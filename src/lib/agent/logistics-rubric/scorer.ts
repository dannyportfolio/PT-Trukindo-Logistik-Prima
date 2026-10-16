import { QualificationTier } from "../../../types/qualification";
import { ValidatedLogisticsFacts } from "./extractor";

/**
 * Logistics ICP Rubric Weight Distribution (Total = 100%)
 */
export const LOGISTICS_RUBRIC_WEIGHTS = {
  target_industry_sector: 25,
  shipping_demand: 25,
  cargo_compatibility: 20,
  route_alignment: 15,
  operating_scale: 15,
} as const;

/**
 * 50% Neutral Baseline Points for Unobserved Logistics Criteria
 */
export const LOGISTICS_NEUTRAL_BASELINES = {
  target_industry_sector: 12.5,
  shipping_demand: 12.5,
  cargo_compatibility: 10.0,
  route_alignment: 7.5,
  operating_scale: 7.5,
} as const;

export const LOGISTICS_QUALIFICATION_THRESHOLDS = {
  MIN_ACTIONABLE_EVIDENCE_COVERAGE: 0.7,
  MIN_TIER_1_SCORE: 80,
  MIN_TIER_1_CONFIDENCE: 0.8,
  MIN_TIER_2_SCORE: 60,
  MIN_TIER_2_CONFIDENCE: 0.65,
} as const;

export interface LogisticsCriterionEvaluation {
  score: number;
  maxScore: number;
  evidence: string | null;
  verified: boolean;
  rationale: string;
}

export interface LogisticsDossierLayers {
  foundFacts: string[];
  modelInferences: string[];
  missingEvidence: string[];
  salesRecommendations: string[];
}

export interface LogisticsScoreResult {
  score: number;
  confidence: number;
  evidenceCoverage: number;
  tier: QualificationTier;
  criteriaBreakdown: {
    target_industry_sector: LogisticsCriterionEvaluation;
    shipping_demand: LogisticsCriterionEvaluation;
    cargo_compatibility: LogisticsCriterionEvaluation;
    route_alignment: LogisticsCriterionEvaluation;
    operating_scale: LogisticsCriterionEvaluation;
  };
  missingInfo: string[];
  evidenceUrls: string[];
  rationale: string;
  dossierLayers: LogisticsDossierLayers;
}

export interface ScoreLogisticsInput {
  facts: ValidatedLogisticsFacts;
  modelEvaluations?: {
    target_industry_sector?: { score?: number; rationale?: string };
    shipping_demand?: { score?: number; rationale?: string };
    cargo_compatibility?: { score?: number; rationale?: string };
    route_alignment?: { score?: number; rationale?: string };
    operating_scale?: { score?: number; rationale?: string };
  };
  modelConfidence?: number;
  salesRecommendations?: string[];
}

/**
 * Computes deterministic logistics ICP qualification with decoupled score, confidence, and coverage.
 * Missing critical shipping demand or target industry sector strictly routes to INSUFFICIENT_EVIDENCE.
 */
