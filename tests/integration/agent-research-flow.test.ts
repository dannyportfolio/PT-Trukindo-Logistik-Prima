import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { POST as createLead } from "@/app/api/leads/route";
import { POST as runAgent } from "@/app/api/agent/run/route";
import { GET as getLeadResearch } from "@/app/api/leads/[id]/research/route";
import { POST as submitReview } from "@/app/api/leads/[id]/review/route";
import { POST as cancelRun } from "@/app/api/agent/runs/[id]/cancel/route";
import { getPool, closePools, checkDatabaseHealth } from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";
import { AgentRepository } from "@/lib/agent/repository";
import * as gatewayModule from "@/lib/gateway";
import * as scraperModule from "@/lib/agent/tools/scraper";

const OPERATOR_AUTH = {
  authorization: "Bearer astraops-secret-token",
  "content-type": "application/json",
};

const VIEWER_AUTH = {
  authorization: "Bearer astraops-viewer-token",
  "content-type": "application/json",
};

describe("End-to-End Milestone 2 Integration: Prospect Research & Qualification (Group 6 - Task 6.4)", () => {
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
    const pool = getPool();
    try {
      await pool.query("DELETE FROM audit_logs WHERE actor_id LIKE '%e2e_flow_test%';");
      await pool.query("DELETE FROM leads WHERE contact_email LIKE '%@e2e-flow-test.example';");
    } catch {
      // ignore cleanup error
    }
    await closePools();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function setupMockE2EPipeline(options?: {
    tier?: "TIER_1" | "TIER_2" | "INSUFFICIENT_EVIDENCE" | "DISQUALIFIED";
    industryEvidence?: string;
    offeringsEvidence?: string;
  }) {
    const tier = options?.tier || "TIER_1";
    let targetWebsiteUrl = "https://example.com";

    vi.spyOn(scraperModule, "scrapeWebsite").mockImplementation(async (url, opts) => {
      targetWebsiteUrl = url;
      if (opts?.agentContext) {
        await opts.agentContext.agentRepo.recordStep({
          runId: opts.agentContext.runId,
          stepNumber: opts.agentContext.stepNumber,
          toolName: "scrapeWebsite",
          inputPayload: { url },
          outputPayload: { title: "Enterprise Platform", contentLength: 1200 },
          tokensUsed: 0,
          costUsd: 0,
          durationMs: 45,
          isToolCall: true,
        });
      }
      return {
        originalUrl: url,
        finalUrl: url,
        statusCode: 200,
        headers: { "content-type": "text/html" },
        rawHtml: "<html><body>AstraOps B2B Enterprise AI Infrastructure</body></html>",
        sanitizedText: "AstraOps delivers enterprise autonomous prospect research and lead qualification.",
        quarantineEnvelope: "<untrusted_scraped_data>AstraOps B2B</untrusted_scraped_data>",
        title: "AstraOps Enterprise",
        metaDescription: "Enterprise AI Infrastructure",
        headings: ["Platform", "Security", "Compliance"],
        redirectCount: 0,
        durationMs: 45,
        retryCount: 0,
        backoffMs: 0,
        triggerStatusCode: null,
      };
    });

    let invocation = 0;
    const mockGateway: gatewayModule.LlmGatewayClient = {
      complete: vi.fn().mockImplementation(async () => {
        invocation++;
        if (invocation === 1) {
          // Stage 1 Fact Extractor
          return {
            content: JSON.stringify({
              industry: "Enterprise AI Infrastructure & Autonomous Sales Ops",
              company_size: "100-250 employees",
              offerings: ["Prospect Research Agent", "Qualification Engine", "Audit Integrity"],
              tech_stack: ["TypeScript", "Next.js", "PostgreSQL", "Docker"],
              summary: "High-growth B2B enterprise platform automating sales qualification.",
              evidence_urls: [`${targetWebsiteUrl}/platform`, `${targetWebsiteUrl}/security`],
            }),
            model: "openai/gpt-4o-mini",
            usage: { promptTokens: 160, completionTokens: 65, totalTokens: 225 },
            cost: {
              pricingVersion: "2026-10-15-v1",
              estimatedWorstCaseCostUsd: 0.00045,
              actualCostUsd: 0.00007,
              residualUncertaintyNote: "e2e-test",
              usageVerified: true,
            },
            durationMs: 90,
          };
        } else {
          // Stage 2 ICP Scorer
          return {
            content: JSON.stringify({
              criteria: {
                industry: {
                  score: 29,
                  rationale: "Direct match with Enterprise AI / Sales ICP",
                  observed: tier !== "INSUFFICIENT_EVIDENCE",
                },
                company_size: {
                  score: 23,
                  rationale: "Growth scale 100-250 employees matches ICP",
                  observed: true,
                },
                offerings: {
                  score: 24,
                  rationale: "Autonomous prospect qualification engine",
                  observed: tier !== "INSUFFICIENT_EVIDENCE",
                },
                tech_stack: {
                  score: 18,
                  rationale: "Modern Next.js, TypeScript, and PostgreSQL stack",
                  observed: true,
                },
              },
              confidence: tier === "INSUFFICIENT_EVIDENCE" ? 0.52 : 0.91,
              overall_rationale: "Strong candidate meeting all ICP rubric standards",
            }),
            model: "openai/gpt-4o-mini",
            usage: { promptTokens: 200, completionTokens: 75, totalTokens: 275 },
            cost: {
              pricingVersion: "2026-10-15-v1",
              estimatedWorstCaseCostUsd: 0.00055,
              actualCostUsd: 0.00009,
              residualUncertaintyNote: "e2e-test",
              usageVerified: true,
            },
            durationMs: 110,
          };
        }
      }),
    };

    vi.spyOn(gatewayModule, "createGatewayClient").mockReturnValue(mockGateway);
  }

  // ============================================================================
  // Scenario 1: Intake -> Research Pipeline -> Dossier Inspection -> Human Approval -> Zero Outreach
  // ============================================================================
  it("should orchestrate full end-to-end lifecycle: ingestion, automated research, dossier verification, and human approval to QUALIFIED with zero outreach", async (ctx) => {
    if (!isDbHealthy) return ctx.skip();
    setupMockE2EPipeline({ tier: "TIER_1" });
    const ts = Date.now() + "-" + Math.random().toString(36).slice(2, 7);

    // 1. Ingest new lead via POST /api/leads
    const ingestReq = new Request("http://localhost:3000/api/leads", {
      method: "POST",
      headers: OPERATOR_AUTH,
      body: JSON.stringify({
        companyName: `Apex AI Systems ${ts}`,
        websiteUrl: `https://apex-ai-${ts}.example.com`,
        contactName: "Sarah Connor",
        contactEmail: `sarah-${ts}@e2e-flow-test.example`,
      }),
    });
    const ingestRes = await createLead(ingestReq);
    expect(ingestRes.status).toBe(201);
    const lead = await ingestRes.json();
    expect(lead.id).toBeDefined();
    expect(lead.status).toBe("INGESTED");

    // 2. Initiate research agent run via POST /api/agent/run
    const runReq = new Request("http://localhost:3000/api/agent/run", {
      method: "POST",
      headers: OPERATOR_AUTH,
      body: JSON.stringify({ leadId: lead.id }),
    });
    const runRes = await runAgent(runReq);
    expect(runRes.status).toBe(201);
    const runJson = await runRes.json();

    // Verify pipeline suspended at Human-in-the-Loop review gate
    expect(runJson.run.state).toBe("AWAITING_APPROVAL");
    expect(runJson.lead.status).toBe("AWAITING_APPROVAL");
    expect(runJson.score.tier).toBe("TIER_1");
    expect(runJson.score.score).toBeGreaterThanOrEqual(80);
    expect(runJson.score.confidence).toBeGreaterThanOrEqual(0.75);
    expect(runJson.score.evidenceCoverage).toBeGreaterThanOrEqual(0.70);
    expect(runJson.research.industry).toContain("Enterprise AI");

    // 3. Inspect research dossier via GET /api/leads/[id]/research
    const dossierReq = new Request(`http://localhost:3000/api/leads/${lead.id}/research`, {
      method: "GET",
      headers: OPERATOR_AUTH,
    });
    const dossierRes = await getLeadResearch(dossierReq, {
      params: Promise.resolve({ id: lead.id }),
    });
    expect(dossierRes.status).toBe(200);
    const dossierJson = await dossierRes.json();

    expect(dossierJson.lead.status).toBe("AWAITING_APPROVAL");
    expect(dossierJson.research.offerings).toContain("Prospect Research Agent");
    expect(dossierJson.score.criteriaBreakdown.industry.score).toBe(29);
    expect(dossierJson.score.criteriaBreakdown.company_size.score).toBe(23);
    expect(dossierJson.score.criteriaBreakdown.offerings.score).toBe(24);
    expect(dossierJson.score.criteriaBreakdown.tech_stack.score).toBe(18);
    expect(dossierJson.score.evidenceUrls.length).toBeGreaterThan(0);
    expect(dossierJson.runs.length).toBe(1);

    // 4. Human Sales Operator Reviews & Approves via POST /api/leads/[id]/review
    const reviewReq = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
      method: "POST",
      headers: OPERATOR_AUTH,
      body: JSON.stringify({
        decision: "APPROVE",
        rationale: "Operator verified enterprise prospect dossier and high fit score",
      }),
    });
    const reviewRes = await submitReview(reviewReq, {
      params: Promise.resolve({ id: lead.id }),
    });
    expect(reviewRes.status).toBe(200);
    const reviewJson = await reviewRes.json();
    expect(reviewJson.lead.status).toBe("QUALIFIED");

    // 5. Verify PostgreSQL Audit Trail Completeness & Zero External Outreach
    const pool = getPool();
    const auditRes = await pool.query(
      "SELECT event_type, actor_id, actor_role, change_diff FROM audit_logs WHERE lead_id = $1 ORDER BY recorded_at ASC;",
      [lead.id]
    );

    const eventTypes = auditRes.rows.map((r) => r.event_type);
    expect(eventTypes).toContain("LEAD_INGESTED");
    expect(eventTypes).toContain("AGENT_RUN_CREATED");
    expect(eventTypes).toContain("AGENT_STEP_EXECUTED");
    expect(eventTypes).toContain("AGENT_STATE_TRANSITION");
    expect(eventTypes).toContain("HUMAN_REVIEW_DECISION");

    // ZERO OUTREACH CONSTRAINT: Ensure no email, proposal, or webhook events exist
    const unauthorizedEvents = auditRes.rows.filter((r) =>
      ["EMAIL_SENT", "OUTREACH_DISPATCHED", "PROPOSAL_GENERATED", "WEBHOOK_TRIGGERED"].includes(
        r.event_type
      )
    );
    expect(unauthorizedEvents.length).toBe(0);

    // Verify final lead state
    const { lead: finalLead } = await leadRepo.getLeadWithAudit(lead.id);
    expect(finalLead?.status).toBe("QUALIFIED");
  });

  // ============================================================================
  // Scenario 2: Insufficient Evidence Gate & Manual Override Workflow
  // ============================================================================
  it("should enforce INSUFFICIENT_EVIDENCE review gate, reject unauthorized approval, and accept manual override with rationale", async (ctx) => {
    if (!isDbHealthy) return ctx.skip();
    setupMockE2EPipeline({ tier: "INSUFFICIENT_EVIDENCE" });
    const ts = Date.now() + "-" + Math.random().toString(36).slice(2, 7);

    // 1. Ingest lead
    const ingestReq = new Request("http://localhost:3000/api/leads", {
      method: "POST",
      headers: OPERATOR_AUTH,
      body: JSON.stringify({
        companyName: `Quiet Stealth Corp ${ts}`,
        websiteUrl: `https://stealth-${ts}.example.com`,
        contactName: "Stealth Founder",
        contactEmail: `founder-${ts}@e2e-flow-test.example`,
      }),
    });
    const ingestRes = await createLead(ingestReq);
    const lead = await ingestRes.json();

    // 2. Run agent pipeline
    const runReq = new Request("http://localhost:3000/api/agent/run", {
      method: "POST",
      headers: OPERATOR_AUTH,
      body: JSON.stringify({ leadId: lead.id }),
    });
    const runRes = await runAgent(runReq);
    expect(runRes.status).toBe(201);
    const runJson = await runRes.json();

    // Verify routed to INSUFFICIENT_EVIDENCE regardless of nominal rubric points
    expect(runJson.run.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(runJson.lead.status).toBe("INSUFFICIENT_EVIDENCE");

    // 3. Attempt normal approve without manual override -> MUST BE REJECTED 400
    const invalidApproveReq = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
      method: "POST",
      headers: OPERATOR_AUTH,
      body: JSON.stringify({ decision: "APPROVE", rationale: "Standard approval attempt" }),
    });
    const invalidApproveRes = await submitReview(invalidApproveReq, {
      params: Promise.resolve({ id: lead.id }),
    });
    expect(invalidApproveRes.status).toBe(400);
    const errJson = await invalidApproveRes.json();
    expect(errJson.error.code).toBe("OVERRIDE_RATIONALE_REQUIRED");

    // 4. Submit manual override with valid justification rationale
    const overrideRationale = "Lead verified via private PitchBook entry and founder interview";
    const validOverrideReq = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
      method: "POST",
      headers: OPERATOR_AUTH,
      body: JSON.stringify({
        decision: "APPROVE",
        manualOverride: true,
        rationale: overrideRationale,
      }),
    });
    const validOverrideRes = await submitReview(validOverrideReq, {
      params: Promise.resolve({ id: lead.id }),
    });
    expect(validOverrideRes.status).toBe(200);
    const overrideJson = await validOverrideRes.json();
    expect(overrideJson.lead.status).toBe("QUALIFIED");

    // Verify audit log recorded manualOverride flag and justification
    const pool = getPool();
    const auditRes = await pool.query(
      "SELECT change_diff FROM audit_logs WHERE lead_id = $1 AND event_type = 'HUMAN_REVIEW_DECISION';",
      [lead.id]
    );
    expect(auditRes.rows[0].change_diff.manualOverride).toBe(true);
    expect(auditRes.rows[0].change_diff.rationale).toBe(overrideRationale);
  });

  // ============================================================================
  // Scenario 3: Rerun Suspension & Cancellation Rollback
  // ============================================================================
  it("should preserve prior status when in-flight rerun is cancelled", async (ctx) => {
    if (!isDbHealthy) return ctx.skip();
    setupMockE2EPipeline({ tier: "TIER_1" });
    const ts = Date.now() + "-" + Math.random().toString(36).slice(2, 7);

    // 1. Ingest lead and complete initial run to AWAITING_APPROVAL
    const ingestReq = new Request("http://localhost:3000/api/leads", {
      method: "POST",
      headers: OPERATOR_AUTH,
      body: JSON.stringify({
        companyName: `Cancellation Test ${ts}`,
        websiteUrl: `https://cancel-${ts}.example.com`,
        contactName: "Cancel Contact",
        contactEmail: `cancel-${ts}@e2e-flow-test.example`,
      }),
    });
    const ingestRes = await createLead(ingestReq);
    const lead = await ingestRes.json();

    const run1Req = new Request("http://localhost:3000/api/agent/run", {
      method: "POST",
      headers: OPERATOR_AUTH,
      body: JSON.stringify({ leadId: lead.id }),
    });
    await runAgent(run1Req);

    // Verify lead is in AWAITING_APPROVAL
    const { lead: leadAfterRun1 } = await leadRepo.getLeadWithAudit(lead.id);
    expect(leadAfterRun1?.status).toBe("AWAITING_APPROVAL");

    // 2. Start manual active run to simulate in-flight rerun
    const activeRun = await agentRepo.createRun({
      leadId: lead.id,
      allowRerun: true,
      actorId: "e2e_flow_test_operator",
      actorRole: "SALES_OPERATOR",
    });

    // 3. Cancel the in-flight run
    const cancelReq = new Request(`http://localhost:3000/api/agent/runs/${activeRun.id}/cancel`, {
      method: "POST",
      headers: OPERATOR_AUTH,
      body: JSON.stringify({ reason: "Operator cancelled in-flight rerun" }),
    });
    const cancelRes = await cancelRun(cancelReq, {
      params: Promise.resolve({ id: activeRun.id }),
    });
    expect(cancelRes.status).toBe(200);

    // 4. Verify lead's prior status (AWAITING_APPROVAL) was restored instead of forcing INGESTED
    const { lead: restoredLead } = await leadRepo.getLeadWithAudit(lead.id);
    expect(restoredLead?.status).toBe("AWAITING_APPROVAL");
  });
});
