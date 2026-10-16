import { z } from "zod";
import { AgentRepository } from "../repository";
import {
  createGatewayClient,
  GatewayCostMetadata,
  LlmGatewayClient,
} from "../../gateway";
import { AllowedModel } from "../../../types/agent";
import {
  LeadScore,
  LeadScoreSchema,
  QualificationTier,
  QUALIFICATION_THRESHOLDS,
  RUBRIC_WEIGHTS,
  NEUTRAL_BASELINES,
  CriterionEvaluation,
} from "../../../types/qualification";
import {
  ValidatedCompanyFacts,
  detectPromptInjection,
  extractDomain,
} from "./extractor";

/**
 * Execution bounds and configuration defaults for Stage 2 ICP Scorer
 */
export const SCORER_BOUNDS = {
  MAX_TOKENS_PER_SCORING: 1000,
  DEFAULT_SCORING_MODEL: "openai/gpt-4o-mini" as AllowedModel,
  MAX_RATIONALE_LENGTH: 2000,
  MAX_CRITERION_RATIONALE_LENGTH: 500,
  MAX_EVIDENCE_URLS_COUNT: 20,
} as const;

/**
 * Formal residual financial risk documentation for Stage 2 inference
 */
export const SCORER_RESIDUAL_RISK_NOTE =
  "Stage 2 ICP evaluation executes structured model reasoning over validated corporate facts. Cost limits and fail-closed policies strictly bound pre-request expenditures; however, in-flight network disruptions or unverifiable upstream telemetry represent residual financial uncertainties mitigated by explicit timeout deadlines and bounded output tokens.";

/**
 * Error hierarchy for Stage 2 ICP Scorer
 */
export class ScorerError extends Error {
  constructor(message: string, public readonly code: string = "SCORER_ERROR") {
    super(message);
    this.name = "ScorerError";
  }
}

export class ScorerValidationError extends ScorerError {
  constructor(message: string, public readonly validationErrors: unknown[] = []) {
    super(message, "SCORER_VALIDATION_ERROR");
    this.name = "ScorerValidationError";
  }
}

/**
 * Zod schema for individual rubric criterion evaluation returned by LLM
 */
export const Stage2CriterionOutputSchema = z.object({
  score: z.number().min(0).max(100),
  rationale: z
    .string()
    .trim()
    .max(SCORER_BOUNDS.MAX_CRITERION_RATIONALE_LENGTH)
    .default(""),
  observed: z.boolean().default(false),
});

/**
 * Strict Zod schema for structured Stage 2 model response
 */
export const Stage2ModelResponseSchema = z.object({
  criteria: z.object({
    industry: Stage2CriterionOutputSchema,
    company_size: Stage2CriterionOutputSchema,
    offerings: Stage2CriterionOutputSchema,
    tech_stack: Stage2CriterionOutputSchema,
  }),
  confidence: z.number().min(0).max(1),
  overall_rationale: z
    .string()
    .trim()
    .max(SCORER_BOUNDS.MAX_RATIONALE_LENGTH)
    .default(""),
});

export type Stage2ModelResponse = z.infer<typeof Stage2ModelResponseSchema>;

/**
 * Filters and validates evidence URLs strictly against target prospect domain
 */
export function filterVerifiedEvidenceUrls(
  leadWebsiteUrl: string,
  candidateUrls: string[]
): { validUrls: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const leadDomain = extractDomain(leadWebsiteUrl);
  const validUrls: string[] = [];

  for (const rawUrl of candidateUrls) {
    if (typeof rawUrl !== "string") continue;
    try {
      const parsed = new URL(rawUrl.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        warnings.push(
          `Evidence URL '${rawUrl}' dropped due to non-http/https protocol '${parsed.protocol}'`
        );
        continue;
      }
      if (leadDomain) {
        const host = parsed.hostname.toLowerCase();
        const isMatch = host === leadDomain || host.endsWith(`.${leadDomain}`);
        if (!isMatch) {
          warnings.push(
            `Evidence URL '${rawUrl}' belongs to foreign domain '${host}', not prospect domain '${leadDomain}'. Dropped for safety.`
          );
          continue;
        }
      }
      validUrls.push(parsed.href);
      if (validUrls.length >= SCORER_BOUNDS.MAX_EVIDENCE_URLS_COUNT) break;
    } catch {
      warnings.push(`Invalid evidence URL format rejected: '${rawUrl}'`);
    }
  }

  return { validUrls, warnings };
}

