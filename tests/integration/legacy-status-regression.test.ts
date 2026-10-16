import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { checkDatabaseHealth, getPool, closePools } from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";
import {
  AgentRepository,
  AgentRepositoryError,
  IneligibleLeadStatusError,
  PendingReviewConflictError,
} from "@/lib/agent/repository";
import { LeadStatusSchema, LeadStatus } from "@/types/lead";
import { mapAgentStateToLeadStatus } from "@/lib/agent/state-machine";

describe("Regression & Domain Separation Suite: Lead Status vs Agent State", () => {
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
      actorId: "status_test_operator",
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

  describe("1. Legacy Milestone 1 Status Compatibility", () => {
    const legacyStatuses: LeadStatus[] = [
      "QUALIFIED",
      "PROPOSAL_DRAFTED",
      "OUTREACH_ACTIVE",
      "ARCHIVED",
      "DISQUALIFIED",
    ];

    it.each(legacyStatuses)(
      "should preserve legacy status '%s' in PostgreSQL and LeadRepository",
      async (status: LeadStatus) => {
        if (!isDbHealthy) {
          return;
        }

        const lead = await createTestLead(`Legacy-${status}`);
        expect(lead.status).toBe("INGESTED");

        // Update status to legacy value
        const updated = await leadRepo.updateStatus({
          leadId: lead.id,
          newStatus: status,
          actorId: "operator_m1",
          actorRole: "SALES_OPERATOR",
        });
        expect(updated.status).toBe(status);

        // Fetch back and assert persistence
        const { lead: fetched } = await leadRepo.getLeadWithAudit(lead.id);
        expect(fetched?.status).toBe(status);

        // Filter list query by legacy status
        const listResult = await leadRepo.listLeads({
          page: 1,
          limit: 10,
          status,
        });
        const found = listResult.data.find((l) => l.id === lead.id);
        expect(found).toBeDefined();
        expect(found?.status).toBe(status);
      }
    );

    it("should validate all legacy and Milestone 2 lead statuses against LeadStatusSchema", () => {
      const allValidStatuses = [
        "INGESTED",
        "RESEARCHING",
        "AWAITING_APPROVAL",
        "INSUFFICIENT_EVIDENCE",
        "QUALIFIED",
        "DISQUALIFIED",
        "PROPOSAL_DRAFTED",
        "OUTREACH_ACTIVE",
        "ARCHIVED",
        "FAILED",
      ];

      for (const st of allValidStatuses) {
        const parsed = LeadStatusSchema.safeParse(st);
        expect(parsed.success).toBe(true);
      }
    });

    it("should strictly reject agent internal execution states in LeadStatusSchema", () => {
      // These internal pipeline execution states must not exist in business lead domain
      expect(LeadStatusSchema.safeParse("RESEARCH_COMPLETED").success).toBe(false);
      expect(LeadStatusSchema.safeParse("SCORING").success).toBe(false);
      expect(LeadStatusSchema.safeParse("NON_EXISTENT_STATUS").success).toBe(false);
    });
  });

  describe("2. Domain Separation: leads.status vs agent_runs.state", () => {
    it("should keep leads.status at RESEARCHING during internal agent execution stages", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Domain-Separation");

      // 1. Create run: lead transitions to RESEARCHING
      const run = await agentRepo.createRun({
        leadId: lead.id,
        actorId: "agent_runner",
        actorRole: "AGENT",
      });
      expect(run.state).toBe("INGESTED");

      let { lead: currentLead } = await leadRepo.getLeadWithAudit(lead.id);
      expect(currentLead?.status).toBe("RESEARCHING");

      // 2. Transition agent run to RESEARCHING -> lead status stays RESEARCHING
      const runResearching = await agentRepo.transitionState(run.id, "RESEARCHING", {
        expectedVersion: 1,
      });
      expect(runResearching.state).toBe("RESEARCHING");
      ({ lead: currentLead } = await leadRepo.getLeadWithAudit(lead.id));
      expect(currentLead?.status).toBe("RESEARCHING");

      // 3. Transition agent run to RESEARCH_COMPLETED -> lead status MUST stay RESEARCHING
      const runCompleted = await agentRepo.transitionState(run.id, "RESEARCH_COMPLETED", {
        expectedVersion: 2,
      });
      expect(runCompleted.state).toBe("RESEARCH_COMPLETED");
      ({ lead: currentLead } = await leadRepo.getLeadWithAudit(lead.id));
      expect(currentLead?.status).toBe("RESEARCHING"); // Must NOT leak RESEARCH_COMPLETED

      // 4. Transition agent run to SCORING -> lead status MUST stay RESEARCHING
      const runScoring = await agentRepo.transitionState(run.id, "SCORING", {
        expectedVersion: 3,
      });
      expect(runScoring.state).toBe("SCORING");
      ({ lead: currentLead } = await leadRepo.getLeadWithAudit(lead.id));
      expect(currentLead?.status).toBe("RESEARCHING"); // Must NOT leak SCORING

      // 5. Transition agent run to AWAITING_APPROVAL -> lead status becomes AWAITING_APPROVAL
      const runApproval = await agentRepo.transitionState(run.id, "AWAITING_APPROVAL", {
        expectedVersion: 4,
      });
      expect(runApproval.state).toBe("AWAITING_APPROVAL");
      ({ lead: currentLead } = await leadRepo.getLeadWithAudit(lead.id));
      expect(currentLead?.status).toBe("AWAITING_APPROVAL");
    });

    it("should map CANCELLED to retryable INGESTED business status, and technical failures to FAILED", () => {
      expect(mapAgentStateToLeadStatus("CANCELLED")).toBe("INGESTED");
      expect(mapAgentStateToLeadStatus("TIMED_OUT")).toBe("FAILED");
      expect(mapAgentStateToLeadStatus("FAILED")).toBe("FAILED");
      expect(mapAgentStateToLeadStatus("DISQUALIFIED")).toBe("DISQUALIFIED");
    });

    it("should allow rerun after cancellation without destroying prior run history", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Cancellation-Rerun");

      // Initial run
      const run1 = await agentRepo.createRun({ leadId: lead.id, actorId: "operator_1" });
      expect(run1.state).toBe("INGESTED");

      // Cancel run
      const cancelledRun = await agentRepo.cancelRun(run1.id, {
        actorId: "operator_1",
        reason: "Cancelled by sales rep to re-check URL",
      });
      expect(cancelledRun.state).toBe("CANCELLED");

      // Verify leads.status was reset to retryable INGESTED (not business FAILED)
      const { lead: leadAfterCancel } = await leadRepo.getLeadWithAudit(lead.id);
      expect(leadAfterCancel?.status).toBe("INGESTED");

      // Rerun lead
      const rerun = await agentRepo.createRun({ leadId: lead.id, actorId: "operator_1" });
      expect(rerun.id).toBeDefined();
      expect(rerun.id).not.toBe(run1.id);
      expect(rerun.state).toBe("INGESTED");

      // Verify lead status is now RESEARCHING
      const { lead: leadAfterRerun } = await leadRepo.getLeadWithAudit(lead.id);
      expect(leadAfterRerun?.status).toBe("RESEARCHING");

      // Verify the cancelled run is still completely preserved in database
      const preservedRun = await agentRepo.getRun(run1.id);
      expect(preservedRun).toBeDefined();
      expect(preservedRun?.state).toBe("CANCELLED");
    });
  });

  describe("3. Lead Status Invariants on createRun and Cancellation Rollback", () => {
    const nonEligibleStatuses: LeadStatus[] = [
      "ARCHIVED",
      "QUALIFIED",
      "PROPOSAL_DRAFTED",
      "OUTREACH_ACTIVE",
      "DISQUALIFIED",
    ];

    it.each(nonEligibleStatuses)(
      "should reject createRun when lead is in non-eligible business status '%s'",
      async (status: LeadStatus) => {
        if (!isDbHealthy) {
          return;
        }

        const lead = await createTestLead(`NonEligible-${status}`);
        await leadRepo.updateStatus({
          leadId: lead.id,
          newStatus: status,
          actorId: "test_operator",
          actorRole: "SALES_OPERATOR",
        });

        await expect(
          agentRepo.createRun({ leadId: lead.id, actorId: "operator_1" })
        ).rejects.toThrow(IneligibleLeadStatusError);
      }
    );

    it("should reject createRun when lead status is AWAITING_APPROVAL without allowRerun: true", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("PendingApproval-Gating");
      await leadRepo.updateStatus({
        leadId: lead.id,
        newStatus: "AWAITING_APPROVAL",
        actorId: "test_operator",
        actorRole: "SALES_OPERATOR",
      });

      await expect(
        agentRepo.createRun({ leadId: lead.id, actorId: "operator_1" })
      ).rejects.toThrow(PendingReviewConflictError);
    });

    it("should reject createRun when lead status is INSUFFICIENT_EVIDENCE without allowRerun: true", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("InsufficientEvidence-Gating");
      await leadRepo.updateStatus({
        leadId: lead.id,
        newStatus: "INSUFFICIENT_EVIDENCE",
        actorId: "test_operator",
        actorRole: "SALES_OPERATOR",
      });

      await expect(
        agentRepo.createRun({ leadId: lead.id, actorId: "operator_1" })
      ).rejects.toThrow(PendingReviewConflictError);
    });

    it("should allow createRun when lead status is AWAITING_APPROVAL with allowRerun: true", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("PendingApproval-Allowed");
      await leadRepo.updateStatus({
        leadId: lead.id,
        newStatus: "AWAITING_APPROVAL",
        actorId: "test_operator",
        actorRole: "SALES_OPERATOR",
      });

      const run = await agentRepo.createRun({
        leadId: lead.id,
        allowRerun: true,
        actorId: "operator_1",
      });
      expect(run.id).toBeDefined();
      expect(run.state).toBe("INGESTED");
    });

    it("should restore previous business status AWAITING_APPROVAL when rerun is cancelled", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Cancel-Awaiting");
      const run1 = await agentRepo.createRun({ leadId: lead.id, actorId: "op" });
      await agentRepo.transitionState(run1.id, "RESEARCHING", { expectedVersion: 1 });
      await agentRepo.transitionState(run1.id, "RESEARCH_COMPLETED", { expectedVersion: 2 });
      await agentRepo.transitionState(run1.id, "SCORING", { expectedVersion: 3 });
      await agentRepo.transitionState(run1.id, "AWAITING_APPROVAL", { expectedVersion: 4 });

      // Lead is now in AWAITING_APPROVAL
      let { lead: currentLead } = await leadRepo.getLeadWithAudit(lead.id);
      expect(currentLead?.status).toBe("AWAITING_APPROVAL");

      // Start rerun
      const rerun = await agentRepo.createRun({ leadId: lead.id, allowRerun: true, actorId: "op" });
      expect(rerun.state).toBe("INGESTED");

      // While in progress, lead is RESEARCHING
      ({ lead: currentLead } = await leadRepo.getLeadWithAudit(lead.id));
      expect(currentLead?.status).toBe("RESEARCHING");

      // Cancel the rerun
      const cancelledRerun = await agentRepo.cancelRun(rerun.id, {
        actorId: "op",
        reason: "Cancelled rerun to review existing draft",
      });
      expect(cancelledRerun.state).toBe("CANCELLED");

      // Assert lead status was restored to AWAITING_APPROVAL, preserving valid business status
      ({ lead: currentLead } = await leadRepo.getLeadWithAudit(lead.id));
      expect(currentLead?.status).toBe("AWAITING_APPROVAL");
    });

    it("should restore previous business status INSUFFICIENT_EVIDENCE when rerun is cancelled", async (ctx) => {
      if (!isDbHealthy) {
        ctx.skip("Skipped: PostgreSQL is not available.");
        return;
      }

      const lead = await createTestLead("Cancel-Insufficient");
      const run1 = await agentRepo.createRun({ leadId: lead.id, actorId: "op" });
      await agentRepo.transitionState(run1.id, "RESEARCHING", { expectedVersion: 1 });
      await agentRepo.transitionState(run1.id, "RESEARCH_COMPLETED", { expectedVersion: 2 });
      await agentRepo.transitionState(run1.id, "SCORING", { expectedVersion: 3 });
      await agentRepo.transitionState(run1.id, "INSUFFICIENT_EVIDENCE", { expectedVersion: 4 });

      // Lead is now in INSUFFICIENT_EVIDENCE
      let { lead: currentLead } = await leadRepo.getLeadWithAudit(lead.id);
      expect(currentLead?.status).toBe("INSUFFICIENT_EVIDENCE");

      // Start rerun
      const rerun = await agentRepo.createRun({ leadId: lead.id, allowRerun: true, actorId: "op" });
      expect(rerun.state).toBe("INGESTED");

      // Cancel the rerun
      const cancelledRerun = await agentRepo.cancelRun(rerun.id, {
        actorId: "op",
        reason: "Cancelled rerun",
      });
      expect(cancelledRerun.state).toBe("CANCELLED");

      // Assert lead status was restored to INSUFFICIENT_EVIDENCE
      ({ lead: currentLead } = await leadRepo.getLeadWithAudit(lead.id));
      expect(currentLead?.status).toBe("INSUFFICIENT_EVIDENCE");
    });
  });
});
