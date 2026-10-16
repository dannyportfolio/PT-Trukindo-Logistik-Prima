# Technical Design: Trukindo Logistics Platform Transformation

## Context

AstraOps Milestone 2 established a hardened, enterprise-grade AI prospect research and qualification platform. Its verified technical baseline includes:
- Next.js 15 (App Router), TypeScript, PostgreSQL, and migration management (`migrator.ts`).
- Dual-role and token-based authentication (`auth.ts`), session management, and CSRF protection (`csrf.ts`).
- Agent state machine (`state-machine.ts`), atomic database concurrency guards, idempotent runs (`idempotency.ts`), and immutable audit logging.
- SSRF-hardened web scraper (`scraper.ts`, `ssrf-guard.ts`) with IPv4/IPv6 private IP filtering, DNS rebinding mitigation via socket pinning, streaming payload caps (2MB), and 10s timeouts.
- 9Router LLM gateway integration (`gateway/client.ts`), model allowlists, strict pricing catalog (`pricing-catalog.ts`), fail-closed cost gating, and budget limits ($0.50/run).
- Two-stage pipeline: Stage 1 quarantined fact extraction (`extractor.ts`) and Stage 2 static ICP qualification scoring (`scorer.ts`) with metric decoupling (`score`, `confidence`, `evidenceCoverage`).
- Human-in-the-loop review gate, prospect dossier UI (`/leads/[id]`), and a test suite with 519 passing unit/integration tests and browser E2E specs.

This design specifies how to transform AstraOps into the **Trukindo Logistics Platform** for **PT Trukindo Logistik Prima** without destroying or rebuilding this production baseline.

---

## Goals / Non-Goals

**Goals:**
1. **Public Corporate Website**: Architect a professional B2B corporate web presence reflecting Trukindo's brand identity, confirmed services, standard vehicle/cargo specifications, and quotation request pathways.
2. **Content Integrity Enforcement**: Guarantee zero fabricated corporate claims (fleet counts, owned facilities, founding years, client logos, or unverified certs) by isolating all content in structured configuration with `NEEDS_VERIFICATION` gating.
3. **Inbound Inquiry Ingestion**: Implement an anti-spam, rate-limited, Zod-validated ingestion pipeline (`/api/inquiries`) funneling public quotation requests into the internal sales queue.
4. **Logistics ICP Rubric Specification**: Propose a freight-tailored ICP scoring model reflecting B2B shipping needs, cargo compatibility, and route alignment while keeping the existing production rubric untouched until formal approval.
5. **Commercial Application Rebranding**: Realign internal AstraOps workspaces for Trukindo sales and business development operations.
6. **Deployment & Domain Strategy**: Provide a realistic, grounded deployment recommendation addressing GitHub Pages constraints, 9Router network topology, and 120s pipeline execution windows.

**Non-Goals:**
1. **Transport Management System (TMS) Execution**: Dispatching vehicles, assigning drivers, GPS fleet telematics, dynamic freight billing, and electronic Proof of Delivery (e-POD) are explicitly out of scope.
2. **Immediate Baseline Breaking Changes**: Modifying existing database constraints, altering existing LeadStatus enums, or rewriting Milestone 2 test suites during planning.
3. **Automated Customer Outreach**: No automatic emailing, quote issuance, or external webhook calls without human operator sign-off.

---

## Architectural Overview & Conceptual Separation

The platform is structured into two conceptually integrated yet functionally distinct tiers:

```
+-----------------------------------------------------------------------------------+
|                           TRUKINDO LOGISTICS PLATFORM                             |
+-----------------------------------------------------------------------------------+
|  A. PUBLIC CORPORATE PORTAL                      B. INTERNAL COMMERCIAL APP       |
|  (Prospective Shippers & Public)                 (Sales & Business Development)   |
|                                                                                   |
|  - Hero & Value Proposition                      - Commercial Pipeline Dashboard  |
|  - Verified Logistics Services                   - Leads & Inquiries Queue        |
|  - Fleet & Cargo Specifications                  - Agentic Prospect Research      |
|  - Industries Served                             - Prospect Intelligence Dossier  |
|  - Operations & Safety Standards                 - Qualification Review Gate      |
|  - Request a Quote / Contact Forms               - Customer & Contract Directory  |
+----------------------------------------+------------------------------------------+
                                         | Inbound Ingestion API
                                         | (/api/inquiries)
                                         v
+-----------------------------------------------------------------------------------+
|                            SHARED CORE & PERSISTENCE                              |
|  - PostgreSQL Database (Leads, Inquiries, Agent Runs, Audit Logs)                 |
|  - Zod Validation, Rate Limiting, Honeypot Anti-Spam                              |
|  - Hardened Agent Runtime & Scraper (SSRF, Socket Pinning, Cheerio Quarantine)   |
|  - 9Router Gateway (Model Allowlist, Budget Guardrails, Fail-Closed Gating)       |
+-----------------------------------------------------------------------------------+
```

