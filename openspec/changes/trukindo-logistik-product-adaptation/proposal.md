# Proposal: Trukindo Logistics Platform Product Transformation

## Why

PT Trukindo Logistik Prima requires a modern, credible, and high-velocity digital presence to support its B2B trucking and logistics operations in Indonesia. By adapting the battle-tested AstraOps Milestone 2 foundation (SSRF-hardened scraper, 9Router LLM gateway, decoupled static ICP scoring, and human-in-the-loop review gates), Trukindo can simultaneously establish a public corporate website that builds enterprise buyer trust and an internal commercial platform that empowers sales and business development teams with AI-assisted prospect intelligence and qualification.

This transformation bridges public inbound demand capture with structured internal commercial qualification without rebuilding core infrastructure or compromising existing security boundaries.

## What Changes

1. **Public Corporate Website Architecture & B2B Profile**:
   - Deliver public-facing corporate pages: Home, About Us, Services, Fleet & Cargo, Industries Served, Operations & Safety, Request a Quote, and Contact.
   - Establish an industrial, modern B2B brand identity using deep navy/corporate blue, neutral grays/white, and high-contrast amber/orange accents.
   - Implement strict **Content Integrity Guardrails**: explicit prohibition of fabricated corporate facts (founding year, truck fleet size, owned warehouse counts, client logos, unconfirmed certifications, or speculative services such as cold chain/customs). All unconfirmed claims are quarantined in configuration as `NEEDS_VERIFICATION` and excluded from public display.
2. **Public-to-Internal Inbound Inquiry Pipeline (`inquiry-intake`)**:
   - Implement a secured public inquiry ingestion endpoint (`/api/inquiries`) accepting quotation and contact requests.
   - Enforce Zod input validation, bot/spam protection (honeypot fields and submission time bounds), rate limiting, and immutable audit event logging.
   - Distinguish inbound inquiries (`source: INBOUND_INQUIRY`) from proactive cold outbound leads or CSV imports, preventing unverified form fills from skewing qualification metrics.
3. **Internal Commercial Platform Adaptation (`commercial-platform`)**:
   - Rebrand internal workspaces from AstraOps to Trukindo Logistics Platform.
   - Realign internal navigation: Commercial Dashboard, Leads & Inquiries, Prospect Research, Qualification Review, Customer Directory, and Platform Settings.
   - Explicitly scope the platform to commercial and prospect intelligence; clarify that operational Transport Management System (TMS) functions (fleet tracking, dispatch, driver management, POD, dynamic billing) remain outside the current platform boundary.
4. **Logistics-Specific ICP Qualification Rubric Proposal (`logistics-qualification`)**:
   - Formulate a tailored B2B logistics ICP rubric evaluating freight requirements, cargo compatibility, shipping volume/frequency, and geographical operating alignment.
   - Preserve the existing production ICP baseline intact to prevent breaking changes, while documenting the logistics rubric, required training/eval data, trade-offs, and migration path for formal review.
5. **Deployment & Domain Strategy ADR**:
   - Provide technical verification of the target temporary domain `logistikprima.dannyportfolio.github.io`.
   - Contrast Option A (Static GitHub Pages + Separate Full-Stack API), Option B (Single Next.js Full-Stack App), and Option C (Containerized Node.js + PostgreSQL + 9Router).
   - Deliver a pragmatic, secure, low-overhead MVP recommendation addressing the 120s pipeline execution timeout and local 9Router daemon network reachability.

## Capabilities

### New Capabilities
- `corporate-website`: Public-facing company profile, verified service catalog, fleet/cargo specifications, trust indicators, and content integrity enforcement.
- `inquiry-intake`: Secured public quotation and contact inquiry ingestion with anti-spam, Zod schema validation, rate limiting, and audit logging into the sales pipeline.
- `logistics-qualification`: Logistics-tailored ICP evaluation framework defining freight demand, cargo fit, and route criteria with decoupled score, confidence, and evidence coverage metrics.
- `commercial-platform`: Internal commercial sales workspace adapting AstraOps lead intelligence, dossier review, human-in-the-loop approval gate, and quotation workflow foundations.

### Modified Capabilities
None (The project specs inventory is currently empty; existing Milestone 2 capabilities serve as the immutable code baseline and will not experience unverified requirement breaks).

## Impact

- **Public Routing**: Addition of public route tree (`/`, `/about`, `/services`, `/fleet-cargo`, `/industries`, `/operations-safety`, `/quote`, `/contact`).
- **Internal Routing**: Domain isolation separating public layout from internal commercial pages (`/leads`, `/leads/[id]`, `/dashboard`).
- **API Endpoints**: Addition of `/api/inquiries` with strict CORS and anti-spam controls.
- **Database Schema**: Non-destructive extensions to support inquiry source attribution, cargo category tags, and logistics qualification metadata without altering existing table constraints.
- **Security & Runtime Boundaries**: Preservation of Milestone 2 security controls (fail-closed gateway, model allowlist, zero automated outreach, strict SSRF socket pinning, and session token authentication).
