import { Pool, PoolClient } from "pg";
import { getPool, withTransaction } from "../db";
import {
  IdempotencyService,
  computePayloadHash,
  IdempotencyConflictError,
} from "../idempotency";
import {
  AgentRun,
  AgentStep,
  CompanyResearch,
  CreateRunInput,
  CreateRunInputSchema,
  RecordStepInput,
  RecordStepInputSchema,
  AgentState,
  AGENT_BOUNDS,
} from "../../types/agent";
import {
  LeadScore,
  SaveLeadScoreInput,
  SaveLeadScoreInputSchema,
} from "../../types/qualification";
import { LeadStatus } from "../../types/lead";
import {
  assertValidTransition,
  canCancelState,
  isStateEligibleForStep,
  mapAgentStateToLeadStatus,
} from "./state-machine";

export { IdempotencyConflictError };

export class AgentRepositoryError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = "AgentRepositoryError";
  }
}

export class RunNotFoundError extends AgentRepositoryError {
  constructor(runId: string) {
    super(`Agent run with ID '${runId}' not found`);
    this.name = "RunNotFoundError";
  }
}

export class ActiveRunCollisionError extends AgentRepositoryError {
  constructor(
    public readonly leadId: string,
    public readonly activeRunId: string,
    public readonly activeState: string
  ) {
    super(
      `Lead '${leadId}' already has an active agent run '${activeRunId}' in state '${activeState}'. Concurrent active runs are prohibited.`
    );
    this.name = "ActiveRunCollisionError";
  }
}

export class PendingReviewConflictError extends AgentRepositoryError {
  constructor(
    public readonly leadId: string,
    public readonly pendingRunId: string,
    public readonly pendingState: string
  ) {
    super(
      `Lead '${leadId}' already has an evaluation pending operator review (run '${pendingRunId}' in state '${pendingState}'). Explicit allowRerun: true is required to rerun qualification.`
    );
    this.name = "PendingReviewConflictError";
  }
}

export class IneligibleLeadStatusError extends AgentRepositoryError {
  constructor(public readonly leadId: string, public readonly currentStatus: string) {
    super(
      `Cannot initiate agent run: lead '${leadId}' is in non-eligible business status '${currentStatus}'`
    );
    this.name = "IneligibleLeadStatusError";
  }
}

export class ConcurrencyConflictError extends AgentRepositoryError {
  constructor(runId: string, expectedVersion: number, currentVersion: number) {
    super(
      `Concurrency conflict on agent run '${runId}': expected version ${expectedVersion}, found ${currentVersion}`
    );
    this.name = "ConcurrencyConflictError";
  }
}

export class StepLimitExceededError extends AgentRepositoryError {
  constructor(runId: string, currentStep: number, maxSteps: number) {
    super(
      `Step limit exceeded for agent run '${runId}': step ${currentStep} exceeds max ${maxSteps}`
    );
    this.name = "StepLimitExceededError";
  }
}

export class ToolCallLimitExceededError extends AgentRepositoryError {
  constructor(runId: string, toolCallsCount: number, maxToolCalls: number) {
    super(
      `Tool call limit exceeded for agent run '${runId}': ${toolCallsCount} calls exceed max ${maxToolCalls}`
    );
    this.name = "ToolCallLimitExceededError";
  }
}

export class BudgetExceededError extends AgentRepositoryError {
  constructor(runId: string, projectedCost: number, budgetLimit: number) {
    super(
      `Budget ceiling exceeded for agent run '${runId}': projected cost $${projectedCost.toFixed(
        4
      )} exceeds budget $${budgetLimit.toFixed(4)}`
    );
    this.name = "BudgetExceededError";
  }
}

export class RunDeadlineExceededError extends AgentRepositoryError {
  constructor(runId: string, timeoutMs: number) {
    super(
      `Deadline exceeded for agent run '${runId}': execution exceeded timeout of ${timeoutMs}ms`
    );
    this.name = "RunDeadlineExceededError";
  }
}