---

## Detailed System Design

### 1. Brand Strategy and Content Integrity

#### A. Visual Identity System
- **Corporate Blue / Deep Navy**: Primary brand color representing reliability, maritime/industrial strength, and corporate trust (`#0a2540`, `#0f3b68`, `#1e40af`).
- **Neutral White & Slate**: Clean, high-legibility backgrounds and cards (`#f8fafc`, `#f1f5f9`, `#ffffff`, text `#0f172a`, `#334155`).
- **Safety Amber / Industrial Orange**: Accent color reserved for critical calls-to-action ("Minta Penawaran"), status badges, and attention points (`#d97706`, `#f59e0b`).
- **Typography**: Clean, geometric sans-serif (Inter / System UI) optimized for enterprise readability.
- **Imagery**: Authentic industrial logistics photography (cargo loading, highway transit, container terminals, warehouse staging). Stock photos must represent standard industry operations; no vehicles may be labeled as "Milik Trukindo" unless confirmed.

#### B. Content Integrity Guardrails & `NEEDS_VERIFICATION` Mechanism
To prevent misleading the public or inventing corporate history, all company-specific claims are managed in a typed configuration file (`src/lib/content/trukindo-config.ts`).

```typescript
export interface CompanyFact<T> {
  value: T;
  status: "VERIFIED" | "NEEDS_VERIFICATION";
  notes?: string;
}

export const TRUKINDO_PROFILE = {
  legalName: "PT Trukindo Logistik Prima",
  brandName: "Trukindo Logistics Platform",
  tagline: "Menghubungkan Bisnis, Menggerakkan Logistik.",
  // Gated facts:
  foundingYear: { value: null, status: "NEEDS_VERIFICATION" },
  fleetSizeCount: { value: null, status: "NEEDS_VERIFICATION" },
  ownedWarehousesCount: { value: null, status: "NEEDS_VERIFICATION" },
  officeLocations: {
    value: ["DKI Jakarta (Kantor Operasional)"],
    status: "NEEDS_VERIFICATION",
    notes: "Requires physical address verification from management"
  },
  confirmedServices: [
    {
      id: "ftl-trucking",
      title: "Full Truck Load (FTL)",
      description: "Layanan pengangkutan darat carter penuh untuk pengiriman point-to-point antarkota dan antarpulau.",
      status: "VERIFIED"
    },
    {
      id: "scheduled-linehaul",
      title: "Scheduled Linehaul",
      description: "Jadwal rute logistik reguler menghubungkan hub industri utama di koridor Jawa-Sumatra-Bali.",
      status: "VERIFIED"
    },
    {
      id: "contract-logistics",
      title: "Dedicated Contract Logistics",
      description: "Manajemen armada dan rute terdedikasi untuk kebutuhan manufaktur, FMCG, dan distribusi komersial.",
      status: "VERIFIED"
    }
  ],
  unconfirmedServices: [
    { id: "cold-chain", title: "Cold Chain Transport", status: "NEEDS_VERIFICATION" },
    { id: "customs-clearance", title: "Customs Clearance & Kepabeanan", status: "NEEDS_VERIFICATION" },
    { id: "cross-docking", title: "Pergudangan & Cross-Docking", status: "NEEDS_VERIFICATION" }
  ]
};
```
*Rule*: The public site only renders services and facts where `status === "VERIFIED"`. Any unverified metrics are omitted or rendered as qualitative capability statements.

---

### 2. Public Corporate Website Architecture

