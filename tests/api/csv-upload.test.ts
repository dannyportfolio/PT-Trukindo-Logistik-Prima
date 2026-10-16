import { describe, it, expect, afterAll, vi } from "vitest";
import { POST } from "@/app/api/leads/upload-csv/route";
import { getPool, closePools } from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";

const AUTH_HEADERS = {
  authorization: "Bearer astraops-secret-token",
  "x-actor-id": "csv_operator_01",
  "x-actor-role": "SALES_OPERATOR",
};

function createMultipartRequest(fileContent: string | Buffer | null, fileName = "prospects.csv", headers: Record<string, string> = AUTH_HEADERS): Request {
  const formData = new FormData();
  if (fileContent !== null) {
    const blob = new Blob([fileContent as unknown as BlobPart], { type: "text/csv" });
    formData.append("file", blob, fileName);
  }

  return new Request("http://localhost:3000/api/leads/upload-csv", {
    method: "POST",
    headers,
    body: formData,
  });
}

describe("API Route Handlers: POST /api/leads/upload-csv", () => {
  afterAll(async () => {
    const pool = getPool();
    try {
      await pool.query("DELETE FROM audit_logs WHERE actor_id = 'csv_operator_01';");
      await pool.query("DELETE FROM leads WHERE contact_email LIKE '%@csv-test.com';");
    } catch {
      // Ignore cleanup error if DB is down
    }
    await closePools();
  });

  describe("Authentication & Authorization Boundary", () => {
    it("should reject request without credentials with 401 Unauthorized", async () => {
      const csv = "company_name,website_url,contact_name,contact_email\nAcme,https://acme.com,John,john@csv-test.com";
      const req = createMultipartRequest(csv, "test.csv", {});

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject request with unauthorized role token (VIEWER) with 403 Forbidden", async () => {
      const csv = "company_name,website_url,contact_name,contact_email\nAcme,https://acme.com,John,john@csv-test.com";
      const req = createMultipartRequest(csv, "test.csv", {
        authorization: "Bearer astraops-viewer-token",
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("FORBIDDEN");
    });

    it("should ignore spoofed client role header x-actor-role: ADMIN", async () => {
      const csv = "company_name,website_url,contact_name,contact_email\nAcme,https://acme.com,John,john@csv-test.com";
      const req = createMultipartRequest(csv, "test.csv", {
        authorization: "Bearer astraops-secret-token",
        "x-actor-role": "ADMIN",
        "x-actor-id": "spoofed_admin_hacker",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      // Verify audit trail logged verified server identity, not spoofed header
      const pool = getPool();
      const auditRes = await pool.query(
        "SELECT actor_id, actor_role FROM audit_logs WHERE lead_id IN (SELECT id FROM leads WHERE contact_email = 'john@csv-test.com') LIMIT 1;"
      );
      expect(auditRes.rows[0].actor_id).toBe("service_operator");
      expect(auditRes.rows[0].actor_role).toBe("SALES_OPERATOR");
    });
  });

  describe("Multipart & Payload Validation", () => {
    it("should reject invalid Content-Length header with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/leads/upload-csv", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "multipart/form-data; boundary=----boundary",
          "content-length": "not-a-number",
        },
        body: "dummy",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("BAD_REQUEST");
    });

    it("should reject oversized Content-Length early with 413 Payload Too Large", async () => {
      const req = new Request("http://localhost:3000/api/leads/upload-csv", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "multipart/form-data; boundary=----boundary",
          "content-length": "10485760", // 10MB
        },
        body: "dummy",
      });

      const res = await POST(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.error.code).toBe("FILE_TOO_LARGE");
    });

    it("should reject non-multipart Content-Type with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/leads/upload-csv", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "application/json",
        },
        body: JSON.stringify({ file: "some-content" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("INVALID_CONTENT_TYPE");
    });

    it("should reject missing file field in form data with 400 Bad Request", async () => {
      const req = createMultipartRequest(null, "empty.csv");
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("FILE_REQUIRED");
    });

    it("should reject non-CSV file extension with 400 Bad Request", async () => {
      const formData = new FormData();
      const blob = new Blob(["malicious payload"], { type: "application/octet-stream" });
      formData.append("file", blob, "malicious_script.exe");

      const req = new Request("http://localhost:3000/api/leads/upload-csv", {
        method: "POST",
        headers: AUTH_HEADERS,
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("INVALID_FILE_TYPE");
    });

    it("should reject empty file with 400 Bad Request", async () => {
      const req = createMultipartRequest("", "empty.csv");
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("EMPTY_FILE");
    });

    it("should reject file exceeding 5MB limit with 413 Payload Too Large", async () => {
      // Create a 5.1MB dummy buffer
      const largeSize = 5.1 * 1024 * 1024;
      const largeBuffer = Buffer.alloc(largeSize, "a");

      const req = createMultipartRequest(largeBuffer, "huge.csv");
      const res = await POST(req);
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.error.code).toBe("FILE_TOO_LARGE");
    });

    it("should reject CSV with missing required headers with 400 Bad Request", async () => {
      const badCsv = "wrong_col,another_col\nvalue1,value2";
      const req = createMultipartRequest(badCsv, "bad_header.csv");

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("CSV_HEADER_ERROR");
      expect(json.error.message).toContain("Missing required CSV header");
    });
  });

  describe("Parsing, Sanitization, and Partial Reporting", () => {
    it("should preserve original data in database without mutating values on import", async () => {
      const formulaCsv = [
        "company_name,website_url,contact_name,contact_email",
        "=cmd|' /C calc'!A0,https://formula-test.com,@InjectedUser,formula@csv-test.com",
      ].join("\n");

      const req = createMultipartRequest(formulaCsv, "formula.csv");
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.importedCount).toBe(1);

      // Verify raw data integrity is preserved in database (not mutated with leading quote)
      const repo = new LeadRepository();
      const list = await repo.listLeads({ limit: 10 });
      const found = list.data.find((l) => l.contact_email === "formula@csv-test.com");
      expect(found).toBeDefined();
      expect(found?.company_name).toBe("=cmd|' /C calc'!A0");
      expect(found?.contact_name).toBe("@InjectedUser");
    });

    it("should report partial row failure with structured errors and import valid rows", async () => {
      const partialCsv = [
        "company_name,website_url,contact_name,contact_email",
        "Valid One,https://valid1.com,Alice,alice1@csv-test.com",
        "Invalid Url Co,ftp://bad-url.com,Bob,bob@csv-test.com",
        "Valid Two,https://valid2.com,Carol,carol2@csv-test.com",
        "Invalid Email Co,https://bad-email.com,Dan,not-an-email",
      ].join("\n");

      const req = createMultipartRequest(partialCsv, "partial.csv");
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.totalRows).toBe(4);
      expect(json.importedCount).toBe(2);
      expect(json.validRows).toHaveLength(2);
      expect(json.invalidRows).toHaveLength(2);

      // Verify line numbers and structured errors
      expect(json.invalidRows[0].rowNumber).toBe(3);
      expect(json.invalidRows[0].errors[0].field).toBe("websiteUrl");
      expect(json.invalidRows[0].errors[0].message).toContain("HTTP or HTTPS");

      expect(json.invalidRows[1].rowNumber).toBe(5);
      expect(json.invalidRows[1].errors[0].field).toBe("contactEmail");
      expect(json.invalidRows[1].errors[0].message).toContain("Invalid contact email");
    });
  });

  describe("Batch Transaction Rollback Policy", () => {
    it("should rollback entire batch and return 500 without claiming partial success if database transaction fails", async () => {
      const validCsv = [
        "company_name,website_url,contact_name,contact_email",
        "Rollback Co 1,https://rb1.com,Test 1,rb1@csv-test.com",
        "Rollback Co 2,https://rb2.com,Test 2,rb2@csv-test.com",
      ].join("\n");

      // Spy on LeadRepository.prototype.createLeadsBatch to simulate a transaction failure
      const batchSpy = vi
        .spyOn(LeadRepository.prototype, "createLeadsBatch")
        .mockRejectedValueOnce(new Error("Simulated database write deadlock"));

      const req = createMultipartRequest(validCsv, "rollback.csv");
      const res = await POST(req);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error.code).toBe("DATABASE_TRANSACTION_FAILED");
      expect(json.error.message).toContain("Transaction was rolled back");

      // Ensure no partial success claim
      expect(json.success).toBeUndefined();

      batchSpy.mockRestore();
    });
  });
});