/**
 * Options for pure static ICP rubric calculation
 */
export interface StaticIcpCalculationInput {
  facts: ValidatedCompanyFacts;
  leadWebsiteUrl: string;
  companyName: string;
  modelEvaluations?: {
    industry?: { score: number; rationale?: string };
    company_size?: { score: number; rationale?: string };
    offerings?: { score: number; rationale?: string };
    tech_stack?: { score: number; rationale?: string };
  };
  modelConfidence?: number;
  overallRationale?: string;
}

export interface StaticIcpCalculationResult {
  score: number;
  confidence: number;
  evidenceCoverage: number;
  tier: QualificationTier;
  criteriaBreakdown: Record<string, CriterionEvaluation>;
  missingInfo: string[];
  evidenceUrls: string[];
  rationale: string;
  warnings: string[];
}

/**
 * Deterministic Static ICP Qualification Engine:
 * Evaluates prospect fit against static rubric weights (30% industry, 25% size, 25% product, 20% tech stack),
 * computes decoupled score, confidence, and evidenceCoverage, enforces neutral baseline for unobserved data,
 * and executes evidence gating for actionable tiers.
 */
export function calculateStaticIcpScore(
  input: StaticIcpCalculationInput
): StaticIcpCalculationResult {
  const warnings: string[] = [];
  const missingInfo: string[] = [];
  const criteriaBreakdown: Record<string, CriterionEvaluation> = {};

  // 1. Strict Evidence URL Scope Validation
  const { validUrls: verifiedUrls, warnings: urlWarnings } = filterVerifiedEvidenceUrls(
    input.leadWebsiteUrl,
    input.facts.evidence_urls || []
  );
  warnings.push(...urlWarnings);
  const hasValidUrls = verifiedUrls.length > 0;

  // 2. Defense-in-Depth Semantic Scan for Adversarial Patterns
  let safeIndustry = input.facts.industry;
  if (safeIndustry && detectPromptInjection(safeIndustry)) {
    warnings.push("Adversarial instruction detected in industry fact; neutralized.");
    safeIndustry = null;
  }

  let safeCompanySize = input.facts.company_size;
  if (safeCompanySize && detectPromptInjection(safeCompanySize)) {
    warnings.push("Adversarial instruction detected in company_size fact; neutralized.");
    safeCompanySize = null;
  }

  const safeOfferings: string[] = [];
  for (const offering of input.facts.offerings || []) {
    if (detectPromptInjection(offering)) {
      warnings.push(`Adversarial instruction in offering '${offering.slice(0, 30)}' dropped.`);
    } else {
      safeOfferings.push(offering);
    }
  }

  const safeTechStack: string[] = [];
  for (const tech of input.facts.tech_stack || []) {
    if (detectPromptInjection(tech)) {
      warnings.push(`Adversarial instruction in tech stack '${tech.slice(0, 30)}' dropped.`);
    } else {
      safeTechStack.push(tech);
    }
  }

  // 3. Rubric Criterion 1: Industry Relevance (30%, Mandatory Critical)
  const hasIndustry = Boolean(safeIndustry && safeIndustry.trim().length > 0);
  if (!hasIndustry) {
    criteriaBreakdown.industry = {
      score: NEUTRAL_BASELINES.industry,
      maxScore: RUBRIC_WEIGHTS.industry,
      evidence: null,
      verified: false,
      rationale:
        "No verified industry information observed on prospect website (neutral baseline applied)",
    };
    missingInfo.push("industry");
  } else if (!hasValidUrls) {
    criteriaBreakdown.industry = {
      score: Math.min(
        RUBRIC_WEIGHTS.industry,
        Math.max(0, input.modelEvaluations?.industry?.score ?? NEUTRAL_BASELINES.industry)
      ),
      maxScore: RUBRIC_WEIGHTS.industry,
      evidence: safeIndustry,
      verified: false,
      rationale: "Industry observed but lacks verified domain evidence URL",
    };
    missingInfo.push("industry_evidence_citation");
  } else {
    const rawScore = input.modelEvaluations?.industry?.score;
    const scoreVal =
      typeof rawScore === "number"
        ? Math.min(RUBRIC_WEIGHTS.industry, Math.max(0, rawScore))
        : RUBRIC_WEIGHTS.industry;
    criteriaBreakdown.industry = {
      score: scoreVal,
      maxScore: RUBRIC_WEIGHTS.industry,
      evidence: safeIndustry,
      verified: true,
      rationale:
        input.modelEvaluations?.industry?.rationale || "Industry verified from prospect domain",
    };
  }

  // 4. Rubric Criterion 2: Company Size / Maturity (25%)
  const hasSize = Boolean(safeCompanySize && safeCompanySize.trim().length > 0);
  if (!hasSize) {
    criteriaBreakdown.company_size = {
      score: NEUTRAL_BASELINES.company_size,
      maxScore: RUBRIC_WEIGHTS.company_size,
      evidence: null,
      verified: false,
      rationale:
        "No company size information observed on prospect website (neutral baseline applied)",
    };
    missingInfo.push("company_size");
  } else if (!hasValidUrls) {
    criteriaBreakdown.company_size = {
      score: Math.min(
        RUBRIC_WEIGHTS.company_size,
        Math.max(0, input.modelEvaluations?.company_size?.score ?? NEUTRAL_BASELINES.company_size)
      ),
      maxScore: RUBRIC_WEIGHTS.company_size,
      evidence: safeCompanySize,
      verified: false,
      rationale: "Company size observed but lacks verified domain evidence URL",
    };
    missingInfo.push("company_size_evidence_citation");
  } else {
    const rawScore = input.modelEvaluations?.company_size?.score;
    const scoreVal =
      typeof rawScore === "number"
        ? Math.min(RUBRIC_WEIGHTS.company_size, Math.max(0, rawScore))
        : RUBRIC_WEIGHTS.company_size;
    criteriaBreakdown.company_size = {
      score: scoreVal,
      maxScore: RUBRIC_WEIGHTS.company_size,
      evidence: safeCompanySize,
      verified: true,
      rationale:
        input.modelEvaluations?.company_size?.rationale ||
        "Company size verified from prospect domain",
    };
  }

  // 5. Rubric Criterion 3: Core Product / Service Fit (25%, Mandatory Critical)
  const hasOfferings = safeOfferings.length > 0;
  if (!hasOfferings) {
    criteriaBreakdown.offerings = {
      score: NEUTRAL_BASELINES.offerings,
      maxScore: RUBRIC_WEIGHTS.offerings,
      evidence: null,
      verified: false,
      rationale:
        "No product or service offerings observed on prospect website (neutral baseline applied)",
    };
    missingInfo.push("offerings");
  } else if (!hasValidUrls) {
    criteriaBreakdown.offerings = {
      score: Math.min(
        RUBRIC_WEIGHTS.offerings,
        Math.max(0, input.modelEvaluations?.offerings?.score ?? NEUTRAL_BASELINES.offerings)
      ),
      maxScore: RUBRIC_WEIGHTS.offerings,
      evidence: safeOfferings.join(", "),
      verified: false,
      rationale: "Offerings observed but lack verified domain evidence URL",
    };
    missingInfo.push("offerings_evidence_citation");
  } else {
    const rawScore = input.modelEvaluations?.offerings?.score;
    const scoreVal =
      typeof rawScore === "number"
        ? Math.min(RUBRIC_WEIGHTS.offerings, Math.max(0, rawScore))
        : RUBRIC_WEIGHTS.offerings;
    criteriaBreakdown.offerings = {
      score: scoreVal,
      maxScore: RUBRIC_WEIGHTS.offerings,
      evidence: safeOfferings.join(", "),
      verified: true,
      rationale:
        input.modelEvaluations?.offerings?.rationale || "Offerings verified from prospect domain",
    };
  }

  // 6. Rubric Criterion 4: Technology Stack Alignment (20%)
  const hasTechStack = safeTechStack.length > 0;
  if (!hasTechStack) {
    criteriaBreakdown.tech_stack = {
      score: NEUTRAL_BASELINES.tech_stack,
      maxScore: RUBRIC_WEIGHTS.tech_stack,
      evidence: null,
      verified: false,
      rationale:
        "No tech stack details observed on prospect website (neutral baseline applied)",
    };
    missingInfo.push("tech_stack");
  } else if (!hasValidUrls) {
    criteriaBreakdown.tech_stack = {
      score: Math.min(
        RUBRIC_WEIGHTS.tech_stack,
        Math.max(0, input.modelEvaluations?.tech_stack?.score ?? NEUTRAL_BASELINES.tech_stack)
      ),
      maxScore: RUBRIC_WEIGHTS.tech_stack,
      evidence: safeTechStack.join(", "),
      verified: false,
      rationale: "Tech stack observed but lacks verified domain evidence URL",
    };
    missingInfo.push("tech_stack_evidence_citation");
  } else {
    const rawScore = input.modelEvaluations?.tech_stack?.score;
    const scoreVal =
      typeof rawScore === "number"
        ? Math.min(RUBRIC_WEIGHTS.tech_stack, Math.max(0, rawScore))
        : RUBRIC_WEIGHTS.tech_stack;
    criteriaBreakdown.tech_stack = {
      score: scoreVal,
      maxScore: RUBRIC_WEIGHTS.tech_stack,
      evidence: safeTechStack.join(", "),
      verified: true,
      rationale:
        input.modelEvaluations?.tech_stack?.rationale || "Tech stack verified from prospect domain",
    };
  }

  // 7. Calculate Quantitative Evidence Coverage (0.0 to 1.0)
  let coverageWeight = 0;
  if (criteriaBreakdown.industry.verified) coverageWeight += RUBRIC_WEIGHTS.industry;
  if (criteriaBreakdown.company_size.verified) coverageWeight += RUBRIC_WEIGHTS.company_size;
  if (criteriaBreakdown.offerings.verified) coverageWeight += RUBRIC_WEIGHTS.offerings;
  if (criteriaBreakdown.tech_stack.verified) coverageWeight += RUBRIC_WEIGHTS.tech_stack;
  const evidenceCoverage = Math.round((coverageWeight / 100) * 100) / 100;

  // 8. Calculate Nominal Fit Score (0 to 100)
  const totalRaw =
    criteriaBreakdown.industry.score +
    criteriaBreakdown.company_size.score +
    criteriaBreakdown.offerings.score +
    criteriaBreakdown.tech_stack.score;
  const score = Math.min(100, Math.max(0, Math.round(totalRaw * 10) / 10));

  // 9. Calculate Epistemic Confidence (strictly bounded by evidenceCoverage)
  let initialConfidence =
    typeof input.modelConfidence === "number" ? input.modelConfidence : evidenceCoverage;
  initialConfidence = Math.max(0, Math.min(1, initialConfidence));
  const boundedConfidence = Math.min(initialConfidence, evidenceCoverage);
  const confidence = Math.round(boundedConfidence * 100) / 100;

  // 10. Evidence Gating & Tier Routing Matrix
  const criticalVerified =
    criteriaBreakdown.industry.verified && criteriaBreakdown.offerings.verified;
  const meetsCoverage =
    evidenceCoverage >= QUALIFICATION_THRESHOLDS.MIN_ACTIONABLE_EVIDENCE_COVERAGE;
  const meetsMinConfidence =
    confidence >= QUALIFICATION_THRESHOLDS.MIN_TIER_2_CONFIDENCE;

  let tier: QualificationTier;

  if (!criticalVerified || !hasValidUrls || !meetsCoverage || !meetsMinConfidence) {
    tier = "INSUFFICIENT_EVIDENCE";
  } else if (
    score >= QUALIFICATION_THRESHOLDS.MIN_TIER_1_SCORE &&
    confidence >= QUALIFICATION_THRESHOLDS.MIN_TIER_1_CONFIDENCE
  ) {
    tier = "TIER_1";
  } else if (
    score >= QUALIFICATION_THRESHOLDS.MIN_TIER_2_SCORE &&
    confidence >= QUALIFICATION_THRESHOLDS.MIN_TIER_2_CONFIDENCE
  ) {
    tier = "TIER_2";
  } else {
    tier = "DISQUALIFIED";
  }

  return {
    score,
    confidence,
    evidenceCoverage,
    tier,
    criteriaBreakdown,
    missingInfo,
    evidenceUrls: verifiedUrls,
    rationale:
      input.overallRationale ||
      `Static ICP evaluation completed: Tier ${tier} with score ${score}, coverage ${evidenceCoverage}, confidence ${confidence}.`,
    warnings,
  };
}

