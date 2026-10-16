import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import {
  parseCsv,
  CsvEmptyError,
  CsvHeaderError,
  CsvSizeLimitExceededError,
  CsvRowLimitExceededError,
  CsvSyntaxError,
} from "@/lib/csv-parser";

describe("CSV Batch Parsing and Validation Engine", () => {
  const validCsvHeader = "company_name,website_url,contact_name,contact_email";

  describe("Normal Happy Path", () => {
    it("should successfully parse all valid rows in a standard CSV", async () => {
      const csv = [
        validCsvHeader,
        "Acme Corp,https://acme.com,John Doe,john@acme.com",
        "Beta LLC,https://beta.io,Jane Smith,jane@beta.io",
      ].join("\n");

      const result = await parseCsv(csv);

      expect(result.totalRows).toBe(2);
      expect(result.validRows).toHaveLength(2);
      expect(result.invalidRows).toHaveLength(0);

      expect(result.validRows[0]).toEqual({
        rowNumber: 2,
        data: {
          companyName: "Acme Corp",
          websiteUrl: "https://acme.com",
          contactName: "John Doe",
          contactEmail: "john@acme.com",
        },
      });

      expect(result.validRows[1]).toEqual({
        rowNumber: 3,
        data: {
          companyName: "Beta LLC",
          websiteUrl: "https://beta.io",
          contactName: "Jane Smith",
          contactEmail: "jane@beta.io",
        },
      });
    });

    it("should parse from Buffer and Readable Stream correctly", async () => {
      const csv = [
        validCsvHeader,
        "Stream Corp,https://stream.io,Sam Waters,sam@stream.io",
      ].join("\n");

      // Buffer
      const bufferResult = await parseCsv(Buffer.from(csv, "utf-8"));
      expect(bufferResult.validRows).toHaveLength(1);
      expect(bufferResult.validRows[0].data.companyName).toBe("Stream Corp");

      // Readable Stream
      const streamResult = await parseCsv(Readable.from([csv]));
      expect(streamResult.validRows).toHaveLength(1);
      expect(streamResult.validRows[0].data.companyName).toBe("Stream Corp");
    });

    it("should handle varied case and alternate header column names", async () => {
      const csv = [
        "Company Name,Website,Contact Name,Email",
        "Atlas Tech,https://atlas.tech,David Clark,david@atlas.tech",
      ].join("\n");

      const result = await parseCsv(csv);
      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0].data).toEqual({
        companyName: "Atlas Tech",
        websiteUrl: "https://atlas.tech",
        contactName: "David Clark",
        contactEmail: "david@atlas.tech",
      });
    });

    it("should ignore extra non-canonical columns", async () => {
      const csv = [
        "company_name,website_url,contact_name,contact_email,notes,phone_number",
        "Extra Corp,https://extra.com,Jack,jack@extra.com,Interested in enterprise,+12345678",
      ].join("\n");

      const result = await parseCsv(csv);
      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0].data.companyName).toBe("Extra Corp");
    });
  });

  describe("Quoted Fields, Commas, and Embedded Newlines (RFC-4180)", () => {
    it("should parse quoted fields with embedded commas", async () => {
      const csv = [
        validCsvHeader,
        '"Acme, Inc.",https://acme.com,"Doe, John",john@acme.com',
      ].join("\n");

      const result = await parseCsv(csv);
      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0].data.companyName).toBe("Acme, Inc.");
      expect(result.validRows[0].data.contactName).toBe("Doe, John");
    });

    it("should parse quoted fields with escaped quotes", async () => {
      const csv = [
        validCsvHeader,
        '"The ""Best"" Company",https://best.com,Boss,boss@best.com',
      ].join("\n");

      const result = await parseCsv(csv);
      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0].data.companyName).toBe('The "Best" Company');
    });

    it("should parse quoted fields containing embedded newlines and track line numbers", async () => {
      const csv = [
        validCsvHeader,
        '"Acme\nInternational",https://acme.com,John Doe,john@acme.com',
        "Second Co,https://second.com,Jane,jane@second.com",
      ].join("\n");

      const result = await parseCsv(csv);
      expect(result.validRows).toHaveLength(2);
      expect(result.validRows[0].data.companyName).toBe("Acme\nInternational");
      // Because row 1 has an embedded newline, second data row starts further down in the file
      expect(result.validRows[1].data.companyName).toBe("Second Co");
      expect(result.validRows[1].rowNumber).toBeGreaterThan(result.validRows[0].rowNumber);
    });
  });

  describe("Formula Injection & Data Integrity in Parsed Data", () => {
    it("should preserve original data in parsed rows during import to maintain database data integrity", async () => {
      const csv = [
        validCsvHeader,
        '=DangerousCorp,https://corp.com,"+Malicious Lead",contact@corp.com',
      ].join("\n");

      // Default import behavior preserves exact raw data
      const result = await parseCsv(csv);
      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0].data.companyName).toBe("=DangerousCorp");
      expect(result.validRows[0].data.contactName).toBe("+Malicious Lead");
    });

    it("should sanitize formula prefixes when sanitizeFormulas option is explicitly enabled", async () => {
      const csv = [
        validCsvHeader,
        '=DangerousCorp,https://corp.com,"+Malicious Lead",contact@corp.com',
      ].join("\n");

      const result = await parseCsv(csv, { sanitizeFormulas: true });
      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0].data.companyName).toBe("'=DangerousCorp");
      expect(result.validRows[0].data.contactName).toBe("'+Malicious Lead");
    });
  });

  describe("Header Validation and Duplicate Detection", () => {
    it("should throw CsvHeaderError on literal duplicate headers", async () => {
      const csv = [
        "company_name,website_url,contact_name,contact_email,company_name",
        "A,https://a.com,B,b@a.com,A",
      ].join("\n");

      await expect(parseCsv(csv)).rejects.toThrow(CsvHeaderError);
      await expect(parseCsv(csv)).rejects.toThrow(/Duplicate header detected/i);
    });

    it("should throw CsvHeaderError when multiple headers map to the same canonical field", async () => {
      const csv = [
        "company,company_name,website_url,contact_name,contact_email",
        "A,A2,https://a.com,B,b@a.com",
      ].join("\n");

      await expect(parseCsv(csv)).rejects.toThrow(CsvHeaderError);
      await expect(parseCsv(csv)).rejects.toThrow(/Conflicting duplicate columns/i);
    });

    it("should throw CsvHeaderError when a required header is missing", async () => {
      const missingEmail = [
        "company_name,website_url,contact_name",
        "A,https://a.com,B",
      ].join("\n");

      await expect(parseCsv(missingEmail)).rejects.toThrow(CsvHeaderError);
      await expect(parseCsv(missingEmail)).rejects.toThrow(/Missing required CSV header.*Contact Email/i);
    });
  });

  describe("Empty Files and Blank Records", () => {
    it("should throw CsvEmptyError for 0-byte string or whitespace-only CSV", async () => {
      await expect(parseCsv("")).rejects.toThrow(CsvEmptyError);
      await expect(parseCsv("   \n\n\t  ")).rejects.toThrow(CsvEmptyError);
      await expect(parseCsv(Buffer.alloc(0))).rejects.toThrow(CsvEmptyError);
    });

    it("should return 0 rows when CSV contains only valid headers and no data", async () => {
      const result = await parseCsv(validCsvHeader);
      expect(result.totalRows).toBe(0);
      expect(result.validRows).toHaveLength(0);
      expect(result.invalidRows).toHaveLength(0);
    });
  });

  describe("Malformed CSV Syntax", () => {
    it("should throw CsvSyntaxError on unclosed quote", async () => {
      const malformed = [
        validCsvHeader,
        '"Unclosed quote company,https://acme.com,John,john@acme.com',
      ].join("\n");

      await expect(parseCsv(malformed)).rejects.toThrow(CsvSyntaxError);
    });
  });

  describe("Limits Enforcement: Size, Rows, and Field Length", () => {
    it("should throw CsvSizeLimitExceededError when byte length exceeds limit", async () => {
      const csv = [
        validCsvHeader,
        "A".repeat(200) + ",https://a.com,B,b@a.com",
      ].join("\n");

      await expect(parseCsv(csv, { maxFileSize: 50 })).rejects.toThrow(
        CsvSizeLimitExceededError
      );
    });

    it("should throw CsvRowLimitExceededError when total data rows exceed maxRows limit", async () => {
      const csv = [
        validCsvHeader,
        "A,https://a.com,B,b@a.com",
        "C,https://c.com,D,d@c.com",
        "E,https://e.com,F,f@e.com",
      ].join("\n");

      await expect(parseCsv(csv, { maxRows: 2 })).rejects.toThrow(
        CsvRowLimitExceededError
      );
    });

    it("should flag a row as invalid if an individual field exceeds maxFieldLength", async () => {
      const csv = [
        validCsvHeader,
        "ValidCo,https://valid.com,Person,valid@valid.com",
        "VeryLongCo" + "X".repeat(50) + ",https://long.com,Person,long@long.com",
      ].join("\n");

      const result = await parseCsv(csv, { maxFieldLength: 30 });
      expect(result.totalRows).toBe(2);
      expect(result.validRows).toHaveLength(1);
      expect(result.invalidRows).toHaveLength(1);
      expect(result.invalidRows[0].errors[0].message).toContain("Field exceeds maximum length");
    });
  });

  describe("Partial Failure Policy (Row-level Error Reporting)", () => {
    it("should collect both valid and invalid rows with exact row numbers and field errors", async () => {
      const mixedCsv = [
        validCsvHeader, // Line 1
        "Acme Corp,https://acme.com,John Doe,john@acme.com", // Line 2: VALID
        "Broken Co,not-a-url,Jane Doe,jane@broken.com", // Line 3: INVALID URL
        "Good Co,https://good.com,Bob Smith,bob@good.com", // Line 4: VALID
        "No Email Co,https://noemail.com,Alice,invalid-email", // Line 5: INVALID EMAIL
        "Empty Name,https://empty.com,,empty@empty.com", // Line 6: MISSING CONTACT NAME
      ].join("\n");

      const result = await parseCsv(mixedCsv);

      expect(result.totalRows).toBe(5);
      expect(result.validRows).toHaveLength(2);
      expect(result.invalidRows).toHaveLength(3);

      // Verify valid rows line numbers
      expect(result.validRows[0].rowNumber).toBe(2);
      expect(result.validRows[0].data.companyName).toBe("Acme Corp");

      expect(result.validRows[1].rowNumber).toBe(4);
      expect(result.validRows[1].data.companyName).toBe("Good Co");

      // Verify invalid rows line numbers and structured errors
      expect(result.invalidRows[0].rowNumber).toBe(3);
      expect(result.invalidRows[0].raw.company_name).toBe("Broken Co");
      expect(result.invalidRows[0].errors[0].field).toBe("websiteUrl");
      expect(result.invalidRows[0].errors[0].message).toContain("HTTP or HTTPS");

      expect(result.invalidRows[1].rowNumber).toBe(5);
      expect(result.invalidRows[1].raw.company_name).toBe("No Email Co");
      expect(result.invalidRows[1].errors[0].field).toBe("contactEmail");
      expect(result.invalidRows[1].errors[0].message).toContain("Invalid contact email format");

      expect(result.invalidRows[2].rowNumber).toBe(6);
      expect(result.invalidRows[2].raw.company_name).toBe("Empty Name");
      expect(result.invalidRows[2].errors[0].field).toBe("contactName");
      expect(result.invalidRows[2].errors[0].message).toContain("Contact name is required");
    });

    it("should reject non-HTTP protocols such as javascript: and ftp: in partial results", async () => {
      const csv = [
        validCsvHeader,
        "XSS Co,javascript:alert(1),Attacker,attacker@xss.com",
        "FTP Co,ftp://files.org,Admin,admin@files.org",
      ].join("\n");

      const result = await parseCsv(csv);
      expect(result.totalRows).toBe(2);
      expect(result.validRows).toHaveLength(0);
      expect(result.invalidRows).toHaveLength(2);
      expect(result.invalidRows[0].errors[0].message).toContain("HTTP or HTTPS");
      expect(result.invalidRows[1].errors[0].message).toContain("HTTP or HTTPS");
    });
  });

  describe("Security and Secret Protection", () => {
    it("should never leak DATABASE_URL or environment secrets in error messages", async () => {
      try {
        await parseCsv("");
      } catch (err) {
        expect((err as Error).message).not.toContain("postgres");
        expect((err as Error).message).not.toContain("password");
        expect((err as Error).message).not.toContain("DATABASE_URL");
      }

      try {
        await parseCsv("bad_header\nval");
      } catch (err) {
        expect((err as Error).message).not.toContain("postgres");
        expect((err as Error).message).not.toContain("password");
        expect((err as Error).message).not.toContain("DATABASE_URL");
      }
    });
  });
});
