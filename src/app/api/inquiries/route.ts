import { NextResponse } from "next/server";
import { InquirySubmissionSchema } from "@/types/inquiry";
import { LeadRepository } from "@/lib/lead-repository";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { inquiryRateLimiter, getClientIdentifier } from "@/lib/rate-limit";
import {
  IdempotencyService,
  computePayloadHash,
  IdempotencyConflictError,
} from "@/lib/idempotency";
import { sendInquiryConfirmationEmail } from "@/lib/notifications/email-service";
import { dispatchSalesAlert } from "@/lib/notifications/sales-alert";

/**
 * Minimum human interaction time before submission (3 seconds)
 */
const MIN_SUBMISSION_TIME_MS = 3000;

/**
 * Maximum requests allowed per rolling hour per IP
 */
const INQUIRY_RATE_LIMIT_HOURLY = 5;
const INQUIRY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedConfig = process.env.CORS_ALLOWED_ORIGINS;

  let allowOrigin = "*";
  if (allowedConfig && allowedConfig !== "*") {
    const list = allowedConfig.split(",").map((s) => s.trim().toLowerCase());
    if (origin && list.includes(origin.toLowerCase())) {
      allowOrigin = origin;
    } else {
      allowOrigin = list[0] || "*";
    }
  } else if (origin) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key, x-idempotency-key",
    "Access-Control-Max-Age": "86400",
  };
}

function applyCors(response: NextResponse, corsHeaders: Record<string, string>): NextResponse {
  Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}

export async function OPTIONS(req: Request) {
  const headers = getCorsHeaders(req);
  return new Response(null, {
    status: 204,
    headers,
  });
}

/**
 * POST /api/inquiries
 * Public quotation and contact inquiry ingestion endpoint.
 *
 * Security & Anti-Spam Defenses:
 * - In-memory sliding-window rate limit (5 req/hr per IP)
 * - Honeypot trap rejection (must be empty)
 * - Minimum interaction time bound (>= 3000ms from form mount)
 * - Strict Zod schema validation
 * - Concurrency & retry idempotency protection via Idempotency-Key
 * - Atomic persistence in PostgreSQL (leads + audit_logs)
 * - Decoupled from AI agents (buffered as INGESTED, zero automatic scraping)
 * - CORS support for cross-origin submissions from static frontends
 */