#### Navigation & Route Structure
1. `/` (**Home**):
   - Hero banner with headline, corporate tagline, and dual CTA ("Minta Penawaran" / "Pelajari Layanan").
   - Value propositions (Ketepatan Waktu, Keandalan Rute, Standard Keselamatan).
   - Core services summary cards.
   - Fleet and standard cargo category preview.
   - Shipper inquiry CTA banner.
2. `/about` (**Tentang Kami**):
   - Corporate identity, mission, and operational focus.
   - Professional operational commitments without fabricated historical lore.
3. `/services` (**Layanan Logistik**):
   - In-depth breakdown of FTL, Scheduled Linehaul, and Dedicated Distribution.
   - Workflow of logistics partnership: Konsultasi Kebutuhan -> Perencanaan Rute -> Pengiriman -> Laporan.
4. `/fleet-cargo` (**Armada & Muatan**):
   - Industry-standard truck classes: CDE (Colt Diesel Engkel), CDD (Colt Diesel Double), Fuso Berat, Tronton Wingbox/Flatbed, Trailer Container (20ft/40ft).
   - Accepted cargo classifications: FMCG & Consumer Products, Bahan Baku Industri, Barang Konsumsi Kering, Elektronik & Komponen.
   - Cargo safety guidelines and dimension charts.
5. `/industries` (**Sektor Industri**):
   - Focus sectors: FMCG & Ritel, Manufaktur & Industri Ringan, Material & Bahan Bangunan, E-Commerce & Distribusi Grosir.
6. `/operations-safety` (**Operasional & Keselamatan**):
   - Preventive maintenance protocols, driver health & road safety guidelines, loading/lashing standards.
7. `/quote` (**Minta Penawaran / Request a Quote**):
   - Interactive quotation inquiry form capturing shipper origin, destination, cargo class, and estimated volume.
8. `/contact` (**Kontak Perusahaan**):
   - Direct business inquiry form, operational communication channels, working hours.

---

### 3. Industry Benchmark Synthesis

From our live investigation of three major Indonesian logistics leaders:
1. **Fastana Logistik Indonesia (`fli.co.id`)**:
   - *Key takeaway*: Clean, focused layout highlighting warehousing and trucking with clear, quantitative capacity indicators where available, paired with straightforward modal inquiry forms.
   - *Trukindo adaptation*: Adopt clear, single-purpose section blocks with intuitive visual cards; omit unconfirmed quantitative metrics.
2. **Puninar Logistics (`puninar.com`)**:
   - *Key takeaway*: Exemplary B2B industry solutions architecture (categorizing solutions by customer industry: Automotive, FMCG, Industrial, Tech). Strong corporate trust building through values and certified operational scopes.
   - *Trukindo adaptation*: Structure the "Industries Served" page around sector-specific supply chain pain points (e.g. FMCG turnaround time vs manufacturing raw material delivery schedules).
3. **Siba Surya (`sibasurya.com`)**:
   - *Key takeaway*: Deep trucking authority. Comprehensive presentation of heavy tractor heads, trailer configurations, flatbeds, nationwide corridor coverage (Jawa-Bali-Sumatra), and safety culture.
   - *Trukindo adaptation*: Present fleet capabilities with standard vehicle technical specifications (gross weight, dimensions, payload) while ensuring no false ownership claims are made.

---

### 4. Inbound Inquiry Data Architecture & Anti-Spam Pipeline

#### A. Ingestion Endpoint: `POST /api/inquiries`
Public visitors submit quotes and contact inquiries to a dedicated endpoint with strict server-side safeguards.

