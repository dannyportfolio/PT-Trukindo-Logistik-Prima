import { TelematicsWebhookPayloadSchema } from "@/types/tracking";
import { ShipmentRepository } from "@/lib/shipment-repository";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { getConfig } from "@/lib/config";

/**
 * POST /api/telematics/webhook
 * Protected endpoint for third-party GPS telematics providers (McEasy, EasyGo).
 * Ingests live latitude/longitude, speed, engine status, and geofence entry/exit events.
 */
export async function POST(req: Request) {
  // 1. Authenticate GPS Vendor Request
  let expectedSecret = "trukindo-telematics-secret-2026";
  try {
    const config = getConfig();
    expectedSecret = config.TELEMATICS_WEBHOOK_SECRET;
  } catch {
    expectedSecret = process.env.TELEMATICS_WEBHOOK_SECRET || expectedSecret;
  }

  const incomingSecret =
    req.headers.get("x-telematics-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!incomingSecret || incomingSecret !== expectedSecret) {
    return jsonError(
      401,
      "UNAUTHORIZED",
      "Kredensial webhook telematika tidak valid atau tidak disertakan."
    );
  }

  // 2. Parse & Validate Payload
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "Format payload JSON tidak valid.");
  }

  const parseResult = TelematicsWebhookPayloadSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return jsonError(
      400,
      "VALIDATION_ERROR",
      "Validasi data telematika gagal.",
      parseResult.error.errors
    );
  }

  const payload = parseResult.data;

  // 3. Ingest Telematics Ping
  try {
    const repo = new ShipmentRepository();
    const result = await repo.recordTelematics(payload);

    return jsonSuccess({
      success: true,
      message: "Data telematika berhasil dicatat.",
      updated: result.updated,
      shipmentId: result.shipmentId || null,
      milestoneCreated: result.milestoneCreated || false,
    });
  } catch (err: unknown) {
    console.error("[POST /api/telematics/webhook] Error ingesting telemetry:", err);
    return jsonError(
      500,
      "INTERNAL_ERROR",
      "Gagal memproses data telematika armada ke dalam database."
    );
  }
}
