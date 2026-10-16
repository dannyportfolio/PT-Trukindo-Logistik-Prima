import { describe, it, expect } from "vitest";
import {
  LeadInputSchema,
  CsvLeadRowSchema,
  WebsiteUrlSchema,
  ContactEmailSchema,
  LeadStatusSchema,
} from "@/types/lead";

describe("LeadInputSchema Validation Contract", () => {
  const validPayload = {
    companyName: "Acme Corporation",
    websiteUrl: "https://acme.example.com",
    contactName: "Jane Doe",
    contactEmail: "jane.doe@acme.example.com",
  };

  it("should validate and parse valid lead input", () => {
    const result = LeadInputSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validPayload);
    }
  });

  it("should trim surrounding whitespace from text fields", () => {
    const payloadWithWhitespace = {
      companyName: "   Acme Corp   ",
      websiteUrl: "  https://acme.com  ",
      contactName: "  Jane Doe  ",
      contactEmail: "  Jane.Doe@Acme.COM  ",
    };

    const result = LeadInputSchema.safeParse(payloadWithWhitespace);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyName).toBe("Acme Corp");
      expect(result.data.websiteUrl).toBe("https://acme.com");
      expect(result.data.contactName).toBe("Jane Doe");
      expect(result.data.contactEmail).toBe("jane.doe@acme.com");
    }
  });

  it("should reject empty or whitespace-only company name", () => {
    const emptyResult = LeadInputSchema.safeParse({
      ...validPayload,
      companyName: "",
    });
    expect(emptyResult.success).toBe(false);

    const whitespaceResult = LeadInputSchema.safeParse({
      ...validPayload,
      companyName: "     ",
    });
    expect(whitespaceResult.success).toBe(false);
  });

  it("should reject company name exceeding 255 characters", () => {
    const result = LeadInputSchema.safeParse({
      ...validPayload,
      companyName: "A".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty or whitespace-only contact name", () => {
    const emptyResult = LeadInputSchema.safeParse({
      ...validPayload,
      contactName: "",
    });
    expect(emptyResult.success).toBe(false);

    const whitespaceResult = LeadInputSchema.safeParse({
      ...validPayload,
      contactName: "     ",
    });
    expect(whitespaceResult.success).toBe(false);
  });

  it("should reject contact name exceeding 255 characters", () => {
    const result = LeadInputSchema.safeParse({
      ...validPayload,
      contactName: "B".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it("should reject null and undefined values for required fields", () => {
    const nullPayload = {
      companyName: null,
      websiteUrl: null,
      contactName: null,
      contactEmail: null,
    };
    const result = LeadInputSchema.safeParse(nullPayload);
    expect(result.success).toBe(false);
  });

  describe("WebsiteUrlSchema", () => {
    it("should accept valid http and https URLs", () => {
      expect(WebsiteUrlSchema.safeParse("http://insecure.com").success).toBe(true);
      expect(WebsiteUrlSchema.safeParse("https://secure.com/about?ref=1").success).toBe(true);
      expect(WebsiteUrlSchema.safeParse("https://sub.domain.co.id:8080/path").success).toBe(true);
    });

    it("should reject dangerous and non-http(s) protocols", () => {
      expect(WebsiteUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
      expect(WebsiteUrlSchema.safeParse("ftp://ftp.example.com").success).toBe(false);
      expect(WebsiteUrlSchema.safeParse("file:///etc/passwd").success).toBe(false);
      expect(WebsiteUrlSchema.safeParse("data:text/html,<script>").success).toBe(false);
      expect(WebsiteUrlSchema.safeParse("mailto:test@example.com").success).toBe(false);
    });

    it("should reject malformed URLs", () => {
      expect(WebsiteUrlSchema.safeParse("not-a-url").success).toBe(false);
      expect(WebsiteUrlSchema.safeParse("http://").success).toBe(false);
      expect(WebsiteUrlSchema.safeParse("https://").success).toBe(false);
      expect(WebsiteUrlSchema.safeParse("://missing-scheme.com").success).toBe(false);
    });

    it("should reject URLs exceeding 2048 characters", () => {
      const longUrl = "https://example.com/" + "a".repeat(2030);
      expect(longUrl.length).toBeGreaterThan(2048);
      expect(WebsiteUrlSchema.safeParse(longUrl).success).toBe(false);
    });
  });

  describe("ContactEmailSchema", () => {
    it("should normalize email to lowercase", () => {
      const result = ContactEmailSchema.safeParse("OPERATOR@COMPANY.ORG");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("operator@company.org");
      }
    });

    it("should reject invalid email formats", () => {
      expect(ContactEmailSchema.safeParse("plainaddress").success).toBe(false);
      expect(ContactEmailSchema.safeParse("@missingusername.com").success).toBe(false);
      expect(ContactEmailSchema.safeParse("username@.com").success).toBe(false);
      expect(ContactEmailSchema.safeParse("username@missingtld").success).toBe(false);
      expect(ContactEmailSchema.safeParse("username@domain..com").success).toBe(false);
    });

    it("should reject emails exceeding 255 characters", () => {
      const longEmail = "a".repeat(250) + "@example.com";
      expect(longEmail.length).toBeGreaterThan(255);
      expect(ContactEmailSchema.safeParse(longEmail).success).toBe(false);
    });
  });

  describe("LeadStatusSchema", () => {
    it("should accept valid PostgreSQL-defined statuses", () => {
      const validStatuses = [
        "INGESTED",
        "RESEARCHING",
        "QUALIFIED",
        "DISQUALIFIED",
        "PROPOSAL_DRAFTED",
        "OUTREACH_ACTIVE",
        "ARCHIVED",
      ];
      for (const status of validStatuses) {
        expect(LeadStatusSchema.safeParse(status).success).toBe(true);
      }
    });

    it("should reject unrecognized lead status", () => {
      expect(LeadStatusSchema.safeParse("UNKNOWN_STATUS").success).toBe(false);
      expect(LeadStatusSchema.safeParse("DELETED").success).toBe(false);
    });
  });
});

describe("CsvLeadRowSchema Column Mapping", () => {
  it("should map canonical camelCase headers", () => {
    const raw = {
      companyName: "Tech Corp",
      websiteUrl: "https://techcorp.io",
      contactName: "John Smith",
      contactEmail: "john@techcorp.io",
    };
    const result = CsvLeadRowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(raw);
    }
  });

  it("should map snake_case headers", () => {
    const raw = {
      company_name: "Tech Corp",
      website_url: "https://techcorp.io",
      contact_name: "John Smith",
      contact_email: "john@techcorp.io",
    };
    const result = CsvLeadRowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyName).toBe("Tech Corp");
      expect(result.data.websiteUrl).toBe("https://techcorp.io");
      expect(result.data.contactName).toBe("John Smith");
      expect(result.data.contactEmail).toBe("john@techcorp.io");
    }
  });

  it("should map human-readable Display headers", () => {
    const raw = {
      "Company Name": "Global Logistics",
      Website: "https://globallogistics.com",
      "Contact Name": "Alice Brown",
      Email: "alice@globallogistics.com",
    };
    const result = CsvLeadRowSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyName).toBe("Global Logistics");
      expect(result.data.websiteUrl).toBe("https://globallogistics.com");
      expect(result.data.contactName).toBe("Alice Brown");
      expect(result.data.contactEmail).toBe("alice@globallogistics.com");
    }
  });

  it("should fail when any required column is missing in row", () => {
    const incomplete = {
      company_name: "Incomplete LLC",
      website_url: "https://incomplete.com",
      // missing contact name and email
    };
    const result = CsvLeadRowSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});
