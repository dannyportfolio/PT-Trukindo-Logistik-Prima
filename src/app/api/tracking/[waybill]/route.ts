import { ShipmentRepository } from "@/lib/shipment-repository";
import { jsonError, jsonSuccess } from "@/lib/api-response";

/**
 * GET /api/tracking/[waybill]
 * Public Waybill & Resi Tracking Endpoint.
 * Strictly shields commercial contract rates, phone numbers, and cross-client data.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ waybill: string }> }
) {
  const { waybill } = await context.params;

  if (!waybill || waybill.trim().length < 3) {
    return jsonError(
      400,
      "INVALID_WAYBILL",
      "Nomor referensi atau surat jalan waybill tidak valid."
    );
  }

  const cleanWaybill = decodeURIComponent(waybill).trim().toUpperCase();

  try {
    const repo = new ShipmentRepository();
    const trackingData = await repo.getPublicTracking(cleanWaybill);

    if (!trackingData) {
      return jsonError(
        404,
        "NOT_FOUND",
        `Pengiriman dengan nomor referensi '${cleanWaybill}' tidak ditemukan. Mohon periksa kembali nomor Surat Jalan atau Waybill Anda.`
      );
    }

    return jsonSuccess(trackingData);
  } catch (err: unknown) {
    console.error(`[GET /api/tracking/${cleanWaybill}] Error:`, err);
    return jsonError(
      500,
      "INTERNAL_ERROR",
      "Terjadi kendala saat memproses pelacakan kargo. Silakan coba kembali."
    );
  }
}
