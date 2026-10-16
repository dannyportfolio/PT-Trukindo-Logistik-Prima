import { z } from "zod";

/**
 * Qualification Tier Enum matching PostgreSQL chk_lead_scores_tier constraint
 */
export const QualificationTierSchema = z.enum([
  "TIER_1",
  "TIER_2",
  "INSUFFICIENT_EVIDENCE",
  "DISQUALIFIED",
]);

export type QualificationTier = z.infer<typeof QualificationTierSchema>;

/**
 * Minimum Evidence Requirements for Actionable Tiers (entering AWAITING_APPROVAL)
 */
export const QUALIFICATION_THRESHOLDS = {
  MIN_ACTIONABLE_EVIDENCE_COVERAGE: 0.7,
  MIN_TIER_1_CONFIDENCE: 0.75,
  MIN_TIER_2_CONFIDENCE: 0.65,
  MIN_TIER_1_SCORE: 80,
  MIN_TIER_2_SCORE: 60,
  MANDATORY_CRITICAL_CRITERIA: ["industry", "offerings"] as const,
} as const;

/**
 * Rubric Weights (Static ICP Rubric: Industry 30%, Size 25%, Product/Offerings 25%, Tech Stack 20%)
 */
export const RUBRIC_WEIGHTS = {
  industry: 30,
  company_size: 25,
  offerings: 25,
  tech_stack: 20,
} as const;

export type RubricCriterion = keyof typeof RUBRIC_WEIGHTS;

export const NEUTRAL_BASELINE_RATIO = 0.5;

export const NEUTRAL_BASELINES: Record<RubricCriterion, number> = {
  industry: RUBRIC_WEIGHTS.industry * NEUTRAL_BASELINE_RATIO, // 15.0
  company_size: RUBRIC_WEIGHTS.company_size * NEUTRAL_BASELINE_RATIO, // 12.5
  offerings: RUBRIC_WEIGHTS.offerings * NEUTRAL_BASELINE_RATIO, // 12.5
  tech_stack: RUBRIC_WEIGHTS.tech_stack * NEUTRAL_BASELINE_RATIO, // 10.0
} as const;

/**
 * Breakdown per rubric criterion
 */
export const CriterionEvaluationSchema = z.object({
  score: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  evidence: z.string().nullable().default(null),
  verified: z.boolean().default(false),
  rationale: z.string().nullable().optional().default(null),
});

export type CriterionEvaluation = z.infer<typeof CriterionEvaluationSchema>;

/**
 * Structured Lead Score Output Zod Schema
 */
export const LeadScoreSchema = z.object({
  id: z.string().uuid().optional(),
  lead_id: z.string().uuid(),
  run_id: z.string().uuid().nullable().default(null),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  evidence_coverage: z.number().min(0).max(1),
  tier: QualificationTierSchema,
  criteria_breakdown: z.record(CriterionEvaluationSchema).default({}),
  missing_info: z.array(z.string()).default([]),
  evidence_urls: z.array(z.string().url()).default([]),
  rationale: z.string().nullable().default(null),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type LeadScore = z.infer<typeof LeadScoreSchema>;

/**
 * Input schema for saving qualification scores in repository
 */
export const SaveLeadScoreInputSchema = z.object({
  leadId: z.string().uuid(),
  runId: z.string().uuid().nullable().optional(),
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  evidenceCoverage: z.number().min(0).max(1),
  tier: QualificationTierSchema,
  criteriaBreakdown: z.record(CriterionEvaluationSchema).default({}),
  missingInfo: z.array(z.string()).default([]),
  evidenceUrls: z.array(z.string()).default([]),
  rationale: z.string().nullable().optional(),
  actorId: z.string().default("system"),
  actorRole: z.string().default("system"),
});

export type SaveLeadScoreInput = z.input<typeof SaveLeadScoreInputSchema>;