export interface TransitionStateOptions {
  expectedVersion?: number;
  checkpointData?: Record<string, unknown>;
  errorCode?: string;
  errorDetails?: string;
  actorId?: string;
  actorRole?: string;
  signal?: AbortSignal;
}

export interface SaveCompanyResearchInput {
  leadId: string;
  runId?: string | null;
  industry?: string | null;
  companySize?: string | null;
  offerings?: string[];
  techStack?: string[];
  summary?: string | null;
  contentHash?: string | null;
  rawEvidence?: Record<string, unknown>;
  actorId?: string;
  actorRole?: string;
}

export class AgentRepository {
  private idempotencyService: IdempotencyService;

  constructor(private pool: Pool = getPool()) {
    this.idempotencyService = new IdempotencyService(this.pool);
  }

  /**
   * Helper to map DB snake_case row to AgentRun
   */
  private mapRunRow(row: Record<string, unknown>): AgentRun {
    return {
      id: String(row.id),
      lead_id: String(row.lead_id),
      state: row.state as AgentState,
      current_step: Number(row.current_step),
      max_steps: Number(row.max_steps),
      tool_calls_count: Number(row.tool_calls_count),
      max_tool_calls: Number(row.max_tool_calls),
      accrued_cost_usd: Number(row.accrued_cost_usd),
      budget_limit_usd: Number(row.budget_limit_usd),
      version_id: Number(row.version_id),
      checkpoint_data: (row.checkpoint_data as Record<string, unknown>) || {},
      error_code: (row.error_code as string) || null,
      error_details: (row.error_details as string) || null,
      created_at: new Date(row.created_at as string | number | Date),
      updated_at: new Date(row.updated_at as string | number | Date),
    };
  }

  /**
   * Helper to map DB row to AgentStep
   */
  private mapStepRow(row: Record<string, unknown>): AgentStep {
    return {
      id: String(row.id),
      run_id: String(row.run_id),
      step_number: Number(row.step_number),
      tool_name: String(row.tool_name),
      input_payload: (row.input_payload as Record<string, unknown>) || {},
      output_payload: (row.output_payload as Record<string, unknown>) || {},
      tokens_used: Number(row.tokens_used),
      cost_usd: Number(row.cost_usd),
      duration_ms: Number(row.duration_ms),
      retry_count: Number(row.retry_count),
      backoff_ms: row.backoff_ms !== null ? Number(row.backoff_ms) : null,
      trigger_status_code:
        row.trigger_status_code !== null ? Number(row.trigger_status_code) : null,
      created_at: new Date(row.created_at as string | number | Date),
    };
  }

  /**
   * Helper to map DB row to CompanyResearch
   */
  private mapResearchRow(row: Record<string, unknown>): CompanyResearch {
    return {
      id: String(row.id),
      lead_id: String(row.lead_id),
      run_id: (row.run_id as string) || null,
      industry: (row.industry as string) || null,
      company_size: (row.company_size as string) || null,
      offerings: Array.isArray(row.offerings) ? (row.offerings as string[]) : [],
      tech_stack: Array.isArray(row.tech_stack) ? (row.tech_stack as string[]) : [],
      summary: (row.summary as string) || null,
      content_hash: (row.content_hash as string) || null,
      raw_evidence: (row.raw_evidence as Record<string, unknown>) || {},
      created_at: new Date(row.created_at as string | number | Date),
      updated_at: new Date(row.updated_at as string | number | Date),
    };
  }

  /**
   * Helper to map DB row to LeadScore
   */
  private mapScoreRow(row: Record<string, unknown>): LeadScore {
    return {
      id: String(row.id),
      lead_id: String(row.lead_id),
      run_id: (row.run_id as string) || null,
      score: Number(row.score),
      confidence: Number(row.confidence),
      evidence_coverage: Number(row.evidence_coverage),
      tier: row.tier as LeadScore["tier"],
      criteria_breakdown:
        (row.criteria_breakdown as LeadScore["criteria_breakdown"]) || {},
      missing_info: Array.isArray(row.missing_info) ? (row.missing_info as string[]) : [],
      evidence_urls: Array.isArray(row.evidence_urls) ? (row.evidence_urls as string[]) : [],
      rationale: (row.rationale as string) || null,
      created_at: new Date(row.created_at as string | number | Date),
      updated_at: new Date(row.updated_at as string | number | Date),
    };
  }

