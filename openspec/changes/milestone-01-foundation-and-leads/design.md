# Design: Milestone 1 - Project Foundation and Lead Management

## Context

AstraOps is initializing its codebase from an empty repository. The system requires a TypeScript Next.js App Router application integrated with PostgreSQL persistence. See `proposal.md` for background motivation and `docs/architecture.md` for global system architecture.

## Goals / Non-Goals

**Goals:**
- Establish standard Next.js 15+ App Router application with strict TypeScript, ESLint, and Vitest configuration.
- Implement PostgreSQL connection client with connection pooling and automated healthcheck.
- Define relational schema and migrations for `leads` and `audit_logs` tables.
- Implement Zod schema validation for manual lead ingestion and CSV parsing.
- Implement defense against CSV formula injection (DDE attacks).
- Enforce database-level append-only privileges for `audit_logs`.
- Build accessible Next.js UI for manual lead creation and CSV batch upload with error reporting.

**Non-Goals:**
- No web scraper, LLM scoring, or proposal generator implementation (deferred to Milestones 2 and 3).
- No n8n webhook integration or dispatching (deferred to Milestone 4).
- No public ingestion webhooks (deferred per architectural decision).

## Decisions

### 1. Project Scaffolding & Directory Structure
- **Decision:** Use Next.js App Router with standard modular structure (`src/app/`, `src/lib/`, `src/components/`, `src/types/`, `tests/`).
- **Rationale:** Standardizes code location, enables React Server Components for fast initial data loading, and cleanly isolates backend Route Handlers.
- **Alternatives Considered:** Express.js + Vite SPA (rejected: requires managing two separate runtimes, violating single Next.js web application constraint).

### 2. Database Client & Migration Tooling
- **Decision:** Use native `pg` connection pool with raw typed SQL migrations and parameterized queries.
- **Rationale:** Zero heavy ORM bloat, predictable query performance, and exact control over transaction boundaries and privilege grants.
- **Alternatives Considered:** Prisma / Drizzle (considered, but raw SQL with pg provides direct control over triggers and privilege revocations without ORM abstraction drift).

### 3. CSV Parsing & Sanitization Library
- **Decision:** Use streaming CSV parser (`csv-parse` or `papaparse`) combined with custom formula injection sanitizer.
- **Rationale:** Prevents high memory consumption on 5MB uploads. Cells beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` are prefixed with an apostrophe `'` to prevent DDE injection in spreadsheet viewers.
- **Alternatives Considered:** Basic `String.split("\n")` (rejected: fails on RFC-4180 escaped commas, multiline cells, and quotes).

### 4. Audit Log Non-Tamperability Design
- **Decision:** Enforce append-only semantics via PostgreSQL role grants and immutability triggers (see ADR-004).
- **Rationale:** Accurately reflects MVP capabilities without false claims of cryptographic immutability.

## Risks / Trade-offs

- **[Risk] High memory usage during large CSV upload** → **Mitigation:** Limit file upload to 5MB, stream parsing with batch inserts of 100 records per transaction.
- **[Risk] CSV Formula Injection executing on operator machines** → **Mitigation:** Strict sanitizer quotes formula prefix characters before database storage.
- **[Risk] Transient database connection drops** → **Mitigation:** Connection pooling with retry policy and structured error logging.

## Migration Plan

1. Initialize Next.js project and install dependencies (`zod`, `pg`, `papaparse`, `vitest`).
2. Run database migration `001_init_leads_and_audit.sql`.
3. Verify database health check and execute test suite via `npm test`.
