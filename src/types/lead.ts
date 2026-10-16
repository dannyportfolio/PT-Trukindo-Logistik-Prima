import { z } from "zod";

/**
 * Lead Status Enum matching PostgreSQL chk_lead_status constraint
 */
export const LeadStatusSchema = z.enum([
  "INGESTED",
  "RESEARCHING",
  "AWAITING_APPROVAL",
  "INSUFFICIENT_EVIDENCE",
  "QUALIFIED",
  "DISQUALIFIED",
  "PROPOSAL_DRAFTED",
  "OUTREACH_ACTIVE",
  "ARCHIVED",
  "FAILED",
]);

export type LeadStatus = z.infer<typeof LeadStatusSchema>;

/**
 * Website URL validation schema:
 * - Must be trimmed
 * - Must be valid HTTP or HTTPS protocol (rejects javascript:, ftp:, data:, etc.)
 * - Max length 2048 characters
 */
export const WebsiteUrlSchema = z
  .string({ required_error: "Website URL is required" })
  .trim()
  .min(1, "Website URL is required")
  .max(2048, "Website URL cannot exceed 2048 characters")
  .refine(
    (val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Website URL must be a valid HTTP or HTTPS URL" }
  );

/**
 * Email validation schema:
 * - Must be trimmed
 * - Must be a valid email format
 * - Lowercased for normalization
 * - Max length 255 characters
 */
export const ContactEmailSchema = z
  .string({ required_error: "Contact email is required" })
  .trim()
  .min(1, "Contact email is required")
  .max(255, "Contact email cannot exceed 255 characters")
  .email("Invalid contact email format")
  .toLowerCase();

/**
 * Required bounded text field schema (companyName, contactName)
 */
export const BoundedTextSchema = (fieldName: string, maxLength: number = 255) =>
  z
    .string({ required_error: `${fieldName} is required` })
    .trim()
    .min(1, `${fieldName} is required`)
    .max(maxLength, `${fieldName} cannot exceed ${maxLength} characters`);

/**
 * Canonical LeadInput schema for manual ingestion and validated domain input
 */
export const LeadInputSchema = z.object({
  companyName: BoundedTextSchema("Company name", 255),
  websiteUrl: WebsiteUrlSchema,
  contactName: BoundedTextSchema("Contact name", 255),
  contactEmail: ContactEmailSchema,
});

export type LeadInput = z.infer<typeof LeadInputSchema>;

/**
 * Raw CSV Row representation: mapping of header column strings to cell values
 */
export type RawCsvRow = Record<string, string | undefined>;

/**
 * Canonical CSV Lead Row schema:
 * Supports canonical keys (companyName, websiteUrl, contactName, contactEmail)
 * as well as standard CSV snake_case / display header variations.
 */
export const CsvLeadRowSchema = z
  .object({
    companyName: z.string().optional(),
    websiteUrl: z.string().optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().optional(),
    // Allow raw header aliases
    company_name: z.string().optional(),
    "Company Name": z.string().optional(),
    website_url: z.string().optional(),
    Website: z.string().optional(),
    contact_name: z.string().optional(),
    "Contact Name": z.string().optional(),
    contact_email: z.string().optional(),
    "Contact Email": z.string().optional(),
    email: z.string().optional(),
    Email: z.string().optional(),
  })
  .passthrough()
  .transform((raw) => {
    const company =
      raw.companyName ?? raw.company_name ?? raw["Company Name"] ?? "";
    const website =
      raw.websiteUrl ?? raw.website_url ?? raw.Website ?? "";
    const contact =
      raw.contactName ?? raw.contact_name ?? raw["Contact Name"] ?? "";
    const email =
      raw.contactEmail ?? raw.contact_email ?? raw["Contact Email"] ?? raw.email ?? raw.Email ?? "";

    return {
      companyName: company,
      websiteUrl: website,
      contactName: contact,
      contactEmail: email,
    };
  })
  .pipe(LeadInputSchema);

export type CsvLeadRow = z.infer<typeof CsvLeadRowSchema>;

/**
 * Schema for GET /api/leads pagination and filtering query parameters
 */
export const LeadListQuerySchema = z.object({
  page: z.coerce
    .number({ invalid_type_error: "Page must be an integer" })
    .int("Page must be an integer")
    .min(1, "Page must be greater than or equal to 1")
    .default(1),
  limit: z.coerce
    .number({ invalid_type_error: "Limit must be an integer" })
    .int("Limit must be an integer")
    .min(1, "Limit must be greater than or equal to 1")
    .max(100, "Limit cannot exceed 100")
    .default(20),
  status: LeadStatusSchema.optional(),
  source: z.string().trim().max(50).optional(),
});

export type LeadListQuery = z.infer<typeof LeadListQuerySchema>;
