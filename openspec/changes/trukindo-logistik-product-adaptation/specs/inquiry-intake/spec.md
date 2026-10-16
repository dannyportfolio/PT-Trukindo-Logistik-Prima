# Spec Delta: Inquiry Intake

## Purpose

Establishes a hardened public-to-internal quotation and contact inquiry ingestion mechanism that validates inputs, deflects automated spam, enforces rate limits, records audit events, and buffers inbound demand into the commercial sales queue.

## ADDED Requirements

### Requirement: Structured Inquiry Schema Validation
The system SHALL expose an inquiry intake endpoint that validates submission payloads using a strict Zod schema requiring company name, contact name, business email, phone number, shipment origin, destination, cargo classification, estimated volume, and notes.

#### Scenario: Submitting valid quotation request
- **WHEN** a prospective client submits complete and conforming inquiry details via the public quotation form
- **THEN** the intake endpoint validates the fields, sanitizes inputs, and responds with HTTP 201 Created and an inquiry reference identifier

#### Scenario: Rejection of invalid payload
- **WHEN** a submission contains an invalid email format, empty required fields, or oversized text buffers
- **THEN** the endpoint rejects the submission with HTTP 400 Bad Request and detailed schema validation messages without creating database records

### Requirement: Anti-Spam and Honeypot Defenses
The inquiry ingestion handler SHALL evaluate submissions for automated bot behavior using hidden honeypot fields and minimum form interaction thresholds, rejecting suspicious submissions without exposing detection heuristics.

#### Scenario: Honeypot field filled by automated script
- **WHEN** an automated submission includes a value in the invisible honeypot field
- **THEN** the endpoint rejects the submission with HTTP 422 Unprocessable Entity or a synthetic success response that drops the payload silently

#### Scenario: Sub-second form submission rejected
- **WHEN** an inquiry payload is submitted faster than the minimum human interaction window (under 3 seconds from form load)
- **THEN** the system rejects the submission as automated bot traffic

### Requirement: Client Rate Limiting
The intake endpoint SHALL enforce client-based rate limiting restricting submissions to a bounded threshold per IP address over a sliding time window (e.g., maximum 5 requests per hour).

#### Scenario: Exceeding submission rate ceiling
- **WHEN** a client IP exceeds the permitted number of inquiry submissions within the rolling window
- **THEN** the intake endpoint responds with HTTP 429 Too Many Requests and a Retry-After header

### Requirement: Inbound Source Attribution and Immutable Audit Logging
The system SHALL record every accepted inquiry as a distinct commercial lead entity tagged with `source: "INBOUND_INQUIRY"` and append an immutable audit log entry capturing submission timestamp, actor ("public_inquiry"), and metadata.

#### Scenario: Storing verified inbound lead
- **WHEN** a valid inquiry is committed to the database
- **THEN** the record is stored with `source: "INBOUND_INQUIRY"`, initial status `INGESTED`, and an audit event in `audit_logs` without triggering automated high-tier qualification assumptions

### Requirement: Decoupled Intake and Research Gating
The ingestion endpoint SHALL persist inbound inquiries without synchronously triggering agentic web scraping or LLM research pipelines during the HTTP request lifecycle.

#### Scenario: Synchronous intake response decoupled from agent execution
- **WHEN** an inquiry is submitted and persisted
- **THEN** the client receives immediate confirmation while automated research execution remains paused until explicitly authorized by a commercial operator
