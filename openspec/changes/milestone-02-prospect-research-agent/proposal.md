# Proposal: Milestone 2 — Prospect Research & Qualification Agent

## Why

With Milestone 1 delivering a hardened lead intake foundation, AstraOps now requires automated intelligence to research prospects and qualify them against Ideal Customer Profile (ICP) criteria before any sales outreach. Manual prospect research is time-consuming, prone to human inconsistency, and delays response times.

However, deploying AI agents in enterprise sales pipelines presents severe security and operational challenges: prompt injection from adversarial website content, Server-Side Request Forgery (SSRF) into cloud/internal networks, unpredictable multi-agent framework bloat (e.g. LangChain/CrewAI), and unconstrained cost loops.

AstraOps Milestone 2 addresses this by introducing a deterministic, custom TypeScript Finite State Machine (FSM) agent runtime that performs SSRF-sandboxed public web research and structured ICP scoring via 9Router, strictly enforcing a Human-in-the-Loop (HITL) review boundary with zero automated outbound actions.

## What Changes

- **Custom Deterministic Agent Runtime (FSM)**:
  - Implement a typed, framework-free state machine (`src/lib/agent/`) orchestrating states: `INGESTED` → `RESEARCHING` → `RESEARCH_COMPLETED` → `SCORING` → `AWAITING_APPROVAL` (or `INSUFFICIENT_EVIDENCE` / `DISQUALIFIED` / `FAILED`).
  - Strict bounded execution guards: max 10 steps per run, 5 tool calls max, 120s global wall-clock deadline via `AbortSignal`, cancellation handler, $0.50 budget ceiling, and structured failure states.
  - **Cost Ceiling Enforcement & Fail-Closed Budget Architecture**:
    - Restrict LLM invocations strictly to an approved model allowlist.
    - Maintain an authoritative, versioned internal pricing source (per-1M prompt/completion token rates).
    - Enforce mandatory bounded output-token limits (`max_tokens`) on every inference call.
    - Perform a pre-request maximum cost estimate (`worstCaseCost = (estimatedPromptTokens * promptRate) + (maxTokens * completionRate)`) before dispatching any request; reject dispatch if remaining budget is insufficient.
    - Track and reconcile actual usage costs when the provider returns verified `usage` metadata (`prompt_tokens`, `completion_tokens`).
    - Explicitly reject character-to-token heuristics (e.g. `chars / 3.5`) as a guarantee of actual hard cost ceilings; if model pricing or usage cannot be verified, the runtime adopts an explicit fail-closed policy, halting execution with `FAILED` and barring subsequent requests without an accountable budget.
    - Formally document residual financial risk: requests already transmitted over the wire cannot always be cancelled mid-flight, refunded, or precisely metered if disconnected or aborted.
  - Persistent run execution, state transitions, tool calls, retry attempts (reasons, backoff delays), and step traces stored in PostgreSQL (`agent_runs`, `agent_steps`) and mirrored to immutable `audit_logs`.

