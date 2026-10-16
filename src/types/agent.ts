import { z } from "zod";

/**
 * Deterministic Agent State Machine states for Milestone 2
 */
export const AgentStateSchema = z.enum([
  "INGESTED",
  "RESEARCHING",
  "RESEARCH_COMPLETED",
  "SCORING",
  "AWAITING_APPROVAL",
  "INSUFFICIENT_EVIDENCE",
  "DISQUALIFIED",
  "CANCELLED",
  "TIMED_OUT",
  "FAILED",
]);

export type AgentState = z.infer<typeof AgentStateSchema>;

/**
 * Execution bounds and resource ceilings
 */
export const AGENT_BOUNDS = {
  MAX_STEPS: 10,
  MAX_TOOL_CALLS: 5,
  WALL_CLOCK_TIMEOUT_MS: 120_000,
  BUDGET_LIMIT_USD: 0.5,
  MAX_RETRY_PER_CALL: 1,
} as const;

/**
 * Approved Model Allowlist for least-privilege LLM invocation
 */
export const MODEL_ALLOWLIST = [
  // Upstream vendor IDs (retained for backward compatibility and unit tests)
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-3-5-sonnet",
  "local/llama-3-8b",
  // 9Router verified local gateway model IDs
  "ag/gemini-3.8-flash-high",
  "ag/gemini-3.8-flash",
  "ag/gemini-3.7-flash",
  "ag/claude-sonnet-5-5",
  "ag/gpt-oss-120b-medium",
] as const;

export type AllowedModel = (typeof MODEL_ALLOWLIST)[number];

export const AllowedModelSchema = z.enum(MODEL_ALLOWLIST);

/**
 * Checkpoint and state snapshot representation
 */
export const CheckpointDataSchema = z.record(z.unknown());
export type CheckpointData = z.infer<typeof CheckpointDataSchema>;

/**
 * Agent Run Zod Schema & TypeScript interface
 */
export const AgentRunSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  state: AgentStateSchema,
  current_step: z.number().int().min(0).max(AGENT_BOUNDS.MAX_STEPS),
  max_steps: z.number().int().min(1).max(AGENT_BOUNDS.MAX_STEPS).default(AGENT_BOUNDS.MAX_STEPS),
  tool_calls_count: z.number().int().min(0).max(AGENT_BOUNDS.MAX_TOOL_CALLS),
  max_tool_calls: z.number().int().min(1).max(AGENT_BOUNDS.MAX_TOOL_CALLS).default(AGENT_BOUNDS.MAX_TOOL_CALLS),
  accrued_cost_usd: z.number().min(0),
  budget_limit_usd: z.number().min(0).max(AGENT_BOUNDS.BUDGET_LIMIT_USD).default(AGENT_BOUNDS.BUDGET_LIMIT_USD),
  version_id: z.number().int().min(1).default(1),
  checkpoint_data: CheckpointDataSchema.default({}),
  error_code: z.string().nullable().default(null),
  error_details: z.string().nullable().default(null),
  created_at: z.date(),
  updated_at: z.date(),
});

export type AgentRun = z.infer<typeof AgentRunSchema>;

/**
 * Agent Step Log Zod Schema & TypeScript interface
 */
export const AgentStepSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),
  step_number: z.number().int().min(1),
  tool_name: z.string().min(1).max(100),
  input_payload: z.record(z.unknown()).default({}),
  output_payload: z.record(z.unknown()).default({}),
  tokens_used: z.number().int().min(0).default(0),
  cost_usd: z.number().min(0).default(0),
  duration_ms: z.number().int().min(0).default(0),
  retry_count: z.number().int().min(0).max(AGENT_BOUNDS.MAX_RETRY_PER_CALL).default(0),
  backoff_ms: z.number().int().nullable().default(null),
  trigger_status_code: z.number().int().nullable().default(null),
  created_at: z.date(),
});

export type AgentStep = z.infer<typeof AgentStepSchema>;

/**
 * Stage 1 Factual Company Research Zod Schema & TypeScript interface
 */
export const CompanyResearchSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  run_id: z.string().uuid().nullable().default(null),
  industry: z.string().max(255).nullable().default(null),
  company_size: z.string().max(100).nullable().default(null),
  offerings: z.array(z.string().max(255)).default([]),
  tech_stack: z.array(z.string().max(100)).default([]),
  summary: z.string().max(1000).nullable().default(null),
  content_hash: z.string().max(64).nullable().default(null),
  raw_evidence: z.record(z.unknown()).default({}),
  created_at: z.date(),
  updated_at: z.date(),
});

export type CompanyResearch = z.infer<typeof CompanyResearchSchema>;

/**
 * Input schemas for agent repository operations
 */
export const CreateRunInputSchema = z.object({
  leadId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(255).optional(),
  allowRerun: z.boolean().default(false),
  maxSteps: z.number().int().min(1).max(AGENT_BOUNDS.MAX_STEPS).default(AGENT_BOUNDS.MAX_STEPS),
  maxToolCalls: z.number().int().min(1).max(AGENT_BOUNDS.MAX_TOOL_CALLS).default(AGENT_BOUNDS.MAX_TOOL_CALLS),
  budgetLimitUsd: z.number().min(0.01).max(AGENT_BOUNDS.BUDGET_LIMIT_USD).default(AGENT_BOUNDS.BUDGET_LIMIT_USD),
  checkpointData: CheckpointDataSchema.optional(),
  actorId: z.string().default("system"),
  actorRole: z.string().default("system"),
});

export type CreateRunInput = z.input<typeof CreateRunInputSchema>;

export const RecordStepInputSchema = z.object({
  runId: z.string().uuid(),
  stepNumber: z.number().int().min(1),
  toolName: z.string().min(1).max(100),
  inputPayload: z.record(z.unknown()).default({}),
  outputPayload: z.record(z.unknown()).default({}),
  tokensUsed: z.number().int().min(0).default(0),
  costUsd: z.number().min(0).default(0),
  durationMs: z.number().int().min(0).default(0),
  isToolCall: z.boolean().default(false),
  retryCount: z.number().int().min(0).max(1).default(0),
  backoffMs: z.number().int().nullable().default(null),
  triggerStatusCode: z.number().int().nullable().default(null),
  actorId: z.string().default("system"),
  actorRole: z.string().default("system"),
  signal: z.custom<AbortSignal>().optional(),
  deadlineMs: z.number().int().min(1).optional(),
});

export type RecordStepInput = z.input<typeof RecordStepInputSchema>;
