# ADR-007: Deployment Topology and Domain Strategy for Trukindo Logistics Platform

## Status

Accepted

## Date

2026-10-15

## Context

PT Trukindo Logistik Prima requires a digital platform combining two core operational tiers:
1. **Public Corporate Portal**: Responsive corporate website and inquiry ingestion pipeline (`/api/inquiries`) capturing shipper quotation requests.
2. **Internal Commercial Application**: Sales and prospect intelligence workspace executing multi-step AI research pipelines (scraping, LLM fact extraction, and ICP qualification) that can take up to **120 seconds** per run.

Stakeholders initially proposed deploying the application to `logistikprima.dannyportfolio.github.io`. This ADR evaluates the technical feasibility of this domain, contrasts deployment architectures, and establishes a secure, low-maintenance production topology.

---

## Technical Feasibility Analysis: `logistikprima.dannyportfolio.github.io`

### 1. GitHub Pages DNS Routing Architecture
In GitHub Pages, user accounts receive an apex domain of `<username>.github.io` (e.g. `dannyportfolio.github.io`). Project repositories hosted under that user account are routed under subpaths:
$$\text{https://dannyportfolio.github.io/logistikprima/}$$

Arbitrary third-level subdomains such as `logistikprima.dannyportfolio.github.io` are **not supported by GitHub Pages DNS**, because `github.io` is registered on the Public Suffix List and GitHub's ingress routers do not route dynamic subdomains to project repositories. Achieving that domain would require creating a GitHub organization or user named `logistikprima` (`logistikprima.github.io`) or provisioning a custom apex domain (e.g. `trukindologistik.com`) configured with CNAME DNS records.

### 2. Static Hosting Limitations of GitHub Pages
GitHub Pages serves **strictly static assets** (HTML, CSS, client-side JS, images). It cannot provide:
- Node.js server runtime execution.
- Server-side Next.js route handlers (`POST /api/inquiries`, `POST /api/agent/run`).
- PostgreSQL client connection pooling (`pg`).
- Long-lived HTTP requests accommodating the 120-second AI pipeline window.
- Secure environment secret management (e.g., `DATABASE_URL`, `API_AUTH_TOKEN`).

---

## Architectural Evaluation of Deployment Options

| Evaluation Metric | Option A: Decoupled (GitHub Pages + External API) | Option B: Unified Serverless Next.js (Vercel / Netlify) | Option C: Unified Containerized Node.js (Docker on VPS / PaaS) |
| :--- | :--- | :--- | :--- |
| **Public Portal** | Static export on GitHub Pages | Next.js Server / Static Hybrid | Next.js Server / Static Hybrid |
| **Inquiry Intake** | Cross-Origin (CORS) HTTP fetch to external backend | Same-origin API route (`/api/inquiries`) | Same-origin API route (`/api/inquiries`) |
| **120s Pipeline Deadline** | Feasible if external backend host supports 120s | **Severe Failure Risk**: Standard serverless functions timeout at 10s–60s | **Fully Supported**: No artificial serverless execution ceiling |
| **9Router Connectivity** | Local `http://localhost:20128` unreachable | Local `http://localhost:20128` unreachable | Sibling container on private bridge network (`http://nine-router:20128/v1`) |
| **Database Exposure** | PostgreSQL must be open to public internet with SSL | PostgreSQL must be open to public internet with SSL | PostgreSQL isolated on internal Docker network |
| **Codebase Complexity** | High (two builds, CORS headers, separate secrets) | Moderate | Low (single repo, unified Next.js App Router, shared types) |

---

## Decision

We adopt **Option C (Unified Containerized Full-Stack Deployment via Docker Compose)** as the primary production architecture for Trukindo Logistics Platform.

### Core Architectural Decisions:

1. **Unified Next.js App Router Architecture**:
   - The public corporate portal and internal commercial workspace reside in a single Next.js codebase.
   - Eliminates cross-origin CORS security risks for `/api/inquiries`.
   - Enables shared TypeScript types (`InquirySubmissionInput`, `Lead`), design tokens, and components.

2. **Persistent Container Runtime**:
   - The application is containerized using a multi-stage `Dockerfile` producing a standalone Next.js bundle (`output: "standalone"`).
   - Runs on a persistent container host (VPS or container PaaS such as Railway / Render / DigitalOcean App Platform).
   - Completely resolves the 120-second timeout risk inherent in serverless platforms.

3. **Private Network Isolation**:
   - PostgreSQL 16 and the 9Router LLM gateway run on a private Docker bridge network (`trukindo-network`).
   - PostgreSQL port 5432 is bound strictly to `127.0.0.1` and never exposed to the public internet.
   - 9Router communication occurs over internal network addresses, preventing unauthenticated external LLM invocation.

4. **Domain Strategy**:
   - For temporary testing, a static brochure export can be hosted at `https://dannyportfolio.github.io/logistikprima/`.
   - For the full interactive platform (inquiry submission, database persistence, and commercial review dashboard), configure a production subdomain (e.g. `https://platform.trukindo.co.id` or `https://trukindo.dannyportfolio.com`).

---

## Consequences

- **Positive**: Zero CORS latency; robust support for long-running AI extraction runs; defense-in-depth database network isolation; zero code duplication between public and commercial platform components.
- **Negative**: Requires persistent container hosting infrastructure rather than free static hosting.
- **Mitigation**: Low-cost VPS (e.g., $6–$12/month) or container PaaS provides sufficient CPU/RAM for the Next.js runtime, local PostgreSQL instance, and 9Router gateway.
