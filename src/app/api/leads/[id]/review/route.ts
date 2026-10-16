import { z } from "zod";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import {
  LeadRepository,
  LeadNotFoundError,
  IllegalReviewStateError,
  OverrideRationaleRequiredError,
} from "@/lib/lead-repository";

const UuidSchema = z.string().uuid("Lead ID must be a valid UUID format");

const ReviewBodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"], {
    errorMap: () => ({ message: "Decision must be either 'APPROVE' or 'REJECT'" }),
  }),
  rationale: z.string().max(1000, "Rationale cannot exceed 1000 characters").optional(),
  manualOverride: z.boolean().optional().default(false),
});

/**
 * POST /api/leads/[id]/review
 * Submits an authenticated Human-in-the-Loop review decision on an evaluated lead.
 *
 * Rules:
 * - Only ADMIN and SALES_OPERATOR can submit review decisions (VIEWER is 403 Forbidden).
 * - CSRF verification enforced for cookie sessions.
 * - Allowed only when lead is in AWAITING_APPROVAL or INSUFFICIENT_EVIDENCE (409 otherwise).
 * - APPROVE on INSUFFICIENT_EVIDENCE strictly requires manualOverride: true and a non-empty rationale (400 otherwise).
 * - Updates lead status to QUALIFIED (on APPROVE) or DISQUALIFIED (on REJECT).
 * - Records immutable HUMAN_REVIEW_DECISION audit log entry inside the same database transaction.
 * - Prior research and score records are strictly preserved.
 * - Zero automated outreach is triggered.
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
      "Lead ID must be a valid UUID format",
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

  // 6. Execute atomic review decision
  try {
    const leadRepo = new LeadRepository();
    const updatedLead = await leadRepo.submitReviewDecision({
      leadId: id,
      decision,
      rationale,
      manualOverride,
      actorId: auth.user.actorId,
      actorRole: auth.user.role,
    });

    return jsonSuccess(
      {
        message: `Lead review decision '${decision}' recorded successfully`,
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
      `[POST /api/leads/${id}/review] Error recording review decision:`,
      error instanceof Error ? error.message : error
    );
    return jsonError(500, "INTERNAL_ERROR", "Failed to submit lead review decision");
  }
}