export function computeDeterministicLogisticsQualification(
  input: ScoreLogisticsInput
): LogisticsScoreResult {
  const missingInfo: string[] = [];
  const foundFacts: string[] = [];
  const modelInferences: string[] = [];
  const salesRecommendations: string[] = input.salesRecommendations || [];

  const hasValidUrls = input.facts.evidence_urls.length > 0;

  // 1. Target Industry Sector (25%, Critical Mandatory)
  const hasIndustry = Boolean(input.facts.industry && input.facts.industry.trim().length > 0);
  let industryEval: LogisticsCriterionEvaluation;

  if (!hasIndustry) {
    industryEval = {
      score: LOGISTICS_NEUTRAL_BASELINES.target_industry_sector,
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.target_industry_sector,
      evidence: null,
      verified: false,
      rationale: "Sektor industri pengirim tidak ditemukan pada profil domain (neutral baseline diterapkan)",
    };
    missingInfo.push("target_industry_sector");
  } else if (!hasValidUrls) {
    industryEval = {
      score: Math.min(
        LOGISTICS_RUBRIC_WEIGHTS.target_industry_sector,
        input.modelEvaluations?.target_industry_sector?.score ??
          LOGISTICS_NEUTRAL_BASELINES.target_industry_sector
      ),
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.target_industry_sector,
      evidence: input.facts.industry,
      verified: false,
      rationale: "Sektor industri teridentifikasi namun kekurangan sitasi URL domain terverifikasi",
    };
    missingInfo.push("industry_evidence_citation");
  } else {
    industryEval = {
      score: Math.min(
        LOGISTICS_RUBRIC_WEIGHTS.target_industry_sector,
        input.modelEvaluations?.target_industry_sector?.score ??
          LOGISTICS_RUBRIC_WEIGHTS.target_industry_sector
      ),
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.target_industry_sector,
      evidence: input.facts.industry,
      verified: true,
      rationale:
        input.modelEvaluations?.target_industry_sector?.rationale ||
        "Sektor industri manufaktur/FMCG/material terverifikasi dari domain perusahaan",
    };
    foundFacts.push(`Sektor Industri: ${input.facts.industry}`);
  }

  // 2. Freight & Shipping Demand (25%, Critical Mandatory)
  const hasDemandSignals = input.facts.logistics_demand_signals.length > 0;
  let demandEval: LogisticsCriterionEvaluation;

  if (!hasDemandSignals) {
    demandEval = {
      score: LOGISTICS_NEUTRAL_BASELINES.shipping_demand,
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.shipping_demand,
      evidence: null,
      verified: false,
      rationale: "Sinyal kebutuhan pengangkutan/linehaul rutin tidak terobservasi (neutral baseline diterapkan)",
    };
    missingInfo.push("shipping_demand");
  } else if (!hasValidUrls) {
    demandEval = {
      score: Math.min(
        LOGISTICS_RUBRIC_WEIGHTS.shipping_demand,
        input.modelEvaluations?.shipping_demand?.score ??
          LOGISTICS_NEUTRAL_BASELINES.shipping_demand
      ),
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.shipping_demand,
      evidence: input.facts.logistics_demand_signals.join(", "),
      verified: false,
      rationale: "Kebutuhan angkutan terdeteksi namun tanpa sitasi URL domain terverifikasi",
    };
    missingInfo.push("shipping_demand_citation");
  } else {
    demandEval = {
      score: Math.min(
        LOGISTICS_RUBRIC_WEIGHTS.shipping_demand,
        input.modelEvaluations?.shipping_demand?.score ??
          LOGISTICS_RUBRIC_WEIGHTS.shipping_demand
      ),
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.shipping_demand,
      evidence: input.facts.logistics_demand_signals.join(", "),
      verified: true,
      rationale:
        input.modelEvaluations?.shipping_demand?.rationale ||
        "Aktivitas pergerakan barang dan distribusi antarkota terkonfirmasi",
    };
    foundFacts.push(`Kebutuhan Pengangkutan: ${input.facts.logistics_demand_signals.join("; ")}`);
  }

  // 3. Cargo Compatibility (20%)
  const hasCargo = input.facts.cargo_types_mentioned.length > 0;
  let cargoEval: LogisticsCriterionEvaluation;

  if (!hasCargo) {
    cargoEval = {
      score: LOGISTICS_NEUTRAL_BASELINES.cargo_compatibility,
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.cargo_compatibility,
      evidence: null,
      verified: false,
      rationale: "Karakteristik jenis kargo belum terobservasi (neutral baseline diterapkan)",
    };
    missingInfo.push("cargo_compatibility");
  } else if (!hasValidUrls) {
    cargoEval = {
      score: Math.min(
        LOGISTICS_RUBRIC_WEIGHTS.cargo_compatibility,
        input.modelEvaluations?.cargo_compatibility?.score ??
          LOGISTICS_NEUTRAL_BASELINES.cargo_compatibility
      ),
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.cargo_compatibility,
      evidence: input.facts.cargo_types_mentioned.join(", "),
      verified: false,
      rationale: "Jenis kargo terdeteksi namun belum terverifikasi dengan URL domain",
    };
    missingInfo.push("cargo_evidence_citation");
  } else {
    cargoEval = {
      score: Math.min(
        LOGISTICS_RUBRIC_WEIGHTS.cargo_compatibility,
        input.modelEvaluations?.cargo_compatibility?.score ??
          LOGISTICS_RUBRIC_WEIGHTS.cargo_compatibility
      ),
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.cargo_compatibility,
      evidence: input.facts.cargo_types_mentioned.join(", "),
      verified: true,
      rationale:
        input.modelEvaluations?.cargo_compatibility?.rationale ||
        "Muatan kargo kompatibel dengan standar armada boks/wingbox/flatbed Trukindo",
    };
    foundFacts.push(`Jenis Kargo: ${input.facts.cargo_types_mentioned.join(", ")}`);
  }

  // 4. Route & Corridor Alignment (15%)
  const hasFacilities = input.facts.facility_locations.length > 0;
  let routeEval: LogisticsCriterionEvaluation;

  if (!hasFacilities) {
    routeEval = {
      score: LOGISTICS_NEUTRAL_BASELINES.route_alignment,
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.route_alignment,
      evidence: null,
      verified: false,
      rationale: "Lokasi fasilitas pabrik/gudang belum terobservasi (neutral baseline diterapkan)",
    };
    missingInfo.push("route_alignment");
  } else if (!hasValidUrls) {
    routeEval = {
      score: Math.min(
        LOGISTICS_RUBRIC_WEIGHTS.route_alignment,
        input.modelEvaluations?.route_alignment?.score ??
          LOGISTICS_NEUTRAL_BASELINES.route_alignment
      ),
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.route_alignment,
      evidence: input.facts.facility_locations.join(", "),
      verified: false,
      rationale: "Titik fasilitas terdeteksi namun tanpa sitasi URL domain",
    };
    missingInfo.push("facility_evidence_citation");
  } else {
    routeEval = {
      score: Math.min(
        LOGISTICS_RUBRIC_WEIGHTS.route_alignment,
        input.modelEvaluations?.route_alignment?.score ??
          LOGISTICS_RUBRIC_WEIGHTS.route_alignment
      ),
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.route_alignment,
      evidence: input.facts.facility_locations.join(", "),
      verified: true,
      rationale:
        input.modelEvaluations?.route_alignment?.rationale ||
        "Fasilitas selaras dengan koridor transportasi Jawa-Sumatra-Bali",
    };
    foundFacts.push(`Lokasi Fasilitas: ${input.facts.facility_locations.join(", ")}`);
  }

  // 5. Operating Scale & Footprint (15%)
  const hasScale = Boolean(input.facts.company_size && input.facts.company_size.trim().length > 0);
  let scaleEval: LogisticsCriterionEvaluation;

  if (!hasScale) {
    scaleEval = {
      score: LOGISTICS_NEUTRAL_BASELINES.operating_scale,
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.operating_scale,
      evidence: null,
      verified: false,
      rationale: "Skala perusahaan dan jejak operasional tidak terobservasi (neutral baseline diterapkan)",
    };
    missingInfo.push("operating_scale");
  } else if (!hasValidUrls) {
    scaleEval = {
      score: Math.min(
        LOGISTICS_RUBRIC_WEIGHTS.operating_scale,
        input.modelEvaluations?.operating_scale?.score ??
          LOGISTICS_NEUTRAL_BASELINES.operating_scale
      ),
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.operating_scale,
      evidence: input.facts.company_size,
      verified: false,
      rationale: "Skala operasional terdeteksi namun tanpa sitasi URL domain",
    };
    missingInfo.push("scale_evidence_citation");
  } else {
    scaleEval = {
      score: Math.min(
        LOGISTICS_RUBRIC_WEIGHTS.operating_scale,
        input.modelEvaluations?.operating_scale?.score ??
          LOGISTICS_RUBRIC_WEIGHTS.operating_scale
      ),
      maxScore: LOGISTICS_RUBRIC_WEIGHTS.operating_scale,
      evidence: input.facts.company_size,
      verified: true,
      rationale:
        input.modelEvaluations?.operating_scale?.rationale ||
        "Skala operasional memenuhi kriteria volume angkutan komersial stabil",
    };
    foundFacts.push(`Skala Usaha: ${input.facts.company_size}`);
  }

  // Calculate Evidence Coverage (0.0 to 1.0)
  let verifiedWeight = 0;
  if (industryEval.verified) verifiedWeight += LOGISTICS_RUBRIC_WEIGHTS.target_industry_sector;
  if (demandEval.verified) verifiedWeight += LOGISTICS_RUBRIC_WEIGHTS.shipping_demand;
  if (cargoEval.verified) verifiedWeight += LOGISTICS_RUBRIC_WEIGHTS.cargo_compatibility;
  if (routeEval.verified) verifiedWeight += LOGISTICS_RUBRIC_WEIGHTS.route_alignment;
  if (scaleEval.verified) verifiedWeight += LOGISTICS_RUBRIC_WEIGHTS.operating_scale;

  const evidenceCoverage = Math.round((verifiedWeight / 100) * 100) / 100;

  // Calculate Nominal Score (0 to 100)
  const totalRaw =
    industryEval.score +
    demandEval.score +
    cargoEval.score +
    routeEval.score +
    scaleEval.score;
  const score = Math.min(100, Math.max(0, Math.round(totalRaw * 10) / 10));

  // Calculate Confidence (strictly bounded by evidenceCoverage)
  const initialConfidence =
    typeof input.modelConfidence === "number" ? input.modelConfidence : evidenceCoverage;
  const boundedConfidence = Math.min(Math.max(0, initialConfidence), evidenceCoverage);
  const confidence = Math.round(boundedConfidence * 100) / 100;

  // Tier Gating Matrix
  const criticalVerified = industryEval.verified && demandEval.verified;
  const meetsCoverage =
    evidenceCoverage >= LOGISTICS_QUALIFICATION_THRESHOLDS.MIN_ACTIONABLE_EVIDENCE_COVERAGE;
  const meetsConfidence =
    confidence >= LOGISTICS_QUALIFICATION_THRESHOLDS.MIN_TIER_2_CONFIDENCE;

  let tier: QualificationTier;

  if (!criticalVerified || !hasValidUrls || !meetsCoverage || !meetsConfidence) {
    tier = "INSUFFICIENT_EVIDENCE";
  } else if (
    score >= LOGISTICS_QUALIFICATION_THRESHOLDS.MIN_TIER_1_SCORE &&
    confidence >= LOGISTICS_QUALIFICATION_THRESHOLDS.MIN_TIER_1_CONFIDENCE
  ) {
    tier = "TIER_1";
  } else if (
    score >= LOGISTICS_QUALIFICATION_THRESHOLDS.MIN_TIER_2_SCORE &&
    confidence >= LOGISTICS_QUALIFICATION_THRESHOLDS.MIN_TIER_2_CONFIDENCE
  ) {
    tier = "TIER_2";
  } else {
    tier = "DISQUALIFIED";
  }

  if (tier === "INSUFFICIENT_EVIDENCE") {
    modelInferences.push(
      "Evaluasi prospek diarahkan ke peninjauan operator karena kekurangan bukti empiris kritis (kebutuhan muatan atau sektor industri)."
    );
  } else {
    modelInferences.push(
      `Prospek terkualifikasi pada ${tier} dengan skor nominal ${score}/100 dan cakupan bukti ${Math.round(
        evidenceCoverage * 100
      )}%.`
    );
  }

  const rationale = `Evaluasi ICP Logistik Trukindo: Skor ${score}/100, Confidence ${confidence}, Coverage ${evidenceCoverage}, Tier ${tier}. ${
    missingInfo.length > 0 ? `Faktor yang perlu verifikasi lanjutan: ${missingInfo.join(", ")}.` : ""
  }`;

  return {
    score,
    confidence,
    evidenceCoverage,
    tier,
    criteriaBreakdown: {
      target_industry_sector: industryEval,
      shipping_demand: demandEval,
      cargo_compatibility: cargoEval,
      route_alignment: routeEval,
      operating_scale: scaleEval,
    },
    missingInfo,
    evidenceUrls: input.facts.evidence_urls,
    rationale,
    dossierLayers: {
      foundFacts,
      modelInferences,
      missingEvidence: missingInfo,
      salesRecommendations,
    },
  };
}
