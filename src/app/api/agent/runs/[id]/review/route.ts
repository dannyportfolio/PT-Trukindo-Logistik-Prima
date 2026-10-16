import { z } from "zod";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { AgentRepository } from "@/lib/agent/repository";
import {
  LeadRepository,
  LeadNotFoundError,
  IllegalReviewStateError,
  OverrideRationaleRequiredError,
} from "@/lib/lead-repository";

const UuidSchema = z.string().uuid("Run ID must be a valid UUID format");

const ReviewBodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"], {
    errorMap: () => ({ message: "Decision must be either 'APPROVE' or 'REJECT'" }),
  }),
  rationale: z.string().max(1000, "Rationale cannot exceed 1000 characters").optional(),
  manualOverride: z.boolean().optional().default(false),
});

/**
 * POST /api/agent/runs/[id]/review
 * Allows submitting a human review decision via the agent run identifier.
 * Looks up the associated lead and updates its status through atomic review.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  // 1. Authenticate & Authorize
  const auth = authenticateRequest(req, ["ADMIN", "SALES_OPERATOR"]);
  if (!auth.success) {
    return jsonError(auth.status, auth.code, auth.message);
  }

  // 2. Resolve route parameters
  const { id } = await context.params;

  // 3. Validate ID format
  const uuidValidation = UuidSchema.safeParse(id);
  if (!uuidValidation.success) {
    return jsonError(
      400,
      "INVALID_ID_FORMAT",
      "Run ID must be a valid UUID format",
      uuidValidation.error.errors
    );
  }

  // 4. Parse JSON body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "Invalid JSON in request body");
  }

  // 5. Validate review decision schema
  const validation = ReviewBodySchema.safeParse(rawBody);
  if (!validation.success) {
    return jsonError(
      400,
      "VALIDATION_ERROR",
      "Review decision validation failed",
      validation.error.errors
    );
  }

  const { decision, rationale, manualOverride } = validation.data;

  try {
    const agentRepo = new AgentRepository();
    const run = await agentRepo.getRun(id);
    if (!run) {
      return jsonError(404, "NOT_FOUND", `Agent run with ID '${id}' was not found`);
    }

    const leadRepo = new LeadRepository();
    const updatedLead = await leadRepo.submitReviewDecision({
      leadId: run.lead_id,
      decision,
      rationale,
      manualOverride,
      actorId: auth.user.actorId,
      actorRole: auth.user.role,
    });

    return jsonSuccess(
      {
        message: `Review decision '${decision}' recorded successfully for run '${id}'`,
        lead: updatedLead,
      },
      200
    );
  } catch (error: unknown) {
    if (error instanceof LeadNotFoundError) {
      return jsonError(404, "NOT_FOUND", error.message);
    }
    if (error instanceof IllegalReviewStateError) {
      return jsonError(409, "ILLEGAL_REVIEW_STATE", error.message);
    }
    if (error instanceof OverrideRationaleRequiredError) {
      return jsonError(400, "OVERRIDE_RATIONALE_REQUIRED", error.message);
    }
    console.error(
      `[POST /api/agent/runs/${id}/review] Error submitting review decision:`,
      error instanceof Error ? error.message : error
    );
    return jsonError(500, "INTERNAL_ERROR", "Failed to submit agent run review decision");
  }
}
