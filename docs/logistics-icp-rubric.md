# Logistics Ideal Customer Profile (ICP) Rubric Specification

## 1. Executive Summary

This document specifies the freight-and-logistics-adapted Ideal Customer Profile (ICP) qualification framework designed for **PT Trukindo Logistik Prima**.

In compliance with our production baseline preservation policy, this rubric is **staged** in `src/lib/agent/logistics-rubric/` rather than replacing the active generic Milestone 2 baseline in `src/lib/agent/tools/scorer.ts`. This ensures existing test suites and lead evaluations remain 100% stable while providing a fully verified qualification engine for trucking prospect intelligence.

---

## 2. Comparison: Baseline Generic ICP vs. Logistics-Adapted ICP

| Dimension | Active Milestone 2 Baseline (`scorer.ts`) | Staged Logistics Rubric (`logistics-rubric/scorer.ts`) |
| :--- | :--- | :--- |
| **Primary Domain Focus** | Generic B2B / SaaS / Enterprise Technology | B2B Commercial Freight, Trucking & Contract Logistics |
| **Criterion 1 (Weight)** | Target Industry Relevance (**30%**) | Target Industry Sector (**25%**) |
| **Criterion 2 (Weight)** | Company Size / Maturity (**25%**) | Freight & Shipping Demand (**25%**) |
| **Criterion 3 (Weight)** | Core Offerings Alignment (**25%**) | Cargo Profile Compatibility (**20%**) |
| **Criterion 4 (Weight)** | Tech Stack Modernity (**20%**) | Route Corridor Alignment (**15%**) |
| **Criterion 5 (Weight)** | N/A | Operating Scale & Footprint (**15%**) |
| **Critical Gating Criteria** | Industry + Offerings verified | Target Industry + Shipping Demand verified |
| **Unobserved Fallback** | 50% neutral baseline per criterion | 50% neutral baseline per criterion |
| **Confidence Cap** | Bounded strictly by `evidenceCoverage` | Bounded strictly by `evidenceCoverage` |

---

## 3. Rubric Breakdown & Evaluation Objectives

### 1. Target Industry Sector (25% — Mandatory Critical)
- **Objective**: Evaluates whether the prospect operates in a sector with structural, continuous demand for heavy road freight.
- **High-Fit Indicators**: FMCG, food & beverage manufacturing, automotive assembly, industrial raw materials, building materials, consumer electronics.
- **Low-Fit Indicators**: Pure digital software, financial consulting, consumer legal services.
- **Gating**: If unobserved or lacking verified domain evidence URLs, the lead is immediately routed to `INSUFFICIENT_EVIDENCE`.

### 2. Freight & Shipping Demand (25% — Mandatory Critical)
- **Objective**: Evaluates empirical evidence of regular intercity distribution, factory-to-warehouse transport, or multi-branch supply chains.
- **High-Fit Indicators**: Multi-plant distribution mentions, nationwide retail reach, regular delivery schedules, warehouse network.
- **Neutral Baseline**: 12.5 points if unobserved.
- **Gating**: Mandatory critical requirement. Lack of empirical evidence routes evaluation to `INSUFFICIENT_EVIDENCE`.

### 3. Cargo Profile Compatibility (20%)
- **Objective**: Evaluates compatibility with Trukindo's fleet standards (CDE, CDD, Fuso, Tronton Wingbox/Flatbed, Trailer).
- **High-Fit Indicators**: Dry packaged goods, palletized cartons, non-hazardous raw materials, machinery, bulk retail cartons.
- **Incompatible Indicators**: Hazmat (B3 chemicals), live animals, oversized infrastructure components exceeding standard road permits.
- **Neutral Baseline**: 10.0 points if unobserved.

### 4. Route & Corridor Alignment (15%)
- **Objective**: Assesses geographic synergy with Trukindo's primary operating corridors (Trans-Jawa, Jabodetabek industrial zones, Central Java, East Java, Bali, Sumatra).
- **High-Fit Indicators**: Manufacturing facilities in Cikarang, Karawang, Cilegon, Gresik, Surabaya, Semarang, Medan.
- **Neutral Baseline**: 7.5 points if unobserved.

### 5. Operating Scale & Footprint (15%)
- **Objective**: Evaluates commercial stability, volume consistency, and operational maturity.
- **High-Fit Indicators**: Mid-to-large enterprise scale (100+ employees, multiple distribution centers).
- **Neutral Baseline**: 7.5 points if unobserved.

---

## 4. Decoupled Metric Calculations

The engine calculates three decoupled metrics independently:
1. **Nominal Score ($0 \le S \le 100$)**:
   $$\text{Score} = \sum_{i=1}^{5} \text{CriterionScore}_i$$
2. **Quantitative Evidence Coverage ($0.0 \le \text{Coverage} \le 1.0$)**:
   $$\text{Coverage} = \frac{\sum_{\text{verified}} \text{Weight}_i}{100}$$
3. **Epistemic Confidence ($0.0 \le C \le 1.0$)**:
   $$C = \min(\text{ModelConfidence}, \text{Coverage})$$
   *Rule*: Confidence is strictly constrained by empirical coverage. The model cannot claim high certainty on speculative deductions.

---

## 5. Separation of Ontological Layers

To uphold data integrity and auditability, evaluation dossiers partition findings into four strict categories:
1. **Found Facts**: Verifiable empirical statements directly extracted from the prospect's verified website (e.g., "Pabrik di Kawasan Industri GIIC Cikarang").
2. **Model Inferences**: Deductions made by the model (e.g., "High probability of regular FTL linehaul between Cikarang and Surabaya DC").
3. **Missing Evidence**: Explicitly flagged data gaps requiring sales rep investigation (e.g., "Weekly dispatch tonnage not publicly disclosed").
4. **Sales Recommendations**: Actionable commercial outreach strategies for human sales representatives.

---

## 6. Migration and Cutover Path

1. **Phase 1 (Current)**: Staged side-by-side in `src/lib/agent/logistics-rubric/`. Unit tested with zero interference on existing tests.
2. **Phase 2 (Shadow Evaluation)**: Benchmark live prospect scrapes across both generic and logistics rubrics.
3. **Phase 3 (Production Cutover)**: Upon commercial management sign-off, configure the agent orchestrator to use the logistics rubric for B2B transportation leads.
