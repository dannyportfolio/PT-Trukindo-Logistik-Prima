import { z } from "zod";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { AgentRepository, RunNotFoundError } from "@/lib/agent/repository";
import { canCancelState } from "@/lib/agent/state-machine";

const UuidSchema = z.string().uuid("Run ID must be a valid UUID format");

const CancelBodySchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .optional();

/**
 * POST /api/agent/runs/[id]/cancel
 * Cancels an active or in-flight agent run, releasing active locks, transitioning
 * run state to CANCELLED, restoring the lead's previous business status, and
 * recording an immutable entry in audit_logs.
 *
 * Requirements:
 * - Server-side authentication (ADMIN, SALES_OPERATOR only; VIEWER is rejected 403).
 * - CSRF verification on cookie sessions.
 * - Rejects cancellation on non-cancellable or terminal states (409).
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
  const validation = UuidSchema.safeParse(id);
  if (!validation.success) {
    return jsonError(
      400,
      "INVALID_ID_FORMAT",
      "Run ID must be a valid UUID format",
      validation.error.errors
    );
  }

  // 4. Parse optional reason
  let reason: string | undefined;
  try {
    const text = await req.text();
    if (text && text.trim().length > 0) {
      const parsedBody = JSON.parse(text);
      const bodyValidation = CancelBodySchema.safeParse(parsedBody);
      if (bodyValidation.success && bodyValidation.data?.reason) {
        reason = bodyValidation.data.reason;
      }
    }
  } catch {
    // If not JSON or empty, proceed with default cancellation reason
  }

  try {
    const agentRepo = new AgentRepository();

    // 5. Check run existence and cancellability
    const currentRun = await agentRepo.getRun(id);
    if (!currentRun) {
      return jsonError(404, "NOT_FOUND", `Agent run with ID '${id}' was not found`);
    }

    if (!canCancelState(currentRun.state)) {
      return jsonError(
        409,
        "CANNOT_CANCEL_RUN",
        `Agent run '${id}' in state '${currentRun.state}' cannot be cancelled`
      );
    }

    // 6. Execute atomic cancellation and status restoration
    const cancelledRun = await agentRepo.cancelRun(id, {
      actorId: auth.user.actorId,
      actorRole: auth.user.role,
      reason: reason || "Cancelled by operator",
    });

    return jsonSuccess(
      {
        message: "Agent run successfully cancelled",
        run: {
          id: cancelledRun.id,
          leadId: cancelledRun.lead_id,
          state: cancelledRun.state,
          currentStep: cancelledRun.current_step,
          accruedCostUsd: cancelledRun.accrued_cost_usd,
          errorCode: cancelledRun.error_code,
          errorDetails: cancelledRun.error_details,
          updatedAt: cancelledRun.updated_at,
        },
      },
      200
    );
  } catch (error: unknown) {
    if (error instanceof RunNotFoundError) {
      return jsonError(404, "NOT_FOUND", error.message);
    }
    console.error(
      `[POST /api/agent/runs/${id}/cancel] Error cancelling run:`,
      error instanceof Error ? error.message : error
    );
    return jsonError(500, "INTERNAL_ERROR", "Failed to cancel agent run");
  }
}
