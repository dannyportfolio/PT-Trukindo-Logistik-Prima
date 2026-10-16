# Tasks: Milestone 1 - Project Foundation and Lead Management

## 1. Project Scaffolding and Environment Setup

- [x] 1.1 Initialize Next.js 15+ App Router project structure with TypeScript strict mode and verify build compiles via `npx next build --dry-run`
- [x] 1.2 Configure Vitest test runner, mock environment, and coverage reporter, verifying via `npm test`
- [x] 1.3 Implement centralized environment configuration module with Zod validation (`DATABASE_URL`, `ROUTER_BASE_URL`, `PORT`) and verify with unit test `tests/unit/config.test.ts`

## 2. Persistence Layer & Database Migrations

- [x] 2.1 Set up PostgreSQL connection pool utility (`src/lib/db.ts`) with retry logic and test healthcheck ping via `tests/integration/db-health.test.ts`
- [x] 2.2 Create database migration `001_create_leads_and_audit.sql` defining `leads` and `audit_logs` tables with appropriate indexes and check syntax
- [x] 2.3 Implement PostgreSQL trigger and privilege grants for append-only immutability on `audit_logs` and verify via test trying unauthorized UPDATE/DELETE
- [x] 2.4 Implement lead repository module with transactional create, read, and audit logging and verify via `tests/integration/lead-repository.test.ts`

## 3. Lead Validation Contracts & CSV Parsing Engine

- [x] 3.1 Define Zod validation schemas for `LeadInput` and `CsvLeadRow` in `src/types/lead.ts` and verify via `tests/unit/lead-validation.test.ts`
- [x] 3.2 Implement CSV streaming parser and formula injection sanitizer in `src/lib/csv-parser.ts` and verify malicious prefix neutralizing via `tests/unit/csv-sanitizer.test.ts`
- [x] 3.3 Implement batch CSV importer with row-level error collection and verify partial failure reporting via `tests/unit/csv-batch-import.test.ts`

## 4. API Route Handlers

- [x] 4.1 Implement `POST /api/leads` and `GET /api/leads` route handlers with Zod validation and verify via `tests/api/leads.test.ts`
- [x] 4.2 Implement `POST /api/leads/upload-csv` with multipart file upload, 5MB limit, and batch transaction, verifying via `tests/api/csv-upload.test.ts`
- [x] 4.3 Implement `GET /api/leads/[id]` retrieving single lead with audit log history and verify via `tests/api/lead-detail.test.ts`

## 5. Web Interface (Presentation Layer)

- [x] 5.1 Build manual lead intake form component with client-side Zod validation and visual feedback in `src/components/LeadForm.tsx`
- [x] 5.2 Build CSV drag-and-drop upload modal with parsing progress and error row table in `src/components/CsvUploader.tsx`
- [x] 5.3 Build lead directory table view with status badges and pagination in `src/app/leads/page.tsx`
- [x] 5.4 Run end-to-end integration test of lead creation and listing flow via `npm test`

## Workflow follow-up

- Review milestone 1 implementation against acceptance criteria.
- Archive change proposal via `openspec archive milestone-01-foundation-and-leads`.
