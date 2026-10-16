import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  checkDatabaseHealth,
  getPool,
  closePools,
  withTransaction,
} from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";
import {
  AgentRepository,
  ConcurrencyConflictError,
  StepLimitExceededError,
  ToolCallLimitExceededError,
  BudgetExceededError,
  RunDeadlineExceededError,
} from "@/lib/agent/repository";
import { IllegalStateTransitionError } from "@/lib/agent/state-machine";
import { PoolClient } from "pg";

describe("Live PostgreSQL Integration Suite: Agent Persistence & State Machine (Group 1)", () => {
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

  it("should probe database readiness before executing integration tests", async (ctx) => {
    if (!isDbHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }
    expect(isDbHealthy).toBe(true);
  });

  describe("Lifecycle, Transitions & Audit Log Consistency", () => {
    it("should atomically create agent run, sync lead status, and write audit trail", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      // 1. Ingest an isolated lead
      const testLead = await createTestLead("Astra Dynamics");
      expect(testLead.id).toBeDefined();
      expect(testLead.status).toBe("INGESTED");

      // 2. Create Agent Run
      const run = await agentRepo.createRun({
        leadId: testLead.id,
        actorId: "test_m2_operator",
        actorRole: "SALES_OPERATOR",
      });

      expect(run.id).toBeDefined();
      expect(run.lead_id).toBe(testLead.id);
      expect(run.state).toBe("INGESTED");
      expect(run.version_id).toBe(1);
      expect(run.current_step).toBe(0);

      // 3. Verify lead status synchronized to RESEARCHING
      const { lead: leadAfterRun, auditLogs } = await leadRepo.getLeadWithAudit(testLead.id);
      expect(leadAfterRun?.status).toBe("RESEARCHING");

      // 4. Verify audit_logs contains AGENT_RUN_CREATED
      const runCreatedAudit = auditLogs.find((a) => a.event_type === "AGENT_RUN_CREATED");
      expect(runCreatedAudit).toBeDefined();
      expect(runCreatedAudit?.actor_id).toBe("test_m2_operator");
      expect(runCreatedAudit?.actor_role).toBe("SALES_OPERATOR");

      // 5. Verify Idempotency & Active Run Collision Rejection
      await expect(
        agentRepo.createRun({ leadId: testLead.id })
      ).rejects.toThrow(/already has an active agent run/);
    });

    it("should execute valid state transitions deterministically, enforce optimistic locking, and reject illegal transitions", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const testLead = await createTestLead("Transition Corp");

      const run = await agentRepo.createRun({
        leadId: testLead.id,
        actorId: "state_runner",
      });
      expect(run.version_id).toBe(1);

      // Transition 1: INGESTED -> RESEARCHING (valid)
      const t1 = await agentRepo.transitionState(run.id, "RESEARCHING", {
        expectedVersion: 1,
        actorId: "worker_agent",
      });
      expect(t1.state).toBe("RESEARCHING");
      expect(t1.version_id).toBe(2);

      // Transition 2: RESEARCHING -> RESEARCH_COMPLETED (valid)
      const t2 = await agentRepo.transitionState(run.id, "RESEARCH_COMPLETED", {
        expectedVersion: 2,
        actorId: "worker_agent",
      });
      expect(t2.state).toBe("RESEARCH_COMPLETED");
      expect(t2.version_id).toBe(3);

      // Test Optimistic Concurrency Conflict: stale version expected
      await expect(
        agentRepo.transitionState(run.id, "SCORING", {
          expectedVersion: 2, // Stale! Current is 3
        })
      ).rejects.toThrow(ConcurrencyConflictError);

      // Transition 3: RESEARCH_COMPLETED -> SCORING (valid with correct version 3)
      const t3 = await agentRepo.transitionState(run.id, "SCORING", {
        expectedVersion: 3,
        actorId: "scoring_agent",
      });
      expect(t3.state).toBe("SCORING");
      expect(t3.version_id).toBe(4);

      // Transition 4: SCORING -> AWAITING_APPROVAL (valid)
      const t4 = await agentRepo.transitionState(run.id, "AWAITING_APPROVAL", {
        expectedVersion: 4,
        actorId: "scoring_agent",
      });
      expect(t4.state).toBe("AWAITING_APPROVAL");
      expect(t4.version_id).toBe(5);

      // Verify Lead status updated to AWAITING_APPROVAL
      const { lead: leadUpdated } = await leadRepo.getLeadWithAudit(testLead.id);
      expect(leadUpdated?.status).toBe("AWAITING_APPROVAL");

      // Test Illegal State Transition: AWAITING_APPROVAL -> RESEARCHING (rejected by FSM)
      await expect(
        agentRepo.transitionState(run.id, "RESEARCHING")
      ).rejects.toThrow(IllegalStateTransitionError);

      // Test Illegal State Transition: AWAITING_APPROVAL -> INGESTED (rejected by FSM)
      await expect(
        agentRepo.transitionState(run.id, "INGESTED")
      ).rejects.toThrow(IllegalStateTransitionError);

      // Verify version and state remained unchanged after rejected illegal transitions
      const runAfterFailures = await agentRepo.getRunById(run.id);
      expect(runAfterFailures?.state).toBe("AWAITING_APPROVAL");
      expect(runAfterFailures?.version_id).toBe(5);
    });

    it("should rollback transaction atomically when persistence fails", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const pool = getPool();
      const testLead = await createTestLead("Rollback LLC");

      // Attempt transaction where second statement fails
      let caughtError: unknown = null;
      try {
        await withTransaction(async (client: PoolClient) => {
          await client.query(
            "INSERT INTO agent_runs (lead_id, state, current_step, max_steps, tool_calls_count, max_tool_calls, accrued_cost_usd, budget_limit_usd, version_id) VALUES ($1, 'INGESTED', 0, 10, 0, 5, 0, 0.5, 1);",
            [testLead.id]
          );
          // Deliberate constraint violation to trigger rollback
          await client.query(
            "INSERT INTO agent_runs (lead_id, state, current_step, max_steps, tool_calls_count, max_tool_calls, accrued_cost_usd, budget_limit_usd, version_id) VALUES ($1, 'NON_EXISTENT_STATE_XYZ', 0, 10, 0, 5, 0, 0.5, 1);",
            [testLead.id]
          );
        }, pool);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();

      // Verify no agent_runs were committed for this lead
      const runs = await agentRepo.getRunsByLeadId(testLead.id);
      expect(runs.length).toBe(0);
    });
  });

  describe("Bounded Guardrails: Steps, Tool Calls, Budget & Deadlines", () => {
    it("should enforce max steps limit and throw StepLimitExceededError", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const testLead = await createTestLead("Limit Steps");

      // Create run with maxSteps = 2
      const run = await agentRepo.createRun({
        leadId: testLead.id,
        maxSteps: 2,
      });

      // Step 1: Success
      await agentRepo.recordStep({
        runId: run.id,
        stepNumber: 1,
        toolName: "scrapeWebsite",
        tokensUsed: 100,
        costUsd: 0.01,
        durationMs: 500,
        isToolCall: false,
      });

      // Step 2: Success
      await agentRepo.recordStep({
        runId: run.id,
        stepNumber: 2,
        toolName: "scrapeWebsite",
        tokensUsed: 100,
        costUsd: 0.01,
        durationMs: 400,
        isToolCall: false,
      });

      // Step 3: Should exceed maxSteps (2)
      await expect(
        agentRepo.recordStep({
          runId: run.id,
          stepNumber: 3,
          toolName: "scrapeWebsite",
          tokensUsed: 100,
          costUsd: 0.01,
          durationMs: 400,
          isToolCall: false,
        })
      ).rejects.toThrow(StepLimitExceededError);
    });

    it("should enforce max tool calls limit and throw ToolCallLimitExceededError", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const testLead = await createTestLead("Limit Tools");

      // Create run with maxToolCalls = 1
      const run = await agentRepo.createRun({
        leadId: testLead.id,
        maxToolCalls: 1,
      });

      // Tool Call 1: Success
      await agentRepo.recordStep({
        runId: run.id,
        stepNumber: 1,
        toolName: "scrapeWebsite",
        isToolCall: true,
      });

      // Tool Call 2: Should exceed limit (1)
      await expect(
        agentRepo.recordStep({
          runId: run.id,
          stepNumber: 2,
          toolName: "scrapeWebsite",
          isToolCall: true,
        })
      ).rejects.toThrow(ToolCallLimitExceededError);
    });

    it("should enforce budget ceiling and throw BudgetExceededError", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const testLead = await createTestLead("Limit Budget");

      // Create run with budgetLimit = 0.05
      const run = await agentRepo.createRun({
        leadId: testLead.id,
        budgetLimitUsd: 0.05,
      });

      // Step 1: cost $0.03 (under budget)
      await agentRepo.recordStep({
        runId: run.id,
        stepNumber: 1,
        toolName: "llmFactExtractor",
        costUsd: 0.03,
      });

      // Step 2: cost $0.03 (projected total $0.06 > $0.05)
      await expect(
        agentRepo.recordStep({
          runId: run.id,
          stepNumber: 2,
          toolName: "llmFactExtractor",
          costUsd: 0.03,
        })
      ).rejects.toThrow(BudgetExceededError);
    });

    it("should enforce execution deadline via AbortSignal and throw error", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const testLead = await createTestLead("Timeout Lead");

      const run = await agentRepo.createRun({ leadId: testLead.id });

      const controller = new AbortController();
      controller.abort("Wall-clock timeout deadline expired");

      await expect(
        agentRepo.recordStep({
          runId: run.id,
          stepNumber: 1,
          toolName: "scrapeWebsite",
          signal: controller.signal,
        })
      ).rejects.toThrow("Execution aborted for agent run");
    });
  });

  describe("Cancellation & State Persistence", () => {
    it("should cancel active run, persist state as CANCELLED, and log operator reason", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const testLead = await createTestLead("Cancel Lead");

      const run = await agentRepo.createRun({ leadId: testLead.id });
      await agentRepo.transitionState(run.id, "RESEARCHING");

      // Cancel the run
      const cancelledRun = await agentRepo.cancelRun(run.id, {
        actorId: "lead_supervisor",
        actorRole: "ADMIN",
        reason: "Company is undergoing restructuring; discontinue research",
      });

      expect(cancelledRun.state).toBe("CANCELLED");
      expect(cancelledRun.error_code).toBe("CANCELLED_BY_OPERATOR");
      expect(cancelledRun.error_details).toContain("restructuring");

      // Verify audit log has the cancellation reason
      const pool = getPool();
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE lead_id = $1 AND event_type = 'AGENT_RUN_CANCELLED' ORDER BY recorded_at DESC LIMIT 1;",
        [testLead.id]
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].actor_id).toBe("lead_supervisor");
      expect(auditRes.rows[0].actor_role).toBe("ADMIN");

      // Verify subsequent step attempt on cancelled run is rejected
      await expect(
        agentRepo.recordStep({
          runId: run.id,
          stepNumber: 1,
          toolName: "scrapeWebsite",
        })
      ).rejects.toThrow(/Cannot record step on agent run in non-executable state 'CANCELLED'/);
    });
  });

  describe("Persisted Research & Decoupled Lead Scores", () => {
    it("should save structured company research and decoupled lead scores with evidence coverage", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const testLead = await createTestLead("Evidence Tech");

      const run = await agentRepo.createRun({ leadId: testLead.id });

      // 1. Save company research
      const research = await agentRepo.saveCompanyResearch({
        leadId: testLead.id,
        runId: run.id,
        industry: "Enterprise Cybersecurity SaaS",
        companySize: "100-250 employees",
        offerings: ["Endpoint Detection", "Zero Trust Identity", "Threat Intelligence"],
        techStack: ["Next.js", "Kubernetes", "PostgreSQL", "Go"],
        summary: "Provider of AI-powered threat detection platforms for enterprise clients.",
        contentHash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        rawEvidence: {
          scrapedPage: "https://evidencetech-test.io/about",
          extractedFacts: 14,
        },
      });

      expect(research.id).toBeDefined();
      expect(research.lead_id).toBe(testLead.id);
      expect(research.industry).toBe("Enterprise Cybersecurity SaaS");
      expect(research.offerings).toHaveLength(3);
      expect(research.tech_stack).toHaveLength(4);

      // 2. Save decoupled lead score
      const leadScore = await agentRepo.saveLeadScore({
        leadId: testLead.id,
        runId: run.id,
        score: 88,
        confidence: 0.92,
        evidenceCoverage: 0.85,
        tier: "TIER_1",
        criteriaBreakdown: {
          industry: { score: 30, maxScore: 30, evidence: "Cybersecurity SaaS", verified: true },
          companySize: { score: 25, maxScore: 25, evidence: "150 employees", verified: true },
          productOffering: { score: 20, maxScore: 25, evidence: "B2B SaaS", verified: true },
          techStack: { score: 13, maxScore: 20, evidence: "Modern cloud stack", verified: true },
        },
        missingInfo: [],
        evidenceUrls: [
          "https://evidencetech-test.io/about",
          "https://evidencetech-test.io/products",
        ],
        rationale: "Excellent ICP fit with verified enterprise SaaS offering.",
      });

      expect(leadScore.id).toBeDefined();
      expect(leadScore.score).toBe(88);
      expect(leadScore.confidence).toBe(0.92);
      expect(leadScore.evidence_coverage).toBe(0.85);
      expect(leadScore.tier).toBe("TIER_1");

      // 3. Verify retrieval by lead ID
      const retrievedScore = await agentRepo.getLeadScoreByLeadId(testLead.id);
      expect(retrievedScore?.id).toBe(leadScore.id);
      expect(retrievedScore?.score).toBe(88);

      const retrievedResearch = await agentRepo.getCompanyResearchByLeadId(testLead.id);
      expect(retrievedResearch?.id).toBe(research.id);
      expect(retrievedResearch?.industry).toBe("Enterprise Cybersecurity SaaS");
    });
  });
});
