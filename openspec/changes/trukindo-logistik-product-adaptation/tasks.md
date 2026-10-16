# Tasks: Trukindo Logistics Platform Implementation

## 1. Brand System, Content Strategy & Fact-Gating Configuration

- [ ] 1.1 Establish brand tokens (navy `#0a2540`, slate neutrals, amber accent `#f59e0b`) in `src/app/globals.css` and verify theme contrast ratios meet WCAG AA standards
- [ ] 1.2 Implement the typed corporate profile and `NEEDS_VERIFICATION` content gating store in `src/lib/content/trukindo-config.ts` and verify unit tests prove unverified facts are suppressed from public rendering
- [ ] 1.3 Add unit test suite in `tests/unit/trukindo-content-integrity.test.ts` verifying that company facts tagged as `NEEDS_VERIFICATION` (founding year, truck count, owned warehouses, client logos) throw or return safe fallbacks

## 2. Public Corporate Website Information Architecture & Pages

- [ ] 2.1 Implement the public layout and navigation component (`src/components/public/PublicNavbar.tsx`, `PublicFooter.tsx`) with links for Home, About, Services, Fleet & Cargo, Industries, Operations & Safety, Quote, and Contact, verifying responsive rendering on mobile and desktop
- [ ] 2.2 Implement the corporate homepage (`src/app/(public)/page.tsx`) with hero value propositions, verified services overview, fleet previews, and B2B quote CTA banner, verifying with snapshot and visual unit tests
- [ ] 2.3 Implement the About Us (`/about`) and Services (`/services`) pages presenting confirmed FTL, Linehaul, and Contract Logistics workflows without speculative claims
- [ ] 2.4 Implement the Fleet & Cargo (`/fleet-cargo`) page detailing standard vehicle specifications (CDE, CDD, Fuso, Tronton, Trailer) and accepted cargo classes, verifying dimension and payload guideline tables
- [ ] 2.5 Implement Industries Served (`/industries`) and Operations & Safety (`/operations-safety`) pages highlighting FMCG/manufacturing solutions and vehicle inspection protocols
- [ ] 2.6 Add end-to-end Playwright tests in `tests/e2e/public-corporate-site.spec.ts` verifying all public links, navigation anchors, and semantic heading hierarchies

## 3. Inbound Inquiry Pipeline, Schema Validation & Anti-Spam Defenses

- [ ] 3.1 Define the inquiry submission schema, cargo classifications, and anti-spam types in `src/types/inquiry.ts` with strict Zod validations
- [ ] 3.2 Implement client-side quotation request form (`src/components/public/QuoteRequestForm.tsx`) with honeypot fields, submission timing bounds, and cargo selection controls
- [ ] 3.3 Implement the ingestion route handler `POST /api/inquiries` with IP rate limiting (5 req/hr), honeypot checks, and sub-second bot deflection, verifying with integration tests in `tests/api/inquiries.test.ts`
- [ ] 3.4 Extend `src/lib/lead-repository.ts` with `createInboundInquiry` to persist inquiries tagged with `source: "INBOUND_INQUIRY"`, status `"INGESTED"`, and an immutable audit log entry in `audit_logs`
- [ ] 3.5 Verify that inbound inquiries are buffered into the sales database without triggering synchronous agent scraping or LLM extraction runs during form submission

## 4. Commercial Platform Rebranding & Internal Workspace Adaptation

- [ ] 4.1 Update commercial workspace layout (`src/app/(admin)/layout.tsx`) and navbar (`src/components/Navbar.tsx`) with "Trukindo Logistics Platform" branding, role indicators, and dual navigation paths (Public Portal vs Commercial Workspace)
- [ ] 4.2 Update the leads directory (`src/app/leads/page.tsx`) with visual source badges distinguishing `INBOUND_INQUIRY` from `MANUAL_PROSPECT` and `CSV_IMPORT`, verifying filter tabs via UI component tests
- [ ] 4.3 Update the prospect dossier view (`src/app/leads/[id]/page.tsx`) to display inbound shipment details (origin, destination, cargo class, volume) alongside research results
- [ ] 4.4 Verify all existing Milestone 2 regression suites (`tests/integration/legacy-status-regression.test.ts`, `tests/api/lead-research.test.ts`) pass without breakage

## 5. Freight & Logistics ICP Qualification Rubric Staging & Schema Evolution

- [ ] 5.1 Implement the staged logistics ICP scoring rubric in `src/lib/agent/logistics-rubric/scorer.ts` evaluating Industry (25%), Shipping Demand (25%), Cargo Compatibility (20%), Route Alignment (15%), and Company Scale (15%)
- [ ] 5.2 Implement decoupled metric calculations (`score`, `confidence`, `evidenceCoverage`) with 50% neutral baselines for unobserved logistics criteria
- [ ] 5.3 Implement the logistics fact extraction schema in `src/lib/agent/logistics-rubric/extractor.ts` capturing manufacturing activity, distribution facilities, and cargo mentions with domain-scoped evidence URLs
- [ ] 5.4 Implement unit tests in `tests/unit/logistics-scorer.test.ts` verifying that missing critical logistics evidence (shipping demand or industry sector) routes evaluations strictly to `INSUFFICIENT_EVIDENCE`
- [ ] 5.5 Document the rubric migration strategy, comparison report with the generic baseline, and acceptance criteria in `docs/logistics-icp-rubric.md`

## 6. Deployment Topology, Dockerization & Verification Strategy

- [ ] 6.1 Create production `Dockerfile` and `docker-compose.yml` defining the standalone Next.js container, PostgreSQL service, and network-linked 9Router gateway
- [ ] 6.2 Configure reverse proxy / timeout settings accommodating the 120-second agent pipeline execution window without premature connection termination
- [ ] 6.3 Document deployment guide and ADR in `docs/adr/ADR-007-deployment-topology-and-domain-strategy.md` addressing GitHub Pages static limits and private 9Router daemon access
- [ ] 6.4 Execute full regression verification: typecheck (`npm run typecheck`), lint (`npm run lint`), vitest suite (`npx vitest run`), and strict OpenSpec validation (`npx openspec validate trukindo-logistik-product-adaptation --strict`)

## Workflow follow-up

- Review the proposed transformation architecture and logistics rubric with business stakeholders.
- Obtain verified company data (founding documentation, operational pool addresses, asset lists) to unlock gated `NEEDS_VERIFICATION` content.
- Finalize production host selection (VPS / containerized PaaS) for the 120s long-pipeline runner and 9Router gateway.
