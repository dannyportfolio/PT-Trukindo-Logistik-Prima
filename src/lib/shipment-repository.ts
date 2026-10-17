/**
 * PT Trukindo Logistik Prima — Shipment & Telematics Repository
 * Handles tracking, milestone timeline, and high-frequency GPS telematics ingestion.
 * 
 * Security Boundary:
 * Strictly prevents cross-tenant commercial leakage by projecting only public-safe
 * transit indicators for external waybill lookups.
 */

import { getPool } from "./db";
import {
  Shipment,
  ShipmentStatus,
  EngineStatus,
  GeofenceStatus,
  PublicTrackingData,
  PublicTrackingMilestone,
  STATUS_LABELS,
  STATUS_ORDER,
  TelematicsWebhookPayload,
} from "../types/tracking";

export class ShipmentRepository {
  /**
   * Sanitizes driver full name to preserve personnel privacy (e.g., "Bambang Supriyanto" -> "Bambang S.")
   */
  private sanitizeDriverName(fullName: string): string {
    if (!fullName) return "Pengemudi Trukindo";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1][0]}.`;
  }

  /**
   * Finds shipment by unique waybill reference number (Internal view)
   */
  async findByWaybill(waybillNumber: string): Promise<Shipment | null> {
    const pool = getPool();
    const cleanWaybill = waybillNumber.trim().toUpperCase();

    const res = await pool.query(
      `SELECT * FROM shipments WHERE UPPER(waybill_number) = $1 LIMIT 1;`,
      [cleanWaybill]
    );

    if (res.rows.length === 0) return null;
    return this.mapShipmentRow(res.rows[0]);
  }

  /**
   * Safe public tracking lookup
   * Strictly shields commercial data, client names, and phone numbers.
   */
  async getPublicTracking(waybillNumber: string): Promise<PublicTrackingData | null> {
    const pool = getPool();
    const cleanWaybill = waybillNumber.trim().toUpperCase();

    const shipmentRes = await pool.query(
      `SELECT * FROM shipments WHERE UPPER(waybill_number) = $1 LIMIT 1;`,
      [cleanWaybill]
    );

    if (shipmentRes.rows.length === 0) return null;
    const shipment = this.mapShipmentRow(shipmentRes.rows[0]);

    const milestonesRes = await pool.query(
      `SELECT * FROM shipment_milestones 
       WHERE shipment_id = $1 
       ORDER BY recorded_at ASC;`,
      [shipment.id]
    );

    const milestones: PublicTrackingMilestone[] = milestonesRes.rows.map((row) => ({
      status: row.status as ShipmentStatus,
      statusLabel: STATUS_LABELS[row.status as ShipmentStatus] || row.status,
      title: row.title,
      locationName: row.location_name,
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null,
      notes: row.notes,
      handoverOfficer: row.handover_officer,
      recordedAt: new Date(row.recorded_at).toISOString(),
    }));

    const statusIndex = STATUS_ORDER.indexOf(shipment.status);

    return {
      waybillNumber: shipment.waybillNumber,
      status: shipment.status,
      statusLabel: STATUS_LABELS[shipment.status] || shipment.status,
      statusIndex: statusIndex >= 0 ? statusIndex : 0,
      originCity: shipment.originCity,
      destinationCity: shipment.destinationCity,
      serviceType: shipment.serviceType,
      truckType: shipment.truckType,
      licensePlate: shipment.licensePlate,
      driverName: this.sanitizeDriverName(shipment.driverName),
      cargoDescription: shipment.cargoDescription,
      estimatedTonnage: shipment.estimatedTonnage,
      currentLatitude: shipment.currentLatitude,
      currentLongitude: shipment.currentLongitude,
      currentSpeedKph: shipment.currentSpeedKph,
      engineStatus: shipment.engineStatus,
      lastTelematicsAt: shipment.lastTelematicsAt,
      estimatedArrivalAt: shipment.estimatedArrivalAt,
      actualArrivalAt: shipment.actualArrivalAt,
      milestones,
      isCompleted: shipment.status === "BONGKAR_SELESAI",
    };
  }

  /**
   * Ingests GPS telemetry ping from third-party vendor (McEasy / EasyGo)
   * Updates coordinates, speed, engine status, and triggers automated geofence milestone alerts.
   */
  async recordTelematics(
    payload: TelematicsWebhookPayload
  ): Promise<{ updated: boolean; shipmentId?: string; milestoneCreated?: boolean }> {
    const pool = getPool();
    const cleanPlate = payload.licensePlate.trim().toUpperCase();

    // 1. Locate active shipment matching license plate or specific waybill
    const shipmentQuery = `
      SELECT id, waybill_number, status, origin_city, destination_city, driver_name 
      FROM shipments 
      WHERE (UPPER(license_plate) = $1 OR ($2::text IS NOT NULL AND UPPER(waybill_number) = $2))
        AND status NOT IN ('BONGKAR_SELESAI', 'CANCELLED')
      ORDER BY created_at DESC 
      LIMIT 1;
    `;

    const cleanWaybill = payload.waybillNumber ? payload.waybillNumber.trim().toUpperCase() : null;
    const shipmentRes = await pool.query(shipmentQuery, [cleanPlate, cleanWaybill]);

    const shipment = shipmentRes.rows.length > 0 ? shipmentRes.rows[0] : null;
    const shipmentId = shipment ? shipment.id : null;

    // 2. Insert into telematics_logs
    await pool.query(
      `INSERT INTO telematics_logs (
        shipment_id, device_id, license_plate, latitude, longitude, speed_kph, engine_status, geofence_event, raw_vendor_payload, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());`,
      [
        shipmentId,
        payload.deviceId,
        cleanPlate,
        payload.latitude,
        payload.longitude,
        payload.speedKph,
        payload.engineStatus,
        payload.geofenceEvent || null,
        payload.rawPayload ? JSON.stringify(payload.rawPayload) : null,
      ]
    );

    if (!shipment) {
      return { updated: false, milestoneCreated: false };
    }

    // 3. Update current vehicle coordinates on active shipment
    let newStatus = shipment.status as ShipmentStatus;
    let geofenceStatus = "TRANSIT_CORRIDOR";
    let milestoneCreated = false;

    // Geofencing state transitions
    if (payload.geofenceEvent === "EXITED_ORIGIN" && shipment.status === "MUAT_SELESAI") {
      newStatus = "LINEHAUL_BERJALAN";
      geofenceStatus = "TRANSIT_CORRIDOR";

      await pool.query(
        `INSERT INTO shipment_milestones (
          shipment_id, status, title, location_name, latitude, longitude, notes, handover_officer
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          shipmentId,
          "LINEHAUL_BERJALAN",
          "Armada Berangkat Menuju Koridor Trans-Jawa (Geofence Alert: Exited Origin)",
          `Depo / Fasilitas Pengirim (${shipment.origin_city})`,
          payload.latitude,
          payload.longitude,
          `Deteksi otomatis GPS telematika: Armada telah meninggalkan area gudang pengirim. Kecepatan: ${payload.speedKph} km/jam.`,
          shipment.driver_name,
        ]
      );
      milestoneCreated = true;
    } else if (payload.geofenceEvent === "ENTERED_DESTINATION" && shipment.status === "LINEHAUL_BERJALAN") {
      newStatus = "TIBA_GUDANG_TUJUAN";
      geofenceStatus = "INSIDE_DESTINATION";

      await pool.query(
        `INSERT INTO shipment_milestones (
          shipment_id, status, title, location_name, latitude, longitude, notes, handover_officer
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          shipmentId,
          "TIBA_GUDANG_TUJUAN",
          "Armada Tiba di Gudang Tujuan (Geofence Alert: Entered Destination)",
          `Fasilitas Penerima (${shipment.destination_city})`,
          payload.latitude,
          payload.longitude,
          `Deteksi otomatis GPS telematika: Armada telah memasuki radius geofence gudang tujuan. Menunggu antrean bongkar muat.`,
          shipment.driver_name,
        ]
      );
      milestoneCreated = true;
    }

    await pool.query(
      `UPDATE shipments SET
        current_latitude = $1,
        current_longitude = $2,
        current_speed_kph = $3,
        engine_status = $4,
        geofence_status = $5,
        status = $6,
        last_telematics_at = NOW(),
        updated_at = NOW()
       WHERE id = $7;`,
      [
        payload.latitude,
        payload.longitude,
        payload.speedKph,
        payload.engineStatus,
        geofenceStatus,
        newStatus,
        shipmentId,
      ]
    );

    return { updated: true, shipmentId, milestoneCreated };
  }

  /**
   * Creates a new shipment record (Internal Ops use)
   */
  async createShipment(data: {
    waybillNumber: string;
    clientName: string;
    originCity: string;
    destinationCity: string;
    truckType: string;
    licensePlate: string;
    driverName: string;
    cargoDescription?: string;
    estimatedTonnage?: number;
    serviceType?: string;
    driverPhone?: string;
  }): Promise<Shipment> {
    const pool = getPool();
    const res = await pool.query(
      `INSERT INTO shipments (
        waybill_number, client_name, origin_city, destination_city,
        truckType: truck_type, license_plate, driver_name, cargo_description,
        estimated_tonnage, service_type, driver_phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;`,
      [
        data.waybillNumber,
        data.clientName,
        data.originCity,
        data.destinationCity,
        data.truckType,
        data.licensePlate,
        data.driverName,
        data.cargoDescription || null,
        data.estimatedTonnage || null,
        data.serviceType || "FTL_TRUCKING",
        data.driverPhone || null,
      ]
    );

    return this.mapShipmentRow(res.rows[0]);
  }

  private mapShipmentRow(row: Record<string, unknown>): Shipment {
    return {
      id: String(row.id),
      waybillNumber: String(row.waybill_number),
      leadId: row.lead_id ? String(row.lead_id) : null,
      clientName: String(row.client_name),
      originCity: String(row.origin_city),
      originAddress: row.origin_address ? String(row.origin_address) : null,
      destinationCity: String(row.destination_city),
      destinationAddress: row.destination_address ? String(row.destination_address) : null,
      serviceType: String(row.service_type),
      truckType: String(row.truck_type),
      licensePlate: String(row.license_plate),
      driverName: String(row.driver_name),
      driverPhone: row.driver_phone ? String(row.driver_phone) : null,
      cargoDescription: row.cargo_description ? String(row.cargo_description) : null,
      estimatedTonnage: row.estimated_tonnage ? Number(row.estimated_tonnage) : null,
      status: row.status as ShipmentStatus,
      currentLatitude: row.current_latitude ? Number(row.current_latitude) : null,
      currentLongitude: row.current_longitude ? Number(row.current_longitude) : null,
      currentSpeedKph: row.current_speed_kph ? Number(row.current_speed_kph) : 0,
      engineStatus: (row.engine_status as EngineStatus) || "ON",
      geofenceStatus: (row.geofence_status as GeofenceStatus) || "INSIDE_ORIGIN",
      lastTelematicsAt: row.last_telematics_at ? new Date(String(row.last_telematics_at)).toISOString() : null,
      estimatedArrivalAt: row.estimated_arrival_at ? new Date(String(row.estimated_arrival_at)).toISOString() : null,
      actualArrivalAt: row.actual_arrival_at ? new Date(String(row.actual_arrival_at)).toISOString() : null,
      handoverOfficer: row.handover_officer ? String(row.handover_officer) : null,
      handoverTimestamp: row.handover_timestamp ? new Date(String(row.handover_timestamp)).toISOString() : null,
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }
}
