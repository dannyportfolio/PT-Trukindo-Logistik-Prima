import { getPool } from "../db";
import { LeadRepository, Lead } from "../lead-repository";
import {
  AgentRepository,
  RunNotFoundError,
  ActiveRunCollisionError,
  PendingReviewConflictError,
  IneligibleLeadStatusError,
  StepLimitExceededError,
  ToolCallLimitExceededError,
  BudgetExceededError,
} from "./repository";
import {
  AgentRun,
  AgentState,
  AGENT_BOUNDS,
  AllowedModel,
  CompanyResearch,
} from "../../types/agent";
import { LeadScore } from "../../types/qualification";
import { LeadStatus } from "../../types/lead";
import {
  isTerminalState,
  isSuspendedState,
  mapAgentStateToLeadStatus,
} from "./state-machine";
import {
  createGatewayClient,
  LlmGatewayClient,
  GatewayBudgetExceededError,
  ModelNotPermittedError,
  UnverifiableCostError,
  sanitizeErrorMessage,
} from "../gateway";
import {
  scrapeWebsite,
  ScrapeResult,
  AbsoluteRequestTimeoutError,
  RequestTimeoutError,
  ScraperExecutionAbortedError,
  ScraperError,
} from "./tools/scraper";
import { SsrfError } from "./tools/ssrf-guard";
import {
  extractCompanyFacts,
  ExtractedFactsResult,
  ExtractorValidationError,
} from "./tools/extractor";
import {
  scoreCompanyLead,
  ScoreLeadIcpResult,
  ScorerValidationError,
} from "./tools/scorer";

/**
 * Standard residual uncertainty disclaimer logged with agent pipeline executions
 */
export const PIPELINE_RESIDUAL_RISK_NOTE =
  "Agent execution enforces hard resource bounds, model allowlisting, trusted rate card verification, and dual-stage prompt isolation. However, in-flight network timeouts or unverifiable upstream telemetry present residual financial uncertainties bounded by strict per-run budget limits and explicit timeout deadlines.";

/**
 * Error hierarchy for Agent Runner
 */
export class AgentRunnerError extends Error {
  constructor(
    message: string,
    public readonly code: string = "PIPELINE_ERROR",
    public readonly runId?: string,
    public readonly state?: AgentState
  ) {
    super(sanitizeErrorMessage(message));
    this.name = "AgentRunnerError";
  }
}

/**
 * Options and parameters for running an agent pipeline
 */
export interface RunAgentPipelineInput {
  leadId: string;
  runId?: string;
  idempotencyKey?: string;
  allowRerun?: boolean;
  actorId?: string;
  actorRole?: string;
  gatewayClient?: LlmGatewayClient;
  agentRepo?: AgentRepository;
  leadRepo?: LeadRepository;
  signal?: AbortSignal;
  timeoutMs?: number;
  budgetLimitUsd?: number;
  maxSteps?: number;
  maxToolCalls?: number;
  model?: AllowedModel;
  throwOnError?: boolean;
}

/**
 * Final execution result of the agent research & qualification pipeline
 */
export interface RunAgentPipelineResult {
  run: AgentRun;
  lead: Lead;
  state: AgentState;
  finalLeadStatus: LeadStatus | null;
  research: CompanyResearch | null;
  score: LeadScore | null;
  stepsCount: number;
  toolCallsCount: number;
  accruedCostUsd: number;
  durationMs: number;
  success: boolean;
  residualRiskNote: string;
  error?: {
    code: string;
    message: string;
  } | null;
}

/**
 * Class-based Agent Pipeline Orchestrator
 */
export class AgentRunner {
  constructor(
    private readonly agentRepo: AgentRepository,
    private readonly leadRepo: LeadRepository,
    private readonly gatewayClient?: LlmGatewayClient
  ) {}

  /**
   * Executes the full prospect research and qualification pipeline
   */
  async run(input: RunAgentPipelineInput): Promise<RunAgentPipelineResult> {
    return runAgentPipeline({
      ...input,
      agentRepo: this.agentRepo,
      leadRepo: this.leadRepo,
      gatewayClient: this.gatewayClient ?? input.gatewayClient,
    });
  }
}

/**
 * Normalizes and categorizes runtime errors into structured agent error codes and sanitized details
 */