export async function POST(req: Request) {
  const corsHeaders = getCorsHeaders(req);

  // 1. IP Rate Limiting Check
  const clientIp = getClientIdentifier(req);
  const rateLimitStatus = inquiryRateLimiter.consume(
    clientIp,
    INQUIRY_RATE_LIMIT_HOURLY,
    INQUIRY_WINDOW_MS
  );

  if (!rateLimitStatus.allowed) {
    const retryAfter = rateLimitStatus.retryAfterSeconds || 3600;
    const res = jsonError(
      429,
      "RATE_LIMIT_EXCEEDED",
      `Batas pengiriman formulir tercapai (maksimal ${INQUIRY_RATE_LIMIT_HOURLY} permintaan per jam). Silakan coba lagi dalam ${retryAfter} detik.`
    );
    res.headers.set("Retry-After", String(retryAfter));
    return applyCors(res, corsHeaders);
  }

  // 2. Parse JSON Body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return applyCors(
      jsonError(400, "BAD_REQUEST", "Format JSON dalam request tidak valid"),
      corsHeaders
    );
  }

  if (typeof rawBody !== "object" || rawBody === null) {
    return applyCors(
      jsonError(400, "BAD_REQUEST", "Payload formulir harus berupa objek JSON"),
      corsHeaders
    );
  }

  const payload = rawBody as Record<string, unknown>;

  // 3. Bot Defense: Honeypot Check
  if (typeof payload.honeypot === "string" && payload.honeypot.trim() !== "") {
    // Honeypot field filled by bot script
    return applyCors(
      jsonError(
        422,
        "BOT_DETECTED",
        "Permintaan ditolak oleh filter keamanan anti-spam."
      ),
      corsHeaders
    );
  }

  // 4. Bot Defense: Minimum Form Interaction Threshold (>= 3s)
  const formRenderTimestamp = Number(payload.formRenderTimestamp);
  const now = Date.now();

  if (
    !formRenderTimestamp ||
    isNaN(formRenderTimestamp) ||
    now - formRenderTimestamp < MIN_SUBMISSION_TIME_MS ||
    formRenderTimestamp > now + 60000 // Future timestamp manipulation
  ) {
    return applyCors(
      jsonError(
        422,
        "SUBMISSION_TOO_FAST",
        "Pengisian formulir terdeteksi terlalu cepat. Mohon periksa kembali data sebelum mengirimkan."
      ),
      corsHeaders
    );
  }

  // 5. Strict Zod Schema Validation
  const validation = InquirySubmissionSchema.safeParse(rawBody);
  if (!validation.success) {
    return applyCors(
      jsonError(
        400,
        "VALIDATION_ERROR",
        "Validasi data permintaan penawaran gagal",
        validation.error.errors
      ),
      corsHeaders
    );
  }

  const data = validation.data;

  // 6. Concurrency / Idempotency Check
  const idempotencyKey =
    req.headers.get("idempotency-key") || req.headers.get("x-idempotency-key");
  const idempotencyService = new IdempotencyService();

  if (idempotencyKey) {
    try {
      const payloadHash = computePayloadHash(data);
      const lease = await idempotencyService.acquireOrGetResult(
        idempotencyKey,
        payloadHash
      );

      if (!lease.acquired) {
        return applyCors(
          jsonSuccess(lease.cached.body, lease.cached.statusCode),
          corsHeaders
        );
      }
    } catch (err: unknown) {
      if (err instanceof IdempotencyConflictError) {
        return applyCors(
          jsonError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key telah digunakan sebelumnya dengan payload data yang berbeda"
          ),
          corsHeaders
        );
      }
      console.error(
        "[POST /api/inquiries] Idempotency lock acquisition failed:",
        err instanceof Error ? err.message : err
      );
      return applyCors(
        jsonError(500, "INTERNAL_ERROR", "Gagal memproses idempotency request"),
        corsHeaders
      );
    }
  }

  // 7. Atomic Database Persistence
  try {
    const repo = new LeadRepository();
    const createdLead = await repo.createInboundInquiry({
      companyName: data.companyName,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      inquiryDetails: {
        serviceCategory: data.serviceCategory,
        cargoType: data.cargoType,
        originCity: data.originCity,
        destinationCity: data.destinationCity,
        truckType: data.truckType,
        estimatedVolumeWeight: data.estimatedVolumeWeight || null,
        estimatedShippingFrequency: data.estimatedShippingFrequency,
        firstLoadingDate: data.firstLoadingDate || null,
        additionalNotes: data.additionalNotes || null,
        jobTitle: data.jobTitle || null,
        submittedAt: new Date().toISOString(),
      },
      actorId: "public_inquiry",
      actorRole: "public_inquiry",
    });

    const referenceNumber = `TRK-${createdLead.id.slice(0, 8).toUpperCase()}`;

    // Milestone 2 Issue #2: Asynchronously dispatch confirmation email and internal sales alert (fail-safe non-blocking)
    const notificationPayload = {
      referenceNumber,
      companyName: data.companyName,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      jobTitle: data.jobTitle,
      originCity: data.originCity,
      destinationCity: data.destinationCity,
      serviceCategory: data.serviceCategory,
      cargoType: data.cargoType,
      truckType: data.truckType,
      estimatedVolumeWeight: data.estimatedVolumeWeight,
      estimatedShippingFrequency: data.estimatedShippingFrequency,
      firstLoadingDate: data.firstLoadingDate,
      additionalNotes: data.additionalNotes,
      submittedAt: new Date().toISOString(),
    };

    Promise.allSettled([
      sendInquiryConfirmationEmail(notificationPayload),
      dispatchSalesAlert(notificationPayload),
    ]).catch((err) => {
      console.warn("[POST /api/inquiries] Failed background notification dispatch:", err);
    });

    const responsePayload = {
      success: true,
      inquiryId: createdLead.id,
      referenceNumber,
      message:
        "Permintaan penawaran Anda telah berhasil dikirim dan tersimpan. Tim komersial PT Trukindo Logistik Prima akan meninjau spesifikasi muatan Anda.",
    };

    if (idempotencyKey) {
      await idempotencyService.completeExecution(
        idempotencyKey,
        201,
        responsePayload
      );
    }

    return applyCors(jsonSuccess(responsePayload, 201), corsHeaders);
  } catch (error: unknown) {
    if (idempotencyKey) {
      await idempotencyService.releaseLock(idempotencyKey);
    }

    console.error(
      "[POST /api/inquiries] Failed to persist inquiry:",
      error instanceof Error ? error.message : error
    );

    return applyCors(
      jsonError(
        500,
        "INTERNAL_ERROR",
        "Terjadi kendala internal saat menyimpan permintaan penawaran. Silakan coba kembali."
      ),
      corsHeaders
    );
  }
}
