# Design: Milestone 2 — Prospect Research & Qualification Agent

## Context

AstraOps Milestone 1 established a secure Next.js 15 App Router platform with PostgreSQL persistence for sales leads, append-only audit logging, CSRF/session hardening, and Playwright browser integration. Leads currently reside in the `leads` table in the initial status `INGESTED`.

Milestone 2 activates automated intelligence to research prospects from public websites and qualify them against Ideal Customer Profile (ICP) criteria before any sales outreach. See `proposal.md` for background motivation and high-level scope.

## Goals / Non-Goals

**Goals:**
- Implement a deterministic, typed Finite State Machine (FSM) runtime in pure TypeScript without heavyweight agent frameworks (LangChain, CrewAI, AutoGen).
- Retrieve stored leads in `INGESTED` status from PostgreSQL and advance their lifecycle deterministically.
- Implement an SSRF-sandboxed, DNS-rebinding-immune public web research tool with comprehensive IPv4, IPv6, and IPv4-mapped IPv6 coverage, strictly scoped to verified lead domains.
- Implement bounded transient retry (exactly 1 retry) for recoverable errors (HTTP 429, 502–504, ECONNRESET) with jitter and `Retry-After` compliance, strictly excluding SSRF, TLS, or invalid URL errors.
- Construct a two-stage, least-privilege LLM pipeline with XML quarantine envelopes and secondary semantic validation to neutralize prompt injection.
- Integrate the model gateway layer via 9Router (`http://localhost:20128/v1`) using a pluggable dual-adapter pattern.
- Produce structured, Zod-validated research findings and qualification scores using a static MVP rubric (30% industry, 25% size, 25% product, 20% tech stack) with explicit separation of `score`, `confidence`, and `evidenceCoverage`, minimum evidence requirements for actionable tiers, and mandatory `INSUFFICIENT_EVIDENCE` routing for leads lacking critical evidence.
- Enforce hard bounded execution guards: max 10 steps, max 5 tool calls, 120s wall-clock deadline via `AbortSignal`, cancellation, and $0.50 budget ceiling backed by model allowlisting, trusted pricing, output-token bounds, pre-request maximum cost estimation, and fail-closed halt on unverified cost/usage.
- Store all execution runs, state transitions, tool invocations, retry attempts, research findings, and scores in PostgreSQL (`agent_runs`, `agent_steps`) with full audit trails.
- Mandate Human-in-the-Loop review (`AWAITING_APPROVAL` or `INSUFFICIENT_EVIDENCE`) before any qualification is considered approved.

**Non-Goals:**
- No automated email outreach, proposal generation, or external writing (strictly deferred to Milestone 3).
- No n8n webhook dispatching or external workflow triggers (strictly deferred to Milestone 4).
- No LangChain, CrewAI, or AutoGen framework usage (ADR-001).
- No arbitrary internet search engine scraping beyond the verified prospect domain.

---

## Decisions

### 1. Custom TypeScript State Machine Runtime & Bounded Execution (ADR-001)

- **Decision:** Build a native TypeScript Finite State Machine (FSM) engine with explicit state transitions:
  `INGESTED` → `RESEARCHING` → `RESEARCH_COMPLETED` → `SCORING` → `AWAITING_APPROVAL` (or `INSUFFICIENT_EVIDENCE` / `DISQUALIFIED` / `FAILED`).
