import { z } from "zod";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { LeadRepository } from "@/lib/lead-repository";
import { AgentRepository } from "@/lib/agent/repository";
import { runAgentPipeline } from "@/lib/agent/runner";
import { AllowedModelSchema, AGENT_BOUNDS } from "@/types/agent";
import {
  IdempotencyService,
  computePayloadHash,
  IdempotencyConflictError,
} from "@/lib/idempotency";

const RunAgentBodySchema = z.object({
  leadId: z.string().uuid("Lead ID must be a valid UUID format"),
  allowRerun: z.boolean().optional().default(false),
  model: AllowedModelSchema.optional(),
  maxSteps: z
    .number()
    .int()
    .min(1)
    .max(
      AGENT_BOUNDS.MAX_STEPS,
      `maxSteps cannot exceed global MVP limit (${AGENT_BOUNDS.MAX_STEPS})`
    )
    .optional(),
  maxToolCalls: z
    .number()
    .int()
    .min(1)
    .max(
      AGENT_BOUNDS.MAX_TOOL_CALLS,
      `maxToolCalls cannot exceed global MVP limit (${AGENT_BOUNDS.MAX_TOOL_CALLS})`
    )
    .optional(),
  budgetLimitUsd: z
    .number()
    .min(0.01)
    .max(
      AGENT_BOUNDS.BUDGET_LIMIT_USD,
      `budgetLimitUsd cannot exceed global MVP limit ($${AGENT_BOUNDS.BUDGET_LIMIT_USD})`
    )
    .optional(),
});

const TERMINAL_STATUSES = new Set([
  "QUALIFIED",
  "DISQUALIFIED",
  "ARCHIVED",
  "PROPOSAL_DRAFTED",
  "OUTREACH_ACTIVE",
]);

/**
 * POST /api/agent/run
 * Initiates an automated research and qualification agent run on an eligible lead.
 *
 * Requirements & Invariants:
 * - Server-side authentication (ADMIN, SALES_OPERATOR only; VIEWER is rejected 403).
 * - CSRF verification on cookie sessions.
 * - Idempotency-Key support to prevent duplicate execution.
 * - Ineligible status rejection (400 for terminal business statuses).
 * - Pending-review conflict (409 if AWAITING_APPROVAL/INSUFFICIENT_EVIDENCE and allowRerun != true).
 * - Active run collision (409 if already RESEARCHING).
 * - Sanitized response payload (no raw HTML, no secrets, no internal credential leakage).
 */
