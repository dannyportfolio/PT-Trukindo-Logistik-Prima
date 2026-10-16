import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runAgentPipeline,
  AgentRunner,
  AgentRunnerError,
  PIPELINE_RESIDUAL_RISK_NOTE,
} from "../../src/lib/agent/runner";
import {
  AgentRepository,
  ActiveRunCollisionError,
  PendingReviewConflictError,
  IneligibleLeadStatusError,
  StepLimitExceededError,
  ToolCallLimitExceededError,
  BudgetExceededError,
  RunNotFoundError,
} from "../../src/lib/agent/repository";
import { LeadRepository, Lead } from "../../src/lib/lead-repository";
import {
  LlmGatewayClient,
  GatewayCompletionResponse,
  GatewayBudgetExceededError,
  ModelNotPermittedError,
  UnverifiableCostError,
  GatewayConnectionError,
  GatewayHttpError,
} from "../../src/lib/gateway";
import { AgentRun } from "../../src/types/agent";
import * as scraperModule from "../../src/lib/agent/tools/scraper";
import { SsrfError } from "../../src/lib/agent/tools/ssrf-guard";

describe("Agent Runner & Pipeline Orchestrator Unit Suite (Group 5)", () => {
  let mockAgentRepo: AgentRepository;
  let mockLeadRepo: LeadRepository;
  let mockGatewayClient: LlmGatewayClient;

  const sampleLead: Lead = {
    id: "11111111-1111-1111-1111-111111111111",
    company_name: "Apex Cloud Systems",
    website_url: "https://apexcloud.io",
    contact_name: "John Doe",
    contact_email: "john@apexcloud.io",
    status: "INGESTED",
    created_at: new Date(),
    updated_at: new Date(),
  };

  const createSampleRun = (overrides: Partial<AgentRun> = {}): AgentRun => ({
    id: "22222222-2222-2222-2222-222222222222",
    lead_id: sampleLead.id,
    state: "INGESTED",
    current_step: 0,
    max_steps: 10,
    tool_calls_count: 0,
    max_tool_calls: 5,
    accrued_cost_usd: 0,
    budget_limit_usd: 0.5,
    version_id: 1,
    checkpoint_data: {},
    error_code: null,
    error_details: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  const sampleScrapeResult: scraperModule.ScrapeResult = {
    originalUrl: "https://apexcloud.io",
    finalUrl: "https://apexcloud.io",
    statusCode: 200,
    headers: { "content-type": "text/html" },
    rawHtml: "<html><body>Apex Cloud Systems Enterprise Kubernetes FinOps</body></html>",
    sanitizedText: "Apex Cloud Systems Enterprise Kubernetes FinOps. Cloud cost optimization platform for enterprise engineering.",
    quarantineEnvelope: "<untrusted_scraped_data>Clean Text</untrusted_scraped_data>",
    title: "Apex Cloud Systems",
    metaDescription: "Enterprise FinOps",
    headings: ["Apex Cloud", "Kubernetes"],
    redirectCount: 0,
    durationMs: 250,
    retryCount: 0,
    backoffMs: 0,
    triggerStatusCode: null,
  };

  const validStage1ExtractorResponse = JSON.stringify({
    industry: "Enterprise Cloud Observability & FinOps",
    company_size: "50-100 employees",
    offerings: ["Kubernetes FinOps Platform", "Cloud Cost Anomaly Alerts"],
    tech_stack: ["TypeScript", "Go", "PostgreSQL", "Kubernetes"],
    summary: "Apex Cloud provides enterprise cloud cost monitoring.",
    evidence_urls: ["https://apexcloud.io/platform", "https://apexcloud.io/pricing"],
  });

  const validStage2Tier1ScorerResponse = JSON.stringify({
    criteria: {
      industry: { score: 28, rationale: "Strong B2B Cloud sector", observed: true },
      company_size: { score: 24, rationale: "Growth stage 50-100", observed: true },
      offerings: { score: 24, rationale: "Enterprise FinOps", observed: true },
      tech_stack: { score: 18, rationale: "Modern TypeScript and Go stack", observed: true },
    },
    confidence: 0.9,
    overall_rationale: "Exceptional ICP match for outbound pipeline.",
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    let currentRun = createSampleRun();

    mockAgentRepo = {
      createRun: vi.fn().mockImplementation(async () => {
        currentRun = createSampleRun();
        return currentRun;
      }),
      getRun: vi.fn().mockImplementation(async () => currentRun),
      transitionState: vi.fn().mockImplementation(async (_runId, toState, options = {}) => {
        currentRun = {
          ...currentRun,
          state: toState,
          version_id: currentRun.version_id + 1,
          error_code: options.errorCode || currentRun.error_code,
          error_details: options.errorDetails || currentRun.error_details,
        };
        return currentRun;
      }),
      recordStep: vi.fn().mockImplementation(async (input) => {
        currentRun = {
          ...currentRun,
          current_step: currentRun.current_step + 1,
          tool_calls_count: currentRun.tool_calls_count + (input.isToolCall ? 1 : 0),
          accrued_cost_usd: currentRun.accrued_cost_usd + (input.costUsd || 0),
        };
        return {
          id: "step-" + currentRun.current_step,
          run_id: currentRun.id,
          step_number: currentRun.current_step,
          tool_name: input.toolName,
          tokens_used: input.tokensUsed || 0,
          cost_usd: input.costUsd || 0,
          duration_ms: input.durationMs || 0,
          created_at: new Date(),
        };
      }),
      saveCompanyResearch: vi.fn().mockResolvedValue({
        id: "res-1",
        lead_id: sampleLead.id,
        industry: "Cloud",
      }),
      saveLeadScore: vi.fn().mockImplementation(async (input) => ({
        id: "score-1",
        lead_id: input.leadId,
        run_id: input.runId,
        score: input.score,
        confidence: input.confidence,
        evidence_coverage: input.evidenceCoverage,
        tier: input.tier,
        criteria_breakdown: input.criteriaBreakdown,
        missing_info: input.missingInfo,
        evidence_urls: input.evidenceUrls,
        rationale: input.rationale,
        created_at: new Date(),
        updated_at: new Date(),
      })),
      getCompanyResearch: vi.fn().mockResolvedValue(null),
      getLeadScore: vi.fn().mockResolvedValue(null),
      cancelRun: vi.fn().mockImplementation(async () => {
        currentRun = {
          ...currentRun,
          state: "CANCELLED",
          error_code: "CANCELLED_BY_OPERATOR",
        };
        return currentRun;
      }),
    } as unknown as AgentRepository;

    mockLeadRepo = {
      getLeadWithAudit: vi.fn().mockResolvedValue({
        lead: sampleLead,
        auditLogs: [],
      }),
    } as unknown as LeadRepository;

    mockGatewayClient = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: validStage1ExtractorResponse,
          model: "openai/gpt-4o-mini",
          usage: { promptTokens: 200, completionTokens: 80, totalTokens: 280 },
          cost: {
            pricingVersion: "2026-10-15-v1",
            estimatedWorstCaseCostUsd: 0.0005,
            actualCostUsd: 0.00008,
            residualUncertaintyNote: "test",
            usageVerified: true,
          },
          durationMs: 200,
        } as GatewayCompletionResponse)
        .mockResolvedValueOnce({
          content: validStage2Tier1ScorerResponse,
          model: "openai/gpt-4o-mini",
          usage: { promptTokens: 220, completionTokens: 90, totalTokens: 310 },
          cost: {
            pricingVersion: "2026-10-15-v1",
            estimatedWorstCaseCostUsd: 0.0005,
            actualCostUsd: 0.00009,
            residualUncertaintyNote: "test",
            usageVerified: true,
          },
          durationMs: 250,
        } as GatewayCompletionResponse),
    };

    vi.spyOn(scraperModule, "scrapeWebsite").mockImplementation(async (_url, options) => {
      if (options?.agentContext) {
        await options.agentContext.agentRepo.recordStep({
          runId: options.agentContext.runId,
          stepNumber: options.agentContext.stepNumber,
          toolName: "scrapeWebsite",
          isToolCall: true,
        });
      }
      return sampleScrapeResult;
    });
  });

  // ============================================================================
  // Suite 1: Full Successful Orchestration
  // ============================================================================
  describe("1. Full Pipeline Orchestration & Review Gate", () => {
    it("should successfully orchestrate lead research, extraction, scoring, and transition to AWAITING_APPROVAL", async () => {
      const runner = new AgentRunner(mockAgentRepo, mockLeadRepo, mockGatewayClient);

      const result = await runner.run({
        leadId: sampleLead.id,
        actorId: "test_runner",
        actorRole: "SALES_OPERATOR",
      });

      expect(result.success).toBe(true);
      expect(result.state).toBe("AWAITING_APPROVAL");
      expect(result.finalLeadStatus).toBe("AWAITING_APPROVAL");
      expect(result.residualRiskNote).toBe(PIPELINE_RESIDUAL_RISK_NOTE);

      // Verify state progression: INGESTED -> RESEARCHING -> RESEARCH_COMPLETED -> SCORING -> AWAITING_APPROVAL
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "RESEARCHING",
        expect.anything()
      );
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "RESEARCH_COMPLETED",
        expect.anything()
      );
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "SCORING",
        expect.anything()
      );
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "AWAITING_APPROVAL",
        expect.anything()
      );

      // Verify tool dispatches
      expect(scraperModule.scrapeWebsite).toHaveBeenCalledTimes(1);
      expect(mockGatewayClient.complete).toHaveBeenCalledTimes(2); // Stage 1 + Stage 2

      // Verify steps and tool calls recorded
      expect(mockAgentRepo.recordStep).toHaveBeenCalledTimes(3);
    });

    it("should route lead to INSUFFICIENT_EVIDENCE if critical facts or evidence coverage are below threshold", async () => {
      // Stage 1 facts with missing industry
      const factsMissingIndustry = JSON.stringify({
        industry: null,
        company_size: "50 employees",
        offerings: ["Cloud Analytics"],
        tech_stack: ["Go"],
        summary: null,
        evidence_urls: ["https://apexcloud.io/about"],
      });

      mockGatewayClient.complete = vi
        .fn()
        .mockResolvedValueOnce({
          content: factsMissingIndustry,
          model: "openai/gpt-4o-mini",
          usage: { promptTokens: 150, completionTokens: 60, totalTokens: 210 },
          cost: { actualCostUsd: 0.00005, usageVerified: true },
          durationMs: 150,
        } as GatewayCompletionResponse)
        .mockResolvedValueOnce({
          content: JSON.stringify({
            criteria: {
              industry: { score: 15, rationale: "Unobserved", observed: false },
              company_size: { score: 20, rationale: "Known", observed: true },
              offerings: { score: 20, rationale: "Known", observed: true },
              tech_stack: { score: 15, rationale: "Known", observed: true },
            },
            confidence: 0.8,
            overall_rationale: "Missing industry",
          }),
          model: "openai/gpt-4o-mini",
          usage: { promptTokens: 180, completionTokens: 70, totalTokens: 250 },
          cost: { actualCostUsd: 0.00006, usageVerified: true },
          durationMs: 180,
        } as GatewayCompletionResponse);

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(true);
      expect(result.state).toBe("INSUFFICIENT_EVIDENCE");
      expect(result.finalLeadStatus).toBe("INSUFFICIENT_EVIDENCE");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "INSUFFICIENT_EVIDENCE",
        expect.anything()
      );
    });
  });

  // ============================================================================
  // Suite 2: Terminal and Suspended State Protection
  // ============================================================================
  describe("2. Terminal and Suspended State Invariance", () => {
    it("should refuse to execute new steps if run is already in terminal state FAILED", async () => {
      const terminalRun = createSampleRun({
        state: "FAILED",
        error_code: "PREVIOUS_FAILURE",
        error_details: "Previous crash",
      });
      mockAgentRepo.getRun = vi.fn().mockResolvedValue(terminalRun);

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        runId: terminalRun.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.state).toBe("FAILED");
      expect(scraperModule.scrapeWebsite).not.toHaveBeenCalled();
      expect(mockGatewayClient.complete).not.toHaveBeenCalled();
    });

    it("should refuse to execute new steps if run is already in suspended state AWAITING_APPROVAL", async () => {
      const suspendedRun = createSampleRun({
        state: "AWAITING_APPROVAL",
      });
      mockAgentRepo.getRun = vi.fn().mockResolvedValue(suspendedRun);

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        runId: suspendedRun.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(true);
      expect(result.state).toBe("AWAITING_APPROVAL");
      expect(scraperModule.scrapeWebsite).not.toHaveBeenCalled();
      expect(mockGatewayClient.complete).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Suite 3: Bounded Execution Guards & Limits
  // ============================================================================
  describe("3. Bounded Execution Guards & Limits", () => {
    it("should halt execution and mark FAILED when step limit is exceeded", async () => {
      // Mock recordStep throwing StepLimitExceededError
      mockAgentRepo.recordStep = vi
        .fn()
        .mockRejectedValue(new StepLimitExceededError("run-1", 11, 10));

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("STEP_LIMIT_EXCEEDED");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "FAILED",
        expect.objectContaining({ errorCode: "STEP_LIMIT_EXCEEDED" })
      );
    });

    it("should halt execution and mark FAILED when tool call limit is exceeded", async () => {
      mockAgentRepo.recordStep = vi
        .fn()
        .mockRejectedValue(new ToolCallLimitExceededError("run-1", 6, 5));

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("TOOL_CALL_LIMIT_EXCEEDED");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "FAILED",
        expect.objectContaining({ errorCode: "TOOL_CALL_LIMIT_EXCEEDED" })
      );
    });

    it("should halt execution and mark TIMED_OUT when wall-clock timeout is exceeded", async () => {
      // Fast timeout 10ms
      vi.spyOn(scraperModule, "scrapeWebsite").mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50))
      );

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        timeoutMs: 15,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.state).toBe("TIMED_OUT");
      expect(result.error?.code).toBe("TIMED_OUT");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "TIMED_OUT",
        expect.objectContaining({ errorCode: "TIMED_OUT" })
      );
    });

    it("should halt execution and mark FAILED with BUDGET_EXCEEDED when gateway budget is exceeded", async () => {
      mockGatewayClient.complete = vi
        .fn()
        .mockRejectedValue(new GatewayBudgetExceededError(0.51, 0.5, 0.49));

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("BUDGET_EXCEEDED");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "FAILED",
        expect.objectContaining({ errorCode: "BUDGET_EXCEEDED" })
      );
    });

    it("should halt execution and mark FAILED with MODEL_NOT_PERMITTED when unapproved model is requested", async () => {
      mockGatewayClient.complete = vi
        .fn()
        .mockRejectedValue(new ModelNotPermittedError("unauthorized/gpt-custom"));

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("MODEL_NOT_PERMITTED");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "FAILED",
        expect.objectContaining({ errorCode: "MODEL_NOT_PERMITTED" })
      );
    });

    it("should halt execution and fail-closed with UNVERIFIABLE_COST_HALT when gateway usage cannot be verified", async () => {
      mockGatewayClient.complete = vi
        .fn()
        .mockRejectedValue(new UnverifiableCostError("Gateway omitted usage"));

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("UNVERIFIABLE_COST_HALT");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "FAILED",
        expect.objectContaining({ errorCode: "UNVERIFIABLE_COST_HALT" })
      );
    });
  });

  // ============================================================================
  // Suite 4: Operator Cancellation
  // ============================================================================
  describe("4. Operator Cancellation & Signal Handling", () => {
    it("should transition to CANCELLED and abort operations when AbortSignal triggers", async () => {
      const abortController = new AbortController();

      vi.spyOn(scraperModule, "scrapeWebsite").mockImplementation(async () => {
        abortController.abort("Operator cancelled via UI");
        throw new Error("AbortError");
      });

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        signal: abortController.signal,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.state).toBe("CANCELLED");
      expect(result.error?.code).toBe("CANCELLED_BY_OPERATOR");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "CANCELLED",
        expect.objectContaining({ errorCode: "CANCELLED_BY_OPERATOR" })
      );
    });

    it("should immediately halt without running tools if database run is already marked CANCELLED", async () => {
      const cancelledRun = createSampleRun({
        state: "CANCELLED",
        error_code: "CANCELLED_BY_OPERATOR",
      });
      mockAgentRepo.getRun = vi.fn().mockResolvedValue(cancelledRun);

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        runId: cancelledRun.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.state).toBe("CANCELLED");
      expect(scraperModule.scrapeWebsite).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Suite 5: SSRF Rejection & Scraper Unresponsiveness
  // ============================================================================
  describe("5. SSRF Rejection & Scraper Failure", () => {
    it("should halt with SSRF_VIOLATION when scraper detects private or metadata IP without retrying", async () => {
      vi.spyOn(scraperModule, "scrapeWebsite").mockRejectedValue(
        new SsrfError("Target IP 169.254.169.254 is blacklisted")
      );

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("SSRF_VIOLATION");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "FAILED",
        expect.objectContaining({ errorCode: "SSRF_VIOLATION" })
      );
      // Ensure LLM was never called
      expect(mockGatewayClient.complete).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Suite 6: Model Validation & Malformed Output
  // ============================================================================
  describe("6. Malformed Model Output & Prompt Injection Defense", () => {
    it("should halt with EXTRACTOR_VALIDATION_ERROR when Stage 1 returns malformed output", async () => {
      mockGatewayClient.complete = vi.fn().mockResolvedValue({
        content: "Raw text without JSON formatting",
        model: "openai/gpt-4o-mini",
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        cost: { actualCostUsd: 0.00002, usageVerified: true },
        durationMs: 100,
      } as GatewayCompletionResponse);

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EXTRACTOR_VALIDATION_ERROR");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "FAILED",
        expect.objectContaining({ errorCode: "EXTRACTOR_VALIDATION_ERROR" })
      );
      // Stage 2 Scorer must NOT be executed!
      expect(mockGatewayClient.complete).toHaveBeenCalledTimes(1);
    });

    it("should halt with SCORER_VALIDATION_ERROR when Stage 2 returns malformed output", async () => {
      // Stage 1 succeeds, Stage 2 returns bad JSON
      mockGatewayClient.complete = vi
        .fn()
        .mockResolvedValueOnce({
          content: validStage1ExtractorResponse,
          model: "openai/gpt-4o-mini",
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          cost: { actualCostUsd: 0.00003, usageVerified: true },
          durationMs: 120,
        } as GatewayCompletionResponse)
        .mockResolvedValueOnce({
          content: "Bad JSON from scorer",
          model: "openai/gpt-4o-mini",
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
          cost: { actualCostUsd: 0.00002, usageVerified: true },
          durationMs: 100,
        } as GatewayCompletionResponse);

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("SCORER_VALIDATION_ERROR");
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "FAILED",
        expect.objectContaining({ errorCode: "SCORER_VALIDATION_ERROR" })
      );
    });
  });

  // ============================================================================
  // Suite 7: Sanitization of Error Details & throwOnError Option
  // ============================================================================
  describe("7. Sanitization & throwOnError Option", () => {
    it("should redact API keys or Bearer tokens in error messages", async () => {
      vi.spyOn(scraperModule, "scrapeWebsite").mockRejectedValue(
        new Error("Connection failed with Bearer secret-token-123456 and api_key=xyz987")
      );

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.error?.message).not.toContain("secret-token-123456");
      expect(result.error?.message).toContain("Bearer [REDACTED]");
    });

    it("should throw AgentRunnerError when throwOnError is true", async () => {
      vi.spyOn(scraperModule, "scrapeWebsite").mockRejectedValue(
        new SsrfError("Target IP 127.0.0.1 is blacklisted")
      );

      await expect(
        runAgentPipeline({
          leadId: sampleLead.id,
          agentRepo: mockAgentRepo,
          leadRepo: mockLeadRepo,
          gatewayClient: mockGatewayClient,
          throwOnError: true,
        })
      ).rejects.toThrow(AgentRunnerError);
    });
  });

  // ============================================================================
  // Suite 8: Lead Status Invariants & Rerun Permissions
  // ============================================================================
  describe("8. Lead Status Invariants & Rerun Permissions", () => {
    const ineligibleStatuses = [
      "QUALIFIED",
      "DISQUALIFIED",
      "ARCHIVED",
      "PROPOSAL_DRAFTED",
      "OUTREACH_ACTIVE",
    ] as const;

    for (const st of ineligibleStatuses) {
      it(`should reject pipeline execution when lead is in non-eligible status '${st}' with INELIGIBLE_LEAD_STATUS`, async () => {
        mockLeadRepo.getLeadWithAudit = vi.fn().mockResolvedValue({
          lead: { ...sampleLead, status: st },
          auditLogs: [],
        });

        const result = await runAgentPipeline({
          leadId: sampleLead.id,
          agentRepo: mockAgentRepo,
          leadRepo: mockLeadRepo,
          gatewayClient: mockGatewayClient,
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INELIGIBLE_LEAD_STATUS");
        expect(mockAgentRepo.createRun).not.toHaveBeenCalled();
      });
    }

    it("should reject rerun without allowRerun: true when lead is in AWAITING_APPROVAL with PENDING_REVIEW_CONFLICT", async () => {
      mockLeadRepo.getLeadWithAudit = vi.fn().mockResolvedValue({
        lead: { ...sampleLead, status: "AWAITING_APPROVAL" },
        auditLogs: [],
      });

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PENDING_REVIEW_CONFLICT");
      expect(mockAgentRepo.createRun).not.toHaveBeenCalled();
    });

    it("should reject rerun without allowRerun: true when lead is in INSUFFICIENT_EVIDENCE with PENDING_REVIEW_CONFLICT", async () => {
      mockLeadRepo.getLeadWithAudit = vi.fn().mockResolvedValue({
        lead: { ...sampleLead, status: "INSUFFICIENT_EVIDENCE" },
        auditLogs: [],
      });

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PENDING_REVIEW_CONFLICT");
      expect(mockAgentRepo.createRun).not.toHaveBeenCalled();
    });

    it("should permit rerun from AWAITING_APPROVAL when allowRerun: true is explicitly authorized", async () => {
      mockLeadRepo.getLeadWithAudit = vi.fn().mockResolvedValue({
        lead: { ...sampleLead, status: "AWAITING_APPROVAL" },
        auditLogs: [],
      });

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        allowRerun: true,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(true);
      expect(mockAgentRepo.createRun).toHaveBeenCalledWith(
        expect.objectContaining({ allowRerun: true })
      );
    });

    it("should restore previousLeadStatus (AWAITING_APPROVAL) when rerun is cancelled by operator", async () => {
      mockLeadRepo.getLeadWithAudit = vi.fn().mockResolvedValue({
        lead: { ...sampleLead, status: "AWAITING_APPROVAL" },
        auditLogs: [],
      });

      // Rerun created with previousLeadStatus in checkpoint_data
      const rerunRun = createSampleRun({
        checkpoint_data: { previousLeadStatus: "AWAITING_APPROVAL" },
      });
      mockAgentRepo.createRun = vi.fn().mockResolvedValue(rerunRun);
      mockAgentRepo.getRun = vi.fn().mockResolvedValue(rerunRun);

      const abortController = new AbortController();
      vi.spyOn(scraperModule, "scrapeWebsite").mockImplementation(async () => {
        abortController.abort("Operator cancelled rerun");
        throw new Error("AbortError");
      });

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        allowRerun: true,
        signal: abortController.signal,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.state).toBe("CANCELLED");
      expect(result.error?.code).toBe("CANCELLED_BY_OPERATOR");
      // Assert finalLeadStatus is restored to AWAITING_APPROVAL, not forced to INGESTED
      expect(result.finalLeadStatus).toBe("AWAITING_APPROVAL");
    });
  });

  // ============================================================================
  // Suite 9: Gateway Failure Fail-Closed (No Direct-Provider Fallback)
  // ============================================================================
  describe("9. Gateway Failure Fail-Closed Policy (No Direct Provider Fallback)", () => {
    it("should fail-closed immediately when 9Router connection fails without direct provider fallback", async () => {
      mockGatewayClient.complete = vi
        .fn()
        .mockRejectedValue(new GatewayConnectionError("ECONNREFUSED 127.0.0.1:20128"));

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.state).toBe("FAILED");
      expect(mockGatewayClient.complete).toHaveBeenCalledTimes(1);
      expect(mockAgentRepo.transitionState).toHaveBeenCalledWith(
        expect.anything(),
        "FAILED",
        expect.anything()
      );
    });

    it("should fail-closed when 9Router returns HTTP 503 without secondary fallback", async () => {
      mockGatewayClient.complete = vi
        .fn()
        .mockRejectedValue(new GatewayHttpError(503, "Service Unavailable"));

      const result = await runAgentPipeline({
        leadId: sampleLead.id,
        agentRepo: mockAgentRepo,
        leadRepo: mockLeadRepo,
        gatewayClient: mockGatewayClient,
      });

      expect(result.success).toBe(false);
      expect(result.state).toBe("FAILED");
      expect(mockGatewayClient.complete).toHaveBeenCalledTimes(1);
    });
  });
});
