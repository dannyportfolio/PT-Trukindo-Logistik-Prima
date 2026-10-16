import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { checkDatabaseHealth, getPool, closePools } from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";
import {
  AgentRepository,
  StepLimitExceededError,
  ToolCallLimitExceededError,
  BudgetExceededError,
  AgentRepositoryError,
} from "@/lib/agent/repository";

describe("Live PostgreSQL Integration Suite: Atomic Concurrent Guardrails", () => {
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
      actorId: "concurrent_guardrails_operator",
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

  describe("1. Atomic Database Concurrency: max_steps enforcement", () => {
    it("should strictly enforce max_steps under concurrent step execution and maintain audit log consistency", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Concurrent-Steps");
      const run = await agentRepo.createRun({
        leadId: lead.id,
        maxSteps: 3, // Hard cap: 3 steps
      });

      // Launch 8 concurrent step submissions
      const promises = Array.from({ length: 8 }).map((_, idx) =>
        agentRepo.recordStep({
          runId: run.id,
          stepNumber: idx + 1,
          toolName: `concurrentTool_${idx + 1}`,
          inputPayload: { attempt: idx + 1 },
          outputPayload: { done: true },
        })
      );

      const results = await Promise.allSettled(promises);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly 3 must succeed, 5 must be rejected
      expect(fulfilled).toHaveLength(3);
      expect(rejected).toHaveLength(5);

      // Verify each rejection is due to step limit
      for (const rej of rejected) {
        if (rej.status === "rejected") {
          expect(rej.reason).toBeInstanceOf(AgentRepositoryError);
          expect(
            rej.reason instanceof StepLimitExceededError ||
            (rej.reason as Error).message.includes("Step limit exceeded") ||
            (rej.reason as Error).message.includes("bounds exceeded")
          ).toBe(true);
        }
      }

      // Verify PostgreSQL agent_runs table state
      const dbRun = await agentRepo.getRun(run.id);
      expect(dbRun?.current_step).toBe(3);

      // Verify committed agent_steps count in database matches exactly 3
      const dbSteps = await agentRepo.getRunSteps(run.id);
      expect(dbSteps).toHaveLength(3);

      // Verify audit logs have EXACTLY 3 AGENT_STEP_EXECUTED events (no orphaned audit entries)
      const { auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
      const stepAuditEvents = auditLogs.filter((a) => a.event_type === "AGENT_STEP_EXECUTED");
      expect(stepAuditEvents).toHaveLength(3);
    });
  });

  describe("2. Atomic Database Concurrency: max_tool_calls enforcement", () => {
    it("should strictly enforce max_tool_calls under concurrent requests", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Concurrent-ToolCalls");
      const run = await agentRepo.createRun({
        leadId: lead.id,
        maxSteps: 10,
        maxToolCalls: 2, // Hard cap: 2 tool calls
      });

      // Launch 6 concurrent tool calls
      const promises = Array.from({ length: 6 }).map((_, idx) =>
        agentRepo.recordStep({
          runId: run.id,
          stepNumber: idx + 1,
          toolName: `toolCall_${idx + 1}`,
          isToolCall: true,
        })
      );

      const results = await Promise.allSettled(promises);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly 2 must succeed, 4 must be rejected
      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(4);

      for (const rej of rejected) {
        if (rej.status === "rejected") {
          expect(
            rej.reason instanceof ToolCallLimitExceededError ||
            (rej.reason as Error).message.includes("Tool call limit exceeded") ||
            (rej.reason as Error).message.includes("bounds exceeded")
          ).toBe(true);
        }
      }

      // Verify database agent_runs state
      const dbRun = await agentRepo.getRun(run.id);
      expect(dbRun?.tool_calls_count).toBe(2);

      // Verify audit logs consistency
      const { auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
      const stepAudits = auditLogs.filter((a) => a.event_type === "AGENT_STEP_EXECUTED");
      expect(stepAudits).toHaveLength(2);
    });
  });

  describe("3. Atomic Database Concurrency: budget_limit_usd enforcement", () => {
    it("should strictly enforce budget_limit_usd under concurrent cost accrual", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Concurrent-Budget");
      const run = await agentRepo.createRun({
        leadId: lead.id,
        maxSteps: 10,
        budgetLimitUsd: 0.10, // Hard ceiling: $0.10
      });

      // Launch 5 concurrent steps each costing $0.04
      // Step 1: $0.04
      // Step 2: $0.08
      // Step 3: $0.12 -> EXCEEDS $0.10!
      const promises = Array.from({ length: 5 }).map((_, idx) =>
        agentRepo.recordStep({
          runId: run.id,
          stepNumber: idx + 1,
          toolName: `costlyStep_${idx + 1}`,
          costUsd: 0.04,
        })
      );

      const results = await Promise.allSettled(promises);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly 2 must succeed (total $0.08), 3 must be rejected
      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(3);

      for (const rej of rejected) {
        if (rej.status === "rejected") {
          expect(
            rej.reason instanceof BudgetExceededError ||
            (rej.reason as Error).message.includes("Budget ceiling exceeded") ||
            (rej.reason as Error).message.includes("bounds exceeded")
          ).toBe(true);
        }
      }

      const dbRun = await agentRepo.getRun(run.id);
      expect(dbRun?.accrued_cost_usd).toBe(0.08);
      expect(dbRun!.accrued_cost_usd).toBeLessThanOrEqual(0.10);

      // Verify audit logs consistency
      const { auditLogs } = await leadRepo.getLeadWithAudit(lead.id);
      const stepAudits = auditLogs.filter((a) => a.event_type === "AGENT_STEP_EXECUTED");
      expect(stepAudits).toHaveLength(2);
    });
  });

  describe("4. Cancellation Race & Terminal State Guardrails", () => {
    it("should reject step execution when raced with operator cancellation", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Cancel-Race");
      const run = await agentRepo.createRun({ leadId: lead.id });

      // Cancel run
      await agentRepo.cancelRun(run.id, {
        actorId: "operator_abort",
        reason: "User cancelled task",
      });

      // Verify run is CANCELLED in DB
      const dbRun = await agentRepo.getRun(run.id);
      expect(dbRun?.state).toBe("CANCELLED");

      // Subsequent step submission must be rejected
      await expect(
        agentRepo.recordStep({
          runId: run.id,
          stepNumber: 1,
          toolName: "postCancelTool",
        })
      ).rejects.toThrow(/CANCELLED/);

      // Verify no step was recorded
      const dbSteps = await agentRepo.getRunSteps(run.id);
      expect(dbSteps).toHaveLength(0);
    });

    it("should reject step execution when wall-clock deadline is exceeded", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Deadline-Test");
      const run = await agentRepo.createRun({ leadId: lead.id });

      // Pass deadlineMs = 1 (1 millisecond timeout)
      // Wait 15ms to ensure deadline is passed
      await new Promise((resolve) => setTimeout(resolve, 15));

      await expect(
        agentRepo.recordStep({
          runId: run.id,
          stepNumber: 1,
          toolName: "slowTool",
          deadlineMs: 1,
        })
      ).rejects.toThrow(/Deadline exceeded for agent run/);
    });
  });

  describe("5. State Eligibility: Bar Non-Executable States from Receiving Steps", () => {
    const ineligibleStates = [
      "AWAITING_APPROVAL",
      "INSUFFICIENT_EVIDENCE",
      "DISQUALIFIED",
      "CANCELLED",
      "TIMED_OUT",
      "FAILED",
    ] as const;

    for (const testState of ineligibleStates) {
      it(`should strictly reject step recording when run is in '${testState}' without changing counters or writing audit events`, async (ctx) => {
        if (!isDbHealthy) {
          ctx.skip("Skipped: PostgreSQL is not available.");
          return;
        }

        const lead = await createTestLead(`Ineligible-${testState}`);
        const run = await agentRepo.createRun({ leadId: lead.id });

        // Move run to target test state
        if (testState === "AWAITING_APPROVAL") {
          await agentRepo.transitionState(run.id, "RESEARCHING", { expectedVersion: 1 });
          await agentRepo.transitionState(run.id, "RESEARCH_COMPLETED", { expectedVersion: 2 });
          await agentRepo.transitionState(run.id, "SCORING", { expectedVersion: 3 });
          await agentRepo.transitionState(run.id, "AWAITING_APPROVAL", { expectedVersion: 4 });
        } else if (testState === "INSUFFICIENT_EVIDENCE") {
          await agentRepo.transitionState(run.id, "RESEARCHING", { expectedVersion: 1 });
          await agentRepo.transitionState(run.id, "RESEARCH_COMPLETED", { expectedVersion: 2 });
          await agentRepo.transitionState(run.id, "SCORING", { expectedVersion: 3 });
          await agentRepo.transitionState(run.id, "INSUFFICIENT_EVIDENCE", { expectedVersion: 4 });
        } else if (testState === "DISQUALIFIED") {
          await agentRepo.transitionState(run.id, "RESEARCHING", { expectedVersion: 1 });
          await agentRepo.transitionState(run.id, "RESEARCH_COMPLETED", { expectedVersion: 2 });
          await agentRepo.transitionState(run.id, "SCORING", { expectedVersion: 3 });
          await agentRepo.transitionState(run.id, "DISQUALIFIED", { expectedVersion: 4 });
        } else if (testState === "CANCELLED") {
          await agentRepo.cancelRun(run.id);
        } else if (testState === "TIMED_OUT") {
          await agentRepo.transitionState(run.id, "RESEARCHING", { expectedVersion: 1 });
          await agentRepo.transitionState(run.id, "TIMED_OUT", { expectedVersion: 2 });
        } else if (testState === "FAILED") {
          await agentRepo.transitionState(run.id, "FAILED", { expectedVersion: 1 });
        }

        const runBefore = await agentRepo.getRun(run.id);
        expect(runBefore?.state).toBe(testState);
        const stepsBefore = (await agentRepo.getRunSteps(run.id)).length;
        const { auditLogs: auditsBefore } = await leadRepo.getLeadWithAudit(lead.id);
        const stepAuditsBefore = auditsBefore.filter((a) => a.event_type === "AGENT_STEP_EXECUTED").length;

        // Attempting to record step in this state must fail
        await expect(
          agentRepo.recordStep({
            runId: run.id,
            stepNumber: 1,
            toolName: "testToolShouldFail",
          })
        ).rejects.toThrow(new RegExp(testState));

        // Verify counters did NOT change
        const runAfter = await agentRepo.getRun(run.id);
        expect(runAfter?.current_step).toBe(runBefore?.current_step);
        expect(runAfter?.tool_calls_count).toBe(runBefore?.tool_calls_count);
        expect(runAfter?.accrued_cost_usd).toBe(runBefore?.accrued_cost_usd);

        // Verify no agent step was recorded in database
        const stepsAfter = (await agentRepo.getRunSteps(run.id)).length;
        expect(stepsAfter).toBe(stepsBefore);

        // Verify NO audit event was written for the rejected step
        const { auditLogs: auditsAfter } = await leadRepo.getLeadWithAudit(lead.id);
        const stepAuditsAfter = auditsAfter.filter((a) => a.event_type === "AGENT_STEP_EXECUTED").length;
        expect(stepAuditsAfter).toBe(stepAuditsBefore);
      });
    }
  });
});
