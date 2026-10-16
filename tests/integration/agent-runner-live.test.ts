import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import {
  checkDatabaseHealth,
  getPool,
  closePools,
} from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";
import { AgentRepository } from "@/lib/agent/repository";
import { runAgentPipeline } from "@/lib/agent/runner";
import { LlmGatewayClient, GatewayCompletionResponse } from "@/lib/gateway";
import * as scraperModule from "@/lib/agent/tools/scraper";

describe("Live PostgreSQL Integration Suite: Agent Pipeline Orchestrator (Group 5)", () => {
  let isDbHealthy = false;
  let leadRepo: LeadRepository;
  let agentRepo: AgentRepository;

  beforeAll(async () => {
    const health = await checkDatabaseHealth();
    isDbHealthy = health.isHealthy;
    if (isDbHealthy) {
      leadRepo = new LeadRepository(getPool());
      agentRepo = new AgentRepository(getPool());
    }
  });

  afterAll(async () => {
    await closePools();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createTestLead(prefix: string) {
    const ts = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    return leadRepo.createLead({
      companyName: `${prefix} ${ts}`,
      websiteUrl: `https://${prefix.toLowerCase().replace(/[^a-z0-9]/g, "")}-${ts}.test.org`,
      contactName: `Contact ${ts}`,
      contactEmail: `lead-${ts}@testcorp.example`,
      actorId: "operator_runner_integration_test",
      actorRole: "SALES_OPERATOR",
    });
  }

  const createMockGatewayClient = (responses: string[]): LlmGatewayClient => {
    let callIndex = 0;
    return {
      complete: vi.fn().mockImplementation(async () => {
        const content = responses[callIndex] || "{}";
        callIndex++;
        return {
          content,
          model: "openai/gpt-4o-mini",
          usage: {
            promptTokens: 200,
            completionTokens: 80,
            totalTokens: 280,
          },
          cost: {
            pricingVersion: "2026-10-15-v1",
            estimatedWorstCaseCostUsd: 0.0005,
            actualCostUsd: 0.00008,
            residualUncertaintyNote: "integration-test-note",
            usageVerified: true,
          },
          durationMs: 250,
        } as GatewayCompletionResponse;
      }),
    };
  };

  it("should probe database readiness before executing integration tests", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }
    expect(isDbHealthy).toBe(true);
  });

  // ============================================================================
  // Test 1: Complete Successful Pipeline to Review Gate
  // ============================================================================
  it("should successfully orchestrate full pipeline from INGESTED to AWAITING_APPROVAL with complete persistence and zero outreach", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const lead = await createTestLead("AstraFintechSaaS");

    // Mock scraper response
    vi.spyOn(scraperModule, "scrapeWebsite").mockImplementation(async (_url, options) => {
      const durationMs = 150;
      if (options?.agentContext) {
        await options.agentContext.agentRepo.recordStep({
          runId: options.agentContext.runId,
          stepNumber: options.agentContext.stepNumber,
          toolName: "scrapeWebsite",
          inputPayload: { url: lead.website_url },
          outputPayload: { title: "AstraFintech", contentLength: 500 },
          tokensUsed: 0,
          costUsd: 0,
          durationMs,
          isToolCall: true,
        });
      }
      return {
        originalUrl: lead.website_url,
        finalUrl: lead.website_url,
        statusCode: 200,
        headers: { "content-type": "text/html" },
        rawHtml: "<html><body>AstraFintech Cloud B2B Reconciliation</body></html>",
        sanitizedText: "AstraFintech provides automated B2B cross-border payments and cloud reconciliation.",
        quarantineEnvelope: "<untrusted_scraped_data>Text</untrusted_scraped_data>",
        title: "AstraFintech",
        metaDescription: "Fintech Platform",
        headings: ["Platform", "Solutions"],
        redirectCount: 0,
        durationMs,
        retryCount: 0,
        backoffMs: 0,
        triggerStatusCode: null,
      };
    });

    // Mock Gateway responses for Stage 1 and Stage 2
    const stage1Response = JSON.stringify({
      industry: "Financial Technology SaaS & Cloud Reconciliation",
      company_size: "50-100 employees",
      offerings: ["B2B Cross-Border Payments", "Automated Reconciliation"],
      tech_stack: ["TypeScript", "Next.js", "PostgreSQL", "AWS"],
      summary: "AstraFintech provides automated B2B payments.",
      evidence_urls: [`${lead.website_url}/platform`, `${lead.website_url}/pricing`],
    });

    const stage2Response = JSON.stringify({
      criteria: {
        industry: { score: 28, rationale: "Strong B2B Cloud sector", observed: true },
        company_size: { score: 24, rationale: "Growth stage 50-100", observed: true },
        offerings: { score: 24, rationale: "High product relevance", observed: true },
        tech_stack: { score: 18, rationale: "Modern TypeScript and Go stack", observed: true },
      },
      confidence: 0.9,
      overall_rationale: "Exceptional ICP match for outbound pipeline.",
    });

    const mockGateway = createMockGatewayClient([stage1Response, stage2Response]);

    const result = await runAgentPipeline({
      leadId: lead.id,
      agentRepo,
      leadRepo,
      gatewayClient: mockGateway,
      actorId: "integration_runner",
      actorRole: "SALES_OPERATOR",
    });

    // Verify pipeline result
    expect(result.success).toBe(true);
    expect(result.state).toBe("AWAITING_APPROVAL");
    expect(result.finalLeadStatus).toBe("AWAITING_APPROVAL");
    expect(result.score?.tier).toBe("TIER_1");
    expect(result.score?.score).toBe(94);
    expect(result.score?.confidence).toBe(0.9);
    expect(result.score?.evidence_coverage).toBe(1.0);

    // Verify PostgreSQL database state
    const { lead: updatedLead, auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
    expect(updatedLead?.status).toBe("AWAITING_APPROVAL");

    const savedResearch = await agentRepo.getCompanyResearch(lead.id);
    expect(savedResearch).toBeDefined();
    expect(savedResearch?.industry).toBe("Financial Technology SaaS & Cloud Reconciliation");

    const savedScore = await agentRepo.getLeadScore(lead.id);
    expect(savedScore).toBeDefined();
    expect(savedScore?.tier).toBe("TIER_1");

    const steps = await agentRepo.getRunSteps(result.run.id);
    expect(steps.length).toBe(3); // scrapeWebsite, fact_extractor, icp_scorer
    expect(steps.map((s) => s.tool_name)).toEqual([
      "scrapeWebsite",
      "fact_extractor",
      "icp_scorer",
    ]);

    // Verify audit logs written
    const events = auditLogs.map((a) => a.event_type);
    expect(events).toContain("AGENT_RUN_CREATED");
    expect(events).toContain("AGENT_STEP_EXECUTED");
    expect(events).toContain("COMPANY_RESEARCH_SAVED");
    expect(events).toContain("LEAD_SCORE_SAVED");
    expect(events).toContain("AGENT_STATE_TRANSITION");
  });

  // ============================================================================
  // Test 2: Routing to INSUFFICIENT_EVIDENCE on Missing Critical Facts
  // ============================================================================
  it("should route pipeline to INSUFFICIENT_EVIDENCE in PostgreSQL when critical industry evidence is missing", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const lead = await createTestLead("IncompleteLead");

    vi.spyOn(scraperModule, "scrapeWebsite").mockImplementation(async (_url, options) => {
      if (options?.agentContext) {
        await options.agentContext.agentRepo.recordStep({
          runId: options.agentContext.runId,
          stepNumber: options.agentContext.stepNumber,
          toolName: "scrapeWebsite",
          isToolCall: true,
        });
      }
      return {
        originalUrl: lead.website_url,
        finalUrl: lead.website_url,
        statusCode: 200,
        headers: {},
        rawHtml: "<html><body>Brief landing page</body></html>",
        sanitizedText: "Brief landing page without corporate facts.",
        quarantineEnvelope: "<untrusted_scraped_data>Text</untrusted_scraped_data>",
        title: "Landing",
        metaDescription: "",
        headings: [],
        redirectCount: 0,
        durationMs: 100,
        retryCount: 0,
        backoffMs: 0,
        triggerStatusCode: null,
      };
    });

    // Stage 1 output has null industry
    const stage1Response = JSON.stringify({
      industry: null,
      company_size: "10-20 employees",
      offerings: ["Consulting"],
      tech_stack: [],
      summary: null,
      evidence_urls: [`${lead.website_url}/contact`],
    });

    const stage2Response = JSON.stringify({
      criteria: {
        industry: { score: 15, rationale: "Missing", observed: false },
        company_size: { score: 20, rationale: "Small", observed: true },
        offerings: { score: 20, rationale: "Consulting", observed: true },
        tech_stack: { score: 10, rationale: "None", observed: false },
      },
      confidence: 0.8,
      overall_rationale: "Critical industry evidence missing",
    });

    const mockGateway = createMockGatewayClient([stage1Response, stage2Response]);

    const result = await runAgentPipeline({
      leadId: lead.id,
      agentRepo,
      leadRepo,
      gatewayClient: mockGateway,
    });

    expect(result.success).toBe(true);
    expect(result.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.finalLeadStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.score?.tier).toBe("INSUFFICIENT_EVIDENCE");

    // Verify DB lead state
    const { lead: updatedLead } = await leadRepo.getLeadWithAudit(lead.id);
    expect(updatedLead?.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  // ============================================================================
  // Test 3: Operator Cancellation via AbortSignal
  // ============================================================================
  it("should handle operator cancellation via AbortSignal and reset lead status to INGESTED", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const lead = await createTestLead("CancelTargetLead");
    const abortController = new AbortController();

    vi.spyOn(scraperModule, "scrapeWebsite").mockImplementation(async () => {
      abortController.abort("Operator cancelled research run");
      throw new Error("ScraperExecutionAbortedError");
    });

    const result = await runAgentPipeline({
      leadId: lead.id,
      signal: abortController.signal,
      agentRepo,
      leadRepo,
    });

    expect(result.success).toBe(false);
    expect(result.state).toBe("CANCELLED");
    expect(result.error?.code).toBe("CANCELLED_BY_OPERATOR");

    // Verify lead was safely reset to retryable INGESTED status
    const { lead: updatedLead, auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
    expect(updatedLead?.status).toBe("INGESTED");

    // Verify audit log has AGENT_RUN_CANCELLED
    const cancelAudit = auditLogs.find((a) => a.event_type === "AGENT_RUN_CANCELLED");
    expect(cancelAudit).toBeDefined();
  });

  // ============================================================================
  // Test 4: SSRF Security Rejection
  // ============================================================================
  it("should fail closed with SSRF_VIOLATION when lead URL targets internal IP", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    // Lead pointing to AWS metadata IP
    const ts = Date.now();
    const ssrfLead = await leadRepo.createLead({
      companyName: `MetadataExploit ${ts}`,
      websiteUrl: "http://169.254.169.254/latest/meta-data/",
      contactName: "Attacker",
      contactEmail: "attacker@exploit.test",
    });

    // Run scraper with actual SSRF guard logic
    const result = await runAgentPipeline({
      leadId: ssrfLead.id,
      agentRepo,
      leadRepo,
    });

    expect(result.success).toBe(false);
    expect(result.state).toBe("FAILED");
    expect(result.error?.code).toBe("SSRF_VIOLATION");

    const { lead: updatedLead } = await leadRepo.getLeadWithAudit(ssrfLead.id);
    expect(updatedLead?.status).toBe("FAILED");
  });

  // ============================================================================
  // Test 5: Idempotency and Duplicate Trigger Rejection
  // ============================================================================
  it("should reject concurrent active runs on the same lead", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const lead = await createTestLead("ConcurrentTestLead");

    // Create active run directly
    const run1 = await agentRepo.createRun({ leadId: lead.id });
    expect(run1.state).toBe("INGESTED");

    // Attempt to launch a second pipeline on the same lead
    const result = await runAgentPipeline({
      leadId: lead.id,
      agentRepo,
      leadRepo,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("ACTIVE_RUN_COLLISION");
  });

  it("should return identical run without duplicate audit logs when idempotencyKey is supplied", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const lead = await createTestLead("IdempotentLead");
    const idempotencyKey = "idemp-" + Date.now();

    // First call creates run
    const run1 = await agentRepo.createRun({
      leadId: lead.id,
      idempotencyKey,
    });

    // Second call with same idempotencyKey returns existing run
    const run2 = await agentRepo.createRun({
      leadId: lead.id,
      idempotencyKey,
    });

    expect(run1.id).toBe(run2.id);

    // Verify audit logs have exactly 1 AGENT_RUN_CREATED
    const { auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
    const createdEvents = auditLogs.filter((a) => a.event_type === "AGENT_RUN_CREATED");
    expect(createdEvents.length).toBe(1);
  });
});
