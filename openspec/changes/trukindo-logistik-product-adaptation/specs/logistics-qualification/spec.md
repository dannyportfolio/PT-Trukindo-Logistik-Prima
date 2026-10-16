# Spec Delta: Logistics Qualification

## Purpose

Defines a freight-and-logistics-adapted Ideal Customer Profile (ICP) evaluation framework, specifying structured criteria for shipping demand, cargo compatibility, geographical route alignment, and enterprise scale, while preserving decoupled score, confidence, and evidence coverage metrics.

## ADDED Requirements

### Requirement: Logistics ICP Rubric Criteria and Weight Distribution
The qualification framework SHALL specify a logistics-tailored rubric evaluating five core dimensions: Target Industry Sector (25%), Freight & Shipping Demand (25%), Cargo Profile Compatibility (20%), Geographical Route Alignment (15%), and Company Scale & Operating Footprint (15%).

#### Scenario: Evaluating prospect against logistics criteria
- **WHEN** the qualification engine scores a validated prospect profile
- **THEN** it calculates weighted performance across the five logistics dimensions, producing a normalized nominal score between 0 and 100

### Requirement: Decoupled Metric Computation and Neutral Baselines
The qualification framework SHALL compute nominal score, confidence, and evidence coverage as independent metrics. Any unobserved logistics criterion SHALL NOT default to zero, but receive a 50% neutral baseline weight, reduce evidenceCoverage, and constrain maximum confidence.

#### Scenario: Scoring prospect with missing route data
- **WHEN** research extracts verified industry and cargo data but cannot discover route preferences
- **THEN** the engine applies the neutral baseline to route alignment, caps evidenceCoverage at 0.85, bounds confidence to <= 0.85, and lists route alignment in missing information

### Requirement: Empirical Fact Extraction with Domain Evidence Scoping
The research extraction engine SHALL isolate observed corporate logistics facts from scraped web content, validating all supporting evidence URLs against the verified root domain of the prospect.

#### Scenario: Verifying extracted logistics evidence
- **WHEN** the agent extracts evidence for manufacturing facilities or warehouse distribution
- **THEN** each evidence URL is checked against the target prospect domain, discarding any external or unverified links

### Requirement: Categorical Separation of Facts, Inferences, and Recommendations
The qualification dossier SHALL strictly partition output data into four distinct categories: empirically verified facts, probabilistic model inferences, missing evidence warnings, and suggested commercial sales strategies.

#### Scenario: Reviewing qualification dossier breakdown
- **WHEN** a commercial operator inspects the prospect evaluation dossier
- **THEN** the interface clearly distinguishes what was directly cited from company websites, what the model deduced, and what data gaps require direct sales verification

### Requirement: Minimum Evidence Gating for Actionable Tiers
The engine SHALL require minimum evidence coverage (>= 0.70), minimum confidence (>= 0.65), and verified empirical evidence for critical dimensions (Industry Sector and Shipping Demand) before permitting assignment to actionable tiers (`TIER_1` or `TIER_2`).

#### Scenario: Gating unevidenced high-score prospect
- **WHEN** a prospect achieves a calculated nominal score >= 80 but evidence coverage is under 0.70 or critical shipping demand data is unverified
- **THEN** the engine classifies the lead as `INSUFFICIENT_EVIDENCE` and routes it to operator investigation rather than `AWAITING_APPROVAL`
