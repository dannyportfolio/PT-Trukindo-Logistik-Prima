import { LeadInputSchema, LeadListQuerySchema } from "@/types/lead";
import { LeadRepository } from "@/lib/lead-repository";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import {
  IdempotencyService,
  computePayloadHash,
  IdempotencyConflictError,
} from "@/lib/idempotency";

/**
 * POST /api/leads
 * Ingests a new sales lead manual entry and records an atomic append-only audit log.
 * Enforces PostgreSQL-persisted, concurrency-safe idempotency if Idempotency-Key header is present.
 */
export async function POST(req: Request) {
  // 1. Authentication & Authorization check (server-derived identity only)
  const auth = authenticateRequest(req);
  if (!auth.success) {
    return jsonError(auth.status, auth.code, auth.message);
  }

  // 2. Parse JSON Body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "Invalid JSON in request body");
  }

  // 3. Validate body against canonical LeadInputSchema
  const validation = LeadInputSchema.safeParse(rawBody);
  if (!validation.success) {
    return jsonError(
      400,
      "VALIDATION_ERROR",
      "Lead input validation failed",
      validation.error.errors
    );
  }

  // 4. Idempotency check with persistent storage and concurrency locks
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
        // Return existing completed execution result
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
        "[POST /api/leads] Idempotency lock acquisition failed:",
        err instanceof Error ? err.message : err
      );
      return jsonError(500, "INTERNAL_ERROR", "Failed to process idempotent request");
    }
  }

  // 5. Persist lead and audit log atomically in PostgreSQL
  try {
    const repo = new LeadRepository();
    const createdLead = await repo.createLead({
      companyName: validation.data.companyName,
      websiteUrl: validation.data.websiteUrl,
      contactName: validation.data.contactName,
      contactEmail: validation.data.contactEmail,
      actorId: auth.user.userId,
      actorRole: auth.user.role,
    });

    if (idempotencyKey) {
      await idempotencyService.completeExecution(
        idempotencyKey,
        201,
        createdLead
      );
    }

    return jsonSuccess(createdLead, 201);
  } catch (error: unknown) {
    if (idempotencyKey) {
      await idempotencyService.releaseLock(idempotencyKey);
    }
    console.error(
      "[POST /api/leads] Error creating lead:",
      error instanceof Error ? error.message : error
    );
    return jsonError(500, "INTERNAL_ERROR", "Failed to persist lead record");
  }
}

/**
 * GET /api/leads
 * Returns a server-side paginated list of leads with deterministic ordering and pagination metadata.
 */
export async function GET(req: Request) {
  // 1. Authentication & Authorization check (server-derived identity only)
  const auth = authenticateRequest(req);
  if (!auth.success) {
    return jsonError(auth.status, auth.code, auth.message);
  }

  // 2. Parse query parameters
  const { searchParams } = new URL(req.url);
  const queryParams: Record<string, string | undefined> = {};
  if (searchParams.has("page")) queryParams.page = searchParams.get("page")!;
  if (searchParams.has("limit")) queryParams.limit = searchParams.get("limit")!;
  if (searchParams.has("status")) queryParams.status = searchParams.get("status")!;
  if (searchParams.has("source")) queryParams.source = searchParams.get("source")!;

  // 3. Validate query parameters
  const validation = LeadListQuerySchema.safeParse(queryParams);
  if (!validation.success) {
    return jsonError(
      400,
      "VALIDATION_ERROR",
      "Invalid query parameters",
      validation.error.errors
    );
  }

  // 4. Fetch paginated records from PostgreSQL
  try {
    const repo = new LeadRepository();
    const result = await repo.listLeads({
      page: validation.data.page,
      limit: validation.data.limit,
      status: validation.data.status,
      source: validation.data.source,
    });

    return jsonSuccess(result, 200);
  } catch (error: unknown) {
    console.error(
      "[GET /api/leads] Error listing leads:",
      error instanceof Error ? error.message : error
    );
    return jsonError(500, "INTERNAL_ERROR", "Failed to retrieve lead list");
  }
}
