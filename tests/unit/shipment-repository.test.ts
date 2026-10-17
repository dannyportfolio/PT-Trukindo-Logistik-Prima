import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShipmentRepository } from "@/lib/shipment-repository";
import * as dbModule from "@/lib/db";
import { TelematicsWebhookPayload } from "@/types/tracking";

describe("Milestone 4 Issue #6: ShipmentRepository & Telematics Ingestion Suite", () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let repo: ShipmentRepository;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
    vi.spyOn(dbModule, "getPool").mockReturnValue(mockPool as any);
    repo = new ShipmentRepository();
  });

  describe("1. Public Tracking Data Projection & Privacy Boundary", () => {
    it("should project public tracking view and strictly shield client commercial data & phone numbers", async () => {
      // Mock database returning shipment with sensitive internal & client data
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: "550e8400-e29b-41d4-a716-446655440000",
              waybill_number: "TRK-20261017-001",
              client_name: "PT Rahasia Komersial Tbk", // SENSITIVE
              origin_city: "Cikarang",
              destination_city: "Surabaya",
              service_type: "FTL_TRUCKING",
              truck_type: "TRONTON_WINGBOX",
              license_plate: "B 9182 UXZ",
              driver_name: "Bambang Supriyanto",
              driver_phone: "+6281288990011", // SENSITIVE
              cargo_description: "Palet Makanan Biskuit",
              estimated_tonnage: "18.50",
              status: "LINEHAUL_BERJALAN",
              current_latitude: -6.9175,
              current_longitude: 110.4188,
              current_speed_kph: 68.5,
              engine_status: "ON",
              geofence_status: "TRANSIT_CORRIDOR",
              last_telematics_at: "2026-10-17T12:00:00Z",
              estimated_arrival_at: "2026-10-17T18:00:00Z",
              created_at: "2026-10-17T04:00:00Z",
              updated_at: "2026-10-17T12:00:00Z",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "milestone-1",
              status: "MUAT_SELESAI",
              title: "Pemuatan Selesai",
              location_name: "Gudang Cikarang",
              latitude: -6.35,
              longitude: 107.16,
              notes: "32 palet dimuat utuh",
              handover_officer: "Agus Santoso",
              recorded_at: "2026-10-17T04:30:00Z",
            },
          ],
        });

      const tracking = await repo.getPublicTracking("TRK-20261017-001");

      expect(tracking).toBeDefined();
      expect(tracking?.waybillNumber).toBe("TRK-20261017-001");
      expect(tracking?.status).toBe("LINEHAUL_BERJALAN");
      expect(tracking?.statusLabel).toBe("Linehaul Berjalan");
      expect(tracking?.statusIndex).toBe(1); // Second step in STATUS_ORDER
      expect(tracking?.originCity).toBe("Cikarang");
      expect(tracking?.destinationCity).toBe("Surabaya");

      // Privacy: Driver full name must be sanitized to first name + initial
      expect(tracking?.driverName).toBe("Bambang S.");

      // Strict Privacy Verification: Sensitive commercial fields must NOT exist in public tracking object
      expect((tracking as any).clientName).toBeUndefined();
      expect((tracking as any).driverPhone).toBeUndefined();
      expect((tracking as any).commercialRate).toBeUndefined();

      // Milestones timeline verified
      expect(tracking?.milestones.length).toBe(1);
      expect(tracking?.milestones[0].locationName).toBe("Gudang Cikarang");
    });

    it("should return null when waybill does not exist in database", async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const tracking = await repo.getPublicTracking("TRK-NONEXISTENT");
      expect(tracking).toBeNull();
    });
  });

  describe("2. Telematics GPS Ingestion & Automated Geofencing Alerts", () => {
    it("should record telematics ping and trigger EXITED_ORIGIN geofence state transition to LINEHAUL_BERJALAN", async () => {
      // 1. Shipment lookup returns MUAT_SELESAI shipment
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: "shipment-uuid-1",
              waybill_number: "TRK-20261017-001",
              status: "MUAT_SELESAI",
              origin_city: "Cikarang",
              destination_city: "Surabaya",
              driver_name: "Bambang Supriyanto",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // telematics_logs insert
        .mockResolvedValueOnce({ rows: [] }) // milestone insert
        .mockResolvedValueOnce({ rows: [] }); // shipment update

      const payload: TelematicsWebhookPayload = {
        provider: "MCEASY",
        licensePlate: "B 9182 UXZ",
        deviceId: "MCEASY-GPS-099",
        latitude: -6.4421,
        longitude: 107.4562,
        speedKph: 65,
        engineStatus: "ON",
        geofenceEvent: "EXITED_ORIGIN",
      };

      const result = await repo.recordTelematics(payload);

      expect(result.updated).toBe(true);
      expect(result.milestoneCreated).toBe(true);
      expect(result.shipmentId).toBe("shipment-uuid-1");

      // Verify milestone insertion was called with LINEHAUL_BERJALAN
      const milestoneCall = mockPool.query.mock.calls.find((call) =>
        call[0].includes("INSERT INTO shipment_milestones")
      );
      expect(milestoneCall).toBeDefined();
      expect(milestoneCall![1][1]).toBe("LINEHAUL_BERJALAN");
      expect(milestoneCall![1][2]).toContain("Exited Origin");
    });

    it("should record telematics ping and trigger ENTERED_DESTINATION geofence transition to TIBA_GUDANG_TUJUAN", async () => {
      // 1. Shipment lookup returns LINEHAUL_BERJALAN shipment
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: "shipment-uuid-2",
              waybill_number: "TRK-20261017-002",
              status: "LINEHAUL_BERJALAN",
              origin_city: "Jakarta",
              destination_city: "Surabaya",
              driver_name: "Dedi K.",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // telematics_logs insert
        .mockResolvedValueOnce({ rows: [] }) // milestone insert
        .mockResolvedValueOnce({ rows: [] }); // shipment update

      const payload: TelematicsWebhookPayload = {
        provider: "EASYGO",
        licensePlate: "B 9471 TLP",
        deviceId: "EASYGO-GPS-88",
        latitude: -7.3195,
        longitude: 112.7521,
        speedKph: 15,
        engineStatus: "IDLE",
        geofenceEvent: "ENTERED_DESTINATION",
      };

      const result = await repo.recordTelematics(payload);

      expect(result.updated).toBe(true);
      expect(result.milestoneCreated).toBe(true);

      const milestoneCall = mockPool.query.mock.calls.find((call) =>
        call[0].includes("INSERT INTO shipment_milestones")
      );
      expect(milestoneCall).toBeDefined();
      expect(milestoneCall![1][1]).toBe("TIBA_GUDANG_TUJUAN");
    });

    it("should log telemetry ping even if no active shipment matches the plate without error", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no active shipment found
        .mockResolvedValueOnce({ rows: [] }); // telematics_logs insert

      const payload: TelematicsWebhookPayload = {
        provider: "GENERIC_GPS",
        licensePlate: "D 9999 UNREGISTERED",
        deviceId: "GPS-UNASSIGNED",
        latitude: -6.2,
        longitude: 106.8,
        speedKph: 0,
        engineStatus: "OFF",
      };

      const result = await repo.recordTelematics(payload);

      expect(result.updated).toBe(false);
      expect(result.milestoneCreated).toBe(false);

      // Verified log was still recorded
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });
});