- **Comprehensive SSRF-Hardened Web Research Engine**:
  - Sandboxed website scraper tool in `src/lib/agent/tools/` using Node.js native `dns` and `fetch` with pre-request DNS resolution and strict IP filtering via `ipaddr.js`.
  - Comprehensive IP rejection:
    - IPv4: loopback (`127.0.0.0/8`), private subnets (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local / cloud metadata (`169.254.0.0/16`), current network (`0.0.0.0/8`), broadcast, and multicast (`224.0.0.0/4`).
    - IPv6: loopback (`::1`), link-local (`fe80::/10`), unique local (RFC 4193: `fc00::/7`), multicast (`ff00::/8`), and unspecified (`::/128`).
    - IPv4-mapped IPv6 (`::ffff:0:0/96`, e.g., `::ffff:127.0.0.1`, `::ffff:169.254.169.254`), IPv4-compatible IPv6 (`::/96`), and non-global unicast ranges (RFC 6890).
  - DNS rebinding mitigation via socket IP pinning: connecting directly to validated IP while preserving target hostname in HTTP `Host` header and TLS Server Name Indication (SNI).
  - Manual redirect validation (max 3 hops), re-resolving and re-validating destination IP/CIDR for every redirect hop.
  - Strict resource constraints: 10s socket timeout, 2MB streaming payload ceiling, and domain restriction limited to the lead's verified `website_url`.
  - Bounded transient retry: Exactly 1 retry for recoverable failures (HTTP 429, 502, 503, 504, ECONNRESET) with exponential backoff, jitter, and `Retry-After` adherence. Zero retry for SSRF rejections, invalid URLs, TLS certificate errors, 4xx client errors, or permanent failures. All retries remain within the 120s execution deadline and budget.
  - DOM parsing and sanitization using Cheerio: strips scripts, iframes, SVGs, styles, and hidden CSS elements to extract clean readable text.

- **Prompt Injection Defense & Two-Stage Least-Privilege LLM Pipeline**:
  - Untrusted scraped website content is quarantined inside `<untrusted_scraped_data>` XML envelopes with explicit system instruction boundary defense.
  - Two-stage, least-privilege LLM architecture: Stage 1 (Fact Extractor) parses raw quarantined text into a typed `CompanyResearch` schema. Stage 2 (ICP Scorer) receives *only* the validated structured JSON facts, minimizing indirect prompt injection attack surface.
  - Explicit documentation and semantic defense: Structured JSON is acknowledged as not being an absolute guarantee against prompt injection. Stage 1 outputs undergo secondary semantic validation (field length caps, regex allowlists on identifiers, prompt leakage pattern checks, and refusal to execute embedded instructions in string values).

- **Static ICP Scoring Rubric, Evidence Coverage, & Confidence Evaluation**:
  - Static baseline rubric for MVP: 30% industry fit, 25% company size, 25% product/offering relevance, and 20% tech stack alignment.
  - Explicit metric decoupling:
    - `score` (0–100): Nominal rubric fit score.
    - `confidence` (0.0–1.0): Epistemic certainty based on clarity and corroboration of facts.
    - `evidenceCoverage` (0.0–1.0): Ratio of rubric criteria backed by verified, empirical citations from the prospect domain.
  - Handling of unknown/missing information:
    - Does NOT default to zero in `score` (assigned neutral baseline to avoid penalizing quiet companies).
    - Directly decreases `evidenceCoverage` proportionally.
    - Directly depresses `confidence` (`confidence <= evidenceCoverage`).
  - Actionable outcome minimum evidence thresholds:
    - Advancing to actionable review tiers (`TIER_1` or `TIER_2` entering `AWAITING_APPROVAL`) strictly requires `evidenceCoverage >= 0.70`, `confidence >= 0.65`, and verified evidence for mandatory critical criteria (`industry` and `offerings`).
    - Leads with missing critical information or failing evidence coverage thresholds are strictly routed to `INSUFFICIENT_EVIDENCE` for manual operator review, regardless of high nominal score.

- **Model Gateway Adapter (9Router Integration)**:
  - Pluggable `LlmGatewayClient` interface with primary `NineRouterClient` implementation targeting OpenAI-compatible local/remote gateway (`ROUTER_BASE_URL`, default `http://localhost:20128/v1`).
  - Fallback provider adapter (`DirectOpenAIClient`) for seamless operational resilience without modifying agent core logic.

- **Human-in-the-Loop (HITL) Review Enforcement**:
  - All agent research and qualification results transition to `AWAITING_APPROVAL`, `INSUFFICIENT_EVIDENCE`, or `DISQUALIFIED`.
  - **Hard Non-Goal / Constraint**: Zero automated outreach, zero email dispatching, and zero external write actions in this milestone. Any prospect contact remains strictly blocked pending human review. n8n remains an external integration boundary, not an agent orchestrator.

## Capabilities

### New Capabilities

- `agent-runtime`: Custom deterministic TypeScript Finite State Machine (FSM) runtime orchestrating bounded agent execution, state transitions, step checkpoints, model allowlist, trusted pricing catalog, output-token bounds, pre-request budget checks, fail-closed cost ceiling enforcement, and residual risk logging without third-party agent frameworks.
- `prospect-research`: SSRF-hardened, domain-restricted public website extraction engine with IPv4/IPv6/IPv4-mapped validation, socket IP pinning, TLS SNI, redirect re-validation, bounded transient retry, HTML sanitization, and prompt quarantine.
- `qualification-scoring`: Two-stage least-privilege LLM pipeline via 9Router gateway producing structured Zod-validated ICP scores, semantic injection defenses, explicit metric separation (`score`, `confidence`, `evidenceCoverage`), minimum evidence requirements, and mandatory routing of unevidenced leads to `INSUFFICIENT_EVIDENCE`.

### Modified Capabilities

<!-- None: Baseline specs were established in Milestone 1. Milestone 2 builds on Milestone 1 data models without altering existing lead intake requirements. -->

## Impact

- **Database**: New PostgreSQL migration `003_create_agent_runs_and_research.sql` creating `agent_runs`, `agent_steps`, `company_research`, and `lead_scores` (with `score`, `confidence`, `evidence_coverage`, `tier`, `criteria_breakdown`, `missing_info`, `evidence_urls`, `rationale`) tables with Foreign Keys referencing `leads.id`.
- **Dependencies**: Addition of `cheerio` (for DOM parsing/sanitization) and `ipaddr.js` (for strict IPv4/IPv6/IPv4-mapped CIDR range validation) in `package.json`.
- **API Endpoints**: New authenticated route handlers `POST /api/agent/run`, `POST /api/agent/runs/[id]/cancel`, `GET /api/agent/runs/[id]`, and `GET /api/leads/[id]/research`.
- **Security & Threat Model**: Extended threat model covering SSRF (IPv4/IPv6/mapped), DNS rebinding, redirect loops, prompt injection semantic risks, fail-closed cost ceilings, and epistemic evidence thresholds.
