# Tasks: Milestone 2 — Prospect Research & Qualification Agent

## 1. Schema Migrations & Storage Persistence Layer

- [x] 1.1 Create PostgreSQL migration `003_create_agent_runs_and_research.sql` defining `agent_runs`, `agent_steps`, `company_research`, and `lead_scores` tables (including `score`, `confidence`, `evidence_coverage`, `tier`, `criteria_breakdown`, `missing_info`, `evidence_urls`, `rationale`) with Foreign Keys, retry metadata columns (`retry_count`, `backoff_ms`, `trigger_status_code`), and indexes, verifying migration execution and rollback idempotency via `tests/unit/migrator.test.ts`.
- [x] 1.2 Implement repository layer in `src/lib/agent/repository.ts` with atomic transactions, step logging, retry recording, and audit trail mirroring to `audit_logs`, verifying CRUD and transaction rollback via `tests/unit/agent-repository.test.ts`.

## 2. SSRF Sandboxing, IP Pinning & Scraper Tooling

- [x] 2.1 Add `cheerio` and `ipaddr.js` to `package.json` dependencies and verify clean build resolution via `npm run typecheck`.
- [x] 2.2 Implement comprehensive pre-request DNS resolution and CIDR blacklisting covering IPv4 (RFC 1918, loopback, link-local `169.254.169.254`, broadcast, multicast, 0.0.0.0/8), IPv6 (loopback, link-local, unique local RFC 4193, multicast, unspecified `::/128`), IPv4-mapped IPv6 (`::ffff:0:0/96`), and non-global unicast (RFC 6890), with socket IP pinning and target Host/SNI preservation in `src/lib/agent/tools/ssrf-guard.ts`, verifying via `tests/unit/ssrf-guard.test.ts`.
- [x] 2.3 Implement sandboxed scraper in `src/lib/agent/tools/scraper.ts` enforcing 10s socket timeout, 2MB streaming payload ceiling, manual redirect validation (max 3 hops re-verifying IP), bounded transient retry (exactly 1 retry for 429/502/503/504/ECONNRESET with jitter and `Retry-After`; 0 retries for SSRF/TLS/invalid URLs), and Cheerio DOM script/hidden tag sanitization, verifying via `tests/unit/scraper.test.ts`.

## 3. Model Gateway & Two-Stage Least-Privilege Pipeline

- [x] 3.1 Implement pluggable `LlmGatewayClient` abstraction with `NineRouterClient` (primary) and `DirectOpenAIClient` (fallback) in `src/lib/gateway/` enforcing model allowlist, trusted internal pricing catalog, mandatory bounded `max_tokens`, pre-request worst-case cost estimation, actual usage reconciliation, and explicit fail-closed policy (halting without sending subsequent requests if pricing or usage is unverifiable), verifying allowlist rejection, pricing calculation, and fail-closed behavior via `tests/unit/gateway-client.test.ts`.
- [x] 3.2 Implement Stage 1 Fact Extractor tool in `src/lib/agent/tools/extractor.ts` using `<untrusted_scraped_data>` XML quarantine tags, strict Zod `CompanyResearchSchema`, and secondary semantic validation (string length ceilings, pattern allowlists, and prompt injection instruction pattern detection), verifying parsing and injection defense via `tests/unit/extractor.test.ts`.

## 4. Static ICP Qualification Engine & Structured Zod Contracts

- [x] 4.1 Define Zod contracts in `src/types/qualification.ts` explicitly separating `score`, `confidence`, and `evidenceCoverage`, specifying neutral baseline defaults for unobserved criteria, defining actionable tier thresholds (minimum 0.70 evidence coverage, 0.65 confidence, and mandatory verified industry/offerings evidence), and supporting `INSUFFICIENT_EVIDENCE` routing, verifying schema validation via `tests/unit/qualification-schema.test.ts`.
- [x] 4.2 Implement Stage 2 ICP Scorer tool in `src/lib/agent/tools/scorer.ts` evaluating static rubric weights (30% industry, 25% size, 25% product, 20% tech stack) from Stage 1 structured JSON without raw web text, computing decoupled `score`, `confidence`, and `evidenceCoverage`, enforcing minimum evidence requirements, and routing any lead missing critical industry/product facts or failing evidence thresholds to `INSUFFICIENT_EVIDENCE` regardless of nominal score, verifying rubric evaluation via `tests/unit/scorer.test.ts`.

## 5. Deterministic State Machine Runtime & Bounded Execution

- [x] 5.1 Implement TypeScript FSM engine in `src/lib/agent/state-machine.ts` with explicit states (`INGESTED`, `RESEARCHING`, `RESEARCH_COMPLETED`, `SCORING`, `AWAITING_APPROVAL`, `INSUFFICIENT_EVIDENCE`, `DISQUALIFIED`, `FAILED`) and verify transition rules and illegal state rejections via `tests/unit/state-machine.test.ts`.
- [x] 5.2 Implement bounded execution guards in `src/lib/agent/runner.ts` enforcing max 10 steps, max 5 tool calls, 120s wall-clock timeout via AbortSignal, operator cancellation, $0.50 budget ceiling with pre-request maximum cost checks, explicit fail-closed halting on unverifiable cost or usage, and structured residual risk logging, verifying guard trigger tests in `tests/unit/agent-runner.test.ts`.
- [x] 5.3 Implement sequential pipeline orchestrator `runAgentPipeline` and class-based `AgentRunner` in `src/lib/agent/runner.ts` connecting lead validation, website scraping, Stage 1 fact extraction, Stage 2 ICP scoring, atomic checkpointing, previousLeadStatus restoration on cancellation, and suspension at the human review gate (`AWAITING_APPROVAL` / `INSUFFICIENT_EVIDENCE` / `DISQUALIFIED`) with zero automated outreach, verified via `tests/unit/agent-runner.test.ts` and `tests/integration/agent-runner-live.test.ts`.

## 6. API Route Handlers & Human-in-the-Loop Review Integration

- [x] 6.1 Implement `POST /api/agent/run`, `POST /api/agent/runs/[id]/cancel`, and `GET /api/agent/runs/[id]` route handlers with role authorization and audit logging, verifying via `tests/api/agent-run.test.ts`.
- [x] 6.2 Implement lead dossier research inspection route `GET /api/leads/[id]/research` and verify with `tests/api/lead-research.test.ts`.
- [x] 6.3 Update lead detail page component in `src/app/leads/[id]/page.tsx` to render research dossier, static ICP score breakdown, evidence coverage, confidence indicator, missing evidence, and `AWAITING_APPROVAL` / `INSUFFICIENT_EVIDENCE` review badges.
- [x] 6.4 Implement end-to-end regression test of prospect research and qualification pipeline against PostgreSQL in `tests/integration/agent-research-flow.test.ts`, verifying zero outreach actions and full audit trail via `npm test`.

## Workflow follow-up

- Review Milestone 2 implementation against acceptance criteria and regression test matrix.
- Archive change proposal via `openspec archive milestone-02-prospect-research-agent`.
