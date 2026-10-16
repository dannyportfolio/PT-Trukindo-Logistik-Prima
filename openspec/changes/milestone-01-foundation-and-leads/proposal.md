# Proposal: Milestone 1 - Project Foundation and Lead Management

## Why

AstraOps requires a rock-solid, production-minded foundation before agentic workflows (scraping, scoring, and proposal drafting) can be executed. Without a standardized TypeScript Next.js base, PostgreSQL schema for leads, and an intake mechanism (manual entry and CSV upload), there is no persistent substrate or user interface to ingest and track prospective sales targets. 

Bootstrapping this foundation now establishes strict typing, database persistence with audit integrity, and reliable lead management while keeping external webhook ingestions deferred per architectural agreement.

## What Changes


- Initialize Next.js (App Router) project structure with strict TypeScript end-to-end and clean directory boundaries.
- Set up PostgreSQL / Supabase persistence schemas for `leads` and append-only `audit_logs` with immutability enforcement.
- Implement Zod validation contracts for lead domain entities, manual entry requests, and CSV row schemas.
- Implement backend API route handlers (`/api/leads`, `/api/leads/upload-csv`) with validation and error reporting.
- Build Next.js UI views for manual lead entry form, CSV batch uploader with preview/validation drawer, and a lead directory table.
- Configure Vitest test framework and write automated unit and integration tests for validation, CSV parsing, and database transactions.

## Capabilities

### New Capabilities
- `project-foundation`: Core Next.js, TypeScript strict configuration, environment variable contracts, Vitest testing setup, and PostgreSQL connection pool.
- `lead-management`: Persistent data model for leads, manual intake UI form, CSV bulk intake with RFC-4180 parsing and formula injection protection, lead listing, and append-only audit logging.

### Modified Capabilities
<!-- No existing capabilities to modify in milestone 1 -->

## Impact

- **New Files & Structure:** Establishes root application folders (`src/app/`, `src/lib/`, `src/components/`, `tests/`).
- **Dependencies:** Adds Next.js, React, TypeScript, Zod, pg / @supabase/supabase-js, Papaparse (or csv-parse), and Vitest (no agent frameworks or message brokers).
- **APIs:** Introduces internal endpoints: `GET /api/leads`, `POST /api/leads`, `POST /api/leads/upload-csv`, `GET /api/leads/:id`.
- **Database:** Creates initial migration for tables `leads` and `audit_logs`.
