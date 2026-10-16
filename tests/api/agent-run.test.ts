import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { POST as runAgent } from "@/app/api/agent/run/route";
import { GET as getRun } from "@/app/api/agent/runs/[id]/route";
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

const ADMIN_AUTH = {
  authorization: "Bearer astraops-admin-token",
  "content-type": "application/json",
};

const VIEWER_AUTH = {
  authorization: "Bearer astraops-viewer-token",
  "content-type": "application/json",
};

describe("API Route Handlers: Agent Run & Lifecycle (Group 6 - Task 6.1)", () => {
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
      await pool.query("DELETE FROM audit_logs WHERE actor_id LIKE '%agent_api_test%';");
      await pool.query("DELETE FROM leads WHERE contact_email LIKE '%@agent-api-test.example';");
    } catch {
      // ignore cleanup error
    }
    await closePools();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function createLead(companyName: string, status: string = "INGESTED") {
    const ts = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const pool = getPool();
    const res = await pool.query(
      `INSERT INTO leads (company_name, website_url, contact_name, contact_email, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`,
      [
        `${companyName} ${ts}`,
        `https://${companyName.toLowerCase().replace(/[^a-z0-9]/g, "")}-${ts}.example.com`,
        "Test Contact",
        `contact-${ts}@agent-api-test.example`,
        status,
      ]
    );
    return res.rows[0];
  }

  function setupMockPipelines(options?: { tier?: "TIER_1" | "INSUFFICIENT_EVIDENCE" | "DISQUALIFIED" }) {
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
          outputPayload: { title: "Test Corp", sanitizedLength: 100 },
          tokensUsed: 0,
          costUsd: 0,
          durationMs: 50,
          isToolCall: true,
        });
      }
      return {
        originalUrl: url,
        finalUrl: url,
        statusCode: 200,
        headers: { "content-type": "text/html" },
        rawHtml: "<html><body>Secret Credentials Inside Raw HTML</body></html>",
        sanitizedText: "Enterprise B2B Cloud Analytics and Compliance SaaS",
        quarantineEnvelope: "<untrusted_scraped_data>Enterprise B2B</untrusted_scraped_data>",
        title: "Test Corp",
        metaDescription: "Test Platform",
        headings: ["Enterprise Analytics"],
        redirectCount: 0,
        durationMs: 50,
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
          // Stage 1 Fact Extractor Output
          return {
            content: JSON.stringify({
              industry: "Enterprise B2B Cloud Analytics & Compliance",
              company_size: "50-200 employees",
              offerings: ["Automated Regulatory Compliance", "Cloud Telemetry"],
              tech_stack: ["Next.js", "PostgreSQL", "Docker"],
              summary: "Leading B2B enterprise analytics provider",
              evidence_urls: [`${targetWebsiteUrl}/platform`, `${targetWebsiteUrl}/pricing`],
            }),
            model: "openai/gpt-4o-mini",
            usage: { promptTokens: 150, completionTokens: 60, totalTokens: 210 },
            cost: {
              pricingVersion: "2026-10-15-v1",
              estimatedWorstCaseCostUsd: 0.0004,
              actualCostUsd: 0.00006,
              residualUncertaintyNote: "test",
              usageVerified: true,
            },
            durationMs: 100,
          };
        } else {
          // Stage 2 ICP Scorer Output
          return {
            content: JSON.stringify({
              criteria: {
                industry: { score: 28, rationale: "Strong B2B Cloud sector", observed: true },
                company_size: { score: 24, rationale: "Growth stage 50-200", observed: true },
                offerings: { score: 24, rationale: "High product relevance", observed: true },
                tech_stack: { score: 18, rationale: "Modern TypeScript and Docker stack", observed: true },
              },
              confidence: tier === "INSUFFICIENT_EVIDENCE" ? 0.50 : 0.90,
              overall_rationale: "Strong alignment with B2B ICP criteria",
            }),
            model: "openai/gpt-4o-mini",
            usage: { promptTokens: 180, completionTokens: 70, totalTokens: 250 },
            cost: {
              pricingVersion: "2026-10-15-v1",
              estimatedWorstCaseCostUsd: 0.0005,
              actualCostUsd: 0.00008,
              residualUncertaintyNote: "test",
              usageVerified: true,
            },
            durationMs: 100,
          };
        }
      }),
    };

    vi.spyOn(gatewayModule, "createGatewayClient").mockReturnValue(mockGateway);
  }

  // ============================================================================
  // Suite 1: Authentication & Authorization Boundaries
  // ============================================================================
  describe("Authentication & Authorization Security Boundaries", () => {
    it("should reject POST /api/agent/run without authorization header with 401 Unauthorized", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("AuthNoToken");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject POST /api/agent/run with VIEWER token with 403 Forbidden", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("AuthViewerToken");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: VIEWER_AUTH,
        body: JSON.stringify({ leadId: lead.id }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("FORBIDDEN");
      expect(json.error.message).toContain("VIEWER");
    });

    it("should ignore client header spoofing (x-actor-role: ADMIN) with VIEWER credentials", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("AuthHeaderSpoof");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: {
          ...VIEWER_AUTH,
          "x-actor-role": "ADMIN",
          "x-actor-id": "spoofed_admin",
        },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("FORBIDDEN");
    });

    it("should reject state-changing cookie session POST when Origin header is mismatched (CSRF defense)", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("AuthCsrfReject");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "astraops_session=astraops-secret-token",
          origin: "https://malicious-cross-origin.com",
        },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("CSRF_FORBIDDEN");
    });

    it("should allow VIEWER token to access GET /api/agent/runs/[id] (read-only privilege)", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("ViewerRunRead");
      const createdRun = await agentRepo.createRun({
        leadId: lead.id,
        actorId: "agent_api_test_op",
        actorRole: "SALES_OPERATOR",
      });

      const req = new Request(`http://localhost:3000/api/agent/runs/${createdRun.id}`, {
        method: "GET",
        headers: VIEWER_AUTH,
      });
      const res = await getRun(req, {
        params: Promise.resolve({ id: createdRun.id }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.run.id).toBe(createdRun.id);
      expect(json.run.leadId).toBe(lead.id);
    });

    it("should reject POST /api/agent/runs/[id]/cancel with VIEWER credentials with 403 Forbidden", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("ViewerCancelForbidden");
      const createdRun = await agentRepo.createRun({
        leadId: lead.id,
        actorId: "agent_api_test_op",
        actorRole: "SALES_OPERATOR",
      });

      const req = new Request(`http://localhost:3000/api/agent/runs/${createdRun.id}/cancel`, {
        method: "POST",
        headers: VIEWER_AUTH,
        body: JSON.stringify({ reason: "Unauthorized viewer attempt" }),
      });
      const res = await cancelRun(req, {
        params: Promise.resolve({ id: createdRun.id }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("FORBIDDEN");
    });
  });

  // ============================================================================
  // Suite 2: POST /api/agent/run Validation, Gating & Idempotency
  // ============================================================================
  describe("POST /api/agent/run Invariants, Status Gating & Idempotency", () => {
    it("should reject non-UUID leadId format with 400 VALIDATION_ERROR", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ leadId: "not-a-valid-uuid" }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 404 NOT_FOUND when target lead does not exist", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const nonExistent = "00000000-0000-0000-0000-000000000000";
      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ leadId: nonExistent }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("should reject runs for leads in terminal/downstream statuses with 400 INELIGIBLE_LEAD_STATUS", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const terminalStatuses = ["QUALIFIED", "DISQUALIFIED", "ARCHIVED", "PROPOSAL_DRAFTED", "OUTREACH_ACTIVE"];

      for (const termStatus of terminalStatuses) {
        const lead = await createLead(`TerminalLead_${termStatus}`, termStatus);

        const req = new Request("http://localhost:3000/api/agent/run", {
          method: "POST",
          headers: OPERATOR_AUTH,
          body: JSON.stringify({ leadId: lead.id }),
        });
        const res = await runAgent(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error.code).toBe("INELIGIBLE_LEAD_STATUS");
        expect(json.error.message).toContain(termStatus);
      }
    });

    it("should reject leads in AWAITING_APPROVAL or INSUFFICIENT_EVIDENCE without allowRerun with 409 PENDING_REVIEW_CONFLICT", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      for (const pendingStatus of ["AWAITING_APPROVAL", "INSUFFICIENT_EVIDENCE"]) {
        const lead = await createLead(`PendingLead_${pendingStatus}`, pendingStatus);

        const req = new Request("http://localhost:3000/api/agent/run", {
          method: "POST",
          headers: OPERATOR_AUTH,
          body: JSON.stringify({ leadId: lead.id, allowRerun: false }),
        });
        const res = await runAgent(req);
        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.error.code).toBe("PENDING_REVIEW_CONFLICT");
        expect(json.error.message).toContain("allowRerun: true is required");
      }
    });

    it("should reject lead with active in-flight run (RESEARCHING) with 409 ACTIVE_RUN_COLLISION", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("ActiveRunCollisionLead", "RESEARCHING");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ leadId: lead.id }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe("ACTIVE_RUN_COLLISION");
    });

    it("should successfully execute agent run and return 201 with sanitized response", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      setupMockPipelines({ tier: "TIER_1" });
      const lead = await createLead("SuccessfulRunLead");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ leadId: lead.id }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(201);
      const json = await res.json();

      expect(json.run).toBeDefined();
      expect(json.run.id).toBeDefined();
      expect(json.run.state).toBe("AWAITING_APPROVAL");
      expect(json.lead.status).toBe("AWAITING_APPROVAL");
      expect(json.research).toBeDefined();
      expect(json.research.industry).toContain("Enterprise B2B Cloud Analytics");
      expect(json.score).toBeDefined();
      expect(json.score.tier).toBe("TIER_1");
      expect(json.score.score).toBeGreaterThanOrEqual(80);
      expect(json.residualRiskNote).toBeDefined();

      // Ensure no raw HTML or internal database secrets are returned
      const rawString = JSON.stringify(json);
      expect(rawString).not.toContain("Secret Credentials Inside Raw HTML");
      expect(rawString).not.toContain("<html>");
    });

    it("should respect Idempotency-Key and return identical cached response on duplicate invocation", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      setupMockPipelines({ tier: "TIER_1" });
      const lead = await createLead("IdempotencyTestLead");
      const idempotencyKey = `agent-run-idem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // First call
      const req1 = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: {
          ...OPERATOR_AUTH,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const res1 = await runAgent(req1);
      expect(res1.status).toBe(201);
      const json1 = await res1.json();

      // Duplicate call with same key and payload
      const req2 = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: {
          ...OPERATOR_AUTH,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const res2 = await runAgent(req2);
      expect(res2.status).toBe(201);
      const json2 = await res2.json();

      expect(json2.run.id).toBe(json1.run.id);

      // Conflict call with same key but different payload
      const req3 = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: {
          ...OPERATOR_AUTH,
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ leadId: lead.id, allowRerun: true }),
      });
      const res3 = await runAgent(req3);
      expect(res3.status).toBe(409);
      const json3 = await res3.json();
      expect(json3.error.code).toBe("IDEMPOTENCY_CONFLICT");
    });

    it("should permit rerun from AWAITING_APPROVAL when allowRerun is explicitly true", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      setupMockPipelines({ tier: "TIER_1" });
      const lead = await createLead("RerunAllowedLead", "AWAITING_APPROVAL");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ leadId: lead.id, allowRerun: true }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.run.state).toBe("AWAITING_APPROVAL");
    });
  });

  // ============================================================================
  // Suite 3: GET /api/agent/runs/[id] & POST /api/agent/runs/[id]/cancel
  // ============================================================================
  describe("Run Trace Inspection & In-flight Cancellation", () => {
    it("should return 400 INVALID_ID_FORMAT on invalid run ID", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const req = new Request("http://localhost:3000/api/agent/runs/invalid-uuid-string", {
        method: "GET",
        headers: OPERATOR_AUTH,
      });
      const res = await getRun(req, {
        params: Promise.resolve({ id: "invalid-uuid-string" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("INVALID_ID_FORMAT");
    });

    it("should return 404 NOT_FOUND on non-existent run ID", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const missingId = "00000000-0000-0000-0000-000000000000";
      const req = new Request(`http://localhost:3000/api/agent/runs/${missingId}`, {
        method: "GET",
        headers: OPERATOR_AUTH,
      });
      const res = await getRun(req, {
        params: Promise.resolve({ id: missingId }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("should return complete run trace, steps, and associated artifacts via GET /api/agent/runs/[id]", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      setupMockPipelines({ tier: "TIER_1" });
      const lead = await createLead("RunTraceLead");

      // Execute run
      const runReq = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ leadId: lead.id }),
      });
      const runRes = await runAgent(runReq);
      const runJson = await runRes.json();
      const runId = runJson.run.id;

      // Query via GET
      const getReq = new Request(`http://localhost:3000/api/agent/runs/${runId}`, {
        method: "GET",
        headers: OPERATOR_AUTH,
      });
      const getResponse = await getRun(getReq, {
        params: Promise.resolve({ id: runId }),
      });
      expect(getResponse.status).toBe(200);
      const trace = await getResponse.json();

      expect(trace.run.id).toBe(runId);
      expect(trace.run.state).toBe("AWAITING_APPROVAL");
      expect(trace.steps).toBeInstanceOf(Array);
      expect(trace.steps.length).toBeGreaterThan(0);
      expect(trace.research).toBeDefined();
      expect(trace.score).toBeDefined();
    });

    it("should cancel an active run and restore the lead's previous status via POST /api/agent/runs/[id]/cancel", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("CancelActiveRunLead", "INGESTED");
      const run = await agentRepo.createRun({
        leadId: lead.id,
        actorId: "operator_test",
        actorRole: "SALES_OPERATOR",
      });

      // Verify run is in INGESTED / RESEARCHING
      expect(run.state).toBe("INGESTED");

      const cancelReq = new Request(`http://localhost:3000/api/agent/runs/${run.id}/cancel`, {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ reason: "Operator cancelled test execution" }),
      });
      const cancelRes = await cancelRun(cancelReq, {
        params: Promise.resolve({ id: run.id }),
      });
      expect(cancelRes.status).toBe(200);
      const cancelJson = await cancelRes.json();
      expect(cancelJson.run.state).toBe("CANCELLED");
      expect(cancelJson.run.errorCode).toBe("CANCELLED_BY_OPERATOR");

      // Verify lead status was restored to previousLeadStatus (INGESTED)
      const { lead: updatedLead } = await leadRepo.getLeadWithAudit(lead.id);
      expect(updatedLead?.status).toBe("INGESTED");
    });

    it("should reject cancellation of terminal runs with 409 CANNOT_CANCEL_RUN", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("TerminalRunCancelLead");
      const run = await agentRepo.createRun({
        leadId: lead.id,
        actorId: "operator_test",
        actorRole: "SALES_OPERATOR",
      });
      // Transition to FAILED
      await agentRepo.transitionState(run.id, "FAILED", {
        errorCode: "TERMINATED",
        errorDetails: "Already completed or failed",
      });

      const cancelReq = new Request(`http://localhost:3000/api/agent/runs/${run.id}/cancel`, {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ reason: "Attempt cancel on failed run" }),
      });
      const cancelRes = await cancelRun(cancelReq, {
        params: Promise.resolve({ id: run.id }),
      });
      expect(cancelRes.status).toBe(409);
      const cancelJson = await cancelRes.json();
      expect(cancelJson.error.code).toBe("CANNOT_CANCEL_RUN");
    });
  });

  describe("MVP Bounds & Runtime Ceilings Enforcement (Final Acceptance Review)", () => {
    it("should accept requests with bounds BELOW the global MVP limits and enforce effective values", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      setupMockPipelines();
      const lead = await createLead("BoundsBelowMax");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({
          leadId: lead.id,
          maxSteps: 5, // Below max (10)
          maxToolCalls: 3, // Below max (5)
          budgetLimitUsd: 0.25, // Below max (0.50)
        }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.run).toBeDefined();
      expect(json.run.maxSteps).toBe(5);
      expect(json.run.maxToolCalls).toBe(3);
      expect(json.run.budgetLimitUsd).toBe(0.25);
    });

    it("should accept requests with bounds EQUAL TO the global MVP limits", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      setupMockPipelines();
      const lead = await createLead("BoundsEqualToMax");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({
          leadId: lead.id,
          maxSteps: 10, // Exactly equal to max (10)
          maxToolCalls: 5, // Exactly equal to max (5)
          budgetLimitUsd: 0.5, // Exactly equal to max (0.50)
        }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.run).toBeDefined();
      expect(json.run.maxSteps).toBe(10);
      expect(json.run.maxToolCalls).toBe(5);
      expect(json.run.budgetLimitUsd).toBe(0.5);
    });

    it("should reject requests with maxSteps ABOVE global MVP limit (10) with 400 VALIDATION_ERROR before starting run", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("BoundsExceedSteps");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({
          leadId: lead.id,
          maxSteps: 11, // Exceeds max (10)
        }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(json.error)).toContain("maxSteps");

      // Verify no run was created in DB
      const runsRes = await getPool().query("SELECT * FROM agent_runs WHERE lead_id = $1;", [lead.id]);
      expect(runsRes.rows).toHaveLength(0);
    });

    it("should reject requests with maxToolCalls ABOVE global MVP limit (5) with 400 VALIDATION_ERROR before starting run", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("BoundsExceedToolCalls");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({
          leadId: lead.id,
          maxToolCalls: 6, // Exceeds max (5)
        }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(json.error)).toContain("maxToolCalls");

      // Verify no run was created in DB
      const runsRes = await getPool().query("SELECT * FROM agent_runs WHERE lead_id = $1;", [lead.id]);
      expect(runsRes.rows).toHaveLength(0);
    });

    it("should reject requests with budgetLimitUsd ABOVE global MVP limit ($0.50) with 400 VALIDATION_ERROR before starting run", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("BoundsExceedBudget");

      const req = new Request("http://localhost:3000/api/agent/run", {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({
          leadId: lead.id,
          budgetLimitUsd: 0.51, // Exceeds max (0.50)
        }),
      });
      const res = await runAgent(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(json.error)).toContain("budgetLimitUsd");

      // Verify no run was created in DB
      const runsRes = await getPool().query("SELECT * FROM agent_runs WHERE lead_id = $1;", [lead.id]);
      expect(runsRes.rows).toHaveLength(0);
    });

    it("should reject direct repository or runner invocation that attempts to elevate bounds above MVP ceilings", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const lead = await createLead("ProgrammaticBoundsExceeded");

      // 1. AgentRepository.createRun rejects invalid bounds at schema validation
      await expect(
        agentRepo.createRun({
          leadId: lead.id,
          maxSteps: 15,
        })
      ).rejects.toThrow();

      await expect(
        agentRepo.createRun({
          leadId: lead.id,
          budgetLimitUsd: 2.5,
        })
      ).rejects.toThrow();
    });
  });
});
