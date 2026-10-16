# Spec Delta: Commercial Platform

## Purpose

Defines internal commercial operations workspace behaviors for PT Trukindo Logistik Prima sales and business development teams, covering prospect dossier inspection, human-review decision gates, role-based authorization, and quotation readiness workflows without claiming operational TMS execution.

## ADDED Requirements

### Requirement: Commercial Navigation and Role-Based Access Control
The internal application SHALL provide authenticated navigation covering Dashboard, Leads & Inquiries, Prospect Research, Qualification Review, Customer Directory, and Settings, enforcing role-based privileges across ADMIN, OPERATOR, and VIEWER roles.

#### Scenario: VIEWER role restricted from commercial reviews
- **WHEN** an authenticated user with the VIEWER role accesses the qualification review interface
- **THEN** the platform permits dossier inspection but disables all approval, rejection, and rerun actions

#### Scenario: OPERATOR role executes qualification decision
- **WHEN** an authenticated user with OPERATOR or ADMIN role submits a review decision with mandatory rationale
- **THEN** the platform commits the state transition to PostgreSQL and records an immutable audit trail entry

### Requirement: Prospect Intelligence Dossier Inspection
The platform SHALL render a dedicated prospect dossier displaying extracted corporate profile data, logistics needs evidence, rubric breakdown charts, decoupled metric meters, and historical agent run logs.

#### Scenario: Inspecting prospect qualification details
- **WHEN** a sales representative opens the dossier view for a lead
- **THEN** the system displays the nominal score, confidence rating, evidence coverage percentage, and verifiable primary source URLs for all confirmed criteria

### Requirement: Mandatory Human-in-the-Loop Review Gate
The platform SHALL require an explicit human operator review decision before any lead in `AWAITING_APPROVAL` or `INSUFFICIENT_EVIDENCE` can transition to `QUALIFIED` or `DISQUALIFIED`, strictly prohibiting automated email transmission or automated outreach.

#### Scenario: Preventing automated lead qualification
- **WHEN** an automated research agent run completes with high scores
- **THEN** the lead remains suspended in `AWAITING_APPROVAL` until a human operator verifies the findings and submits an approval decision

### Requirement: Visual Pipeline Separation for Inquiries and Cold Prospects
The leads and opportunities directory SHALL provide distinct visual tagging, filtering, and sorting to separate inbound shipper inquiries from cold researched prospects.

#### Scenario: Filtering inbound commercial inquiries
- **WHEN** a sales manager applies the inbound filter in the leads directory
- **THEN** the table displays only records originating from `INBOUND_INQUIRY` alongside their shipment origin, destination, and cargo requirements

### Requirement: Explicit Commercial Boundary and TMS Isolation
The commercial platform SHALL explicitly limit its functional scope to lead management, prospect intelligence, qualification, and quote preparation foundations, barring operational dispatch, vehicle assignment, driver telemetry, or proof-of-delivery tracking from the commercial dashboard.

#### Scenario: Clarifying platform capability boundary
- **WHEN** an operator accesses the platform overview
- **THEN** system status clearly reflects commercial and sales pipeline metrics without presenting unintegrated operational fleet tracking controls