  /**
   * Creates a new agent execution run within an atomic transaction,
   * supporting request idempotency, active-run mutual exclusivity, pending-review gating,
   * and immutable audit log recording.
   */
  async createRun(rawInput: CreateRunInput): Promise<AgentRun> {
    const input = CreateRunInputSchema.parse(rawInput);

    // 1. Request Idempotency Handling (if idempotencyKey is supplied)
    if (input.idempotencyKey) {
      const payloadHash = computePayloadHash({
        leadId: input.leadId,
        maxSteps: input.maxSteps,
        maxToolCalls: input.maxToolCalls,
        budgetLimitUsd: input.budgetLimitUsd,
      });

      // Step 1a: Inconsistency State Repair (Scenario 2)
      // If a run was already committed to PostgreSQL (e.g. legacy state, manual intervention, or
      // dual-path anomalies) but the idempotency key was left in 'PROCESSING', repair this inconsistency
      // deterministically: verify payload hash against committed run, heal the key to 'COMPLETED',
      // and return the existing run without creating duplicate runs or audit events.
      // (Note: Crash before commit is handled via transaction rollback and lease recovery in acquireOrGetResult).
      const priorRunRes = await this.pool.query<{ run_id: string }>(
        `SELECT change_diff->>'runId' as run_id
         FROM audit_logs
         WHERE event_type = 'AGENT_RUN_CREATED'
           AND change_diff->>'idempotencyKey' = $1
         ORDER BY recorded_at DESC
         LIMIT 1;`,
        [input.idempotencyKey]
      );

      if (priorRunRes.rows.length > 0 && priorRunRes.rows[0].run_id) {
        const existingRun = await this.getRun(priorRunRes.rows[0].run_id);
        if (existingRun) {
          // Verify payload consistency against existing run bounds to guarantee mismatch conflicts
          const existingRunPayloadHash = computePayloadHash({
            leadId: existingRun.lead_id,
            maxSteps: existingRun.max_steps,
            maxToolCalls: existingRun.max_tool_calls,
            budgetLimitUsd: existingRun.budget_limit_usd,
          });
          if (existingRunPayloadHash !== payloadHash) {
            throw new IdempotencyConflictError(
              "Idempotency key was previously used with a different request payload"
            );
          }

          // Heal idempotency record to COMPLETED state
          await this.idempotencyService.completeExecution(
            input.idempotencyKey,
            201,
            existingRun
          );
          return existingRun;
        }
      }

      const lease = await this.idempotencyService.acquireOrGetResult(
        input.idempotencyKey,
        payloadHash
      );

      if (!lease.acquired) {
        const cached = lease.cached.body as AgentRun;
        const existingRun = await this.getRun(cached.id);
        return existingRun || cached;
      }
    }

    try {
      const run = await withTransaction(async (client: PoolClient) => {
        // Step A: Verify target lead exists and acquire exclusive row lock
        const leadRes = await client.query(
          "SELECT id, status FROM leads WHERE id = $1 FOR UPDATE;",
          [input.leadId]
        );
        if (leadRes.rows.length === 0) {
          throw new AgentRepositoryError(`Target lead with ID '${input.leadId}' not found`);
        }

        const currentLeadStatus = leadRes.rows[0].status as LeadStatus;

        // Step B: Check for active in-flight run collision (Mutual Exclusivity)
        const activeRunRes = await client.query(
          `SELECT id, state FROM agent_runs 
           WHERE lead_id = $1 
           AND state IN ('INGESTED', 'RESEARCHING', 'RESEARCH_COMPLETED', 'SCORING')
           LIMIT 1;`,
          [input.leadId]
        );
        if (activeRunRes.rows.length > 0) {
          throw new ActiveRunCollisionError(
            input.leadId,
            activeRunRes.rows[0].id,
            activeRunRes.rows[0].state
          );
        }

        // Invariant: Only leads in intake (INGESTED), technical failure retry (FAILED), or pending review (with allowRerun)
        // are eligible to start an agent run. Terminal or downstream business statuses (ARCHIVED, QUALIFIED,
        // PROPOSAL_DRAFTED, OUTREACH_ACTIVE, DISQUALIFIED) are strictly prohibited from initiating research.
        const ELIGIBLE_LEAD_STATUSES: LeadStatus[] = [
          "INGESTED",
          "FAILED",
          "AWAITING_APPROVAL",
          "INSUFFICIENT_EVIDENCE",
        ];
        if (!ELIGIBLE_LEAD_STATUSES.includes(currentLeadStatus)) {
          throw new IneligibleLeadStatusError(input.leadId, currentLeadStatus);
        }

        // Step C: Check for pending-review status or prior pending-review run (AWAITING_APPROVAL or INSUFFICIENT_EVIDENCE)
        const pendingReviewRes = await client.query(
          `SELECT id, state FROM agent_runs 
           WHERE lead_id = $1 
           AND state IN ('AWAITING_APPROVAL', 'INSUFFICIENT_EVIDENCE')
           ORDER BY created_at DESC
           LIMIT 1;`,
          [input.leadId]
        );

        const isPendingReview =
          currentLeadStatus === "AWAITING_APPROVAL" ||
          currentLeadStatus === "INSUFFICIENT_EVIDENCE" ||
          pendingReviewRes.rows.length > 0;

        if (isPendingReview && !input.allowRerun) {
          throw new PendingReviewConflictError(
            input.leadId,
            pendingReviewRes.rows[0]?.id || "pending-review",
            pendingReviewRes.rows[0]?.state || currentLeadStatus
          );
        }

        // Step D: If rerun was explicitly authorized, record audit event referencing prior run/status
        if (isPendingReview && input.allowRerun) {
          await client.query(
            `INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot, change_diff)
             VALUES ($1, 'AGENT_RUN_RERUN_TRIGGERED', $2, $3, $4, $5);`,
            [
              input.leadId,
              input.actorId || "system",
              input.actorRole || "system",
              JSON.stringify({
                previousRunId: pendingReviewRes.rows[0]?.id || null,
                previousLeadStatus: currentLeadStatus,
              }),
              JSON.stringify({
                action: "RERUN_TRIGGERED",
                previousRunId: pendingReviewRes.rows[0]?.id || null,
                previousState: pendingReviewRes.rows[0]?.state || currentLeadStatus,
              }),
            ]
          );
        }

        // Step E: Insert agent_run, preserving previous lead status in checkpoint_data for consistent cancellation rollback
        const checkpointWithHistory = {
          ...(input.checkpointData || {}),
          previousLeadStatus: currentLeadStatus,
        };

        const insertRunSql = `
          INSERT INTO agent_runs (
            lead_id, state, current_step, max_steps, tool_calls_count, max_tool_calls,
            accrued_cost_usd, budget_limit_usd, version_id, checkpoint_data
          )
          VALUES ($1, 'INGESTED', 0, $2, 0, $3, 0.0000, $4, 1, $5)
          RETURNING *;
        `;
        const runRes = await client.query(insertRunSql, [
          input.leadId,
          input.maxSteps ?? AGENT_BOUNDS.MAX_STEPS,
          input.maxToolCalls ?? AGENT_BOUNDS.MAX_TOOL_CALLS,
          input.budgetLimitUsd ?? AGENT_BOUNDS.BUDGET_LIMIT_USD,
          JSON.stringify(checkpointWithHistory),
        ]);
        const createdRun = this.mapRunRow(runRes.rows[0]);

        // Step F: Update leads.status to RESEARCHING
        await client.query("UPDATE leads SET status = 'RESEARCHING' WHERE id = $1;", [
          input.leadId,
        ]);

        // Step G: Insert immutable audit log entry
        const auditSql = `
          INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot, change_diff)
          VALUES ($1, 'AGENT_RUN_CREATED', $2, $3, $4, $5);
        `;
        await client.query(auditSql, [
          input.leadId,
          input.actorId || "system",
          input.actorRole || "system",
          JSON.stringify(createdRun),
          JSON.stringify({
            runId: createdRun.id,
            idempotencyKey: input.idempotencyKey || null,
            allowRerun: input.allowRerun,
          }),
        ]);

        // Step H: Atomically update idempotency_keys to COMPLETED inside the same database transaction
        if (input.idempotencyKey) {
          await client.query(
            `UPDATE idempotency_keys
             SET status = 'COMPLETED', status_code = 201, response_body = $2
             WHERE key = $1;`,
            [input.idempotencyKey, JSON.stringify(createdRun)]
          );
        }

        return createdRun;
      }, this.pool);

      // Finalize idempotency lease upon successful run creation (idempotent double-check)
      if (input.idempotencyKey) {
        await this.idempotencyService.completeExecution(
          input.idempotencyKey,
          201,
          run
        );
      }

      return run;
    } catch (err) {
      // Release idempotency lock ONLY if run was not committed to audit logs
      if (input.idempotencyKey) {
        try {
          const auditCheck = await this.pool.query(
            `SELECT id FROM audit_logs WHERE change_diff->>'idempotencyKey' = $1 LIMIT 1;`,
            [input.idempotencyKey]
          );
          if (auditCheck.rows.length === 0) {
            await this.idempotencyService.releaseLock(input.idempotencyKey);
          }
        } catch {
          await this.idempotencyService.releaseLock(input.idempotencyKey);
        }
      }
      throw err;
    }
  }