#### B. Validation Schema (`src/types/inquiry.ts`)
```typescript
import { z } from "zod";

export const CargoClassificationSchema = z.enum([
  "FMCG_CONSUMER_GOODS",
  "INDUSTRIAL_RAW_MATERIALS",
  "FINISHED_GOODS",
  "BUILDING_MATERIALS",
  "ELECTRONICS",
  "OTHER_GENERAL_CARGO"
]);

export const TruckTypePreferenceSchema = z.enum([
  "CDE_ENGKEL",
  "CDD_DOUBLE",
  "FUSO",
  "TRONTON_BOX",
  "TRONTON_WINGBOX",
  "TRAILER_20FT",
  "TRAILER_40FT",
  "ANY_APPROPRIATE"
]);

export const InquirySubmissionSchema = z.object({
  companyName: z.string().trim().min(2).max(255),
  contactName: z.string().trim().min(2).max(255),
  contactEmail: z.string().trim().email().toLowerCase().max(255),
  contactPhone: z.string().trim().min(8).max(30).regex(/^[0-9+\-\s()]+$/, "Invalid phone format"),
  originCity: z.string().trim().min(2).max(100),
  destinationCity: z.string().trim().min(2).max(100),
  cargoType: CargoClassificationSchema,
  truckType: TruckTypePreferenceSchema.default("ANY_APPROPRIATE"),
  estimatedVolumeWeight: z.string().trim().max(100).optional(),
  estimatedShippingFrequency: z.enum(["ONE_TIME", "WEEKLY", "MONTHLY", "CONTRACT_REGULAR"]).default("ONE_TIME"),
  additionalNotes: z.string().trim().max(2000).optional(),
  // Anti-Spam Safeguards:
  honeypot: z.string().max(0, "Bot detected"), // Must be empty
  formRenderTimestamp: z.number().int().positive() // Must be at least 3 seconds prior to submission
});
```

#### C. Processing & Storage
1. **Rate Limiting**: Bounded to 5 requests per rolling hour per IP via client IP hashing.
2. **Bot Gating**: Rejection if `honeypot !== ""` or if `Date.now() - formRenderTimestamp < 3000ms`.
3. **Persistence**:
   - Insert into `leads` table with:
     - `company_name`: `companyName`
     - `contact_name`: `contactName`
     - `contact_email`: `contactEmail`
     - `website_url`: `https://placeholder-inbound.internal` (or company domain if provided)
     - `status`: `"INGESTED"`
     - `source`: `"INBOUND_INQUIRY"`
   - Record inquiry payload in dedicated `inquiry_details` table or structured metadata column.
   - Write immutable audit entry in `audit_logs` (`actor: "public_inquiry"`, `action: "INQUIRY_RECEIVED"`).
4. **Decoupled Execution**: No automatic scraping or 9Router LLM extraction is run synchronously. The lead is placed into the sales queue for operator evaluation.

---

### 5. Freight & Logistics ICP Qualification Rubric Proposal

The existing Milestone 2 rubric in `scorer.ts` evaluates generic SaaS/tech criteria:
- Industry (30%), Company Size (25%), Offerings (25%), Tech Stack (20%).

#### A. Proposed Logistics-Adapted Rubric
| Criterion | Weight | Logistics Assessment Objective | Positive Evidence Indicators |
| :--- | :--- | :--- | :--- |
| **1. Target Industry Sector** | **25%** | Evaluates if the prospect operates in a freight-heavy industry | Manufacturing, FMCG, retail distribution, building materials, consumer electronics |
| **2. Freight & Shipping Demand** | **25%** | Evaluates volume, regular linehaul need, and intercity movement | Multi-branch distribution, factory-to-warehouse flows, B2B wholesale shipments |
| **3. Cargo Compatibility** | **20%** | Evaluates whether goods align with dry freight, box, or flatbed trucking | Palletized cartons, dry packaged goods, machinery, raw material drums (No hazmat/hazardous chemical bulk) |
| **4. Route & Corridor Alignment** | **15%** | Evaluates geographic alignment with key industrial transit corridors | Facilities in Jabodetabek, West Java, Central Java, East Java, Sumatra, Bali |
| **5. Operating Scale & Footprint** | **15%** | Evaluates stability, creditworthiness, and volume scale | Mid-to-large enterprise, multiple plant locations, established logistics personnel |

#### B. Fact Extraction Schema Adjustments (Stage 1 Extractor)
Proposed expansion to `ExtractedFactsRawSchema` for logistics:
```typescript
export const LogisticsExtractedFactsSchema = z.object({
  industry: z.string().nullable(),
  company_size: z.string().nullable(),
  logistics_demand_signals: z.array(z.string().max(255)).max(15).default([]),
  cargo_types_mentioned: z.array(z.string().max(255)).max(15).default([]),
  facility_locations: z.array(z.string().max(255)).max(15).default([]),
  summary: z.string().max(1000).nullable(),
  evidence_urls: z.array(z.string().url()).max(20).default([])
});
```

