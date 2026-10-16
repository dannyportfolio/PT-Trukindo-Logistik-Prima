import { z } from "zod";

/**
 * Confirmed logistics service categories
 */
export const ServiceCategorySchema = z.enum([
  "FTL_TRUCKING",
  "SCHEDULED_LINEHAUL",
  "CONTRACT_LOGISTICS",
]);

export type ServiceCategory = z.infer<typeof ServiceCategorySchema>;

/**
 * Accepted cargo classifications for ground transport
 */
export const CargoClassificationSchema = z.enum([
  "FMCG_CONSUMER_GOODS",
  "INDUSTRIAL_RAW_MATERIALS",
  "FINISHED_GOODS",
  "BUILDING_MATERIALS",
  "ELECTRONICS",
  "OTHER_GENERAL_CARGO",
]);

export type CargoClassification = z.infer<typeof CargoClassificationSchema>;

/**
 * Standard fleet truck preferences
 */
export const TruckTypePreferenceSchema = z.enum([
  "CDE_ENGKEL",
  "CDD_DOUBLE",
  "FUSO",
  "TRONTON_BOX",
  "TRONTON_WINGBOX",
  "TRAILER_20FT",
  "TRAILER_40FT",
  "ANY_APPROPRIATE",
]);

export type TruckTypePreference = z.infer<typeof TruckTypePreferenceSchema>;

/**
 * Shipping frequency options
 */
export const ShippingFrequencySchema = z.enum([
  "ONE_TIME",
  "WEEKLY",
  "MONTHLY",
  "CONTRACT_REGULAR",
  "CONSULTATION_NEEDED",
]);

export type ShippingFrequency = z.infer<typeof ShippingFrequencySchema>;

/**
 * Strict server-side Zod validation schema for inbound quotation and contact inquiries
 */
export const InquirySubmissionSchema = z.object({
  companyName: z
    .string({ required_error: "Nama perusahaan wajib diisi" })
    .trim()
    .min(2, "Nama perusahaan minimal 2 karakter")
    .max(255, "Nama perusahaan maksimal 255 karakter"),
  contactName: z
    .string({ required_error: "Nama kontak wajib diisi" })
    .trim()
    .min(2, "Nama kontak minimal 2 karakter")
    .max(255, "Nama kontak maksimal 255 karakter"),
  contactEmail: z
    .string({ required_error: "Email bisnis wajib diisi" })
    .trim()
    .min(1, "Email bisnis wajib diisi")
    .max(255, "Email maksimal 255 karakter")
    .email("Format email tidak valid")
    .toLowerCase(),
  contactPhone: z
    .string({ required_error: "Nomor WhatsApp/telepon wajib diisi" })
    .trim()
    .min(8, "Nomor telepon minimal 8 digit")
    .max(30, "Nomor telepon maksimal 30 karakter")
    .regex(/^[0-9+\-\s()]+$/, "Format nomor telepon tidak valid"),
  jobTitle: z
    .string()
    .trim()
    .max(100, "Jabatan maksimal 100 karakter")
    .optional()
    .or(z.literal("")),
  serviceCategory: ServiceCategorySchema.default("FTL_TRUCKING"),
  cargoType: CargoClassificationSchema,
  originCity: z
    .string({ required_error: "Kota/depo asal wajib diisi" })
    .trim()
    .min(2, "Kota asal minimal 2 karakter")
    .max(100, "Kota asal maksimal 100 karakter"),
  destinationCity: z
    .string({ required_error: "Kota/depo tujuan wajib diisi" })
    .trim()
    .min(2, "Kota tujuan minimal 2 karakter")
    .max(100, "Kota tujuan maksimal 100 karakter"),
  truckType: TruckTypePreferenceSchema.default("ANY_APPROPRIATE"),
  estimatedVolumeWeight: z
    .string()
    .trim()
    .max(100, "Estimasi tonase/volume maksimal 100 karakter")
    .optional()
    .or(z.literal("")),
  estimatedShippingFrequency: ShippingFrequencySchema.default("ONE_TIME"),
  firstLoadingDate: z
    .string()
    .trim()
    .max(50, "Jadwal muat maksimal 50 karakter")
    .optional()
    .or(z.literal("")),
  additionalNotes: z
    .string()
    .trim()
    .max(2000, "Catatan maksimal 2000 karakter")
    .optional()
    .or(z.literal("")),
  // Anti-Spam Defenses
  honeypot: z.string().max(0, "Aktivitas bot terdeteksi"), // Must be empty
  formRenderTimestamp: z
    .number({ required_error: "Timestamp form wajib disertakan" })
    .int()
    .positive(),
});

export type InquirySubmissionInput = z.infer<typeof InquirySubmissionSchema>;

export interface InquiryDetailsData {
  serviceCategory: ServiceCategory;
  cargoType: CargoClassification;
  originCity: string;
  destinationCity: string;
  truckType?: TruckTypePreference;
  estimatedVolumeWeight?: string;
  estimatedShippingFrequency?: ShippingFrequency;
  firstLoadingDate?: string;
  additionalNotes?: string;
  jobTitle?: string;
  submittedAt: string;
}

export interface InquiryResponse {
  success: boolean;
  inquiryId: string;
  referenceNumber: string;
  message: string;
}
