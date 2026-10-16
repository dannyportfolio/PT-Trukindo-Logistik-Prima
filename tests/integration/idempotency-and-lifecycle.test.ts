import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { checkDatabaseHealth, getPool, closePools } from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";
import {
  AgentRepository,
  ActiveRunCollisionError,
  PendingReviewConflictError,
  IdempotencyConflictError,
} from "@/lib/agent/repository";
import { computePayloadHash } from "@/lib/idempotency";

describe("Live PostgreSQL Integration Suite: Idempotency & Pending-Review Lifecycle", () => {
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
      websiteUrl: `https://${prefix.toLowerCase().replace(/[^a-z0-9]/g, "")}-${ts}.example.com`,
      contactName: `Contact ${ts}`,
      contactEmail: `lead-${ts}@example.com`,
      actorId: "lifecycle_test_operator",
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

  describe("1. Request Idempotency via idempotencyKey", () => {
    it("should return identical run on duplicate request with same idempotencyKey without creating second run or duplicate audit events", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Idempotency-Exact");
      const idempotencyKey = `create-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // First call
      const run1 = await agentRepo.createRun({
        leadId: lead.id,
        idempotencyKey,
        maxSteps: 8,
        actorId: "operator_1",
      });

      expect(run1.id).toBeDefined();
      expect(run1.lead_id).toBe(lead.id);

      // Second identical call (replay / network retry)
      const run2 = await agentRepo.createRun({
        leadId: lead.id,
        idempotencyKey,
        maxSteps: 8,
        actorId: "operator_1",
      });

      // Assert identical instance returned
      expect(run2.id).toBe(run1.id);
      expect(run2.lead_id).toBe(run1.lead_id);
      expect(run2.state).toBe(run1.state);

      // Verify audit logs only contain one AGENT_RUN_CREATED event
      const { auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
      const runCreatedEvents = auditLogs.filter((a) => a.event_type === "AGENT_RUN_CREATED");
      expect(runCreatedEvents).toHaveLength(1);
    });

    it("should throw IdempotencyConflictError when same idempotencyKey is reused with different payload", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Idempotency-Conflict");
      const idempotencyKey = `conflict-key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // First call with maxSteps: 5
      await agentRepo.createRun({
        leadId: lead.id,
        idempotencyKey,
        maxSteps: 5,
      });

      // Second call with mismatched payload (maxSteps: 10)
      await expect(
        agentRepo.createRun({
          leadId: lead.id,
          idempotencyKey,
          maxSteps: 10,
        })
      ).rejects.toThrow(IdempotencyConflictError);
    });

    it("Scenario 1 (Crash before transaction commit): should rollback uncommitted changes, reclaim expired PROCESSING lease on retry, and create run safely without duplicate audit events", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Crash-Before-Commit");
      const idempotencyKey = `crash-precommit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const pool = getPool();

      // 1. Simulate process acquiring idempotency claim in PROCESSING state,
      // then crashing BEFORE transaction commits (or transaction rolling back on error).
      const payloadHash = computePayloadHash({
        leadId: lead.id,
        maxSteps: 6,
        maxToolCalls: 4,
        budgetLimitUsd: 0.5,
      });

      // Insert initial idempotency lease in PROCESSING state, backdated to simulate expired lease
      await pool.query(
        `INSERT INTO idempotency_keys (key, payload_hash, status, status_code, response_body, created_at)
         VALUES ($1, $2, 'PROCESSING', 0, '{}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '15 seconds');`,
        [idempotencyKey, payloadHash]
      );

      // Verify that NO run exists in agent_runs and NO AGENT_RUN_CREATED audit event exists
      const preRunCheck = await pool.query(
        "SELECT count(*) FROM agent_runs WHERE lead_id = $1;",
        [lead.id]
      );
      expect(Number(preRunCheck.rows[0].count)).toBe(0);

      const preAuditCheck = await pool.query(
        "SELECT count(*) FROM audit_logs WHERE lead_id = $1 AND event_type = 'AGENT_RUN_CREATED';",
        [lead.id]
      );
      expect(Number(preAuditCheck.rows[0].count)).toBe(0);

      // 2. Client retries with the SAME idempotencyKey and identical payload
      // IdempotencyService lease recovery policy reclaims the expired lease and executes createRun
      const run = await agentRepo.createRun({
        leadId: lead.id,
        idempotencyKey,
        maxSteps: 6,
        maxToolCalls: 4,
        budgetLimitUsd: 0.5,
      });

      expect(run.id).toBeDefined();
      expect(run.lead_id).toBe(lead.id);

      // Verify idempotency record is now COMPLETED with this run
      const checkKey = await pool.query<{ status: string; body_id: string }>(
        `SELECT status, (response_body->>'id') as body_id FROM idempotency_keys WHERE key = $1;`,
        [idempotencyKey]
      );
      expect(checkKey.rows[0].status).toBe("COMPLETED");
      expect(checkKey.rows[0].body_id).toBe(run.id);

      // 3. Exactly 1 run exists in agent_runs
      const postRunCheck = await pool.query(
        "SELECT count(*) FROM agent_runs WHERE lead_id = $1;",
        [lead.id]
      );
      expect(Number(postRunCheck.rows[0].count)).toBe(1);

      // 4. Exactly 1 AGENT_RUN_CREATED event exists in audit_logs
      const { auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
      const runCreatedEvents = auditLogs.filter((a) => a.event_type === "AGENT_RUN_CREATED");
      expect(runCreatedEvents).toHaveLength(1);

      // 5. Subsequent retry with MISMATCHED payload is rejected with IdempotencyConflictError
      await expect(
        agentRepo.createRun({
          leadId: lead.id,
          idempotencyKey,
          maxSteps: 9, // Mismatch (9 vs 6), but within global MVP bound 10
        })
      ).rejects.toThrow(IdempotencyConflictError);
    });

    it("Scenario 2 (Inconsistency State Repair): should deterministically heal idempotency key to COMPLETED when run already exists in PostgreSQL and key was left PROCESSING", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Inconsistency-Repair");
      const idempotencyKey = `inconsistency-key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const pool = getPool();

      // 1. Initial run creation succeeds and commits to PostgreSQL
      const run1 = await agentRepo.createRun({
        leadId: lead.id,
        idempotencyKey,
        maxSteps: 6,
      });

      // 2. Induce an inconsistency condition (e.g. simulating legacy state, out-of-transaction anomaly,
      // or uncompleted lease while run is committed in PostgreSQL)
      await pool.query(
        `UPDATE idempotency_keys
         SET status = 'PROCESSING', status_code = 0, response_body = '{}'::jsonb
         WHERE key = $1;`,
        [idempotencyKey]
      );

      // 3. Client retries with the SAME idempotencyKey and identical payload
      // createRun detects existing committed run via audit_logs in Step 1a, verifies payload hash,
      // heals the key to COMPLETED, and returns the existing run.
      const repairedRun = await agentRepo.createRun({
        leadId: lead.id,
        idempotencyKey,
        maxSteps: 6,
      });

      // Assert repaired run matches original persisted run
      expect(repairedRun.id).toBe(run1.id);
      expect(repairedRun.lead_id).toBe(lead.id);

      // Assert idempotency_keys record was healed to COMPLETED
      const checkKey = await pool.query<{ status: string; body_id: string }>(
        `SELECT status, (response_body->>'id') as body_id FROM idempotency_keys WHERE key = $1;`,
        [idempotencyKey]
      );
      expect(checkKey.rows[0].status).toBe("COMPLETED");
      expect(checkKey.rows[0].body_id).toBe(run1.id);

      // 4. Retry with MISMATCHED payload throws IdempotencyConflictError
      await expect(
        agentRepo.createRun({
          leadId: lead.id,
          idempotencyKey,
          maxSteps: 9, // Mismatch (9 vs 6), but within global MVP bound 10
        })
      ).rejects.toThrow(IdempotencyConflictError);

      // 5. Verify audit logs still contain only 1 AGENT_RUN_CREATED event (no duplication)
      const { auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
      const runCreatedEvents = auditLogs.filter((a) => a.event_type === "AGENT_RUN_CREATED");
      expect(runCreatedEvents).toHaveLength(1);
    });
  });

  describe("2. Active-Run Collision Prevention (Distinct from Idempotency)", () => {
    it("should throw ActiveRunCollisionError when attempting a new run for a lead with an in-flight run", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Active-Collision");

      // Initial run (in INGESTED state)
      const firstRun = await agentRepo.createRun({ leadId: lead.id });
      expect(firstRun.state).toBe("INGESTED");

      // Attempting second run without idempotencyKey must throw ActiveRunCollisionError
      await expect(agentRepo.createRun({ leadId: lead.id })).rejects.toThrow(
        ActiveRunCollisionError
      );

      // Move run to RESEARCHING and verify collision still rejected
      await agentRepo.transitionState(firstRun.id, "RESEARCHING", { expectedVersion: 1 });
      await expect(agentRepo.createRun({ leadId: lead.id })).rejects.toThrow(
        ActiveRunCollisionError
      );
    });
  });

  describe("3. Pending-Review Lifecycle (AWAITING_APPROVAL & INSUFFICIENT_EVIDENCE)", () => {
    it("should reject new run creation by default when lead has a run in AWAITING_APPROVAL", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Pending-Awaiting");
      const run = await agentRepo.createRun({ leadId: lead.id });

      // Walk through state machine to AWAITING_APPROVAL
      await agentRepo.transitionState(run.id, "RESEARCHING", { expectedVersion: 1 });
      await agentRepo.transitionState(run.id, "RESEARCH_COMPLETED", { expectedVersion: 2 });
      await agentRepo.transitionState(run.id, "SCORING", { expectedVersion: 3 });
      await agentRepo.transitionState(run.id, "AWAITING_APPROVAL", { expectedVersion: 4 });

      // Attempting new run without allowRerun must throw PendingReviewConflictError
      await expect(agentRepo.createRun({ leadId: lead.id })).rejects.toThrow(
        PendingReviewConflictError
      );
    });

    it("should reject new run creation by default when lead has a run in INSUFFICIENT_EVIDENCE", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Pending-Insufficient");
      const run = await agentRepo.createRun({ leadId: lead.id });

      // Walk through state machine to INSUFFICIENT_EVIDENCE
      await agentRepo.transitionState(run.id, "RESEARCHING", { expectedVersion: 1 });
      await agentRepo.transitionState(run.id, "RESEARCH_COMPLETED", { expectedVersion: 2 });
      await agentRepo.transitionState(run.id, "SCORING", { expectedVersion: 3 });
      await agentRepo.transitionState(run.id, "INSUFFICIENT_EVIDENCE", { expectedVersion: 4 });

      // Attempting new run without allowRerun must throw PendingReviewConflictError
      await expect(agentRepo.createRun({ leadId: lead.id })).rejects.toThrow(
        PendingReviewConflictError
      );
    });

    it("should permit rerun with explicit allowRerun: true, preserving prior run and logging rerun audit event", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Explicit-Rerun");
      const initialRun = await agentRepo.createRun({ leadId: lead.id });

      await agentRepo.transitionState(initialRun.id, "RESEARCHING", { expectedVersion: 1 });
      await agentRepo.transitionState(initialRun.id, "RESEARCH_COMPLETED", { expectedVersion: 2 });
      await agentRepo.transitionState(initialRun.id, "SCORING", { expectedVersion: 3 });
      await agentRepo.transitionState(initialRun.id, "AWAITING_APPROVAL", { expectedVersion: 4 });

      // Explicit rerun
      const rerun = await agentRepo.createRun({
        leadId: lead.id,
        allowRerun: true,
        actorId: "lead_reviewer",
        actorRole: "MANAGER",
      });

      expect(rerun.id).toBeDefined();
      expect(rerun.id).not.toBe(initialRun.id);
      expect(rerun.state).toBe("INGESTED");

      // Verify prior run still exists in database (not destroyed)
      const preservedPriorRun = await agentRepo.getRun(initialRun.id);
      expect(preservedPriorRun).toBeDefined();
      expect(preservedPriorRun?.state).toBe("AWAITING_APPROVAL");

      // Verify audit logs contain AGENT_RUN_RERUN_TRIGGERED event referencing previousRunId
      const { auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
      const rerunEvent = auditLogs.find((a) => a.event_type === "AGENT_RUN_RERUN_TRIGGERED");
      expect(rerunEvent).toBeDefined();
      expect(rerunEvent?.actor_id).toBe("lead_reviewer");
      expect(rerunEvent?.actor_role).toBe("MANAGER");
      expect(JSON.stringify(rerunEvent?.change_diff)).toContain(initialRun.id);
    });
  });
});
