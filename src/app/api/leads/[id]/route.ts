import { z } from "zod";
import { LeadRepository } from "@/lib/lead-repository";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";

const UuidSchema = z.string().uuid("Lead ID must be a valid UUID format");

/**
 * GET /api/leads/[id]
 * Retrieves a single lead and its entire append-only audit trail.
 *
 * Requirements:
 * - Authentication & Authorization boundary (401 / 403).
 * - Distinguishes invalid ID format (400) from non-existent lead (404).
 * - Does not leak ownership or internal database details.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  // 1. Authentication & Authorization check
  const auth = authenticateRequest(req);
  if (!auth.success) {
    return jsonError(auth.status, auth.code, auth.message);
  }

  // 2. Resolve route parameters (Next.js 15 Promise-based params)
  const { id } = await context.params;

  // 3. Validate ID format (must be valid UUID)
  const validation = UuidSchema.safeParse(id);
  if (!validation.success) {
    return jsonError(
      400,
      "INVALID_ID_FORMAT",
      "Lead ID must be a valid UUID format",
      validation.error.errors
    );
  }

  // 4. Fetch lead and associated immutable audit history
  try {
    const repo = new LeadRepository();
    const result = await repo.getLeadWithAudit(id);

    if (!result.lead) {
      return jsonError(404, "NOT_FOUND", `Lead with ID '${id}' was not found`);
    }

    return jsonSuccess(
      {
        lead: result.lead,
        auditLogs: result.auditLogs,
      },
      200
    );
  } catch (error: unknown) {
    console.error(`[GET /api/leads/${id}] Error retrieving lead:`, error instanceof Error ? error.message : error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to retrieve lead details");
  }
}