/**
 * Builds the least-privilege Stage 2 prompt containing ONLY semantically validated facts
 */
export function buildScoringPrompt(
  facts: ValidatedCompanyFacts,
  lead: { companyName: string; websiteUrl: string },
  verifiedUrls: string[]
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an Ideal Customer Profile (ICP) qualification scoring evaluator for AstraOps.
CRITICAL EVALUATION AND LEAST-PRIVILEGE DIRECTIVES:
1. You evaluate prospect fit based STRICTLY and ONLY on the structured factual JSON provided.
2. You do NOT have access to raw website text, search tools, or external scrapers.
3. If a factual attribute is null, empty, or unobserved, you MUST NOT fabricate, assume, or hallucinate details.
4. You MUST NOT decide to overlook or forgive missing evidence. Unobserved criteria must be flagged as unobserved.
5. Provide objective evaluations for observed criteria conforming strictly to the requested rubric weights:
   - Industry Relevance: max 30 points (Mandatory critical criteria: AstraOps targets B2B Software, Cloud, SaaS, Enterprise IT, AI/Data Infrastructure).
   - Company Size / Maturity: max 25 points (AstraOps targets Growth / Mid-market / Enterprise, typically 10-1000 employees).
   - Core Product / Service Fit: max 25 points (Mandatory critical criteria: Target companies selling B2B technology products or enterprise services with inbound/outbound sales motion).
   - Tech Stack Alignment: max 20 points (Modern web/cloud stack: TypeScript, React/Next.js, Node/Python/Go, Cloud AWS/GCP/Azure, PostgreSQL/modern DBs).
6. Return ONLY a single valid JSON object matching the requested schema. No markdown formatting, no conversational text.`;

  const userPrompt = `Evaluate the following structured company facts for "${lead.companyName}" against the AstraOps ICP rubric:

Target Website: ${lead.websiteUrl}

Company Facts:
${JSON.stringify(
  {
    industry: facts.industry,
    company_size: facts.company_size,
    offerings: facts.offerings,
    tech_stack: facts.tech_stack,
    summary: facts.summary,
  },
  null,
  2
)}

Verified Evidence URLs from prospect domain:
${JSON.stringify(verifiedUrls, null, 2)}

Return a JSON object conforming strictly to this schema:
{
  "criteria": {
    "industry": {
      "score": number (0 to 30; if unobserved, return 15),
      "rationale": string,
      "observed": boolean
    },
    "company_size": {
      "score": number (0 to 25; if unobserved, return 12.5),
      "rationale": string,
      "observed": boolean
    },
    "offerings": {
      "score": number (0 to 25; if unobserved, return 12.5),
      "rationale": string,
      "observed": boolean
    },
    "tech_stack": {
      "score": number (0 to 20; if unobserved, return 10),
      "rationale": string,
      "observed": boolean
    }
  },
  "confidence": number (0.0 to 1.0, epistemic certainty based on fact specificity and clarity),
  "overall_rationale": string
}`;

  return { systemPrompt, userPrompt };
}

/**
 * Contextual agent execution dependencies for Stage 2 ICP Scorer
 */
export interface ScorerAgentContext {
  agentRepo: AgentRepository;
  runId: string;
  stepNumber: number;
  actorId?: string;
  actorRole?: string;
  autoTransition?: boolean;
}

/**
 * Input arguments for Stage 2 ICP Scorer tool
 */
export interface ScoreLeadIcpInput {
  leadId: string;
  runId?: string;
  companyName: string;
  websiteUrl: string;
  facts: ValidatedCompanyFacts;
  gatewayClient?: LlmGatewayClient;
  model?: AllowedModel;
  maxTokens?: number;
  accruedCostUsd?: number;
  budgetLimitUsd?: number;
  signal?: AbortSignal;
  agentContext?: ScorerAgentContext;
}

/**
 * Output result from Stage 2 ICP Scorer tool
 */
export interface ScoreLeadIcpResult {
  leadScore: LeadScore;
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
  costMetadata?: GatewayCostMetadata;
  sanitizationWarnings: string[];
  residualRiskNote: string;
}

/**
 * Stage 2 ICP Scorer Tool:
 * Consumes ONLY semantically validated company facts, invokes Model Gateway under least privilege,
 * validates model response with strict Zod schema, calculates deterministic decoupled metrics & evidence gating,
 * records step in agent_steps, and atomically persists result to lead_scores.
 */
export async function scoreCompanyLead(
  input: ScoreLeadIcpInput
): Promise<ScoreLeadIcpResult> {
  // 1. Validate Input Integrity (Defense-in-depth: Reject null or malformed facts)
  if (!input.facts || typeof input.facts !== "object") {
    throw new ScorerValidationError(
      "Stage 2 ICP Scorer requires a valid ValidatedCompanyFacts object from Stage 1",
      []
    );
  }

  // 2. Filter Verified Evidence URLs strictly against prospect domain
  const { validUrls: verifiedUrls, warnings: urlWarnings } = filterVerifiedEvidenceUrls(
    input.websiteUrl,
    input.facts.evidence_urls || []
  );

  const client = input.gatewayClient ?? createGatewayClient();
  const model = input.model ?? SCORER_BOUNDS.DEFAULT_SCORING_MODEL;
  const maxTokens = input.maxTokens ?? SCORER_BOUNDS.MAX_TOKENS_PER_SCORING;

  // 3. Build Prompt (Free of any raw scraped HTML or website text)
  const { systemPrompt, userPrompt } = buildScoringPrompt(
    input.facts,
    {
      companyName: input.companyName,
      websiteUrl: input.websiteUrl,
    },
    verifiedUrls
  );

  // 4. Dispatch Inference Request via Gateway Client (Enforces budget and fail-closed policies)
  const response = await client.complete({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxTokens,
    temperature: 0.1,
    responseFormat: { type: "json_object" },
    accruedCostUsd: input.accruedCostUsd,
    budgetLimitUsd: input.budgetLimitUsd,
    signal: input.signal,
  });

  // 5. Parse and Validate JSON output strictly
  let rawJson: unknown;
  try {
    const cleanContent = response.content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    rawJson = JSON.parse(cleanContent);
  } catch (parseErr: unknown) {
    throw new ScorerValidationError(
      `Stage 2 Scorer output was not valid JSON: ${
        parseErr instanceof Error ? parseErr.message : String(parseErr)
      }`,
      []
    );
  }

  const zodResult = Stage2ModelResponseSchema.safeParse(rawJson);
  if (!zodResult.success) {
    throw new ScorerValidationError(
      `Stage 2 Scorer output failed strict schema validation: ${zodResult.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ")}`,
      zodResult.error.errors
    );
  }

  const modelOutput = zodResult.data;

  // 6. Deterministic Static ICP Rubric Calculation & Evidence Gating
  const calculated = calculateStaticIcpScore({
    facts: input.facts,
    leadWebsiteUrl: input.websiteUrl,
    companyName: input.companyName,
    modelEvaluations: {
      industry: {
        score: modelOutput.criteria.industry.score,
        rationale: modelOutput.criteria.industry.rationale,
      },
      company_size: {
        score: modelOutput.criteria.company_size.score,
        rationale: modelOutput.criteria.company_size.rationale,
      },
      offerings: {
        score: modelOutput.criteria.offerings.score,
        rationale: modelOutput.criteria.offerings.rationale,
      },
      tech_stack: {
        score: modelOutput.criteria.tech_stack.score,
        rationale: modelOutput.criteria.tech_stack.rationale,
      },
    },
    modelConfidence: modelOutput.confidence,
    overallRationale: modelOutput.overall_rationale,
  });

  const allWarnings = [...urlWarnings, ...calculated.warnings];

  // 7. Atomically persist execution step & lead_scores if agentContext is provided
  let leadScore: LeadScore;

  if (input.agentContext) {
    const { agentRepo, runId, stepNumber, actorId, actorRole, autoTransition } =
      input.agentContext;

    // Record step in agent_steps:
    // Only structured facts and deterministic results are recorded. No raw web text!
    await agentRepo.recordStep({
      runId,
      stepNumber,
      toolName: "icp_scorer",
      inputPayload: {
        leadId: input.leadId,
        companyName: input.companyName,
        websiteUrl: input.websiteUrl,
        facts: {
          industry: input.facts.industry,
          company_size: input.facts.company_size,
          offerings: input.facts.offerings,
          tech_stack: input.facts.tech_stack,
        },
        model,
        maxTokens,
      },
      outputPayload: {
        score: calculated.score,
        confidence: calculated.confidence,
        evidenceCoverage: calculated.evidenceCoverage,
        tier: calculated.tier,
        criteriaBreakdown: calculated.criteriaBreakdown,
        missingInfo: calculated.missingInfo,
        evidenceUrls: calculated.evidenceUrls,
        warnings: allWarnings,
        residualRiskNote: SCORER_RESIDUAL_RISK_NOTE,
      },
      tokensUsed: response.usage.totalTokens,
      costUsd: response.cost.actualCostUsd,
      durationMs: response.durationMs,
      isToolCall: true,
      actorId: actorId || "system",
      actorRole: actorRole || "system",
      signal: input.signal,
    });

    // Save structured score in lead_scores table
    leadScore = await agentRepo.saveLeadScore({
      leadId: input.leadId,
      runId,
      score: calculated.score,
      confidence: calculated.confidence,
      evidenceCoverage: calculated.evidenceCoverage,
      tier: calculated.tier,
      criteriaBreakdown: calculated.criteriaBreakdown,
      missingInfo: calculated.missingInfo,
      evidenceUrls: calculated.evidenceUrls,
      rationale: calculated.rationale,
      actorId: actorId || "system",
      actorRole: actorRole || "system",
    });

    // If autoTransition is requested, transition agent run state accordingly
    if (autoTransition) {
      const targetState =
        calculated.tier === "TIER_1" || calculated.tier === "TIER_2"
          ? "AWAITING_APPROVAL"
          : calculated.tier === "INSUFFICIENT_EVIDENCE"
          ? "INSUFFICIENT_EVIDENCE"
          : "DISQUALIFIED";

      await agentRepo.transitionState(runId, targetState, {
        actorId: actorId || "system",
        actorRole: actorRole || "system",
        signal: input.signal,
      });
    }
  } else {
    leadScore = LeadScoreSchema.parse({
      lead_id: input.leadId,
      run_id: input.runId || null,
      score: calculated.score,
      confidence: calculated.confidence,
      evidence_coverage: calculated.evidenceCoverage,
      tier: calculated.tier,
      criteria_breakdown: calculated.criteriaBreakdown,
      missing_info: calculated.missingInfo,
      evidence_urls: calculated.evidenceUrls,
      rationale: calculated.rationale,
    });
  }

  return {
    leadScore,
    tokensUsed: response.usage.totalTokens,
    costUsd: response.cost.actualCostUsd,
    durationMs: response.durationMs,
    costMetadata: response.cost,
    sanitizationWarnings: allWarnings,
    residualRiskNote: SCORER_RESIDUAL_RISK_NOTE,
  };
}
