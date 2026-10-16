import { z } from "zod";

/**
 * Logistics-Adapted Fact Extraction Schema
 * Staged for PT Trukindo Logistik Prima freight qualification.
 * Captures manufacturing activity, distribution facilities, cargo mentions, and freight demand signals.
 */
export const LogisticsExtractedFactsSchema = z.object({
  industry: z.string().nullable().default(null),
  company_size: z.string().nullable().default(null),
  logistics_demand_signals: z.array(z.string().max(255)).max(15).default([]),
  cargo_types_mentioned: z.array(z.string().max(255)).max(15).default([]),
  facility_locations: z.array(z.string().max(255)).max(15).default([]),
  summary: z.string().max(1000).nullable().default(null),
  evidence_urls: z.array(z.string().url()).max(20).default([]),
});

export type LogisticsExtractedFacts = z.infer<typeof LogisticsExtractedFactsSchema>;

/**
 * Validated container for logistics facts with strict domain evidence scoping
 */
export interface ValidatedLogisticsFacts {
  leadWebsiteUrl: string;
  leadDomain: string;
  industry: string | null;
  company_size: string | null;
  logistics_demand_signals: string[];
  cargo_types_mentioned: string[];
  facility_locations: string[];
  summary: string | null;
  evidence_urls: string[];
  warnings: string[];
}
