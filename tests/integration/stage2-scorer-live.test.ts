import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  checkDatabaseHealth,
  getPool,
  closePools,
} from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";
import { AgentRepository } from "@/lib/agent/repository";
import { scoreCompanyLead } from "@/lib/agent/tools/scorer";
import { ValidatedCompanyFacts } from "@/lib/agent/tools/extractor";
import { LlmGatewayClient, GatewayCompletionResponse } from "@/lib/gateway";

describe("Live PostgreSQL Integration Suite: Stage 2 ICP Scorer (Group 4)", () => {
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

  async function createTestLead(prefix: string) {
    const ts = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    return leadRepo.createLead({
      companyName: `${prefix} ${ts}`,
      websiteUrl: `https://${prefix.toLowerCase().replace(/[^a-z0-9]/g, "")}-${ts}.test.org`,
      contactName: `Contact ${ts}`,
      contactEmail: `lead-${ts}@testcorp.example`,
      actorId: "operator_integration_test",
      actorRole: "SALES_OPERATOR",
    });
  }

  const createMockGatewayClient = (modelResponseJson: string): LlmGatewayClient => ({
    complete: vi.fn().mockResolvedValue({
      content: modelResponseJson,
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
      durationMs: 320,
    } as GatewayCompletionResponse),
  });

  it("should probe database readiness before executing integration tests", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }
    expect(isDbHealthy).toBe(true);
  });

  it("should score lead, persist decoupled score to PostgreSQL, record step, and transition run state to AWAITING_APPROVAL", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    // 1. Create Lead and Agent Run
    const lead = await createTestLead("AstraFintech");
    const run = await agentRepo.createRun({
      leadId: lead.id,
      actorId: "operator_scorer_test",
      actorRole: "SALES_OPERATOR",
    });

    // 2. Advance Run to SCORING
    await agentRepo.transitionState(run.id, "RESEARCHING");
    await agentRepo.transitionState(run.id, "RESEARCH_COMPLETED");
    await agentRepo.transitionState(run.id, "SCORING");

    // 3. Stage 1 Validated Facts
    const validatedFacts: ValidatedCompanyFacts = {
      industry: "Financial Technology SaaS & Payment Infrastructure",
      company_size: "50-100 employees",
      offerings: ["Cross-border B2B Payments", "Automated Reconciliation Engine"],
      tech_stack: ["TypeScript", "Next.js", "PostgreSQL", "AWS"],
      summary: "AstraFintech provides automated B2B cross-border payments.",
      evidence_urls: [`${lead.website_url}/platform`, `${lead.website_url}/pricing`],
    };

    // 4. Mock Gateway Response
    const modelOutput = JSON.stringify({
      criteria: {
        industry: { score: 28, rationale: "Strong B2B FinOps fit", observed: true },
        company_size: { score: 24, rationale: "Mid-market scale", observed: true },
        offerings: { score: 24, rationale: "High product relevance", observed: true },
        tech_stack: { score: 18, rationale: "Modern TypeScript cloud stack", observed: true },
      },
      confidence: 0.9,
      overall_rationale: "Excellent prospect fit for AstraOps ICP.",
    });
    const mockClient = createMockGatewayClient(modelOutput);

    // 5. Execute Stage 2 Scorer
    const scorerResult = await scoreCompanyLead({
      leadId: lead.id,
      runId: run.id,
      companyName: lead.company_name,
      websiteUrl: lead.website_url,
      facts: validatedFacts,
      gatewayClient: mockClient,
      agentContext: {
        agentRepo,
        runId: run.id,
        stepNumber: 1,
        actorId: "scorer_agent",
        actorRole: "AGENT",
        autoTransition: true,
      },
    });

    expect(scorerResult.leadScore.tier).toBe("TIER_1");
    expect(scorerResult.leadScore.score).toBe(94);
    expect(scorerResult.leadScore.confidence).toBe(0.9);
    expect(scorerResult.leadScore.evidence_coverage).toBe(1.0);

    // 6. Verify lead_scores in PostgreSQL
    const savedScore = await agentRepo.getLeadScore(lead.id);
    expect(savedScore).toBeDefined();
    expect(savedScore?.score).toBe(94);
    expect(savedScore?.tier).toBe("TIER_1");
    expect(savedScore?.confidence).toBe(0.9);
    expect(savedScore?.evidence_coverage).toBe(1.0);
    expect(savedScore?.evidence_urls).toEqual(validatedFacts.evidence_urls);

    // 7. Verify agent_steps log in PostgreSQL
    const steps = await agentRepo.getRunSteps(run.id);
    expect(steps.length).toBeGreaterThanOrEqual(1);
    const scorerStep = steps.find((s) => s.tool_name === "icp_scorer");
    expect(scorerStep).toBeDefined();
    expect(scorerStep?.step_number).toBe(1);

    // 8. Verify agent_runs state in PostgreSQL transitioned to AWAITING_APPROVAL
    const updatedRun = await agentRepo.getRun(run.id);
    expect(updatedRun?.state).toBe("AWAITING_APPROVAL");

    // 9. Verify leads status in PostgreSQL synchronized to AWAITING_APPROVAL
    const { lead: updatedLead, auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
    expect(updatedLead?.status).toBe("AWAITING_APPROVAL");

    // 10. Verify audit log entry LEAD_SCORE_SAVED exists
    const scoreSavedAudit = auditLogs.find((a) => a.event_type === "LEAD_SCORE_SAVED");
    expect(scoreSavedAudit).toBeDefined();
  });

  it("should route lead to INSUFFICIENT_EVIDENCE in PostgreSQL when critical industry evidence is missing", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const lead = await createTestLead("IncompleteDataCorp");
    const run = await agentRepo.createRun({
      leadId: lead.id,
      actorId: "operator_scorer_test",
      actorRole: "SALES_OPERATOR",
    });

    await agentRepo.transitionState(run.id, "RESEARCHING");
    await agentRepo.transitionState(run.id, "RESEARCH_COMPLETED");
    await agentRepo.transitionState(run.id, "SCORING");

    const factsMissingIndustry: ValidatedCompanyFacts = {
      industry: null, // Critical missing!
      company_size: "50-100 employees",
      offerings: ["Cloud Automation"],
      tech_stack: ["Go"],
      summary: null,
      evidence_urls: [`${lead.website_url}/about`],
    };

    const modelOutput = JSON.stringify({
      criteria: {
        industry: { score: 15, rationale: "Unobserved", observed: false },
        company_size: { score: 25, rationale: "Known size", observed: true },
        offerings: { score: 25, rationale: "Known product", observed: true },
        tech_stack: { score: 20, rationale: "Known stack", observed: true },
      },
      confidence: 0.9,
      overall_rationale: "Missing industry fact",
    });
    const mockClient = createMockGatewayClient(modelOutput);

    const scorerResult = await scoreCompanyLead({
      leadId: lead.id,
      runId: run.id,
      companyName: lead.company_name,
      websiteUrl: lead.website_url,
      facts: factsMissingIndustry,
      gatewayClient: mockClient,
      agentContext: {
        agentRepo,
        runId: run.id,
        stepNumber: 1,
        autoTransition: true,
      },
    });

    expect(scorerResult.leadScore.tier).toBe("INSUFFICIENT_EVIDENCE");
    expect(scorerResult.leadScore.score).toBe(85); // 15 + 25 + 25 + 20

    // Verify run and lead state in DB
    const updatedRun = await agentRepo.getRun(run.id);
    expect(updatedRun?.state).toBe("INSUFFICIENT_EVIDENCE");

    const { lead: updatedLead } = await leadRepo.getLeadWithAudit(lead.id);
    expect(updatedLead?.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("should route lead to DISQUALIFIED in PostgreSQL when score < 60 with full evidence", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const lead = await createTestLead("B2CRetailShop");
    const run = await agentRepo.createRun({
      leadId: lead.id,
      actorId: "operator_scorer_test",
      actorRole: "SALES_OPERATOR",
    });

    await agentRepo.transitionState(run.id, "RESEARCHING");
    await agentRepo.transitionState(run.id, "RESEARCH_COMPLETED");
    await agentRepo.transitionState(run.id, "SCORING");

    const disqualifiedFacts: ValidatedCompanyFacts = {
      industry: "B2C Consumer Fashion Retail",
      company_size: "1-5 employees",
      offerings: ["Handmade Leather Shoes"],
      tech_stack: ["Shopify"],
      summary: "Consumer shoe boutique.",
      evidence_urls: [`${lead.website_url}/store`],
    };

    const modelOutput = JSON.stringify({
      criteria: {
        industry: { score: 5, rationale: "B2C Retail, not B2B", observed: true },
        company_size: { score: 5, rationale: "Too small", observed: true },
        offerings: { score: 5, rationale: "Physical goods", observed: true },
        tech_stack: { score: 5, rationale: "Shopify only", observed: true },
      },
      confidence: 0.9,
      overall_rationale: "Out-of-market prospect.",
    });
    const mockClient = createMockGatewayClient(modelOutput);

    const scorerResult = await scoreCompanyLead({
      leadId: lead.id,
      runId: run.id,
      companyName: lead.company_name,
      websiteUrl: lead.website_url,
      facts: disqualifiedFacts,
      gatewayClient: mockClient,
      agentContext: {
        agentRepo,
        runId: run.id,
        stepNumber: 1,
        autoTransition: true,
      },
    });

    expect(scorerResult.leadScore.tier).toBe("DISQUALIFIED");
    expect(scorerResult.leadScore.score).toBe(20);

    // Verify run and lead state in DB
    const updatedRun = await agentRepo.getRun(run.id);
    expect(updatedRun?.state).toBe("DISQUALIFIED");

    const { lead: updatedLead } = await leadRepo.getLeadWithAudit(lead.id);
    expect(updatedLead?.status).toBe("DISQUALIFIED");
  });
});