- **Bounded Execution Enforcement:**
  1. *Step Ceiling:* Maximum 10 steps per execution run. If exceeded, run halts immediately with `STEP_LIMIT_EXCEEDED` and transitions to `FAILED`.
  2. *Tool Call Ceiling:* Maximum 5 tool invocations per run. Prevents runaway tool loops.
  3. *Global Wall-Clock Deadline:* Hard 120-second timeout managed via an `AbortController`. The runtime passes `signal: abortController.signal` to all asynchronous operations (HTTP requests, database calls, LLM queries). When expired, execution aborts cleanly with state `TIMED_OUT`.
  4. *Manual Cancellation:* An authorized operator can issue `POST /api/agent/runs/[id]/cancel`, triggering `abortController.abort()` and transitioning the run to `CANCELLED`.
  5. *Token Budget & Cost Ceiling:* $0.50 hard cap per run. Accrued cost is tracked per step.
  6. *Cost Ceiling Architecture & Fail-Closed Budget Enforcement:*
     - **Character Heuristic Non-Guarantee:** Estimations based on character length (such as `ceil(chars / 3.5)`) are rough approximations only and CANNOT be claimed to guarantee actual token counts or costs due to tokenizer variances across languages, symbols, and JSON structures.
     - **Model Allowlist:** Strict whitelist of approved models (`openai/gpt-4o-mini`, `openai/gpt-4o`, `anthropic/claude-3-5-sonnet` or local equivalent configured via gateway). Invocations of unlisted models are rejected before network transmission.
     - **Trusted Pricing Catalog:** A centralized, versioned internal pricing source (`src/lib/gateway/pricing-catalog.ts`) maintaining authoritative per-1M input and output token rates for all allowlisted models. Gateway-reported or ad-hoc runtime pricing claims are never trusted blindly.
     - **Mandatory Output-Token Limits:** Every inference request MUST pass explicit, bounded `max_tokens` (e.g., 1,000 tokens for Stage 1 extraction, 1,000 tokens for Stage 2 scoring), preventing unbounded completion generation and capping maximum possible completion costs.
     - **Pre-Request Maximum Cost Check:** Prior to dispatching any inference request, the runtime computes the upper-bound worst-case cost:
       `estimatedInputTokens = ceil(promptCharacterCount / 3.0)` (conservative token estimator)
       `maxPotentialCost = (estimatedInputTokens * model.inputRate) + (request.maxTokens * model.outputRate)`
       If `accruedCost + maxPotentialCost > budgetLimitUsd ($0.50)`, the request is blocked before transmission.
     - **Actual Usage Accounting:** When the gateway returns a completion response with verified `usage` metadata (`prompt_tokens`, `completion_tokens`), the runtime calculates actual incurred cost against the trusted pricing catalog: `actualCost = (prompt_tokens * model.inputRate) + (completion_tokens * model.outputRate)` and adds it to `accruedCost`.
     - **Explicit Fail-Closed Policy:** If a model's pricing is not defined in the trusted catalog, or if the gateway response omits usage metadata and the worst-case upper bound would violate remaining budget, or if usage cannot be verified, the runtime adopts a strict fail-closed posture: it immediately terminates the run with state `FAILED` and error code `UNVERIFIABLE_COST_HALT` or `BUDGET_EXCEEDED`, and strictly REFUSES to dispatch subsequent requests without an accountable budget.
     - **Residual Financial Risk:** Requests already dispatched over the network cannot always be cancelled mid-stream, refunded by upstream providers, or precisely metered if connection drops or times out before metadata reception. This residual risk is bounded by per-request timeouts (30s) and single-attempt boundaries.

### 2. Comprehensive SSRF, DNS Rebinding, and Redirect Defense (ADR-005, ADR-006)

