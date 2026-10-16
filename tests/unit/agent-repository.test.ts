import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AgentRepository,
  RunNotFoundError,
  ActiveRunCollisionError,
  PendingReviewConflictError,
  ConcurrencyConflictError,
  StepLimitExceededError,
  ToolCallLimitExceededError,
  BudgetExceededError,
  RunDeadlineExceededError,
} from "@/lib/agent/repository";
import { IllegalStateTransitionError } from "@/lib/agent/state-machine";
import { Pool, PoolClient } from "pg";

describe("AgentRepository Unit Suite", () => {
  let mockClient: PoolClient;
  let mockPool: Pool;
  let repo: AgentRepository;

  const sampleLead = {
    id: "11111111-1111-1111-1111-111111111111",
    status: "INGESTED",
  };

  const sampleRunRow = {
    id: "22222222-2222-2222-2222-222222222222",
    lead_id: sampleLead.id,
    state: "INGESTED",
    current_step: 0,
    max_steps: 10,
    tool_calls_count: 0,
    max_tool_calls: 5,
    accrued_cost_usd: "0.0000",
    budget_limit_usd: "0.5000",
    version_id: 1,
    checkpoint_data: {},
    error_code: null,
    error_details: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    } as unknown as PoolClient;

    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    repo = new AgentRepository(mockPool);
  });

  describe("createRun", () => {
    it("should atomically insert agent_run, update lead status, and record audit log", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, status FROM leads")) {
          return Promise.resolve({ rows: [sampleLead] });
        }
        if (sql.includes("FROM agent_runs") && sql.includes("WHERE lead_id")) {
          return Promise.resolve({ rows: [] }); // No active run
        }
        if (sql.includes("INSERT INTO agent_runs")) {
          return Promise.resolve({ rows: [sampleRunRow] });
        }
        if (sql.includes("UPDATE leads SET status")) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes("INSERT INTO audit_logs")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const run = await repo.createRun({
        leadId: sampleLead.id,
        actorId: "test_operator",
        actorRole: "SALES_OPERATOR",
      });

      expect(run.id).toBe(sampleRunRow.id);
      expect(run.state).toBe("INGESTED");
      expect(run.version_id).toBe(1);

      // Verify BEGIN and COMMIT were invoked
      expect(mockQuery).toHaveBeenCalledWith("BEGIN;");
      expect(mockQuery).toHaveBeenCalledWith("COMMIT;");

      // Verify lead status updated to RESEARCHING
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE leads SET status = 'RESEARCHING'"),
        [sampleLead.id]
      );

      // Verify audit log entry
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO audit_logs"),
        expect.arrayContaining([sampleLead.id, "test_operator", "SALES_OPERATOR"])
      );
    });

    it("should reject creation if target lead does not exist", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, status FROM leads")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        repo.createRun({ leadId: "00000000-0000-0000-0000-000000000000" })
      ).rejects.toThrow("Target lead with ID '00000000-0000-0000-0000-000000000000' not found");

      expect(mockQuery).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("should reject creation if an active run already exists for the lead", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, status FROM leads")) {
          return Promise.resolve({ rows: [sampleLead] });
        }
        if (sql.includes("FROM agent_runs") && sql.includes("WHERE lead_id") && sql.includes("'INGESTED'")) {
          return Promise.resolve({
            rows: [{ id: "existing-run-id", state: "RESEARCHING" }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(repo.createRun({ leadId: sampleLead.id })).rejects.toThrow(
        ActiveRunCollisionError
      );

      expect(mockQuery).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("should reject creation if lead has pending review run unless allowRerun is true", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, status FROM leads")) {
          return Promise.resolve({ rows: [sampleLead] });
        }
        if (sql.includes("FROM agent_runs") && sql.includes("WHERE lead_id") && sql.includes("'INGESTED'")) {
          return Promise.resolve({ rows: [] }); // No active run
        }
        if (sql.includes("FROM agent_runs") && sql.includes("WHERE lead_id") && sql.includes("'AWAITING_APPROVAL'")) {
          return Promise.resolve({
            rows: [{ id: "pending-run-id", state: "AWAITING_APPROVAL" }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(repo.createRun({ leadId: sampleLead.id })).rejects.toThrow(
        PendingReviewConflictError
      );

      expect(mockQuery).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("should permit rerun when allowRerun is explicitly true and record AGENT_RUN_RERUN_TRIGGERED", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT id, status FROM leads")) {
          return Promise.resolve({ rows: [sampleLead] });
        }
        if (sql.includes("FROM agent_runs") && sql.includes("WHERE lead_id") && sql.includes("'INGESTED'")) {
          return Promise.resolve({ rows: [] }); // No active run
        }
        if (sql.includes("FROM agent_runs") && sql.includes("WHERE lead_id") && sql.includes("'AWAITING_APPROVAL'")) {
          return Promise.resolve({
            rows: [{ id: "pending-run-id", state: "AWAITING_APPROVAL" }],
          });
        }
        if (sql.includes("INSERT INTO agent_runs")) {
          return Promise.resolve({ rows: [sampleRunRow] });
        }
        if (sql.includes("UPDATE leads SET status")) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes("INSERT INTO audit_logs")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const run = await repo.createRun({
        leadId: sampleLead.id,
        allowRerun: true,
        actorId: "supervisor",
        actorRole: "ADMIN",
      });

      expect(run.id).toBe(sampleRunRow.id);
      expect(mockQuery).toHaveBeenCalledWith("COMMIT;");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO audit_logs"),
        expect.arrayContaining([
          sampleLead.id,
          "supervisor",
          "ADMIN",
          expect.stringContaining("pending-run-id"),
        ])
      );
    });
  });

  describe("transitionState", () => {
    it("should allow valid state transition, increment version_id, and record audit log", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      const updatedRow = {
        ...sampleRunRow,
        state: "RESEARCHING",
        version_id: 2,
      };

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({ rows: [sampleRunRow] });
        }
        if (sql.includes("UPDATE agent_runs")) {
          return Promise.resolve({ rows: [updatedRow] });
        }
        if (sql.includes("UPDATE leads SET status")) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes("INSERT INTO audit_logs")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await repo.transitionState(sampleRunRow.id, "RESEARCHING", {
        expectedVersion: 1,
        actorId: "test_actor",
      });

      expect(result.state).toBe("RESEARCHING");
      expect(result.version_id).toBe(2);

      expect(mockQuery).toHaveBeenCalledWith("COMMIT;");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO audit_logs"),
        expect.arrayContaining([
          sampleRunRow.lead_id,
          "test_actor",
          "system",
          expect.any(String),
          expect.stringContaining('"toState":"RESEARCHING"'),
        ])
      );
    });

    it("should reject illegal state transitions via state machine assertions", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({ rows: [sampleRunRow] }); // INGESTED state
        }
        return Promise.resolve({ rows: [] });
      });

      // INGESTED directly to AWAITING_APPROVAL is illegal
      await expect(
        repo.transitionState(sampleRunRow.id, "AWAITING_APPROVAL")
      ).rejects.toThrow(IllegalStateTransitionError);

      expect(mockQuery).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("should throw ConcurrencyConflictError when expectedVersion does not match current version", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({
            rows: [{ ...sampleRunRow, version_id: 3 }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        repo.transitionState(sampleRunRow.id, "RESEARCHING", { expectedVersion: 1 })
      ).rejects.toThrow(ConcurrencyConflictError);

      expect(mockQuery).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("should throw RunNotFoundError when run ID does not exist", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        repo.transitionState("00000000-0000-0000-0000-000000000000", "RESEARCHING")
      ).rejects.toThrow(RunNotFoundError);
    });

    it("should abort state transition when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort("User manually stopped operation");

      await expect(
        repo.transitionState(sampleRunRow.id, "RESEARCHING", {
          signal: controller.signal,
        })
      ).rejects.toThrow("State transition aborted for agent run");
    });
  });

  describe("recordStep & Bounded Guardrails", () => {
    it("should record step, increment step count, update accrued cost, and log audit trail", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      const activeRun = {
        ...sampleRunRow,
        state: "RESEARCHING",
        current_step: 1,
        accrued_cost_usd: "0.0500",
      };

      const stepRow = {
        id: "33333333-3333-3333-3333-333333333333",
        run_id: sampleRunRow.id,
        step_number: 2,
        tool_name: "scrapeWebsite",
        input_payload: { url: "https://example.com" },
        output_payload: { status: 200 },
        tokens_used: 1500,
        cost_usd: "0.0200",
        duration_ms: 1200,
        retry_count: 0,
        backoff_ms: null,
        trigger_status_code: null,
        created_at: new Date(),
      };

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({ rows: [activeRun] });
        }
        if (sql.includes("INSERT INTO agent_steps")) {
          return Promise.resolve({ rows: [stepRow] });
        }
        if (sql.includes("UPDATE agent_runs")) {
          return Promise.resolve({
            rows: [
              {
                ...activeRun,
                current_step: 2,
                tool_calls_count: 1,
                accrued_cost_usd: "0.0700",
              },
            ],
          });
        }
        if (sql.includes("INSERT INTO audit_logs")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const step = await repo.recordStep({
        runId: sampleRunRow.id,
        stepNumber: 2,
        toolName: "scrapeWebsite",
        inputPayload: { url: "https://example.com" },
        outputPayload: { status: 200 },
        tokensUsed: 1500,
        costUsd: 0.02,
        durationMs: 1200,
        isToolCall: true,
      });

      expect(step.id).toBe(stepRow.id);
      expect(step.step_number).toBe(2);
      expect(step.tokens_used).toBe(1500);

      expect(mockQuery).toHaveBeenCalledWith("COMMIT;");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE agent_runs"),
        [2, 1, 0.07, sampleRunRow.id]
      );
    });

    it("should throw StepLimitExceededError when nextStep exceeds max_steps", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({
            rows: [
              {
                ...sampleRunRow,
                state: "RESEARCHING",
                current_step: 10,
                max_steps: 10,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        repo.recordStep({
          runId: sampleRunRow.id,
          stepNumber: 11,
          toolName: "scrapeWebsite",
        })
      ).rejects.toThrow(StepLimitExceededError);

      expect(mockQuery).toHaveBeenCalledWith("ROLLBACK;");
    });

    it("should throw ToolCallLimitExceededError when nextToolCalls exceeds max_tool_calls", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({
            rows: [
              {
                ...sampleRunRow,
                state: "RESEARCHING",
                current_step: 3,
                tool_calls_count: 5,
                max_tool_calls: 5,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        repo.recordStep({
          runId: sampleRunRow.id,
          stepNumber: 4,
          toolName: "scrapeWebsite",
          isToolCall: true,
        })
      ).rejects.toThrow(ToolCallLimitExceededError);
    });

    it("should throw BudgetExceededError when projected cost exceeds budget limit", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({
            rows: [
              {
                ...sampleRunRow,
                state: "RESEARCHING",
                current_step: 2,
                accrued_cost_usd: "0.4500",
                budget_limit_usd: "0.5000",
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        repo.recordStep({
          runId: sampleRunRow.id,
          stepNumber: 3,
          toolName: "llmFactExtractor",
          costUsd: 0.06, // 0.45 + 0.06 = 0.51 > 0.50
        })
      ).rejects.toThrow(BudgetExceededError);
    });

    it("should reject recording steps on a terminal run", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({
            rows: [{ ...sampleRunRow, state: "FAILED" }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        repo.recordStep({
          runId: sampleRunRow.id,
          stepNumber: 1,
          toolName: "testTool",
        })
      ).rejects.toThrow("Cannot record step on agent run in non-executable state 'FAILED'");
    });

    it("should abort step recording when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort("Request cancelled by caller");

      await expect(
        repo.recordStep({
          runId: sampleRunRow.id,
          stepNumber: 1,
          toolName: "testTool",
          signal: controller.signal,
        })
      ).rejects.toThrow("Execution aborted for agent run");
    });

    it("should throw RunDeadlineExceededError when run execution time exceeds deadline", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      const expiredRun = {
        ...sampleRunRow,
        state: "RESEARCHING",
        created_at: new Date(Date.now() - 150_000), // 150s ago (exceeds 120s limit)
      };

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({ rows: [expiredRun] });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        repo.recordStep({
          runId: sampleRunRow.id,
          stepNumber: 1,
          toolName: "testTool",
        })
      ).rejects.toThrow(RunDeadlineExceededError);
    });
  });

  describe("cancelRun", () => {
    it("should cancel an active run and record operator reason in audit logs", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      const activeRun = { ...sampleRunRow, state: "RESEARCHING" };
      const cancelledRun = {
        ...sampleRunRow,
        state: "CANCELLED",
        error_code: "CANCELLED_BY_OPERATOR",
        version_id: 2,
      };

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1;")) {
          return Promise.resolve({ rows: [activeRun] });
        }
        if (sql.includes("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")) {
          return Promise.resolve({ rows: [activeRun] });
        }
        if (sql.includes("UPDATE agent_runs")) {
          return Promise.resolve({ rows: [cancelledRun] });
        }
        if (sql.includes("INSERT INTO audit_logs")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const res = await repo.cancelRun(sampleRunRow.id, {
        actorId: "operator_bob",
        reason: "User cancelled inquiry",
      });

      expect(res.state).toBe("CANCELLED");
      expect(mockQuery).toHaveBeenCalledWith("COMMIT;");
    });
  });

  describe("saveCompanyResearch & saveLeadScore", () => {
    it("should save structured company research and emit audit log", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      const researchRow = {
        id: "44444444-4444-4444-4444-444444444444",
        lead_id: sampleLead.id,
        run_id: sampleRunRow.id,
        industry: "SaaS Enterprise",
        company_size: "50-200",
        offerings: ["CRM", "Billing"],
        tech_stack: ["Next.js", "PostgreSQL"],
        summary: "B2B SaaS Provider",
        content_hash: "abc123hash",
        raw_evidence: { url: "https://example.com/about" },
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("INSERT INTO company_research")) {
          return Promise.resolve({ rows: [researchRow] });
        }
        if (sql.includes("INSERT INTO audit_logs")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const research = await repo.saveCompanyResearch({
        leadId: sampleLead.id,
        runId: sampleRunRow.id,
        industry: "SaaS Enterprise",
        companySize: "50-200",
        offerings: ["CRM", "Billing"],
        techStack: ["Next.js", "PostgreSQL"],
        summary: "B2B SaaS Provider",
      });

      expect(research.id).toBe(researchRow.id);
      expect(research.industry).toBe("SaaS Enterprise");
      expect(research.offerings).toEqual(["CRM", "Billing"]);
      expect(mockQuery).toHaveBeenCalledWith("COMMIT;");
    });

    it("should save lead score with decoupled score, confidence, and evidence_coverage", async () => {
      const mockQuery = mockClient.query as unknown as ReturnType<typeof vi.fn>;
      const scoreRow = {
        id: "55555555-5555-5555-5555-555555555555",
        lead_id: sampleLead.id,
        run_id: sampleRunRow.id,
        score: "85.00",
        confidence: "0.85",
        evidence_coverage: "0.80",
        tier: "TIER_1",
        criteria_breakdown: {
          industry: { score: 30, maxScore: 30, evidence: "B2B SaaS", verified: true },
        },
        missing_info: [],
        evidence_urls: ["https://example.com/about"],
        rationale: "Strong ICP fit",
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("INSERT INTO lead_scores")) {
          return Promise.resolve({ rows: [scoreRow] });
        }
        if (sql.includes("INSERT INTO audit_logs")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const score = await repo.saveLeadScore({
        leadId: sampleLead.id,
        runId: sampleRunRow.id,
        score: 85,
        confidence: 0.85,
        evidenceCoverage: 0.8,
        tier: "TIER_1",
        criteriaBreakdown: {
          industry: { score: 30, maxScore: 30, evidence: "B2B SaaS", verified: true },
        },
        missingInfo: [],
        evidenceUrls: ["https://example.com/about"],
        rationale: "Strong ICP fit",
      });

      expect(score.score).toBe(85);
      expect(score.confidence).toBe(0.85);
      expect(score.evidence_coverage).toBe(0.8);
      expect(score.tier).toBe("TIER_1");
      expect(mockQuery).toHaveBeenCalledWith("COMMIT;");
    });
  });
});
