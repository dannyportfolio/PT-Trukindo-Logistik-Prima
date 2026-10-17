import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getTracking } from "@/app/api/tracking/[waybill]/route";
import { POST as postTelematicsWebhook } from "@/app/api/telematics/webhook/route";
import { ShipmentRepository } from "@/lib/shipment-repository";

describe("API Route Handlers: Tracking & Telematics Webhook (/api/tracking & /api/telematics/webhook)", () => {
  describe("GET /api/tracking/[waybill]", () => {
    it("should reject waybill queries shorter than 3 characters with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/tracking/TR");
      const res = await getTracking(req, {
        params: Promise.resolve({ waybill: "TR" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("INVALID_WAYBILL");
    });

    it("should return 404 Not Found when waybill does not exist", async () => {
      vi.spyOn(ShipmentRepository.prototype, "getPublicTracking").mockResolvedValueOnce(null);

      const req = new Request("http://localhost:3000/api/tracking/TRK-NOTFOUND");
      const res = await getTracking(req, {
        params: Promise.resolve({ waybill: "TRK-NOTFOUND" }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("NOT_FOUND");
      expect(json.error.message).toContain("TRK-NOTFOUND");
    });

    it("should return 200 with sanitized tracking payload and zero commercial data leak", async () => {
      vi.spyOn(ShipmentRepository.prototype, "getPublicTracking").mockResolvedValueOnce({
        waybillNumber: "TRK-20261017-001",
        status: "LINEHAUL_BERJALAN",
        statusLabel: "Linehaul Berjalan",
        statusIndex: 1,
        originCity: "Cikarang",
        destinationCity: "Surabaya",
        serviceType: "FTL_TRUCKING",
        truckType: "TRONTON_WINGBOX",
        licensePlate: "B 9182 UXZ",
        driverName: "Bambang S.",
        currentLatitude: -6.9175,
        currentLongitude: 110.4188,
        currentSpeedKph: 68.5,
        engineStatus: "ON",
        milestones: [
          {
            status: "MUAT_SELESAI",
            statusLabel: "Muat Selesai",
            title: "Pemuatan Kargo Selesai",
            locationName: "Gudang Cikarang",
            recordedAt: "2026-10-17T04:00:00Z",
          },
        ],
        isCompleted: false,
      });

      const req = new Request("http://localhost:3000/api/tracking/TRK-20261017-001");
      const res = await getTracking(req, {
        params: Promise.resolve({ waybill: "TRK-20261017-001" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json).toBeDefined();
      expect(json.waybillNumber).toBe("TRK-20261017-001");
      expect(json.driverName).toBe("Bambang S.");
      expect(json.currentSpeedKph).toBe(68.5);
      expect(json.milestones.length).toBe(1);

      // Verify no sensitive commercial data leak in API response
      expect(json.clientName).toBeUndefined();
      expect(json.driverPhone).toBeUndefined();
      expect(json.contractPrice).toBeUndefined();
    });
  });

  describe("POST /api/telematics/webhook", () => {
    it("should reject requests without valid telematics secret with 401 Unauthorized", async () => {
      const req = new Request("http://localhost:3000/api/telematics/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telematics-secret": "wrong-secret",
        },
        body: JSON.stringify({
          provider: "MCEASY",
          licensePlate: "B 9182 UXZ",
          latitude: -6.5,
          longitude: 107.5,
        }),
      });

      const res = await postTelematicsWebhook(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject malformed telematics payload (invalid coordinates) with 400 Validation Error", async () => {
      const req = new Request("http://localhost:3000/api/telematics/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telematics-secret": "trukindo-telematics-secret-2026",
        },
        body: JSON.stringify({
          provider: "MCEASY",
          licensePlate: "B 9182 UXZ",
          latitude: 999, // INVALID (> 90)
          longitude: 107.5,
        }),
      });

      const res = await postTelematicsWebhook(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("should accept valid GPS telematics ping and return 200 with update status", async () => {
      vi.spyOn(ShipmentRepository.prototype, "recordTelematics").mockResolvedValueOnce({
        updated: true,
        shipmentId: "shipment-uuid-1",
        milestoneCreated: true,
      });

      const req = new Request("http://localhost:3000/api/telematics/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telematics-secret": "trukindo-telematics-secret-2026",
        },
        body: JSON.stringify({
          provider: "MCEASY",
          licensePlate: "B 9182 UXZ",
          deviceId: "MCEASY-001",
          latitude: -6.9175,
          longitude: 110.4188,
          speedKph: 72,
          engineStatus: "ON",
          geofenceEvent: "TRANSIT_CORRIDOR",
        }),
      });

      const res = await postTelematicsWebhook(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.updated).toBe(true);
      expect(json.milestoneCreated).toBe(true);
    });
  });
});