- **Decision:** Implement a multi-layered network sandbox using Node.js `dns.promises` and custom fetch socket agents:
  1. *Scheme & Port Filtering:* Allow only `http:` and `https:` on standard ports 80 and 443.
  2. *Pre-Request DNS Resolution:* Hostname is resolved via `dns.promises.lookup(hostname, { all: true })`.
  3. *Comprehensive IP & CIDR Blacklisting:*
     - **IPv4:** Loopback (`127.0.0.0/8`), Private subnets (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Link-Local & Cloud Metadata (`169.254.0.0/16`), Current network (`0.0.0.0/8`), Broadcast (`255.255.255.255`), Multicast (`224.0.0.0/4`).
     - **IPv6:** Loopback (`::1`), Link-Local (`fe80::/10`), Unique Local (RFC 4193: `fc00::/7`), Multicast (`ff00::/8`), Unspecified (`::/128`).
     - **IPv4-Mapped IPv6:** Address ranges matching `::ffff:0:0/96` (e.g. `::ffff:127.0.0.1`, `::ffff:169.254.169.254`, `::ffff:10.0.0.1`) are extracted to their IPv4 equivalents and evaluated against the IPv4 blacklist.
     - **Non-Global Unicast:** Any address marked non-global under RFC 6890 is rejected.
  4. *DNS Rebinding Mitigation via Socket IP Pinning:* The HTTP request connects directly to the validated IP address at the transport layer, setting the original target hostname in the HTTP `Host` header and TLS Server Name Indication (SNI). This eliminates the Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding window.
  5. *Manual Redirect Validation:* Requests enforce `redirect: "manual"`. If a 301, 302, 303, 307, or 308 response is encountered, the redirect target URL is resolved and its IP is validated from scratch against the entire blacklist. A hard maximum of 3 redirect hops is enforced.
  6. *Payload & Socket Limits:* 10-second socket timeout and a 2MB maximum payload limit enforced via a streaming byte counter that terminates the socket if exceeded.
  7. *Bounded Transient Retry Policy:*
     - **Recoverable Errors:** HTTP 429 (Rate Limit), 502 (Bad Gateway), 503 (Service Unavailable), 504 (Gateway Timeout), and network `ECONNRESET`.
     - **Limit:** Exactly ONE retry attempt is permitted.
     - **Backoff:** Exponential backoff with random jitter (base 1.5s ± 0.5s). If the server returns a valid `Retry-After` header (up to 10s), the backoff respects this value.
     - **Non-Retryable Errors:** SSRF security rejection, invalid URL, TLS certificate mismatch/failure, HTTP 400, 401, 403, 404, or permanent network errors fail immediately with zero retries.
     - **Deadline Invariance:** The retry delay and second attempt must complete within the overall 120-second run timeout and budget limit.

### 3. Two-Stage, Least-Privilege LLM Pipeline & Semantic Injection Defense

- **Decision:** Isolate factual web extraction from qualification scoring into two decoupled LLM stages with defense-in-depth:
  1. *Quarantine Envelope:* Scraped HTML is cleaned with Cheerio (stripping `<script>`, `<iframe>`, `<style>`, `<svg>`, `<form>`, and hidden CSS elements). Extracted plain text is quarantined inside `<untrusted_scraped_data origin="...">` XML envelopes.
  2. *Stage 1 (Fact Extractor):* Instructs the LLM solely to extract factual corporate attributes into a strict Zod `CompanyResearchSchema` (industry, employee count estimate, core offerings, tech stack).
  3. *Semantic Validation Layer (Post-Stage 1):*
     - Structured JSON is *not* assumed to be free of prompt injection. Malicious text embedded in string values could attempt to influence Stage 2.
     - Additional semantic checks are enforced:
       - Strict length ceilings on string fields (e.g. `summary` max 500 chars, `offering` names max 100 chars).
       - Pattern allowlists on technical identifiers (alphanumeric, dots, hyphens).
       - Prompt leakage and adversarial instruction detection (scanning for patterns like `"ignore previous instructions"`, `"system prompt"`, `"grant full score"`, or markdown link injections).
       - Any detected adversarial instructions within field values are sanitized or flagged before Stage 2.
  4. *Stage 2 (ICP Scorer):* Consumes *only* the semantically validated JSON facts and verified prospect URLs. It never inspects raw scraped text.

### 4. Static ICP Scoring Rubric, Evidence Coverage, & Confidence Evaluation

- **Decision:** Implement a deterministic, static baseline rubric for the MVP with rigorous separation of nominal fit, empirical evidence coverage, and epistemic confidence:
  - **Component Weights:**
    - Industry Relevance: **30%** (Mandatory Critical Factor)
    - Company Size / Maturity: **25%**
    - Core Product / Service Fit: **25%** (Mandatory Critical Factor)
    - Technology Stack Alignment: **20%**
  - **Decoupled Evaluation Metrics:**
    1. `score` (0–100): Nominal rubric fit score calculated from observed criteria plus neutral baseline points for unobserved non-critical criteria.
    2. `evidenceCoverage` (0.0–1.0): Quantitative proportion of rubric criteria backed by verified, cited web evidence from the prospect domain:
       $\text{evidenceCoverage} = \sum_{i \in \text{verified}} w_i$ (where weights $w_i \in \{0.30, 0.25, 0.25, 0.20\}$).
    3. `confidence` (0.0–1.0): Epistemic certainty reflecting clarity, consistency, and specificity of extracted findings, strictly bounded by evidence coverage ($\text{confidence} \le \text{evidenceCoverage}$).
  - **Impact of Unknown / Missing Information:**
    - **On `score`:** Unknown information does **NOT** default to zero (which would unfairly penalize early-stage or quiet companies). Unobserved criteria receive a neutral baseline score (50% of the criteria weight), preventing false disqualification while avoiding unearned bonus points.
    - **On `evidenceCoverage`:** Each unobserved criterion directly deducts from coverage according to its weight.
    - **On `confidence`:** Epistemic uncertainty scales confidence downward; missing criteria cap maximum possible confidence.
  - **Minimum Evidence Requirements for Actionable Outcomes:**
    - To advance to actionable tiers (`TIER_1` or `TIER_2` entering `AWAITING_APPROVAL` for sales outreach review), a prospect MUST fulfill ALL of the following:
      1. **Mandatory Critical Criteria:** Verified empirical evidence citations MUST exist for BOTH `industry` (Industry Relevance) AND `offerings` (Core Product / Service Fit).
      2. **Minimum Evidence Coverage:** $\text{evidenceCoverage} \ge 0.70$ (at least 70% of criteria weight backed by verified citations).
      3. **Minimum Confidence:** $\text{confidence} \ge 0.75$ for Tier 1, $\text{confidence} \ge 0.65$ for Tier 2.
      4. **Verified Evidence URLs:** Non-empty array of verified URLs on the prospect's verified domain.
  - **Tiering & Routing Matrix:**
    - `TIER_1` (Score 80–100, Confidence ≥ 0.75, Evidence Coverage ≥ 0.70, critical evidence verified): Strong fit, transitions to `AWAITING_APPROVAL`.
    - `TIER_2` (Score 60–79, Confidence ≥ 0.65, Evidence Coverage ≥ 0.70, critical evidence verified): Moderate fit, transitions to `AWAITING_APPROVAL`.
    - `INSUFFICIENT_EVIDENCE` (Missing critical industry/product evidence OR Evidence Coverage < 0.70 OR Confidence < 0.65): **Strictly routed to `INSUFFICIENT_EVIDENCE` regardless of nominal score (even if nominal score is ≥ 60 or ≥ 80)**. Suspended for operator review without outreach capability.
    - `DISQUALIFIED` (Score < 50 with sufficient evidence, or verified out-of-market): Flagged as `DISQUALIFIED`.

### 5. Pluggable Model Gateway Adapter (9Router Integration - ADR-002)

- **Decision:** Define a typed `LlmGatewayClient` abstraction with two implementations:
  1. `NineRouterClient` (Primary): Targets the OpenAI-compatible 9Router gateway on `http://localhost:20128/v1` for model routing and token optimization.
  2. `DirectOpenAIClient` (Fallback): Direct client utilizing OpenAI SDK for high-availability redundancy.
- **Provider Switching:** Configurable via `LLM_GATEWAY_PROVIDER` (`9router` | `direct`).

### 6. Relational State Persistence & Complete Auditability (ADR-004)

- **Decision:** Dedicated PostgreSQL schema (`migrations/003_create_agent_runs_and_research.sql`):
  - `agent_runs`: Tracks `id`, `lead_id`, `state`, `current_step`, `max_steps`, `accrued_cost_usd`, `budget_limit_usd`, `error_code`, `error_details`, `created_at`, `updated_at`.
  - `agent_steps`: Append-only log storing `run_id`, `step_number`, `tool_name`, `input_payload`, `output_payload`, `tokens_used`, `cost_usd`, `duration_ms`, `created_at`.
  - `company_research`: Stores structured factual data (`lead_id`, `industry`, `company_size`, `offerings`, `tech_stack`, `content_hash`).
  - `lead_scores`: Stores `lead_id`, `score`, `confidence`, `evidence_coverage`, `tier`, `criteria_breakdown`, `rationale`, `evidence_urls`, `missing_info`.
- **Retry & Failure Auditing:** Any retry attempt records an `agent_step` entry specifying `retry_count: 1`, `backoff_ms`, `trigger_status_code`, and `timestamp`. All state transitions emit immutable entries to `audit_logs`.

### 7. Human-in-the-Loop Review Gate & Zero Outreach Constraint

- **Decision:** Completed runs transition to `AWAITING_APPROVAL` or `INSUFFICIENT_EVIDENCE`.
- **Strict Constraint:** Zero automated email sending, zero proposal generation, zero external write actions in Milestone 2. n8n integration is non-operational for agent dispatches in this milestone.

---

## Acceptance Criteria & Test Strategy

### Group 1: Persistence & Migrations
- **Criteria:** Migration `003` executes cleanly and rollbacks idempotently. Relational foreign keys to `leads(id)` cascade appropriately.
- **Test Strategy:** Unit tests in `tests/unit/migrator.test.ts` verifying up/down migrations; repository tests in `tests/unit/agent-repository.test.ts` verifying atomic inserts, step logging, and retry persistence.

### Group 2: SSRF Sandboxing, IP Pinning & Scraper
- **Criteria:**
  - Blocks IPv4 loopback, RFC 1918, link-local `169.254.169.254`, broadcast, multicast, and 0.0.0.0/8.
  - Blocks IPv6 loopback `::1`, link-local `fe80::/10`, unique local `fc00::/7`, multicast, and unspecified `::/128`.
  - Blocks IPv4-mapped IPv6 (e.g. `::ffff:127.0.0.1`, `::ffff:169.254.169.254`).
  - Socket connects directly to safe IP with target hostname in HTTP `Host` and TLS SNI.
  - Redirects limited to 3 hops, re-checking destination IP on each hop.
  - Streaming payload cut off at 2MB; socket timeout at 10s.
  - Exactly 1 retry for 429/502/503/504/ECONNRESET with jitter and `Retry-After`; 0 retries for SSRF, TLS, or invalid URLs.
- **Test Strategy:** Comprehensive unit tests in `tests/unit/ssrf-guard.test.ts` and `tests/unit/scraper.test.ts` covering IP ranges, redirect chains, socket timeouts, and retry matrix.

### Group 3: Model Gateway & Two-Stage LLM Pipeline
- **Criteria:**
  - Pluggable gateway switches cleanly between 9Router and Direct OpenAI.
  - Model allowlist rejects unlisted models before transmission.
  - Trusted pricing catalog enforces per-1M token rates for prompt and completion.
  - Explicit bounded `max_tokens` enforced on every inference request.
  - Pre-request maximum cost check halts execution before budget exceeded.
  - Fail-closed policy triggers `UNVERIFIABLE_COST_HALT` if pricing/usage cannot be verified, preventing subsequent dispatches.
  - Residual risk of in-flight unmetered/interrupted requests documented and logged.
  - Stage 1 extracts structured JSON inside `<untrusted_scraped_data>`.
  - Semantic validation detects prompt injection strings, excessive field lengths, and illegal characters in identifiers.
- **Test Strategy:** Unit tests in `tests/unit/gateway-client.test.ts` and `tests/unit/extractor.test.ts`.

### Group 4: ICP Qualification, Evidence Coverage, & Confidence Evaluation
- **Criteria:**
  - Evaluates static rubric (30/25/25/20) producing decoupled `score`, `confidence`, and `evidenceCoverage`.
  - Missing evidence receives neutral baseline in score, deducts from coverage, and caps confidence.
  - Prospects lacking critical evidence (industry or offerings) or with `evidenceCoverage < 0.70` or `confidence < 0.65` transition to `INSUFFICIENT_EVIDENCE` even if nominal score >= 80.
  - Actionable tiers (`TIER_1` / `TIER_2`) require verified critical evidence, `evidenceCoverage >= 0.70`, and `confidence >= 0.65` (Tier 2) / `0.75` (Tier 1).
- **Test Strategy:** Unit tests in `tests/unit/qualification-schema.test.ts` and `tests/unit/scorer.test.ts`.

### Group 5: FSM Runtime & Bounded Execution
- **Criteria:**
  - State machine allows only valid progressions; rejects illegal jumps.
  - Step limit (10) terminates run with `STEP_LIMIT_EXCEEDED`.
  - Tool call limit (5) terminates runaway loops.
  - Wall-clock timeout (120s) triggers AbortSignal and marks run as `TIMED_OUT`.
  - Operator cancellation transitions run to `CANCELLED` and releases resources.
  - Accrued cost or pre-request worst-case estimate exceeding $0.50 budget ceiling halts execution with fail-closed error.
- **Test Strategy:** Unit tests in `tests/unit/state-machine.test.ts` and `tests/unit/agent-runner.test.ts`.

### Group 6: API Routes & UI Inspection
- **Criteria:**
  - `POST /api/agent/run` starts background run with session authentication.
  - `POST /api/agent/runs/[id]/cancel` cancels in-flight run.
  - `GET /api/agent/runs/[id]` and `GET /api/leads/[id]/research` expose dossiers and status.
  - Lead detail UI renders research dossier, score breakdown, evidence URLs, confidence, evidence coverage, missing info, and `AWAITING_APPROVAL` / `INSUFFICIENT_EVIDENCE` badges.
  - Zero outreach actions triggered.
- **Test Strategy:** Route tests in `tests/api/agent-run.test.ts` and full integration test in `tests/integration/agent-research-flow.test.ts`.

---

## Migration Plan

1. **Database Migration**: Create `migrations/003_create_agent_runs_and_research.sql` defining `agent_runs`, `agent_steps`, `company_research`, and `lead_scores` (with `score`, `confidence`, `evidence_coverage`, `tier`, `criteria_breakdown`, `rationale`, `evidence_urls`, `missing_info`).
2. **Dependencies**: Add `cheerio` and `ipaddr.js` to `package.json`.
3. **Core Modules Implementation**:
   - `src/lib/agent/state-machine.ts`: FSM state transitions and boundary checks.
   - `src/lib/agent/tools/ssrf-guard.ts`: Socket IP pinning and IPv4/IPv6/mapped CIDR validation.
   - `src/lib/agent/tools/scraper.ts`: Sandboxed HTTP fetcher with 1x transient retry, 2MB streaming cap, and Cheerio DOM sanitization.
   - `src/lib/agent/tools/extractor.ts`: Stage 1 fact extraction with semantic validation.
   - `src/lib/agent/tools/scorer.ts`: Stage 2 static ICP evaluation with decoupled `score`, `confidence`, and `evidenceCoverage`, minimum evidence gating, and `INSUFFICIENT_EVIDENCE` routing.
   - `src/lib/agent/runner.ts`: Bounded execution engine with model allowlist, trusted pricing, output-token bounds, pre-request maximum cost check, fail-closed costing, 120s timeout, and cancellation.
   - `src/lib/gateway/`: Gateway client supporting 9Router and direct provider adapters with trusted pricing catalog.
4. **API Handlers & UI View**:
   - `/api/agent/run`, `/api/agent/runs/[id]/cancel`, `/api/agent/runs/[id]`, `/api/leads/[id]/research`.
   - Update `src/app/leads/[id]/page.tsx` for research dossier visualization, score breakdown, evidence coverage, confidence indicator, and HITL review banner.

---

## Open Decisions Resolved

- **ICP Rubric & Evidence Gating:** Resolved by operator — static baseline rubric (30% industry, 25% size, 25% product, 20% tech stack) with decoupled `score`, `confidence`, and `evidenceCoverage`, minimum evidence requirements (mandatory industry/product, coverage >= 0.70), and mandatory `INSUFFICIENT_EVIDENCE` routing for unevidenced leads regardless of nominal score.
- **Cost Ceiling Architecture:** Resolved by operator — fail-closed cost ceiling ($0.50 cap) backed by model allowlisting, trusted internal pricing catalog, explicit output-token limits (`max_tokens`), pre-request worst-case cost estimation, actual usage reconciliation, and formal acknowledgement of in-flight residual financial risk.
- **Research Retry:** Resolved by operator — exactly 1 retry for transient recoverable failures (HTTP 429, 502–504, ECONNRESET) with exponential backoff, jitter, and `Retry-After` compliance within global timeout; zero retry for SSRF, TLS, or permanent errors.