  /**
   * Transitions an agent run to a new state deterministically with optimistic concurrency
   * protection, updating checkpoint data, lead status, and writing audit logs in a single transaction.
   */
  async transitionState(
    runId: string,
    toState: AgentState,
    options: TransitionStateOptions = {}
  ): Promise<AgentRun> {
    return withTransaction(async (client: PoolClient) => {
      // 0. Check cancellation signal if provided
      if (options.signal?.aborted) {
        throw new AgentRepositoryError(
          `State transition aborted for agent run '${runId}': ${options.signal.reason || "aborted"}`
        );
      }

      // 1. Fetch current run with row lock
      const currentRes = await client.query(
        "SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE;",
        [runId]
      );
      if (currentRes.rows.length === 0) {
        throw new RunNotFoundError(runId);
      }
      const currentRun = this.mapRunRow(currentRes.rows[0]);

      // 2. Validate state machine transition rules
      assertValidTransition(currentRun.state, toState);

      // 3. Verify optimistic lock version if specified
      if (
        options.expectedVersion !== undefined &&
        currentRun.version_id !== options.expectedVersion
      ) {
        throw new ConcurrencyConflictError(
          runId,
          options.expectedVersion,
          currentRun.version_id
        );
      }

      // 4. Merge checkpoint data if provided
      const updatedCheckpoint = options.checkpointData
        ? { ...currentRun.checkpoint_data, ...options.checkpointData }
        : currentRun.checkpoint_data;

      // 5. Execute state transition and increment version_id
      const updateRunSql = `
        UPDATE agent_runs
        SET 
          state = $1,
          version_id = version_id + 1,
          checkpoint_data = $2,
          error_code = COALESCE($3, error_code),
          error_details = COALESCE($4, error_details),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5 AND version_id = $6
        RETURNING *;
      `;
      const updateRes = await client.query(updateRunSql, [
        toState,
        JSON.stringify(updatedCheckpoint),
        options.errorCode || null,
        options.errorDetails || null,
        runId,
        currentRun.version_id,
      ]);

      if (updateRes.rows.length === 0) {
        throw new ConcurrencyConflictError(
          runId,
          currentRun.version_id,
          currentRun.version_id + 1
        );
      }
      const updatedRun = this.mapRunRow(updateRes.rows[0]);

      // 6. Synchronize leads status via deterministic domain mapping
      const previousLeadStatus =
        (currentRun.checkpoint_data?.previousLeadStatus as LeadStatus) || null;
      let targetLeadStatus = mapAgentStateToLeadStatus(toState, previousLeadStatus);
      if (toState === "CANCELLED" && previousLeadStatus) {
        // If run was cancelled by operator, restore the exact valid business status the lead had prior to this run
        targetLeadStatus = previousLeadStatus;
      }
      if (targetLeadStatus) {
        await client.query(
          "UPDATE leads SET status = $1 WHERE id = $2 AND status IS DISTINCT FROM $1;",
          [targetLeadStatus, updatedRun.lead_id]
        );
      }

      // 7. Insert audit log
      const eventType =
        toState === "CANCELLED" ? "AGENT_RUN_CANCELLED" : "AGENT_STATE_TRANSITION";
      const auditSql = `
        INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot, change_diff)
        VALUES ($1, $2, $3, $4, $5, $6);
      `;
      await client.query(auditSql, [
        updatedRun.lead_id,
        eventType,
        options.actorId || "system",
        options.actorRole || "system",
        JSON.stringify(updatedRun),
        JSON.stringify({
          runId,
          fromState: currentRun.state,
          toState,
          version: updatedRun.version_id,
          reason: options.errorDetails || null,
        }),
      ]);

      return updatedRun;
    }, this.pool);
  }

