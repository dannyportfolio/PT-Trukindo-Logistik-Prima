import { describe, it, expect } from "vitest";
import {
  QualificationTierSchema,
  QUALIFICATION_THRESHOLDS,
  RUBRIC_WEIGHTS,
  NEUTRAL_BASELINES,
  NEUTRAL_BASELINE_RATIO,
  CriterionEvaluationSchema,
  LeadScoreSchema,
  SaveLeadScoreInputSchema,
} from "@/types/qualification";

describe("Qualification Zod Contracts & Decoupled Metrics Suite", () => {
  describe("RUBRIC_WEIGHTS and NEUTRAL_BASELINES", () => {
    it("should define exact rubric weights summing to 100", () => {
      expect(RUBRIC_WEIGHTS.industry).toBe(30);
      expect(RUBRIC_WEIGHTS.company_size).toBe(25);
      expect(RUBRIC_WEIGHTS.offerings).toBe(25);
      expect(RUBRIC_WEIGHTS.tech_stack).toBe(20);

      const totalWeight =
        RUBRIC_WEIGHTS.industry +
        RUBRIC_WEIGHTS.company_size +
        RUBRIC_WEIGHTS.offerings +
        RUBRIC_WEIGHTS.tech_stack;
      expect(totalWeight).toBe(100);
    });

    it("should define neutral baselines as 50% of criteria weights", () => {
      expect(NEUTRAL_BASELINE_RATIO).toBe(0.5);
      expect(NEUTRAL_BASELINES.industry).toBe(15);
      expect(NEUTRAL_BASELINES.company_size).toBe(12.5);
      expect(NEUTRAL_BASELINES.offerings).toBe(12.5);
      expect(NEUTRAL_BASELINES.tech_stack).toBe(10);

      const totalNeutral =
        NEUTRAL_BASELINES.industry +
        NEUTRAL_BASELINES.company_size +
        NEUTRAL_BASELINES.offerings +
        NEUTRAL_BASELINES.tech_stack;
      expect(totalNeutral).toBe(50);
    });
  });

  describe("QualificationTierSchema", () => {
    it("should accept valid qualification tiers", () => {
      const validTiers = [
        "TIER_1",
        "TIER_2",
        "INSUFFICIENT_EVIDENCE",
        "DISQUALIFIED",
      ];
      for (const tier of validTiers) {
        expect(QualificationTierSchema.parse(tier)).toBe(tier);
      }
    });

    it("should reject invalid tiers", () => {
      expect(() => QualificationTierSchema.parse("TIER_3")).toThrow();
      expect(() => QualificationTierSchema.parse("HOT_LEAD")).toThrow();
      expect(() => QualificationTierSchema.parse("")).toThrow();
    });
  });

  describe("QUALIFICATION_THRESHOLDS", () => {
    it("should enforce expected minimum thresholds for actionable tiers", () => {
      expect(QUALIFICATION_THRESHOLDS.MIN_ACTIONABLE_EVIDENCE_COVERAGE).toBe(0.7);
      expect(QUALIFICATION_THRESHOLDS.MIN_TIER_1_CONFIDENCE).toBe(0.75);
      expect(QUALIFICATION_THRESHOLDS.MIN_TIER_2_CONFIDENCE).toBe(0.65);
      expect(QUALIFICATION_THRESHOLDS.MIN_TIER_1_SCORE).toBe(80);
      expect(QUALIFICATION_THRESHOLDS.MIN_TIER_2_SCORE).toBe(60);
      expect(QUALIFICATION_THRESHOLDS.MANDATORY_CRITICAL_CRITERIA).toEqual([
        "industry",
        "offerings",
      ]);
    });
  });

  describe("CriterionEvaluationSchema", () => {
    it("should validate and apply defaults to criterion evaluation", () => {
      const parsed = CriterionEvaluationSchema.parse({
        score: 30,
        maxScore: 30,
      });

      expect(parsed.score).toBe(30);
      expect(parsed.maxScore).toBe(30);
      expect(parsed.evidence).toBeNull();
      expect(parsed.verified).toBe(false);
    });

    it("should accept verified criterion with evidence string", () => {
      const parsed = CriterionEvaluationSchema.parse({
        score: 25,
        maxScore: 25,
        evidence: "Enterprise B2B Cloud Analytics",
        verified: true,
      });

      expect(parsed.verified).toBe(true);
      expect(parsed.evidence).toBe("Enterprise B2B Cloud Analytics");
    });

    it("should reject scores outside 0-100 range", () => {
      expect(() =>
        CriterionEvaluationSchema.parse({
          score: -5,
          maxScore: 25,
        })
      ).toThrow();

      expect(() =>
        CriterionEvaluationSchema.parse({
          score: 105,
          maxScore: 100,
        })
      ).toThrow();
    });
  });

  describe("LeadScoreSchema", () => {
    it("should decouple score, confidence, and evidence_coverage", () => {
      const valid = {
        lead_id: "a1111111-1111-1111-1111-111111111111",
        score: 85,
        confidence: 0.9,
        evidence_coverage: 0.85,
        tier: "TIER_1",
        criteria_breakdown: {
          industry: {
            score: 30,
            maxScore: 30,
            evidence: "Fintech SaaS",
            verified: true,
          },
        },
        missing_info: [],
        evidence_urls: ["https://example.com/about"],
        rationale: "Comprehensive evidence found across corporate pages",
      };

      const parsed = LeadScoreSchema.parse(valid);
      expect(parsed.score).toBe(85);
      expect(parsed.confidence).toBe(0.9);
      expect(parsed.evidence_coverage).toBe(0.85);
      expect(parsed.tier).toBe("TIER_1");
    });

    it("should support INSUFFICIENT_EVIDENCE tier when coverage is below threshold", () => {
      const lowCoverage = {
        lead_id: "b2222222-2222-2222-2222-222222222222",
        score: 90, // High nominal score but low evidence
        confidence: 0.4,
        evidence_coverage: 0.3,
        tier: "INSUFFICIENT_EVIDENCE",
        missing_info: ["offerings", "company_size"],
      };

      const parsed = LeadScoreSchema.parse(lowCoverage);
      expect(parsed.tier).toBe("INSUFFICIENT_EVIDENCE");
      expect(parsed.evidence_coverage).toBe(0.3);
      expect(parsed.confidence).toBe(0.4);
      expect(parsed.missing_info).toContain("offerings");
    });

    it("should reject confidence or evidence_coverage outside [0, 1]", () => {
      expect(() =>
        LeadScoreSchema.parse({
          lead_id: "b2222222-2222-2222-2222-222222222222",
          score: 80,
          confidence: 1.5, // Invalid > 1
          evidence_coverage: 0.8,
          tier: "TIER_1",
        })
      ).toThrow();

      expect(() =>
        LeadScoreSchema.parse({
          lead_id: "b2222222-2222-2222-2222-222222222222",
          score: 80,
          confidence: 0.8,
          evidence_coverage: -0.1, // Invalid < 0
          tier: "TIER_1",
        })
      ).toThrow();
    });
  });

  describe("SaveLeadScoreInputSchema", () => {
    it("should parse valid input for repository persistence", () => {
      const input = {
        leadId: "c3333333-3333-3333-3333-333333333333",
        score: 75,
        confidence: 0.7,
        evidenceCoverage: 0.75,
        tier: "TIER_2" as const,
        criteriaBreakdown: {},
        missingInfo: ["tech_stack"],
        evidenceUrls: ["https://company.org"],
        actorId: "scorer_agent",
        actorRole: "AGENT",
      };

      const parsed = SaveLeadScoreInputSchema.parse(input);
      expect(parsed.leadId).toBe("c3333333-3333-3333-3333-333333333333");
      expect(parsed.score).toBe(75);
      expect(parsed.tier).toBe("TIER_2");
      expect(parsed.actorId).toBe("scorer_agent");
    });
  });
});
