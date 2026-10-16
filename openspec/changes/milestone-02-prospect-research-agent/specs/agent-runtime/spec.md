# Spec Delta: Agent Runtime

## Purpose

Provides a deterministic, typed Finite State Machine runtime that orchestrates prospect research and qualification workflows with strict bounded execution limits, model allowlisting, trusted pricing, fail-closed cost ceilings, and ACID persistence.

## ADDED Requirements

### Requirement: Deterministic State Machine Transitions
The runtime SHALL govern agent execution via a deterministic finite state machine with strictly permitted transitions (`INGESTED` → `RESEARCHING` → `RESEARCH_COMPLETED` → `SCORING` → `AWAITING_APPROVAL` or `INSUFFICIENT_EVIDENCE` or `DISQUALIFIED`), immediately rejecting any unregistered state transitions.

#### Scenario: Valid state progression
- **WHEN** an ingested lead is triggered for automated research
- **THEN** the state machine transitions from `INGESTED` to `RESEARCHING` and dispatches permitted research tools

#### Scenario: Rejection of illegal transition
- **WHEN** an external action attempts to move a lead directly from `INGESTED` to `AWAITING_APPROVAL` without research
- **THEN** the runtime rejects the transition with an illegal state transition error and preserves the current state

### Requirement: Bounded Execution and Wall-Clock Timeout
The agent runtime SHALL enforce strict resource boundaries on execution runs, limiting processing to a maximum of 10 steps, 5 tool calls, and a 120-second global wall-clock deadline via AbortSignal, halting immediately upon boundary violation.

#### Scenario: Step ceiling triggered
- **WHEN** an agent run reaches 10 execution steps without entering a terminal or suspended state
- **THEN** the runtime halts execution, marks the run state as `FAILED`, and logs `STEP_LIMIT_EXCEEDED`

#### Scenario: Wall-clock execution timeout
- **WHEN** an agent execution exceeds 120 seconds of continuous processing
- **THEN** the runtime triggers an AbortSignal, terminates in-flight operations, and marks the run as `TIMED_OUT`

### Requirement: Fail-Closed Cost Ceiling and Budget Enforcement
The runtime SHALL enforce a $0.50 budget ceiling using an approved model allowlist, a trusted internal pricing catalog, bounded output tokens, pre-request maximum cost estimation, and actual usage reconciliation. The runtime SHALL reject heuristic cost guarantees, fail closed on unverified pricing or usage, and document residual in-flight financial risk.

#### Scenario: Model outside allowlist rejected
- **WHEN** a task or configuration specifies an LLM model not listed in the approved model allowlist
- **THEN** the runtime rejects the invocation immediately prior to dispatch and marks the run as `FAILED` with `MODEL_NOT_PERMITTED`

#### Scenario: Pre-request budget limit exceeded
- **WHEN** the pre-request maximum cost estimate (`(estimatedPromptTokens * inputRate) + (maxTokens * outputRate)`) exceeds the remaining budget
- **THEN** the runtime blocks the request prior to transmission, transitions the run to `FAILED`, and logs `BUDGET_EXCEEDED`

#### Scenario: Unverifiable provider usage triggers fail-closed halt
- **WHEN** a completion response lacks verifiable token usage metadata and the remaining budget cannot be accounted for responsibly against the trusted rate card
- **THEN** the runtime fails closed, transitions run state to `FAILED` with `UNVERIFIABLE_COST_HALT`, and refuses to dispatch any subsequent model requests

#### Scenario: Actual usage reconciliation against trusted pricing
- **WHEN** a model response returns verified `prompt_tokens` and `completion_tokens` metadata
- **THEN** the runtime calculates actual incurred cost using the authoritative pricing catalog and updates `accrued_cost_usd` in `agent_runs` and `agent_steps`

### Requirement: Execution Checkpointing, Retries, and Audit Persistence
The runtime SHALL persist every state transition, tool invocation, transient retry attempt (including backoff delay, trigger status, and timestamp), latency, and token cost estimate atomically into PostgreSQL `agent_runs` and `agent_steps` tables, mirroring events to `audit_logs`.

#### Scenario: Atomic step and retry recording
- **WHEN** a scraper tool performs a transient retry during an agent run
- **THEN** the runtime records the retry attempt details in `agent_steps` and updates run status atomically before continuing

#### Scenario: Run state inspection
- **WHEN** an operator queries an agent run by ID via `GET /api/agent/runs/[id]`
- **THEN** the system returns the full execution trace including current state, step history, retry counts, and accrued cost

### Requirement: Manual Cancellation and Graceful Teardown
The runtime SHALL support immediate manual cancellation by an authorized operator, aborting active asynchronous tasks via AbortController, transitioning run state to `CANCELLED`, and recording an immutable entry into `audit_logs` without corrupting lead records.

#### Scenario: Operator cancels active run
- **WHEN** an operator issues a cancellation request for an active agent run
- **THEN** the runtime aborts active processes, transitions run state to `CANCELLED`, and writes an immutable entry into `audit_logs`

### Requirement: Sequential Pipeline Orchestration and Review Gate Suspension
The agent runtime orchestrator (`runAgentPipeline` / `AgentRunner`) SHALL sequentially coordinate lead verification, website scraping, Stage 1 factual extraction, and Stage 2 ICP scoring under strict bounded limits, automatically transitioning the lead and run to a Human-in-the-Loop review gate (`AWAITING_APPROVAL`, `INSUFFICIENT_EVIDENCE`, or `DISQUALIFIED`), and enforcing complete execution halt with zero automated outreach.

#### Scenario: Full successful pipeline orchestration
- **WHEN** an eligible lead is dispatched through `runAgentPipeline`
- **THEN** the orchestrator coordinates scraping, fact extraction, and ICP scoring, recording atomic checkpoints and suspending at `AWAITING_APPROVAL` with zero outreach actions

#### Scenario: Rejection of ineligible lead status
- **WHEN** an execution run is requested for a lead in a downstream or terminal business status (`QUALIFIED`, `DISQUALIFIED`, `ARCHIVED`, `PROPOSAL_DRAFTED`, `OUTREACH_ACTIVE`)
- **THEN** the orchestrator rejects the run immediately with `INELIGIBLE_LEAD_STATUS` without dispatching tools or modifying lead records

#### Scenario: Preservation and restoration of lead status on rerun cancellation
- **WHEN** an operator cancels an active agent rerun that originated from a pending-review state (`AWAITING_APPROVAL` or `INSUFFICIENT_EVIDENCE`)
- **THEN** the runtime restores the lead's prior business status from `previousLeadStatus` in checkpoint data rather than forcing it to `INGESTED`, while preserving all run history, research facts, and audit logs
