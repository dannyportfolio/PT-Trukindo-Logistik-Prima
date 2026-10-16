# Spec Delta

## Purpose

Enables sales operators to intake, validate, browse, and audit prospective sales targets via manual UI form submission and bulk CSV uploading.

## ADDED Requirements

### Requirement: Manual Lead Submission
The system SHALL validate and persist new leads submitted through manual form input or REST API with company name, website URL, contact name, and contact email.

#### Scenario: Successful manual lead creation
- **WHEN** sales operator submits valid lead details with valid URL and contact email
- **THEN** system creates lead in PostgreSQL with status INGESTED, assigns UUID, and records an audit log entry

#### Scenario: Rejection of invalid website URL
- **WHEN** operator submits an invalid or non-HTTP/HTTPS website URL
- **THEN** system rejects submission with HTTP 400 and returns structured Zod error details

### Requirement: Bulk CSV Lead Intake with Formula Injection Protection
The system SHALL accept CSV files up to 5MB, validate rows against the lead schema, sanitize formula injection characters, and batch-insert valid leads.

#### Scenario: Valid CSV upload
- **WHEN** operator uploads a CSV file containing valid prospect rows
- **THEN** system parses rows, sanitizes formula prefixes, inserts valid records into leads, and reports count of imported rows

#### Scenario: Malicious formula injection detection
- **WHEN** a CSV cell starts with formula trigger characters like equals, plus, minus, or at sign
- **THEN** parser sanitizes or quotes the cell to neutralize spreadsheet DDE formula execution before database storage

#### Scenario: Partial row failure reporting
- **WHEN** uploaded CSV contains both valid rows and malformed rows with missing emails or invalid URLs
- **THEN** system imports all valid rows, returns a list of failed line numbers with specific validation errors, and does not crash

### Requirement: Lead Query and Detail Retrieval
The system SHALL provide paginated listing and single-lead retrieval including associated audit history.

#### Scenario: Fetching paginated lead list
- **WHEN** operator requests GET /api/leads with page and limit parameters
- **THEN** system returns JSON array of leads sorted by created_at descending along with pagination metadata

### Requirement: Immutable Audit Trail for Lead Ingestion
The system SHALL record an append-only audit log entry for every created lead capturing actor ID, timestamp, and initial payload snapshot.

#### Scenario: Audit record created on lead intake
- **WHEN** a new lead is persisted into the leads table
- **THEN** system inserts an immutable record into audit_logs containing event_type LEAD_INGESTED