export async function POST(req: Request) {
  // 1. Authenticate & Authorize
  const auth = authenticateRequest(req, ["ADMIN", "SALES_OPERATOR"]);
  if (!auth.success) {
    return jsonError(auth.status, auth.code, auth.message);
  }

  // 2. Parse JSON body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "Invalid JSON in request body");
  }

  // 3. Validate request schema
  const validation = RunAgentBodySchema.safeParse(rawBody);
  if (!validation.success) {
    return jsonError(
      400,
      "VALIDATION_ERROR",
      "Agent run input validation failed",
      validation.error.errors
    );
  }

  const { leadId, allowRerun, model, maxSteps, maxToolCalls, budgetLimitUsd } =
    validation.data;
  const leadRepo = new LeadRepository();
  const agentRepo = new AgentRepository();

  // 4. Idempotency lease check
  const idempotencyKey =
    req.headers.get("idempotency-key") || req.headers.get("x-idempotency-key");
  const idempotencyService = new IdempotencyService();

  if (idempotencyKey) {
    try {
      const payloadHash = computePayloadHash(validation.data);
      const lease = await idempotencyService.acquireOrGetResult(
        idempotencyKey,
        payloadHash
      );

      if (!lease.acquired) {
        return jsonSuccess(lease.cached.body, lease.cached.statusCode);
      }
    } catch (err: unknown) {
      if (err instanceof IdempotencyConflictError) {
        return jsonError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was previously used with a different request payload"
        );
      }
      console.error(
        "[POST /api/agent/run] Idempotency acquisition error:",
        err instanceof Error ? err.message : err
      );
      return jsonError(500, "INTERNAL_ERROR", "Failed to process idempotent request");
    }
  }

  // 5. Pre-flight lead status and conflict checks
  try {
    const { lead } = await leadRepo.getLeadWithAudit(leadId);
    if (!lead) {
      if (idempotencyKey) await idempotencyService.releaseLock(idempotencyKey);
      return jsonError(404, "NOT_FOUND", `Lead with ID '${leadId}' not found`);
    }

    // Ineligible business status check
    if (TERMINAL_STATUSES.has(lead.status)) {
      if (idempotencyKey) await idempotencyService.releaseLock(idempotencyKey);
      return jsonError(
        400,
        "INELIGIBLE_LEAD_STATUS",
        `Cannot initiate agent run: lead '${leadId}' is in non-eligible business status '${lead.status}'`
      );
    }

    // Pending review status check
    if (
      (lead.status === "AWAITING_APPROVAL" || lead.status === "INSUFFICIENT_EVIDENCE") &&
      !allowRerun
    ) {
      if (idempotencyKey) await idempotencyService.releaseLock(idempotencyKey);
      return jsonError(
        409,
        "PENDING_REVIEW_CONFLICT",
        `Lead '${leadId}' already has an evaluation pending operator review (status '${lead.status}'). Explicit allowRerun: true is required to rerun qualification.`
      );
    }

    // Active run collision check
    if (lead.status === "RESEARCHING") {
      if (idempotencyKey) await idempotencyService.releaseLock(idempotencyKey);
      return jsonError(
        409,
        "ACTIVE_RUN_COLLISION",
        `Lead '${leadId}' already has an active agent run in state 'RESEARCHING'. Concurrent active runs are prohibited.`
      );
    }
  } catch (err: unknown) {
    if (idempotencyKey) await idempotencyService.releaseLock(idempotencyKey);
    console.error(
      `[POST /api/agent/run] Error inspecting lead '${leadId}':`,
      err instanceof Error ? err.message : err
    );
    return jsonError(500, "INTERNAL_ERROR", "Failed to verify lead status");
  }

  // 6. Execute bounded Agent Pipeline
  // Note: Idempotency lease is acquired and completed at the HTTP API route boundary;
  // we do not pass idempotencyKey to the lower-level pipeline runner to prevent duplicate hash conflicts.
  try {
    const result = await runAgentPipeline({
      leadId,
      allowRerun,
      model,
      maxSteps,
      maxToolCalls,
      budgetLimitUsd,
      idempotencyKey: undefined,
      actorId: auth.user.actorId,
      actorRole: auth.user.role,
      agentRepo,
      leadRepo,
    });

    if (!result.success && result.error) {
      if (idempotencyKey) await idempotencyService.releaseLock(idempotencyKey);
      console.error("[POST /api/agent/run] Pipeline returned error:", result.error);

      let statusCode = 500;
      if (
        result.error.code === "INELIGIBLE_LEAD_STATUS" ||
        result.error.code === "BOUNDS_EXCEEDED"
      ) {
        statusCode = 400;
      } else if (
        result.error.code === "ACTIVE_RUN_COLLISION" ||
        result.error.code === "PENDING_REVIEW_CONFLICT"
      ) {
        statusCode = 409;
      } else if (result.error.code === "TIMED_OUT") {
        statusCode = 504;
      } else if (
        result.error.code === "BUDGET_EXCEEDED" ||
        result.error.code === "UNVERIFIABLE_COST_HALT" ||
        result.error.code === "MODEL_NOT_PERMITTED" ||
        result.error.code === "STEP_LIMIT_EXCEEDED" ||
        result.error.code === "TOOL_CALL_LIMIT_EXCEEDED"
      ) {
        statusCode = 422;
      }

      return jsonError(statusCode, result.error.code, result.error.message);
    }

    // 7. Format sanitized response payload (strictly omitting raw scraped HTML and internal secrets)
    const responsePayload = {
      run: {
        id: result.run.id,
        leadId: result.run.lead_id,
        state: result.run.state,
        currentStep: result.run.current_step,
        maxSteps: result.run.max_steps,
        toolCallsCount: result.run.tool_calls_count,
        maxToolCalls: result.run.max_tool_calls,
        accruedCostUsd: result.run.accrued_cost_usd,
        budgetLimitUsd: result.run.budget_limit_usd,
        createdAt: result.run.created_at,
        updatedAt: result.run.updated_at,
      },
      lead: {
        id: result.lead.id,
        companyName: result.lead.company_name,
        websiteUrl: result.lead.website_url,
        status: result.finalLeadStatus || result.lead.status,
      },
      research: result.research
        ? {
            industry: result.research.industry,
            companySize: result.research.company_size,
            offerings: result.research.offerings,
            techStack: result.research.tech_stack,
            summary: result.research.summary,
            contentHash: result.research.content_hash,
          }
        : null,
      score: result.score
        ? {
            score: result.score.score,
            confidence: result.score.confidence,
            evidenceCoverage: result.score.evidence_coverage,
            tier: result.score.tier,
            criteriaBreakdown: result.score.criteria_breakdown,
            missingInfo: result.score.missing_info,
            evidenceUrls: result.score.evidence_urls,
            rationale: result.score.rationale,
          }
        : null,
      residualRiskNote: result.residualRiskNote,
    };

    // 8. Commit idempotency record on success
    if (idempotencyKey) {
      await idempotencyService.completeExecution(
        idempotencyKey,
        201,
        responsePayload
      );
    }

    return jsonSuccess(responsePayload, 201);
  } catch (error: unknown) {
    if (idempotencyKey) await idempotencyService.releaseLock(idempotencyKey);
    console.error(
      `[POST /api/agent/run] Unexpected pipeline error for lead '${leadId}':`,
      error instanceof Error ? error.message : error
    );
    return jsonError(500, "INTERNAL_ERROR", "Pipeline execution encountered an unexpected error");
  }
}
