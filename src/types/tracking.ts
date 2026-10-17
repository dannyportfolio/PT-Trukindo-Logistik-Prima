import { z } from "zod";

/**
 * Standard Trukindo Logistics Transit Status Progression
 */
export const SHIPMENT_STATUSES = [
  "MUAT_SELESAI",
  "LINEHAUL_BERJALAN",
  "TRANSIT_FERRY",
  "TIBA_GUDANG_TUJUAN",
  "BONGKAR_SELESAI",
  "CANCELLED",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  MUAT_SELESAI: "Muat Selesai",
  LINEHAUL_BERJALAN: "Linehaul Berjalan",
  TRANSIT_FERRY: "Transit Penyeberangan Ferry",
  TIBA_GUDANG_TUJUAN: "Tiba di Gudang Tujuan",
  BONGKAR_SELESAI: "Bongkar Selesai",
  CANCELLED: "Dibatalkan",
};

export const STATUS_ORDER: ShipmentStatus[] = [
  "MUAT_SELESAI",
  "LINEHAUL_BERJALAN",
  "TRANSIT_FERRY",
  "TIBA_GUDANG_TUJUAN",
  "BONGKAR_SELESAI",
];

export type GeofenceStatus =
  | "INSIDE_ORIGIN"
  | "TRANSIT_CORRIDOR"
  | "APPROACHING_DESTINATION"
  | "INSIDE_DESTINATION";

export type EngineStatus = "ON" | "OFF" | "IDLE";

/**
 * Internal Database Shipment Entity
 */
export interface Shipment {
  id: string;
  waybillNumber: string;
  leadId?: string | null;
  clientName: string;
  originCity: string;
  originAddress?: string | null;
  destinationCity: string;
  destinationAddress?: string | null;
  serviceType: string;
  truckType: string;
  licensePlate: string;
  driverName: string;
  driverPhone?: string | null;
  cargoDescription?: string | null;
  estimatedTonnage?: number | null;
  status: ShipmentStatus;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  currentSpeedKph?: number;
  engineStatus?: EngineStatus;
  geofenceStatus?: GeofenceStatus;
  lastTelematicsAt?: string | null;
  estimatedArrivalAt?: string | null;
  actualArrivalAt?: string | null;
  handoverOfficer?: string | null;
  handoverTimestamp?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transit Milestone / Custody Handover Event
 */
export interface ShipmentMilestone {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  title: string;
  locationName: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  handoverOfficer?: string | null;
  recordedAt: string;
  createdAt: string;
}

/**
 * Public Sanitized Tracking View
 * Strictly shields commercial contract rates, phone numbers, and cross-client data.
 */
export interface PublicTrackingMilestone {
  status: ShipmentStatus;
  statusLabel: string;
  title: string;
  locationName: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  handoverOfficer?: string | null;
  recordedAt: string;
}

export interface PublicTrackingData {
  waybillNumber: string;
  status: ShipmentStatus;
  statusLabel: string;
  statusIndex: number; // 0 to 4 in active progress
  originCity: string;
  destinationCity: string;
  serviceType: string;
  truckType: string;
  licensePlate: string;
  driverName: string; // Sanitized (e.g. "Bambang S.")
  cargoDescription?: string | null;
  estimatedTonnage?: number | null;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  currentSpeedKph?: number;
  engineStatus?: EngineStatus;
  lastTelematicsAt?: string | null;
  estimatedArrivalAt?: string | null;
  actualArrivalAt?: string | null;
  milestones: PublicTrackingMilestone[];
  isCompleted: boolean;
}

/**
 * Telematics GPS Webhook Payload Schema (McEasy / EasyGo / Generic)
 */
export const TelematicsWebhookPayloadSchema = z.object({
  provider: z.enum(["MCEASY", "EASYGO", "GENERIC_GPS"]).default("MCEASY"),
  licensePlate: z
    .string({ required_error: "licensePlate wajib disertakan" })
    .trim()
    .min(3)
    .max(20),
  waybillNumber: z.string().trim().optional(),
  deviceId: z.string().trim().min(1).default("GPS-DEV-001"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speedKph: z.number().min(0).max(200).default(0),
  engineStatus: z.enum(["ON", "OFF", "IDLE"]).default("ON"),
  geofenceEvent: z
    .enum([
      "ENTERED_ORIGIN",
      "EXITED_ORIGIN",
      "TRANSIT_CORRIDOR",
      "APPROACHING_DESTINATION",
      "ENTERED_DESTINATION",
      "EXITED_DESTINATION",
    ])
    .optional(),
  timestamp: z.string().or(z.number()).optional(),
  rawPayload: z.record(z.unknown()).optional(),
});

export type TelematicsWebhookPayload = z.infer<typeof TelematicsWebhookPayloadSchema>;