  /**
   * Records an execution step, enforces step, tool call, and budget bounds,
   * updates accumulated cost, and writes audit logs in a single transaction.
   */
  async recordStep(rawInput: RecordStepInput): Promise<AgentStep> {
    const input = RecordStepInputSchema.parse(rawInput);
    return withTransaction(async (client: PoolClient) => {
      // 0. Check cancellation signal if provided
      if (input.signal?.aborted) {
        throw new AgentRepositoryError(
          `Execution aborted for agent run '${input.runId}': ${input.signal.reason || "aborted"}`
        );
      }

      // 1. Fetch current run with row lock
      const runRes = await client.query(
        "SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE;",
        [input.runId]
      );
      if (runRes.rows.length === 0) {
        throw new RunNotFoundError(input.runId);
      }
      const currentRun = this.mapRunRow(runRes.rows[0]);

      // 2. Reject step on non-executable states (must be INGESTED, RESEARCHING, RESEARCH_COMPLETED, or SCORING)
      if (!isStateEligibleForStep(currentRun.state)) {
        throw new AgentRepositoryError(
          `Cannot record step on agent run in non-executable state '${currentRun.state}'`
        );
      }

      // Check wall-clock deadline
      const timeoutMs = input.deadlineMs ?? AGENT_BOUNDS.WALL_CLOCK_TIMEOUT_MS;
      const elapsedMs = Date.now() - new Date(currentRun.created_at).getTime();
      if (elapsedMs > timeoutMs) {
        throw new RunDeadlineExceededError(input.runId, timeoutMs);
      }

      // 3. Check bounded limits
      const nextStep = currentRun.current_step + 1;
      if (nextStep > currentRun.max_steps) {
        throw new StepLimitExceededError(input.runId, nextStep, currentRun.max_steps);
      }

      const nextToolCalls =
        currentRun.tool_calls_count + (input.isToolCall ? 1 : 0);
      if (nextToolCalls > currentRun.max_tool_calls) {
        throw new ToolCallLimitExceededError(
          input.runId,
          nextToolCalls,
          currentRun.max_tool_calls
        );
      }

      const nextCost = Number(
        (currentRun.accrued_cost_usd + (input.costUsd ?? 0)).toFixed(4)
      );
      if (nextCost > currentRun.budget_limit_usd) {
        throw new BudgetExceededError(input.runId, nextCost, currentRun.budget_limit_usd);
      }

      // 4. Insert step record
      const insertStepSql = `
        INSERT INTO agent_steps (
          run_id, step_number, tool_name, input_payload, output_payload,
          tokens_used, cost_usd, duration_ms, retry_count, backoff_ms, trigger_status_code
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;
      `;
      const stepRes = await client.query(insertStepSql, [
        input.runId,
        input.stepNumber,
        input.toolName,
        JSON.stringify(input.inputPayload || {}),
        JSON.stringify(input.outputPayload || {}),
        input.tokensUsed ?? 0,
        input.costUsd ?? 0,
        input.durationMs ?? 0,
        input.retryCount || 0,
        input.backoffMs ?? null,
        input.triggerStatusCode ?? null,
      ]);
      const createdStep = this.mapStepRow(stepRes.rows[0]);

      // 5. Update agent_run progress with atomic database-level guardrails
      const updateRunSql = `
        UPDATE agent_runs 
        SET current_step = $1, tool_calls_count = $2, accrued_cost_usd = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
          AND $1 <= max_steps
          AND $2 <= max_tool_calls
          AND $3 <= budget_limit_usd
          AND state IN ('INGESTED', 'RESEARCHING', 'RESEARCH_COMPLETED', 'SCORING')
        RETURNING *;
      `;
      const updateRes = await client.query(updateRunSql, [
        nextStep,
        nextToolCalls,
        nextCost,
        input.runId,
      ]);

      if (updateRes.rows.length === 0) {
        // Enforce exact boundary failure at the database level
        const refreshedRes = await client.query(
          "SELECT * FROM agent_runs WHERE id = $1;",
          [input.runId]
        );
        if (refreshedRes.rows.length > 0) {
          const freshRun = this.mapRunRow(refreshedRes.rows[0]);
          if (!isStateEligibleForStep(freshRun.state)) {
            throw new AgentRepositoryError(
              `Cannot record step on agent run in non-executable state '${freshRun.state}'`
            );
          }
          if (nextStep > freshRun.max_steps) {
            throw new StepLimitExceededError(input.runId, nextStep, freshRun.max_steps);
          }
          if (nextToolCalls > freshRun.max_tool_calls) {
            throw new ToolCallLimitExceededError(
              input.runId,
              nextToolCalls,
              freshRun.max_tool_calls
            );
          }
          if (nextCost > freshRun.budget_limit_usd) {
            throw new BudgetExceededError(
              input.runId,
              nextCost,
              freshRun.budget_limit_usd
            );
          }
        }
        throw new AgentRepositoryError(
          `Failed to record step: execution bounds exceeded on agent run '${input.runId}'`
        );
      }

      // 6. Record audit log
      const auditSql = `
        INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot, change_diff)
        VALUES ($1, 'AGENT_STEP_EXECUTED', $2, $3, $4, $5);
      `;
      await client.query(auditSql, [
        currentRun.lead_id,
        input.actorId || "system",
        input.actorRole || "system",
        JSON.stringify(createdStep),
        JSON.stringify({
          runId: input.runId,
          stepNumber: input.stepNumber,
          toolName: input.toolName,
          costUsd: input.costUsd,
          tokensUsed: input.tokensUsed,
        }),
      ]);

      return createdStep;
    }, this.pool);
  }

