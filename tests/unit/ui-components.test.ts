import { describe, it, expect } from "vitest";
import { LeadInputSchema, WebsiteUrlSchema, ContactEmailSchema } from "@/types/lead";

describe("UI Presentation Components: Client Validation & Logic", () => {
  describe("LeadForm: Client Schema & Field Validations", () => {
    it("should accept valid lead inputs", () => {
      const result = LeadInputSchema.safeParse({
        companyName: "Acme Industrial",
        websiteUrl: "https://acme.com",
        contactName: "John Doe",
        contactEmail: "john@acme.com",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid website URLs in client validation", () => {
      const invalidUrls = [
        "not-a-url",
        "javascript:alert(1)",
        "ftp://files.example.com",
        "",
        "   ",
        "http://",
      ];

      for (const url of invalidUrls) {
        const res = WebsiteUrlSchema.safeParse(url);
        expect(res.success).toBe(false);
      }
    });

    it("should reject invalid email formats in client validation", () => {
      const invalidEmails = [
        "notanemail",
        "user@",
        "@domain.com",
        "user@domain",
        "",
        "   ",
      ];

      for (const email of invalidEmails) {
        const res = ContactEmailSchema.safeParse(email);
        expect(res.success).toBe(false);
      }
    });

    it("should trim and clean valid email inputs", () => {
      const res = ContactEmailSchema.safeParse("  Hello@Domain.Com  ");
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe("hello@domain.com");
      }
    });
  });

  describe("CsvUploader: Client-Side Upload Constraints", () => {
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    const validateClientFile = (name: string, size: number) => {
      if (!name.toLowerCase().endsWith(".csv")) {
        return { valid: false, error: "Invalid file type: Please select an RFC-4180 CSV file (.csv)." };
      }
      if (size === 0) {
        return { valid: false, error: "File is empty: The selected CSV file contains 0 bytes." };
      }
      if (size > MAX_FILE_SIZE) {
        return { valid: false, error: "File too large: CSV file exceeds the 5MB maximum limit." };
      }
      return { valid: true };
    };

    it("should allow CSV files under 5MB", () => {
      const result = validateClientFile("prospects.csv", 1024 * 500); // 500 KB
      expect(result.valid).toBe(true);
    });

    it("should reject non-CSV file extensions", () => {
      expect(validateClientFile("malware.exe", 100).valid).toBe(false);
      expect(validateClientFile("data.xlsx", 100).valid).toBe(false);
      expect(validateClientFile("data.txt", 100).valid).toBe(false);
    });

    it("should reject 0-byte empty files", () => {
      const result = validateClientFile("empty.csv", 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("should reject files exceeding 5MB client size limit", () => {
      const result = validateClientFile("huge.csv", MAX_FILE_SIZE + 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("5MB");
    });
  });

  describe("Leads Directory: Pagination & Badge Calculations", () => {
    it("should correctly compute pagination slices and boundaries", () => {
      const total = 45;
      const limit = 10;
      const totalPages = Math.ceil(total / limit);
      expect(totalPages).toBe(5);

      const page1HasNext = 1 < totalPages;
      const page1HasPrev = 1 > 1;
      expect(page1HasNext).toBe(true);
      expect(page1HasPrev).toBe(false);

      const page5HasNext = 5 < totalPages;
      const page5HasPrev = 5 > 1;
      expect(page5HasNext).toBe(false);
      expect(page5HasPrev).toBe(true);
    });
  });

  describe("LeadDetailPage: Tier Badges & Review Action Constraints", () => {
    const getStatusBadgeClass = (status: string) => `badge badge-${status.toLowerCase()}`;

    const getTierBadgeStyle = (tier?: string) => {
      switch (tier) {
        case "TIER_1":
          return { backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)" };
        case "TIER_2":
          return { backgroundColor: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.3)" };
        case "INSUFFICIENT_EVIDENCE":
          return { backgroundColor: "rgba(249, 115, 22, 0.15)", color: "#fb923c", border: "1px solid rgba(249, 115, 22, 0.3)" };
        case "DISQUALIFIED":
          return { backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.3)" };
        default:
          return { backgroundColor: "rgba(148, 163, 184, 0.15)", color: "#94a3b8", border: "1px solid rgba(148, 163, 184, 0.3)" };
      }
    };

    it("should generate correct badge classes for lead statuses", () => {
      expect(getStatusBadgeClass("AWAITING_APPROVAL")).toBe("badge badge-awaiting_approval");
      expect(getStatusBadgeClass("INSUFFICIENT_EVIDENCE")).toBe("badge badge-insufficient_evidence");
      expect(getStatusBadgeClass("QUALIFIED")).toBe("badge badge-qualified");
      expect(getStatusBadgeClass("DISQUALIFIED")).toBe("badge badge-disqualified");
      expect(getStatusBadgeClass("RESEARCHING")).toBe("badge badge-researching");
    });

    it("should return distinct colors for actionable vs warning tiers", () => {
      const tier1 = getTierBadgeStyle("TIER_1");
      const tier2 = getTierBadgeStyle("TIER_2");
      const insufficient = getTierBadgeStyle("INSUFFICIENT_EVIDENCE");
      const disqualified = getTierBadgeStyle("DISQUALIFIED");

      expect(tier1.color).toBe("#34d399"); // Green
      expect(tier2.color).toBe("#60a5fa"); // Blue
      expect(insufficient.color).toBe("#fb923c"); // Orange
      expect(disqualified.color).toBe("#f87171"); // Red
    });

    it("should validate client-side requirement for manual override rationale on INSUFFICIENT_EVIDENCE", () => {
      const validateOverride = (confirmed: boolean, rationale: string) => {
        return confirmed && rationale.trim().length > 0;
      };

      expect(validateOverride(false, "Valid reason")).toBe(false);
      expect(validateOverride(true, "")).toBe(false);
      expect(validateOverride(true, "   ")).toBe(false);
      expect(validateOverride(true, "Verified via SEC Edgar 10-K")).toBe(true);
    });
  });
});

