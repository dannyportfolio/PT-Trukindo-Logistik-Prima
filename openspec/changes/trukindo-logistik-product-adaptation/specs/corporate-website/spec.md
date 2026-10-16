# Spec Delta: Corporate Website

## Purpose

Defines public-facing corporate portal behaviors for PT Trukindo Logistik Prima, presenting verified trucking and logistics capabilities, operational standards, B2B call-to-action pathways, and strict content integrity enforcement.

## ADDED Requirements

### Requirement: Information Architecture and Public Navigation
The corporate website SHALL provide primary navigation comprising Home, About Us, Services, Fleet & Cargo, Industries Served, Operations & Safety, Request a Quote, and Contact, rendering responsive views across desktop, tablet, and mobile displays.

#### Scenario: Navigating corporate pages
- **WHEN** a visitor clicks any primary navigation link on the corporate site
- **THEN** the application renders the corresponding section with proper semantic headings, page metadata, and active link indication

### Requirement: Confirmed Service Offerings Presentation
The corporate website SHALL display verified land transportation and contract logistics services, presenting clear operational scopes while strictly isolating any speculative or unconfirmed services.

#### Scenario: Displaying confirmed trucking services
- **WHEN** a prospective client views the Services overview
- **THEN** the system displays confirmed service models (Full Truck Load, scheduled line haul, dedicated distribution) with verified capability summaries

### Requirement: Fleet and Cargo Specifications Display
The website SHALL describe standard truck categories (e.g., CDE, CDD, Fuso, Tronton, Trailer) and compatible cargo classifications (FMCG, industrial raw materials, general cargo) without asserting unverified fleet counts or asset ownership.

#### Scenario: Inspecting cargo compatibility
- **WHEN** a prospective shipper inspects the Fleet & Cargo catalog
- **THEN** the portal presents dimensional and payload specifications for standard vehicle classes alongside accepted cargo types and packing guidelines

### Requirement: Content Integrity and Fact Gating Guardrails
The content presentation system SHALL enforce strict fact gating, prohibiting display of unconfirmed corporate statistics (truck count, warehouse square footage, client logos, safety certifications, or unverified founding years). Any unverified datum in configuration SHALL be excluded from public rendering.

#### Scenario: Unverified corporate datum quarantined
- **WHEN** a corporate profile configuration entry contains a `NEEDS_VERIFICATION` flag
- **THEN** the public UI suppresses the metric and replaces it with qualitative capability descriptions rather than publishing fabricated figures

### Requirement: Commercial Call-to-Action Pathways
The website SHALL present prominent, accessible commercial call-to-action touchpoints on every corporate page, routing prospective shippers directly to the Request a Quote workflow or official contact channels.

#### Scenario: Initiating quotation request from hero section
- **WHEN** a visitor clicks "Minta Penawaran" or "Hubungi Tim Komersial" on any corporate page
- **THEN** the system navigates directly to the quotation request section with pre-focused input fields