  /**
   * Cancels an in-flight agent run, releasing active resources and marking state CANCELLED.
   */
  async cancelRun(
    runId: string,
    options: { actorId?: string; actorRole?: string; reason?: string } = {}
  ): Promise<AgentRun> {
    const currentRun = await this.getRun(runId);
    if (!currentRun) {
      throw new RunNotFoundError(runId);
    }
    if (!canCancelState(currentRun.state)) {
      throw new AgentRepositoryError(
        `Agent run '${runId}' in state '${currentRun.state}' cannot be cancelled`
      );
    }

    return this.transitionState(runId, "CANCELLED", {
      errorCode: "CANCELLED_BY_OPERATOR",
      errorDetails: options.reason || "Execution cancelled by operator",
      actorId: options.actorId || "system",
      actorRole: options.actorRole || "system",
    });
  }

  /**
   * Saves or updates structured company research facts
   */
  async saveCompanyResearch(input: SaveCompanyResearchInput): Promise<CompanyResearch> {
    return withTransaction(async (client: PoolClient) => {
      const sql = `
        INSERT INTO company_research (
          lead_id, run_id, industry, company_size, offerings, tech_stack,
          summary, content_hash, raw_evidence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;
      const res = await client.query(sql, [
        input.leadId,
        input.runId || null,
        input.industry || null,
        input.companySize || null,
        JSON.stringify(input.offerings || []),
        JSON.stringify(input.techStack || []),
        input.summary || null,
        input.contentHash || null,
        JSON.stringify(input.rawEvidence || {}),
      ]);
      const research = this.mapResearchRow(res.rows[0]);

      // Insert audit log
      const auditSql = `
        INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot)
        VALUES ($1, 'COMPANY_RESEARCH_SAVED', $2, $3, $4);
      `;
      await client.query(auditSql, [
        input.leadId,
        input.actorId || "system",
        input.actorRole || "system",
        JSON.stringify(research),
      ]);

      return research;
    }, this.pool);
  }

  /**
   * Saves or updates structured ICP lead score with decoupled score, confidence, and evidence coverage
   */
  async saveLeadScore(rawInput: SaveLeadScoreInput): Promise<LeadScore> {
    const input = SaveLeadScoreInputSchema.parse(rawInput);
    return withTransaction(async (client: PoolClient) => {
      const sql = `
        INSERT INTO lead_scores (
          lead_id, run_id, score, confidence, evidence_coverage, tier,
          criteria_breakdown, missing_info, evidence_urls, rationale
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `;
      const res = await client.query(sql, [
        input.leadId,
        input.runId || null,
        input.score,
        input.confidence,
        input.evidenceCoverage,
        input.tier,
        JSON.stringify(input.criteriaBreakdown || {}),
        JSON.stringify(input.missingInfo || []),
        JSON.stringify(input.evidenceUrls || []),
        input.rationale || null,
      ]);
      const leadScore = this.mapScoreRow(res.rows[0]);

      // Insert audit log
      const auditSql = `
        INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot)
        VALUES ($1, 'LEAD_SCORE_SAVED', $2, $3, $4);
      `;
      await client.query(auditSql, [
        input.leadId,
        input.actorId || "system",
        input.actorRole || "system",
        JSON.stringify(leadScore),
      ]);

      return leadScore;
    }, this.pool);
  }

  /**
   * Retrieves single agent run by ID
   */
  async getRun(runId: string): Promise<AgentRun | null> {
    const client = await this.pool.connect();
    try {
      const res = await client.query("SELECT * FROM agent_runs WHERE id = $1;", [runId]);
      if (res.rows.length === 0) {
        return null;
      }
      return this.mapRunRow(res.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves execution steps for a run ordered by step_number
   */
  async getRunSteps(runId: string): Promise<AgentStep[]> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        "SELECT * FROM agent_steps WHERE run_id = $1 ORDER BY step_number ASC, created_at ASC;",
        [runId]
      );
      return res.rows.map((row) => this.mapStepRow(row));
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves company research for a lead
   */
  async getCompanyResearch(leadId: string): Promise<CompanyResearch | null> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        "SELECT * FROM company_research WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1;",
        [leadId]
      );
      if (res.rows.length === 0) {
        return null;
      }
      return this.mapResearchRow(res.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves lead qualification score for a lead
   */
  async getLeadScore(leadId: string): Promise<LeadScore | null> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        "SELECT * FROM lead_scores WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1;",
        [leadId]
      );
      if (res.rows.length === 0) {
        return null;
      }
      return this.mapScoreRow(res.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves all agent runs for a lead ordered by created_at DESC
   */
  async getRunsByLeadId(leadId: string): Promise<AgentRun[]> {
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        "SELECT * FROM agent_runs WHERE lead_id = $1 ORDER BY created_at DESC;",
        [leadId]
      );
      return res.rows.map((row) => this.mapRunRow(row));
    } finally {
      client.release();
    }
  }

  // Aliases for explicit naming
  getRunById = this.getRun.bind(this);
  getCompanyResearchByLeadId = this.getCompanyResearch.bind(this);
  getLeadScoreByLeadId = this.getLeadScore.bind(this);
}