function classifyPipelineError(err: unknown): { code: string; message: string } {
  if (
    err instanceof SsrfError ||
    (err && typeof err === "object" && "code" in err && (err as Record<string, unknown>).code === "SSRF_VIOLATION") ||
    (err && typeof err === "object" && "name" in err && (err as Record<string, unknown>).name === "SsrfError") ||
    (err instanceof Error && err.message.toLowerCase().includes("blacklisted"))
  ) {
    return {
      code: "SSRF_VIOLATION",
      message: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
    };
  }
  if (
    err instanceof GatewayBudgetExceededError ||
    err instanceof BudgetExceededError
  ) {
    return {
      code: "BUDGET_EXCEEDED",
      message: sanitizeErrorMessage(err.message),
    };
  }
  if (err instanceof ModelNotPermittedError) {
    return {
      code: "MODEL_NOT_PERMITTED",
      message: sanitizeErrorMessage(err.message),
    };
  }
  if (err instanceof UnverifiableCostError) {
    return {
      code: "UNVERIFIABLE_COST_HALT",
      message: sanitizeErrorMessage(err.message),
    };
  }
  if (
    err instanceof AbsoluteRequestTimeoutError ||
    err instanceof RequestTimeoutError ||
    (err instanceof Error && err.name === "TimeoutError")
  ) {
    return {
      code: "TIMED_OUT",
      message: "Scraper or model request exceeded deadline",
    };
  }
  if (
    err instanceof ScraperExecutionAbortedError ||
    (err instanceof Error &&
      (err.name === "AbortError" ||
        err.message.includes("AbortError") ||
        err.message.includes("cancelled") ||
        err.message.includes("aborted")))
  ) {
    return {
      code: "CANCELLED_BY_OPERATOR",
      message: "Execution cancelled by operator",
    };
  }
  if (err instanceof AgentRunnerError && err.code === "BOUNDS_EXCEEDED") {
    return {
      code: "BOUNDS_EXCEEDED",
      message: sanitizeErrorMessage(err.message),
    };
  }
  if (err instanceof StepLimitExceededError) {
    return {
      code: "STEP_LIMIT_EXCEEDED",
      message: sanitizeErrorMessage(err.message),
    };
  }
  if (err instanceof ToolCallLimitExceededError) {
    return {
      code: "TOOL_CALL_LIMIT_EXCEEDED",
      message: sanitizeErrorMessage(err.message),
    };
  }
  if (err instanceof ExtractorValidationError) {
    return {
      code: "EXTRACTOR_VALIDATION_ERROR",
      message: sanitizeErrorMessage(err.message).slice(0, 500),
    };
  }
  if (err instanceof ScorerValidationError) {
    return {
      code: "SCORER_VALIDATION_ERROR",
      message: sanitizeErrorMessage(err.message).slice(0, 500),
    };
  }
  if (err instanceof ScraperError) {
    return {
      code: err.code || "SCRAPER_ERROR",
      message: sanitizeErrorMessage(err.message).slice(0, 500),
    };
  }
  if (err instanceof ActiveRunCollisionError) {
    return {
      code: "ACTIVE_RUN_COLLISION",
      message: sanitizeErrorMessage(err.message),
    };
  }
  if (err instanceof PendingReviewConflictError) {
    return {
      code: "PENDING_REVIEW_CONFLICT",
      message: sanitizeErrorMessage(err.message),
    };
  }
  if (
    err instanceof IneligibleLeadStatusError ||
    (err instanceof Error && err.message.includes("non-eligible business status"))
  ) {
    return {
      code: "INELIGIBLE_LEAD_STATUS",
      message: sanitizeErrorMessage(err.message),
    };
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  return {
    code: "PIPELINE_ERROR",
    message: sanitizeErrorMessage(rawMsg).slice(0, 500),
  };
}

/**
 * Main orchestration entrypoint:
 * Connects Lead Validation -> Website Scraper -> Fact Extractor -> ICP Scorer -> Persistence -> Human Review Gate
 */
export async function runAgentPipeline(
  input: RunAgentPipelineInput
): Promise<RunAgentPipelineResult> {
  const startTime = Date.now();
  const pool = getPool();
  const agentRepo = input.agentRepo ?? new AgentRepository(pool);
  const leadRepo = input.leadRepo ?? new LeadRepository(pool);
  const gatewayClient = input.gatewayClient ?? createGatewayClient();

  // Enforce global MVP limits: callers cannot elevate bounds beyond hard bounds
  if (input.maxSteps !== undefined && input.maxSteps > AGENT_BOUNDS.MAX_STEPS) {
    throw new AgentRunnerError(
      `Requested maxSteps (${input.maxSteps}) exceeds global MVP limit (${AGENT_BOUNDS.MAX_STEPS})`,
      "BOUNDS_EXCEEDED"
    );
  }
  if (input.maxToolCalls !== undefined && input.maxToolCalls > AGENT_BOUNDS.MAX_TOOL_CALLS) {
    throw new AgentRunnerError(
      `Requested maxToolCalls (${input.maxToolCalls}) exceeds global MVP limit (${AGENT_BOUNDS.MAX_TOOL_CALLS})`,
      "BOUNDS_EXCEEDED"
    );
  }
  if (input.budgetLimitUsd !== undefined && input.budgetLimitUsd > AGENT_BOUNDS.BUDGET_LIMIT_USD) {
    throw new AgentRunnerError(
      `Requested budgetLimitUsd ($${input.budgetLimitUsd}) exceeds global MVP limit ($${AGENT_BOUNDS.BUDGET_LIMIT_USD})`,
      "BOUNDS_EXCEEDED"
    );
  }

  const timeoutMs = input.timeoutMs ?? AGENT_BOUNDS.WALL_CLOCK_TIMEOUT_MS;
  const deadlineMs = startTime + timeoutMs;
  const maxSteps = input.maxSteps ?? AGENT_BOUNDS.MAX_STEPS;
  const maxToolCalls = input.maxToolCalls ?? AGENT_BOUNDS.MAX_TOOL_CALLS;
  const budgetLimitUsd = input.budgetLimitUsd ?? AGENT_BOUNDS.BUDGET_LIMIT_USD;
  const model = input.model ?? "openai/gpt-4o-mini";
  const actorId = input.actorId || "system";
  const actorRole = input.actorRole || "system";

  // Setup abort controller bound to external signal and wall-clock deadline
  const pipelineAbortController = new AbortController();
  const pipelineSignal = pipelineAbortController.signal;

  let timeoutTimer: NodeJS.Timeout | null = null;
  if (timeoutMs > 0 && timeoutMs !== Infinity) {
    timeoutTimer = setTimeout(() => {
      pipelineAbortController.abort("Global pipeline execution deadline exceeded (120s)");
    }, timeoutMs);
  }

  if (input.signal) {
    input.signal.addEventListener(
      "abort",
      () => {
        pipelineAbortController.abort(input.signal?.reason || "Cancelled by caller");
      },
      { once: true }
    );
  }

  let activeRun: AgentRun | null = null;
  let activeLead: Lead | null = null;

  /**
   * Helper to inspect global bounds, deadlines, and operator cancellations before each stage
   */
  async function checkExecutionGuards(): Promise<void> {
    // 1. Check AbortSignal
    if (pipelineSignal.aborted) {
      const reason = String(pipelineSignal.reason || "aborted");
      if (reason.includes("deadline")) {
        throw new AbsoluteRequestTimeoutError(timeoutMs);
      }
      throw new ScraperExecutionAbortedError(reason);
    }

    // 2. Check Wall-Clock Deadline
    if (Date.now() >= deadlineMs) {
      throw new AbsoluteRequestTimeoutError(timeoutMs);
    }

    // 3. Check Current DB State of Run (if run is already initialized)
    if (activeRun) {
      const refreshed = await agentRepo.getRun(activeRun.id);
      if (!refreshed) {
        throw new RunNotFoundError(activeRun.id);
      }
      activeRun = refreshed;

      // Operator cancellation via database state
      if (activeRun.state === "CANCELLED") {
        throw new ScraperExecutionAbortedError("Run was cancelled by operator in database");
      }

      // Prohibit execution on terminal or suspended states
      if (isTerminalState(activeRun.state) || isSuspendedState(activeRun.state)) {
        throw new AgentRunnerError(
          `Cannot proceed: Run '${activeRun.id}' is in non-executable state '${activeRun.state}'`,
          "INVALID_STATE",
          activeRun.id,
          activeRun.state
        );
      }

      // Check step limit
      if (activeRun.current_step >= activeRun.max_steps) {
        throw new StepLimitExceededError(
          activeRun.id,
          activeRun.current_step,
          activeRun.max_steps
        );
      }

      // Check tool call limit
      if (activeRun.tool_calls_count >= activeRun.max_tool_calls) {
        throw new ToolCallLimitExceededError(
          activeRun.id,
          activeRun.tool_calls_count,
          activeRun.max_tool_calls
        );
      }

      // Check accrued cost against budget ceiling
      if (activeRun.accrued_cost_usd >= activeRun.budget_limit_usd) {
        throw new BudgetExceededError(
          activeRun.id,
          activeRun.accrued_cost_usd,
          activeRun.budget_limit_usd
        );
      }
    }
  }

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Lead Verification & Run Initialization
    // -------------------------------------------------------------------------
    if (input.runId) {
      const existingRun = await agentRepo.getRun(input.runId);
      if (!existingRun) {
        throw new RunNotFoundError(input.runId);
      }
      activeRun = existingRun;

      const { lead } = await leadRepo.getLeadWithAudit(activeRun.lead_id);
      if (!lead) {
        throw new AgentRunnerError(
          `Target lead '${activeRun.lead_id}' for run '${activeRun.id}' not found`,
          "LEAD_NOT_FOUND"
        );
      }
      activeLead = lead;

      // Invariant: Lead in downstream or terminal business statuses cannot execute or resume runs
      const TERMINAL_BUSINESS_STATUSES: LeadStatus[] = [
        "QUALIFIED",
        "DISQUALIFIED",
        "ARCHIVED",
        "PROPOSAL_DRAFTED",
        "OUTREACH_ACTIVE",
      ];
      if (TERMINAL_BUSINESS_STATUSES.includes(activeLead.status)) {
        throw new IneligibleLeadStatusError(activeLead.id, activeLead.status);
      }

      // Invariant: Do not execute new steps if run is already terminal or awaiting review
      if (isTerminalState(activeRun.state) || isSuspendedState(activeRun.state)) {
        const research = await agentRepo.getCompanyResearch(activeRun.lead_id);
        const score = await agentRepo.getLeadScore(activeRun.lead_id);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        return {
          run: activeRun,
          lead: activeLead,
          state: activeRun.state,
          finalLeadStatus: mapAgentStateToLeadStatus(
            activeRun.state,
            (activeRun.checkpoint_data?.previousLeadStatus as LeadStatus) || null
          ),
          research,
          score,
          stepsCount: activeRun.current_step,
          toolCallsCount: activeRun.tool_calls_count,
          accruedCostUsd: activeRun.accrued_cost_usd,
          durationMs: Date.now() - startTime,
          success: !isTerminalState(activeRun.state),
          residualRiskNote: PIPELINE_RESIDUAL_RISK_NOTE,
          error: isTerminalState(activeRun.state)
            ? {
                code: activeRun.error_code || "TERMINAL_STATE",
                message: activeRun.error_details || `Run is in terminal state '${activeRun.state}'`,
              }
            : null,
        };
      }
    } else {
      // Validate lead existence before creating run
      const { lead } = await leadRepo.getLeadWithAudit(input.leadId);
      if (!lead) {
        throw new AgentRunnerError(`Lead with ID '${input.leadId}' not found`, "LEAD_NOT_FOUND");
      }
      activeLead = lead;

      // Invariant: Lead in downstream or terminal business statuses cannot initiate new runs
      const TERMINAL_BUSINESS_STATUSES: LeadStatus[] = [
        "QUALIFIED",
        "DISQUALIFIED",
        "ARCHIVED",
        "PROPOSAL_DRAFTED",
        "OUTREACH_ACTIVE",
      ];
      if (TERMINAL_BUSINESS_STATUSES.includes(activeLead.status)) {
        throw new IneligibleLeadStatusError(activeLead.id, activeLead.status);
      }

      // Prohibit rerun from pending review states without explicit authorization
      if (
        (activeLead.status === "AWAITING_APPROVAL" ||
          activeLead.status === "INSUFFICIENT_EVIDENCE") &&
        !input.allowRerun
      ) {
        throw new PendingReviewConflictError(
          activeLead.id,
          "pending-review-lead",
          activeLead.status
        );
      }

      // Atomically create agent run (enforces eligibility, active run mutual exclusivity, idempotency)
      activeRun = await agentRepo.createRun({
        leadId: input.leadId,
        maxSteps,
        maxToolCalls,
        budgetLimitUsd,
        idempotencyKey: input.idempotencyKey,
        allowRerun: input.allowRerun,
        actorId,
        actorRole,
      });
    }

    await checkExecutionGuards();

    // -------------------------------------------------------------------------
    // Phase 2: State Transition INGESTED -> RESEARCHING & Scraper Dispatch
    // -------------------------------------------------------------------------
    if (activeRun.state === "INGESTED") {
      activeRun = await agentRepo.transitionState(activeRun.id, "RESEARCHING", {
        actorId,
        actorRole,
        signal: pipelineSignal,
      });
    }

    await checkExecutionGuards();

    if (!activeLead.website_url || activeLead.website_url.trim() === "") {
      throw new AgentRunnerError(
        `Lead '${activeLead.id}' has an invalid or empty website URL`,
        "INVALID_WEBSITE_URL"
      );
    }

    // Execute Tool 1: scrapeWebsite (Group 2 SSRF Sandboxing & Cheerio Sanitization)
    const scrapeStepNumber = activeRun.current_step + 1;
    const scrapeResult: ScrapeResult = await scrapeWebsite(activeLead.website_url, {
      deadlineMs,
      signal: pipelineSignal,
      agentContext: {
        agentRepo,
        runId: activeRun.id,
        stepNumber: scrapeStepNumber,
      },
    });

    await checkExecutionGuards();

    // -------------------------------------------------------------------------
    // Phase 3: Stage 1 Fact Extractor (Group 3 XML Quarantine & Semantic Defense)
    // -------------------------------------------------------------------------
    const extractStepNumber = activeRun.current_step + 1;
    const extractResult: ExtractedFactsResult = await extractCompanyFacts({
      leadId: activeLead.id,
      runId: activeRun.id,
      companyName: activeLead.company_name,
      websiteUrl: activeLead.website_url,
      scrapedContent: scrapeResult.sanitizedText,
      gatewayClient,
      model,
      accruedCostUsd: activeRun.accrued_cost_usd,
      budgetLimitUsd: activeRun.budget_limit_usd,
      signal: pipelineSignal,
      agentContext: {
        agentRepo,
        runId: activeRun.id,
        stepNumber: extractStepNumber,
        actorId,
        actorRole,
      },
    });

    await checkExecutionGuards();

    // Advance state RESEARCHING -> RESEARCH_COMPLETED
    activeRun = await agentRepo.transitionState(activeRun.id, "RESEARCH_COMPLETED", {
      actorId,
      actorRole,
      signal: pipelineSignal,
    });

    await checkExecutionGuards();

    // -------------------------------------------------------------------------
    // Phase 4: Stage 2 ICP Scorer (Group 4 Static Rubric & Evidence Gating)
    // -------------------------------------------------------------------------
    // Advance state RESEARCH_COMPLETED -> SCORING
    activeRun = await agentRepo.transitionState(activeRun.id, "SCORING", {
      actorId,
      actorRole,
      signal: pipelineSignal,
    });

    await checkExecutionGuards();

    // Execute Tool 3: scoreCompanyLead (Consumes ONLY validated facts, never raw text)
    const scoreStepNumber = activeRun.current_step + 1;
    const scoreResult: ScoreLeadIcpResult = await scoreCompanyLead({
      leadId: activeLead.id,
      runId: activeRun.id,
      companyName: activeLead.company_name,
      websiteUrl: activeLead.website_url,
      facts: extractResult.facts,
      gatewayClient,
      model,
      accruedCostUsd: activeRun.accrued_cost_usd,
      budgetLimitUsd: activeRun.budget_limit_usd,
      signal: pipelineSignal,
      agentContext: {
        agentRepo,
        runId: activeRun.id,
        stepNumber: scoreStepNumber,
        actorId,
        actorRole,
        autoTransition: false, // Runner controls the deterministic final transition
      },
    });

    // -------------------------------------------------------------------------
    // Phase 5: Human Review Gate (AWAITING_APPROVAL / INSUFFICIENT_EVIDENCE / DISQUALIFIED)
    // -------------------------------------------------------------------------
    const targetState: AgentState =
      scoreResult.leadScore.tier === "TIER_1" || scoreResult.leadScore.tier === "TIER_2"
        ? "AWAITING_APPROVAL"
        : scoreResult.leadScore.tier === "INSUFFICIENT_EVIDENCE"
        ? "INSUFFICIENT_EVIDENCE"
        : "DISQUALIFIED";

    activeRun = await agentRepo.transitionState(activeRun.id, targetState, {
      actorId,
      actorRole,
      signal: pipelineSignal,
    });

    // Refresh lead state to reflect updated business lifecycle status
    const { lead: finalLead } = await leadRepo.getLeadWithAudit(activeLead.id);
    const research = await agentRepo.getCompanyResearch(activeLead.id);
    const score = await agentRepo.getLeadScore(activeLead.id);

    if (timeoutTimer) clearTimeout(timeoutTimer);

    // CRITICAL REQUIREMENT: Complete Halt on Review Gate (Zero Automated Outreach)
    return {
      run: activeRun,
      lead: finalLead || activeLead,
      state: activeRun.state,
      finalLeadStatus: mapAgentStateToLeadStatus(
        activeRun.state,
        (activeRun.checkpoint_data?.previousLeadStatus as LeadStatus) || null
      ),
      research,
      score,
      stepsCount: activeRun.current_step,
      toolCallsCount: activeRun.tool_calls_count,
      accruedCostUsd: activeRun.accrued_cost_usd,
      durationMs: Date.now() - startTime,
      success: true,
      residualRiskNote: PIPELINE_RESIDUAL_RISK_NOTE,
      error: null,
    };
  } catch (err: unknown) {
    if (timeoutTimer) clearTimeout(timeoutTimer);

    let { code, message } = classifyPipelineError(err);
    if (pipelineSignal.aborted && code !== "TIMED_OUT") {
      code = "CANCELLED_BY_OPERATOR";
      message = "Execution cancelled by operator";
    }

    // Determine target error state
    let targetErrorState: AgentState = "FAILED";
    if (code === "TIMED_OUT") {
      targetErrorState = "TIMED_OUT";
    } else if (code === "CANCELLED_BY_OPERATOR") {
      targetErrorState = "CANCELLED";
    }

    // If an active run exists in a non-terminal, non-suspended state, persist the error transition
    if (activeRun && !isTerminalState(activeRun.state) && !isSuspendedState(activeRun.state)) {
      try {
        activeRun = await agentRepo.transitionState(activeRun.id, targetErrorState, {
          errorCode: code,
          errorDetails: message,
          actorId,
          actorRole,
        });
      } catch (transitionErr) {
        // Fallback: log transition error without masking primary cause
        console.error(
          `[AgentRunner] Failed to transition run '${activeRun.id}' to '${targetErrorState}':`,
          transitionErr
        );
      }
    }

    // Refresh lead status if available
    let latestLead = activeLead;
    if (activeLead) {
      try {
        const { lead } = await leadRepo.getLeadWithAudit(activeLead.id);
        if (lead) latestLead = lead;
      } catch {
        // ignore secondary fetch failure
      }
    }

    const failureResult: RunAgentPipelineResult = {
      run: activeRun || ({} as AgentRun),
      lead: latestLead || ({} as Lead),
      state: activeRun?.state || targetErrorState,
      finalLeadStatus: activeRun
        ? mapAgentStateToLeadStatus(
            activeRun.state,
            (activeRun.checkpoint_data?.previousLeadStatus as LeadStatus) ||
              latestLead?.status ||
              null
          )
        : latestLead?.status || "FAILED",
      research: activeRun ? await agentRepo.getCompanyResearch(activeRun.lead_id) : null,
      score: activeRun ? await agentRepo.getLeadScore(activeRun.lead_id) : null,
      stepsCount: activeRun?.current_step || 0,
      toolCallsCount: activeRun?.tool_calls_count || 0,
      accruedCostUsd: activeRun?.accrued_cost_usd || 0,
      durationMs: Date.now() - startTime,
      success: false,
      residualRiskNote: PIPELINE_RESIDUAL_RISK_NOTE,
      error: { code, message },
    };

    if (input.throwOnError) {
      throw new AgentRunnerError(message, code, activeRun?.id, activeRun?.state);
    }

    return failureResult;
  }
}
