# Spec Delta: Qualification Scoring

## Purpose

Defines structured, model-driven prospect evaluation against Ideal Customer Profile criteria using a two-stage least-privilege LLM pipeline via 9Router with semantic injection defense, explicit metric separation (`score`, `confidence`, `evidenceCoverage`), minimum evidence gating, and mandatory Human-in-the-Loop review gates.

## ADDED Requirements

### Requirement: Model Gateway Dual-Adapter Integration
The qualification engine SHALL dispatch all inference calls through a pluggable `LlmGatewayClient` abstraction targeting an OpenAI-compatible 9Router gateway endpoint (`http://localhost:20128/v1`), with configurable dual-adapter fallback to direct provider APIs.

#### Scenario: Dispatch through 9Router gateway
- **WHEN** the agent initiates structured inference for extraction or scoring
- **THEN** the request routes through the configured 9Router base URL with model routing metadata

#### Scenario: Switching gateway provider
- **WHEN** the system configuration sets `LLM_GATEWAY_PROVIDER` to `direct`
- **THEN** the engine uses the direct provider adapter without modifying agent state machine logic

### Requirement: Two-Stage Least-Privilege Pipeline with Semantic Defense
The system SHALL isolate factual company extraction from ICP qualification scoring across two decoupled LLM stages, enforcing secondary semantic validation on extracted JSON fields to detect prompt injection strings and prevent adversarial instructions from reaching the scoring prompt.

#### Scenario: Stage 1 factual extraction
- **WHEN** quarantined website text is submitted to the Stage 1 extraction prompt
- **THEN** the model returns a validated `CompanyResearch` JSON object containing industry, size, offerings, and observed tech stack

#### Scenario: Semantic injection validation on extracted facts
- **WHEN** extracted JSON strings contain suspicious instruction patterns or excessive lengths
- **THEN** the semantic validator sanitizes the payload and flags injection attempts before Stage 2 execution

#### Scenario: Stage 2 isolated scoring
- **WHEN** the Stage 2 scoring prompt evaluates prospect fit against the ICP rubric
- **THEN** the prompt receives only the semantically validated JSON facts and verified website evidence URLs

### Requirement: Decoupled ICP Rubric, Evidence Coverage, and Confidence Evaluation
The qualification engine SHALL evaluate prospects using a static rubric (30% industry, 25% size, 25% product fit, 20% tech stack) outputting three decoupled metrics: nominal score (0–100), confidence (0.0–1.0), and evidenceCoverage (0.0–1.0). Unknown criteria SHALL NOT default to zero, but receive a neutral baseline score, deduct proportionally from evidenceCoverage, and bound confidence.

#### Scenario: Decoupled metric evaluation with partial evidence
- **WHEN** a prospect profile has verified data for industry and product fit but lacks tech stack details
- **THEN** the engine assigns a neutral baseline to the tech stack score, reflects 80% coverage in `evidenceCoverage` (0.80), bounds `confidence` to <= 0.80, and lists missing tech stack factors in `missingInfo`

### Requirement: Minimum Evidence Gating and Insufficient Evidence Routing
The qualification engine SHALL enforce minimum evidence requirements (`evidenceCoverage >= 0.70`, `confidence >= 0.65`, and verified evidence for mandatory critical criteria `industry` and `offerings`) for actionable tiers (`TIER_1`, `TIER_2`). The engine SHALL route any prospect lacking critical evidence or failing evidence thresholds to `INSUFFICIENT_EVIDENCE` regardless of nominal score.

#### Scenario: High nominal score with missing critical evidence routes to INSUFFICIENT_EVIDENCE
- **WHEN** an evaluation produces a nominal score of 80 or above but lacks verified empirical evidence for mandatory critical criteria (industry relevance or core offerings), or has `evidenceCoverage < 0.70`
- **THEN** the engine strictly assigns the tier `INSUFFICIENT_EVIDENCE`, transitions the run state to `INSUFFICIENT_EVIDENCE`, and routes the lead for manual operator investigation rather than advancing to `AWAITING_APPROVAL`

#### Scenario: Fully evidenced prospect qualifies for actionable review
- **WHEN** a prospect achieves an ICP score of 80 or above with `evidenceCoverage >= 0.70`, `confidence >= 0.75`, and verified primary evidence for both industry and core offerings
- **THEN** the engine assigns `TIER_1` and transitions the lead to `AWAITING_APPROVAL`

### Requirement: Mandatory Human-in-the-Loop Review Gate
All completed qualification evaluations SHALL enter an `AWAITING_APPROVAL`, `INSUFFICIENT_EVIDENCE`, or `DISQUALIFIED` state, strictly barring any automated email outreach, proposal dispatch, or external write operations until a human sales operator explicitly reviews and authorizes the prospect.

#### Scenario: Qualified lead suspended for operator review
- **WHEN** a prospect achieves an actionable tier (`TIER_1` or `TIER_2`) with sufficient evidence coverage and confidence
- **THEN** the agent transitions the lead to `AWAITING_APPROVAL`, suspends execution, and alerts the sales operator in the UI

#### Scenario: Prohibition of automated outreach actions
- **WHEN** an agent run completes qualification scoring
- **THEN** the runtime halts without initiating any email transmission or external n8n webhook calls