#### C. Separation of Ontological Layers
In compliance with Section 6, the evaluation dossier strictly partitions:
1. **Found Facts**: Empirical statements directly extracted from the prospect's public website (e.g. "Pabrik di Cikarang seluas 5.000 m2").
2. **Model Inferences**: Probabilistic deductions made by the LLM (e.g. "Operates regular FTL distribution between West Java plant and East Java distribution center").
3. **Missing Evidence**: Explicitly flagged data gaps (e.g. "Shipping frequency and third-party transport reliance not stated").
4. **Sales Recommendations**: Suggested commercial outreach angles for human reps (e.g. "Inquire regarding seasonal FMCG surge demand in Q4").

#### D. Production Baseline Preservation Policy
*Critical Architecture Rule*: The proposed logistics rubric and extractor modifications will NOT overwrite the existing active `scorer.ts` or `extractor.ts` in this planning change. They will be staged in an isolated qualification module (`src/lib/agent/logistics-rubric/`) and tested in parallel before any production cutover.

---

### 6. Deployment, Hosting, and Domain Strategy (ADR)

#### A. Analysis of Target Temporary Domain: `logistikprima.dannyportfolio.github.io`
- **DNS / GitHub Pages Mechanism**:
  In GitHub Pages architecture, a user account named `dannyportfolio` receives an apex domain of `dannyportfolio.github.io`. Any repository created under that account (e.g., `logistikprima`) is hosted at:
  $$\text{https://dannyportfolio.github.io/logistikprima/}$$
  A third-level domain like `logistikprima.dannyportfolio.github.io` is **not natively supported** by GitHub Pages DNS because `github.io` is a public suffix and GitHub's routing infrastructure does not route arbitrary subdomains of `<username>.github.io` to project repositories.
  To achieve `logistikprima.dannyportfolio.github.io`, one would need an actual GitHub user/organization named `logistikprima` (`logistikprima.github.io`) or a custom apex domain (e.g. `trukindologistik.com`) with CNAME DNS records.
- **Static Hosting vs. Dynamic Server Requirements**:
  GitHub Pages serves **strictly static assets (HTML/CSS/JS)**. It cannot run:
  - Node.js server runtimes.
  - Next.js server actions or dynamic API route handlers (`/api/agent/run`, `/api/inquiries`).
  - PostgreSQL database pool connections (`pg`).
  - Long-lived HTTP connections for the 120-second agent pipeline.
  - Secret environment variables (`API_AUTH_TOKEN`, `DATABASE_URL`).

#### B. Evaluation of Deployment Options

| Criteria | Option A: Static Website (GitHub Pages) + Decoupled Full-Stack Backend | Option B: Unified Next.js Full-Stack App (Vercel / PaaS) | Option C: Containerized Full-Stack (Docker on VPS / VM) |
| :--- | :--- | :--- | :--- |
| **Public Site** | Static export on GitHub Pages (`dannyportfolio.github.io/logistikprima`) | Next.js Server / Static Hybrid | Next.js Server / Static Hybrid |
| **Internal App & API** | Node.js host (Render / Railway / VPS) | Hosted on PaaS | Unified Docker container |
| **Inquiry Ingestion** | Cross-Origin (CORS) fetch to external backend | Same-origin API route (`/api/inquiries`) | Same-origin API route (`/api/inquiries`) |
| **Long Pipeline Execution (120s)** | Supported if backend host allows long timeout | **Severe Risk**: Serverless functions timeout (10s–60s limit on standard tiers) | **Fully Supported**: No artificial serverless timeout limits |
| **9Router Connectivity** | Backend must connect to network-reachable 9Router | Backend cannot reach local `http://localhost:20128` | Docker network connects directly to 9Router daemon |
| **Database Security** | PostgreSQL exposed over public internet (SSL required) | PostgreSQL exposed over public internet (SSL required) | PostgreSQL can be on internal Docker bridge network |
| **Operational Overhead** | High (Two codebases/builds, CORS, DNS management) | Moderate | Low-to-Moderate (Single Docker Compose stack) |

#### C. Realistic MVP Deployment Recommendation
**Recommended Architecture: Option C (or Option B on a persistent Node.js host)**

1. **Public Website + Commercial Platform in a Single Unified Next.js Deployment**:
   - Eliminates CORS security issues for the inquiry ingestion endpoint.
   - Allows shared design tokens, TypeScript types (`InquiryPayload`, `Lead`), and layout components.
   - Uses Next.js App Router route groups: `(public)` for corporate website and `(admin)` for authenticated sales workspace.
2. **Hosting Runtime Environment**:
   - Deploy as a **Docker container** on a VPS (e.g., DigitalOcean, Hetzner, AWS EC2, or Railway with persistent container runtime).
   - *Why*: The AstraOps agent pipeline runs synchronous scraping + LLM extraction + scoring that can take **up to 120 seconds**. Standard serverless environments (e.g. Vercel Hobby with 10s-15s timeouts) will abruptly terminate in-flight runs!
   - *9Router Gateway Handling*: If 9Router runs locally on Danny's development machine (`http://localhost:20128/v1`), in production it must either:
     - Run as a sibling container within the Docker Compose network (`http://nine-router:20128/v1`), OR
     - Be exposed securely over an internal VPN / WireGuard / Cloudflare Tunnel with authorization tokens.
     *Under no circumstances should 9Router or PostgreSQL be exposed unauthenticated to the public internet.*
3. **Domain Recommendation**:
   - For temporary testing on GitHub Pages, publish only a static export of the corporate brochure to `https://dannyportfolio.github.io/logistikprima/`.
   - For the full interactive platform (including inquiry submission and sales dashboard), deploy the unified container to a dedicated host using a standard subdomain or custom domain (e.g., `https://trukindo.dannyportfolio.com` or custom domain `https://logistikprima.com`).

---

### 7. Reusable vs Changed Components Mapping

| Component / File | Current AstraOps Role | Trukindo Adaptation Strategy | Status |
| :--- | :--- | :--- | :--- |
| `src/lib/agent/tools/scraper.ts` | SSRF-hardened web scraper | Reused 100% without modification | **PRESERVED** |
| `src/lib/agent/tools/ssrf-guard.ts` | Socket IP pinning & DNS rebinding guard | Reused 100% without modification | **PRESERVED** |
| `src/lib/gateway/client.ts` | 9Router gateway client | Reused 100% without modification | **PRESERVED** |
| `src/lib/gateway/pricing-catalog.ts`| LLM pricing & cost estimation catalog | Reused 100% without modification | **PRESERVED** |
| `src/lib/agent/runner.ts` | Agent state machine pipeline runner | Reused 100% (maintains run lifecycle) | **PRESERVED** |
| `src/lib/agent/repository.ts` | PostgreSQL persistence for agent runs | Reused 100% (audit logs, runs, steps) | **PRESERVED** |
| `src/lib/auth.ts` & `src/lib/csrf.ts`| Session auth, token validation, CSRF | Reused 100% for commercial workspace | **PRESERVED** |
| `src/lib/lead-repository.ts` | Lead management repository | Reused; extended for inquiry source attribution | **EXTENDED** |
| `src/types/lead.ts` | Lead entity & Zod schemas | Extended with `source: INBOUND_INQUIRY` | **EXTENDED** |
| `src/lib/agent/tools/scorer.ts` | Static ICP qualification scorer | Preserved as baseline; logistics rubric staged | **PRESERVED / STAGED** |
| `src/lib/agent/tools/extractor.ts` | Quarantined fact extractor | Preserved as baseline; logistics schema staged | **PRESERVED / STAGED** |
| `src/app/page.tsx` | AstraOps technical landing page | Replaced with Trukindo Corporate Homepage | **TRANSFORMED** |
| `src/components/Navbar.tsx` | AstraOps internal top navigation | Adapted into dual-mode (Public vs Commercial) | **ADAPTED** |
| Public Pages (`/about`, `/services`, etc.) | None (New capability) | Newly implemented under public route tree | **NEW** |
| `src/app/api/inquiries/route.ts` | None (New capability) | Inbound inquiry ingestion endpoint | **NEW** |
| `src/lib/content/trukindo-config.ts` | None (New capability) | Content integrity & `NEEDS_VERIFICATION` store | **NEW** |

---

### 8. Company Data Requirements & `NEEDS_VERIFICATION` Checklist

| Data Field | Current Status | Safe Public Copy While Unverified | Verification Requirement |
| :--- | :--- | :--- | :--- |
| **Tahun Berdiri (Founding Year)** | `NEEDS_VERIFICATION` | "Didukung tim berpengalaman di industri transportasi logistik nasional." | Akta pendirian perusahaan / NIB |
| **Jumlah Unit Armada (Fleet Count)** | `NEEDS_VERIFICATION` | "Armada beragam dari truk ringan hingga berat siap melayani berbagai kebutuhan muatan." | Data inventaris aset operasional |
| **Kepemilikan Gudang (Warehouses)** | `NEEDS_VERIFICATION` | "Layanan pengangkutan point-to-point langsung dari fasilitas pengirim ke penerima." | Sertifikat hak milik / perjanjian sewa gudang |
| **Lokasi Kantor Cabang / Pool** | `NEEDS_VERIFICATION` | "Kantor Operasional: DKI Jakarta (Wilayah layanan mencakup koridor utama Jawa-Sumatra-Bali)." | Alamat fisik pool & kantor cabang resmi |
| **Daftar Klien Komersial** | `NEEDS_VERIFICATION` | Omit client logos entirely. Present industry sectors served instead. | Izin tertulis / NDA persetujuan penggunaan logo |
| **Sertifikasi Keselamatan (ISO/SMK)** | `NEEDS_VERIFICATION` | "Menerapkan standar ketat inspeksi kendaraan pra-perjalanan dan pembinaan pengemudi." | Sertifikat resmi Kemenhub / ISO terverifikasi |
| **Layanan Cold Chain & Bea Cukai** | `NEEDS_VERIFICATION` | Excluded from active service list. Listed as "Dalam Pengembangan". | Lisensi PPJK / ketersediaan armada reefer aktif |

---

## Security & Deployment Guardrails

1. **No Direct-Provider Bypass**: All LLM inference calls must route through the configured 9Router gateway client. Direct provider fallback remains strictly configurable and disabled by default.
2. **Model Allowlist Enforcement**: Only allowed models (`openai/gpt-4o-mini`, `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`) can be invoked.
3. **Zero Automated Outreach**: The platform will never send emails, dispatch quotations, or trigger webhooks automatically upon lead qualification. Human operator review is mandatory.
4. **SSRF Multi-Stack Protection**: The web scraper will continue to reject all private IP ranges (IPv4, IPv6, mapped IPv6) and pin safe resolved IPs to sockets.
5. **No Secret Leakage**: No database connection strings, auth tokens, or gateway keys will be exposed to public client components or client-side JavaScript.
6. **Raw HTML Quarantine**: Scraped website content is quarantined in XML envelopes and stripped of all executable and hidden tags. Raw HTML is never rendered in the UI.
7. **Per-Run Budget Limit ($0.50)**: Pre-request budget estimation continues to guard against runaway inference costs.

---

## Risks and Mitigations

- **[Risk 1: 9Router Network Inaccessibility in Production]**
  *Mitigation*: When deploying the application outside Danny's local workstation, 9Router must be deployed alongside the container stack or accessed via a secure tunnel with mutual authentication.
- **[Risk 2: Serverless Function Timeout During 120s Pipeline]**
  *Mitigation*: Avoid hosting the agent runner on serverless providers with short execution deadlines. Use a persistent Node.js container runtime or background worker queue.
- **[Risk 3: Public Website Ingestion Spam Flood]**
  *Mitigation*: Combine honeypot traps, client submission timing bounds (>= 3s), IP rate limiting (5 req/hr), and strict Zod payload parsing.
- **[Risk 4: Accidental Baseline Regression of Milestone 2 Tests]**
  *Mitigation*: Keep public routes and inquiry routes decoupled from the existing agent runner and lead repository test suites. Run full `vitest` suite after every change.
- **[Risk 5: Legal Exposure from Unconfirmed Corporate Claims]**
  *Mitigation*: Enforce `NEEDS_VERIFICATION` gating in code. Suppress any metric without documented management sign-off.
