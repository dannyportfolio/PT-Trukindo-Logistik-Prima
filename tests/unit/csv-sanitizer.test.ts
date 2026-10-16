import { describe, it, expect } from "vitest";
import {
  isFormulaInjectionRisk,
  sanitizeFormulaInjection,
  sanitizeLeadInput,
  escapeCsvCell,
  exportLeadsToCsv,
} from "@/lib/csv-parser";
import { LeadInput } from "@/types/lead";

describe("CSV Formula Injection Sanitizer (OWASP DDE Mitigation)", () => {
  describe("isFormulaInjectionRisk", () => {
    it("should detect formulas starting with equals (=)", () => {
      expect(isFormulaInjectionRisk("=cmd|' /C calc'!A0")).toBe(true);
      expect(isFormulaInjectionRisk("=1+1")).toBe(true);
      expect(isFormulaInjectionRisk("=SUM(A1:A10)")).toBe(true);
    });

    it("should detect formulas starting with plus (+)", () => {
      expect(isFormulaInjectionRisk("+cmd|' /C calc'!A0")).toBe(true);
      expect(isFormulaInjectionRisk("+SUM(1,2)")).toBe(true);
    });

    it("should detect formulas starting with minus (-)", () => {
      expect(isFormulaInjectionRisk("-cmd|' /C calc'!A0")).toBe(true);
      expect(isFormulaInjectionRisk("-100")).toBe(true);
    });

    it("should detect formulas starting with at (@)", () => {
      expect(isFormulaInjectionRisk("@SUM(1,2)")).toBe(true);
      expect(isFormulaInjectionRisk("@eval()")).toBe(true);
    });

    it("should detect formulas with leading whitespace before trigger characters", () => {
      expect(isFormulaInjectionRisk("   =cmd")).toBe(true);
      expect(isFormulaInjectionRisk(" \t+calc")).toBe(true);
      expect(isFormulaInjectionRisk("\r-10")).toBe(true);
    });

    it("should detect formulas starting with tab (\\t) or carriage return (\\r)", () => {
      expect(isFormulaInjectionRisk("\t=calc")).toBe(true);
      expect(isFormulaInjectionRisk("\r@sum")).toBe(true);
    });

    it("should not flag benign text", () => {
      expect(isFormulaInjectionRisk("Acme Corporation")).toBe(false);
      expect(isFormulaInjectionRisk("https://acme.example.com")).toBe(false);
      expect(isFormulaInjectionRisk("Jane Doe")).toBe(false);
      expect(isFormulaInjectionRisk("jane.doe@acme.example.com")).toBe(false);
      expect(isFormulaInjectionRisk("")).toBe(false);
    });

    it("should not flag strings that already start with an apostrophe/single quote", () => {
      expect(isFormulaInjectionRisk("'=already_escaped")).toBe(false);
      expect(isFormulaInjectionRisk("'+12345")).toBe(false);
      expect(isFormulaInjectionRisk("'-500")).toBe(false);
      expect(isFormulaInjectionRisk("'@sum")).toBe(false);
    });
  });

  describe("sanitizeFormulaInjection", () => {
    it("should prepend single quote (') to malicious formula payloads", () => {
      expect(sanitizeFormulaInjection("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
      expect(sanitizeFormulaInjection("+SUM(A1:B2)")).toBe("'+SUM(A1:B2)");
      expect(sanitizeFormulaInjection("-2+5")).toBe("'-2+5");
      expect(sanitizeFormulaInjection("@SUM(1,2)")).toBe("'@SUM(1,2)");
      expect(sanitizeFormulaInjection("   =calc")).toBe("'   =calc");
    });

    it("should leave benign text unchanged", () => {
      expect(sanitizeFormulaInjection("Normal Company Ltd")).toBe("Normal Company Ltd");
      expect(sanitizeFormulaInjection("https://google.com")).toBe("https://google.com");
      expect(sanitizeFormulaInjection("john@doe.com")).toBe("john@doe.com");
    });

    it("should not duplicate single quote if already escaped", () => {
      expect(sanitizeFormulaInjection("'=cmd")).toBe("'=cmd");
    });
  });

  describe("sanitizeLeadInput", () => {
    it("should sanitize all fields in a LeadInput object", () => {
      const untrusted: LeadInput = {
        companyName: "=EvilCorp",
        websiteUrl: "https://evilcorp.com",
        contactName: "+Hacker Name",
        contactEmail: "contact@evilcorp.com",
      };

      const sanitized = sanitizeLeadInput(untrusted);
      expect(sanitized.companyName).toBe("'=EvilCorp");
      expect(sanitized.websiteUrl).toBe("https://evilcorp.com");
      expect(sanitized.contactName).toBe("'+Hacker Name");
      expect(sanitized.contactEmail).toBe("contact@evilcorp.com");
    });
  });

  describe("escapeCsvCell & exportLeadsToCsv", () => {
    it("should wrap cells with commas, quotes, and newlines in double quotes per RFC-4180", () => {
      expect(escapeCsvCell("Acme, Inc.")).toBe('"Acme, Inc."');
      expect(escapeCsvCell('He said "Hello"')).toBe('"He said ""Hello"""');
      expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    });

    it("should sanitize formula injection when escaping CSV cells", () => {
      const maliciousCell = "=cmd|' /C calc'!A0";
      expect(escapeCsvCell(maliciousCell)).toBe("'=cmd|' /C calc'!A0");

      const maliciousWithComma = "=SUM(1, 2)";
      expect(escapeCsvCell(maliciousWithComma)).toBe('"\'=SUM(1, 2)"');
    });

    it("should generate RFC-4180 CSV with sanitized cells", () => {
      const leads: LeadInput[] = [
        {
          companyName: "=Malicious Corp",
          websiteUrl: "https://malicious.com",
          contactName: "John, Doe",
          contactEmail: "john@malicious.com",
        },
        {
          companyName: "Safe Inc",
          websiteUrl: "https://safe.com",
          contactName: "Jane Doe",
          contactEmail: "jane@safe.com",
        },
      ];

      const csv = exportLeadsToCsv(leads);
      const lines = csv.split("\r\n");

      expect(lines[0]).toBe("company_name,website_url,contact_name,contact_email");
      // First data line must have formula sanitized and comma quoted
      expect(lines[1]).toBe("'=Malicious Corp,https://malicious.com,\"John, Doe\",john@malicious.com");
      expect(lines[2]).toBe("Safe Inc,https://safe.com,Jane Doe,jane@safe.com");
    });
  });
});
