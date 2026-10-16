import { describe, it, expect } from "vitest";
import {
  computeDeterministicLogisticsQualification,
  LOGISTICS_RUBRIC_WEIGHTS,
  LOGISTICS_NEUTRAL_BASELINES,
} from "@/lib/agent/logistics-rubric/scorer";
import { ValidatedLogisticsFacts } from "@/lib/agent/logistics-rubric/extractor";

describe("Logistics ICP Scorer Unit Suite: PT Trukindo Logistik Prima", () => {
  const baseFacts: ValidatedLogisticsFacts = {
    leadWebsiteUrl: "https://pabrik-fmcg-nusantara.co.id",
    leadDomain: "pabrik-fmcg-nusantara.co.id",
    industry: "FMCG / Fast Moving Consumer Goods",
    company_size: "500-1000 Karyawan",
    logistics_demand_signals: [
      "Distribusi harian antarpabrik ke DC Jabodetabek dan Jawa Timur",
      "Kebutuhan FTL rutin 5 armada per minggu",
    ],
    cargo_types_mentioned: ["Makanan kemasan dalam karton dan palet"],
    facility_locations: ["Pabrik Cikarang", "DC Surabaya", "Gudang Semarang"],
    summary: "Produsen makanan kemasan berskala nasional dengan jaringan distribusi pulau Jawa.",
    evidence_urls: [
      "https://pabrik-fmcg-nusantara.co.id/about-us",
      "https://pabrik-fmcg-nusantara.co.id/distribution-network",
    ],
    warnings: [],
  };

  it("should qualify complete logistics prospect as TIER_1 with high evidence coverage", () => {
    const result = computeDeterministicLogisticsQualification({
      facts: baseFacts,
      modelEvaluations: {
        target_industry_sector: { score: 25, rationale: "Sektor FMCG bernilai tinggi" },
        shipping_demand: { score: 25, rationale: "Volume FTL 5 truk per minggu" },
        cargo_compatibility: { score: 20, rationale: "Karton palet cocok untuk wingbox" },
        route_alignment: { score: 15, rationale: "Koridor Cikarang-Semarang-Surabaya" },
        operating_scale: { score: 15, rationale: "Enterprise 500+ karyawan" },
      },
      modelConfidence: 0.95,
      salesRecommendations: ["Tawarkan kontrak regular dedicated FTL dengan rate koridor Jawa"],
    });

    expect(result.score).toBe(100);
    expect(result.evidenceCoverage).toBe(1.0);
    expect(result.confidence).toBe(0.95);
    expect(result.tier).toBe("TIER_1");
    expect(result.missingInfo.length).toBe(0);

    // Verify ontological layer separation
    expect(result.dossierLayers.foundFacts.length).toBeGreaterThanOrEqual(4);
    expect(result.dossierLayers.modelInferences.length).toBeGreaterThan(0);
    expect(result.dossierLayers.salesRecommendations).toContain(
      "Tawarkan kontrak regular dedicated FTL dengan rate koridor Jawa"
    );
  });

  it("should route prospect strictly to INSUFFICIENT_EVIDENCE when critical shipping demand is missing", () => {
    const factsWithoutDemand: ValidatedLogisticsFacts = {
      ...baseFacts,
      logistics_demand_signals: [], // No shipping demand evidence
    };

    const result = computeDeterministicLogisticsQualification({
      facts: factsWithoutDemand,
      modelEvaluations: {
        target_industry_sector: { score: 25 },
        cargo_compatibility: { score: 20 },
        route_alignment: { score: 15 },
        operating_scale: { score: 15 },
      },
      modelConfidence: 0.9,
    });

    expect(result.tier).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.missingInfo).toContain("shipping_demand");
    expect(result.criteriaBreakdown.shipping_demand.verified).toBe(false);
    expect(result.criteriaBreakdown.shipping_demand.score).toBe(
      LOGISTICS_NEUTRAL_BASELINES.shipping_demand
    );
  });

  it("should apply 50% neutral baseline for unobserved criteria instead of zero", () => {
    const factsWithMissingRoute: ValidatedLogisticsFacts = {
      ...baseFacts,
      facility_locations: [], // Missing route/corridor data
    };

    const result = computeDeterministicLogisticsQualification({
      facts: factsWithMissingRoute,
      modelEvaluations: {
        target_industry_sector: { score: 25 },
        shipping_demand: { score: 25 },
        cargo_compatibility: { score: 20 },
        operating_scale: { score: 15 },
      },
    });

    // Route alignment must receive neutral baseline 7.5 (not 0)
    expect(result.criteriaBreakdown.route_alignment.score).toBe(7.5);
    expect(result.criteriaBreakdown.route_alignment.maxScore).toBe(15);
    expect(result.criteriaBreakdown.route_alignment.verified).toBe(false);
    expect(result.missingInfo).toContain("route_alignment");

    // Coverage must reflect 85% (100 - 15)
    expect(result.evidenceCoverage).toBe(0.85);
  });

  it("should strictly bound confidence to <= evidenceCoverage", () => {
    const lowEvidenceFacts: ValidatedLogisticsFacts = {
      ...baseFacts,
      facility_locations: [],
      cargo_types_mentioned: [],
    };

    const result = computeDeterministicLogisticsQualification({
      facts: lowEvidenceFacts,
      modelConfidence: 0.99, // Artificially high model confidence
    });

    // Confidence cannot exceed evidenceCoverage (65% = 25+25+15)
    expect(result.evidenceCoverage).toBe(0.65);
    expect(result.confidence).toBeLessThanOrEqual(result.evidenceCoverage);
    expect(result.confidence).toBe(0.65);
    expect(result.tier).toBe("INSUFFICIENT_EVIDENCE"); // Below 0.70 threshold
  });
});
