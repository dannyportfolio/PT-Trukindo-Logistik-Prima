import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { GET as getLeadResearch } from "@/app/api/leads/[id]/research/route";
import { POST as submitLeadReview } from "@/app/api/leads/[id]/review/route";
import { POST as submitRunReview } from "@/app/api/agent/runs/[id]/review/route";
import { getPool, closePools, checkDatabaseHealth } from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";
import { AgentRepository } from "@/lib/agent/repository";

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

describe("API Route Handlers: Lead Research Dossier & Human Review (Group 6 - Task 6.2)", () => {
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
      await pool.query("DELETE FROM audit_logs WHERE actor_id LIKE '%review_api_test%';");
      await pool.query("DELETE FROM leads WHERE contact_email LIKE '%@review-api-test.example';");
    } catch {
      // ignore cleanup error
    }
    await closePools();
  });

  async function createLeadWithDossier(options: {
    status: string;
    tier?: "TIER_1" | "TIER_2" | "INSUFFICIENT_EVIDENCE" | "DISQUALIFIED";
    score?: number;
    companyName?: string;
  }) {
    const pool = getPool();
    const ts = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const company = options.companyName || `DossierCorp ${ts}`;

    // 1. Create lead initially in INGESTED state
    const leadRes = await pool.query(
      `INSERT INTO leads (company_name, website_url, contact_name, contact_email, status)
       VALUES ($1, $2, $3, $4, 'INGESTED')
       RETURNING *;`,
      [
        company,
        `https://dossier-${ts}.example.com`,
        "Alex Reviewer",
        `alex-${ts}@review-api-test.example`,
      ]
    );
    let lead = leadRes.rows[0];

    // 2. Create agent run
    const run = await agentRepo.createRun({
      leadId: lead.id,
      actorId: "review_api_test_seed",
      actorRole: "SALES_OPERATOR",
    });

    // 3. Save company research
    await agentRepo.saveCompanyResearch({
      leadId: lead.id,
      runId: run.id,
      industry: "Enterprise AI & Cloud Security",
      companySize: "100-500",
      offerings: ["Automated Posture Management", "Continuous Cloud Auditing"],
      techStack: ["Kubernetes", "PostgreSQL", "Go", "TypeScript"],
      summary: "Leading cloud security compliance automation platform.",
      contentHash: "hash-dossier-12345",
      rawEvidence: {
        domain: `dossier-${ts}.example.com`,
        citations: ["https://example.com/about", "https://example.com/products"],
      },
      actorId: "review_api_test_seed",
      actorRole: "SALES_OPERATOR",
    });

    // 4. Save lead score
    const tier = options.tier || "TIER_1";
    await agentRepo.saveLeadScore({
      leadId: lead.id,
      runId: run.id,
      score: options.score !== undefined ? options.score : tier === "TIER_1" ? 88 : 62,
      confidence: tier === "INSUFFICIENT_EVIDENCE" ? 0.50 : 0.82,
      evidenceCoverage: tier === "INSUFFICIENT_EVIDENCE" ? 0.45 : 0.78,
      tier,
      criteriaBreakdown: {
        industry: { score: 30, maxScore: 30, verified: true, evidence: "Cloud Security" },
        company_size: { score: 20, maxScore: 25, verified: true, evidence: "100-500 employees" },
        offerings: { score: 20, maxScore: 25, verified: true, evidence: "Cloud Auditing" },
        tech_stack: { score: 18, maxScore: 20, verified: true, evidence: "Kubernetes" },
      },
      missingInfo: tier === "INSUFFICIENT_EVIDENCE" ? ["Verified offerings citation"] : [],
      evidenceUrls: ["https://example.com/products"],
      rationale: "Matches Enterprise ICP profile",
      actorId: "review_api_test_seed",
      actorRole: "SALES_OPERATOR",
    });

    // 5. Update lead and run to target status
    if (options.status !== "INGESTED") {
      const targetState =
        options.status === "AWAITING_APPROVAL"
          ? "AWAITING_APPROVAL"
          : options.status === "INSUFFICIENT_EVIDENCE"
          ? "INSUFFICIENT_EVIDENCE"
          : options.status === "DISQUALIFIED"
          ? "DISQUALIFIED"
          : "FAILED";

      await pool.query("UPDATE agent_runs SET state = $1 WHERE id = $2;", [targetState, run.id]);
      const updatedLeadRes = await pool.query(
        "UPDATE leads SET status = $1 WHERE id = $2 RETURNING *;",
        [options.status, lead.id]
      );
      lead = updatedLeadRes.rows[0];
    }

    return { lead, run };
  }

  // ============================================================================
  // Suite 1: GET /api/leads/[id]/research
  // ============================================================================
  describe("GET /api/leads/[id]/research Inspection", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead } = await createLeadWithDossier({ status: "AWAITING_APPROVAL" });

      const req = new Request(`http://localhost:3000/api/leads/${lead.id}/research`);
      const res = await getLeadResearch(req, {
        params: Promise.resolve({ id: lead.id }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("should allow VIEWER token to read research dossier with 200 OK", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead } = await createLeadWithDossier({ status: "AWAITING_APPROVAL" });

      const req = new Request(`http://localhost:3000/api/leads/${lead.id}/research`, {
        headers: VIEWER_AUTH,
      });
      const res = await getLeadResearch(req, {
        params: Promise.resolve({ id: lead.id }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.lead.id).toBe(lead.id);
      expect(json.research).toBeDefined();
      expect(json.research.industry).toBe("Enterprise AI & Cloud Security");
      expect(json.research.companySize).toBe("100-500");
      expect(json.research.offerings).toContain("Automated Posture Management");
      expect(json.score).toBeDefined();
      expect(json.score.tier).toBe("TIER_1");
      expect(json.score.score).toBe(88);
      expect(json.runs).toBeInstanceOf(Array);
      expect(json.runs.length).toBeGreaterThan(0);
    });

    it("should return 400 INVALID_ID_FORMAT for non-UUID lead ID", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const req = new Request("http://localhost:3000/api/leads/not-valid-uuid/research", {
        headers: OPERATOR_AUTH,
      });
      const res = await getLeadResearch(req, {
        params: Promise.resolve({ id: "not-valid-uuid" }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("INVALID_ID_FORMAT");
    });

    it("should return 404 NOT_FOUND for non-existent lead ID", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const missingId = "00000000-0000-0000-0000-000000000000";
      const req = new Request(`http://localhost:3000/api/leads/${missingId}/research`, {
        headers: OPERATOR_AUTH,
      });
      const res = await getLeadResearch(req, {
        params: Promise.resolve({ id: missingId }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });
  });

  // ============================================================================
  // Suite 2: POST /api/leads/[id]/review Decision Gating & Mutations
  // ============================================================================
  describe("POST /api/leads/[id]/review Decision Rules & State Machine", () => {
    it("should reject unauthenticated review request with 401 Unauthorized", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead } = await createLeadWithDossier({ status: "AWAITING_APPROVAL" });

      const req = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "APPROVE" }),
      });
      const res = await submitLeadReview(req, {
        params: Promise.resolve({ id: lead.id }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject VIEWER token from submitting human review with 403 Forbidden", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead } = await createLeadWithDossier({ status: "AWAITING_APPROVAL" });

      const req = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
        method: "POST",
        headers: VIEWER_AUTH,
        body: JSON.stringify({ decision: "APPROVE" }),
      });
      const res = await submitLeadReview(req, {
        params: Promise.resolve({ id: lead.id }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("FORBIDDEN");
    });

    it("should reject review submission for lead in illegal state (INGESTED, RESEARCHING, QUALIFIED) with 409 ILLEGAL_REVIEW_STATE", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const illegalStatuses = ["INGESTED", "RESEARCHING", "QUALIFIED", "DISQUALIFIED", "ARCHIVED"];

      for (const st of illegalStatuses) {
        const { lead } = await createLeadWithDossier({ status: st });

        const req = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
          method: "POST",
          headers: OPERATOR_AUTH,
          body: JSON.stringify({ decision: "APPROVE" }),
        });
        const res = await submitLeadReview(req, {
          params: Promise.resolve({ id: lead.id }),
        });
        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.error.code).toBe("ILLEGAL_REVIEW_STATE");
      }
    });

    it("should approve an AWAITING_APPROVAL lead, transition to QUALIFIED, and write append-only audit log", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead } = await createLeadWithDossier({ status: "AWAITING_APPROVAL", tier: "TIER_1" });

      const req = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({
          decision: "APPROVE",
          rationale: "Enterprise prospect validated by sales operator",
        }),
      });
      const res = await submitLeadReview(req, {
        params: Promise.resolve({ id: lead.id }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.lead.status).toBe("QUALIFIED");

      // Verify PostgreSQL audit log
      const pool = getPool();
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE lead_id = $1 AND event_type = 'HUMAN_REVIEW_DECISION';",
        [lead.id]
      );
      expect(auditRes.rows.length).toBe(1);
      const auditLog = auditRes.rows[0];
      expect(auditLog.actor_id).toBe("service_operator");
      expect(auditLog.actor_role).toBe("SALES_OPERATOR");
      expect(auditLog.change_diff.fromStatus).toBe("AWAITING_APPROVAL");
      expect(auditLog.change_diff.toStatus).toBe("QUALIFIED");
      expect(auditLog.change_diff.decision).toBe("APPROVE");
    });

    it("should reject an AWAITING_APPROVAL lead and transition to DISQUALIFIED", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead } = await createLeadWithDossier({ status: "AWAITING_APPROVAL", tier: "TIER_2" });

      const req = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({
          decision: "REJECT",
          rationale: "Product offerings outside our primary market focus",
        }),
      });
      const res = await submitLeadReview(req, {
        params: Promise.resolve({ id: lead.id }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.lead.status).toBe("DISQUALIFIED");
    });

    it("should reject APPROVE on INSUFFICIENT_EVIDENCE without manualOverride or non-empty rationale with 400 OVERRIDE_RATIONALE_REQUIRED", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead } = await createLeadWithDossier({
        status: "INSUFFICIENT_EVIDENCE",
        tier: "INSUFFICIENT_EVIDENCE",
      });

      // 1. Without manualOverride flag
      const req1 = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ decision: "APPROVE", rationale: "I want to approve anyway" }),
      });
      const res1 = await submitLeadReview(req1, {
        params: Promise.resolve({ id: lead.id }),
      });
      expect(res1.status).toBe(400);
      const json1 = await res1.json();
      expect(json1.error.code).toBe("OVERRIDE_RATIONALE_REQUIRED");

      // 2. With manualOverride: true but empty rationale
      const req2 = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ decision: "APPROVE", manualOverride: true, rationale: "   " }),
      });
      const res2 = await submitLeadReview(req2, {
        params: Promise.resolve({ id: lead.id }),
      });
      expect(res2.status).toBe(400);
      const json2 = await res2.json();
      expect(json2.error.code).toBe("OVERRIDE_RATIONALE_REQUIRED");
    });

    it("should approve an INSUFFICIENT_EVIDENCE lead when manualOverride: true and justification rationale is provided", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead } = await createLeadWithDossier({
        status: "INSUFFICIENT_EVIDENCE",
        tier: "INSUFFICIENT_EVIDENCE",
      });

      const justification = "Manual verification via direct LinkedIn and SEC EDGAR filing confirmed enterprise scale";
      const req = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({
          decision: "APPROVE",
          manualOverride: true,
          rationale: justification,
        }),
      });
      const res = await submitLeadReview(req, {
        params: Promise.resolve({ id: lead.id }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.lead.status).toBe("QUALIFIED");

      // Verify audit log has manualOverride and rationale
      const pool = getPool();
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE lead_id = $1 AND event_type = 'HUMAN_REVIEW_DECISION';",
        [lead.id]
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].change_diff.manualOverride).toBe(true);
      expect(auditRes.rows[0].change_diff.rationale).toBe(justification);
    });

    it("should allow REJECT on INSUFFICIENT_EVIDENCE without requiring manual override", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead } = await createLeadWithDossier({
        status: "INSUFFICIENT_EVIDENCE",
        tier: "INSUFFICIENT_EVIDENCE",
      });

      const req = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({
          decision: "REJECT",
          rationale: "Unverifiable website and insufficient evidence",
        }),
      });
      const res = await submitLeadReview(req, {
        params: Promise.resolve({ id: lead.id }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.lead.status).toBe("DISQUALIFIED");
    });

    it("should allow review via POST /api/agent/runs/[id]/review using run ID", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead, run } = await createLeadWithDossier({ status: "AWAITING_APPROVAL" });

      const req = new Request(`http://localhost:3000/api/agent/runs/${run.id}/review`, {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({
          decision: "APPROVE",
          rationale: "Approved via run review endpoint",
        }),
      });
      const res = await submitRunReview(req, {
        params: Promise.resolve({ id: run.id }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.lead.status).toBe("QUALIFIED");
    });

    it("should preserve existing research facts and score immutably after human review", async (ctx) => {
      if (!isDbHealthy) return ctx.skip();
      const { lead } = await createLeadWithDossier({ status: "AWAITING_APPROVAL", score: 88 });

      // Review lead
      const req = new Request(`http://localhost:3000/api/leads/${lead.id}/review`, {
        method: "POST",
        headers: OPERATOR_AUTH,
        body: JSON.stringify({ decision: "APPROVE" }),
      });
      await submitLeadReview(req, {
        params: Promise.resolve({ id: lead.id }),
      });

      // Verify research & scores are preserved
      const research = await agentRepo.getCompanyResearch(lead.id);
      const score = await agentRepo.getLeadScore(lead.id);

      expect(research).not.toBeNull();
      expect(research?.industry).toBe("Enterprise AI & Cloud Security");
      expect(score).not.toBeNull();
      expect(score?.score).toBe(88);
    });
  });
});
