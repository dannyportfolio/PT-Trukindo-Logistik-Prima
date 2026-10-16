import { describe, it, expect, afterAll } from "vitest";
import { GET } from "@/app/api/leads/[id]/route";
import { getPool, closePools } from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";

const AUTH_HEADERS = {
  authorization: "Bearer astraops-secret-token",
  "x-actor-id": "detail_operator_01",
  "x-actor-role": "SALES_OPERATOR",
};

describe("API Route Handlers: GET /api/leads/[id]", () => {
  afterAll(async () => {
    const pool = getPool();
    try {
      await pool.query("DELETE FROM audit_logs WHERE actor_id = 'detail_operator_01';");
      await pool.query("DELETE FROM leads WHERE contact_email LIKE '%@detail-test.com';");
    } catch {
      // Ignore cleanup error if DB is down
    }
    await closePools();
  });

  describe("Authentication and Authorization Boundary", () => {
    it("should reject request without authorization header with 401 Unauthorized", async () => {
      const req = new Request("http://localhost:3000/api/leads/550e8400-e29b-41d4-a716-446655440000");
      const res = await GET(req, {
        params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject request with unauthorized role token (VIEWER) with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/leads/550e8400-e29b-41d4-a716-446655440000", {
        headers: {
          authorization: "Bearer astraops-viewer-token",
        },
      });
      const res = await GET(req, {
        params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("FORBIDDEN");
    });
  });

  describe("Validation & Retrieval", () => {
    it("should reject malformed non-UUID ID with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/leads/not-a-valid-uuid", {
        headers: AUTH_HEADERS,
      });
      const res = await GET(req, {
        params: Promise.resolve({ id: "not-a-valid-uuid" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("INVALID_ID_FORMAT");
      expect(json.error.message).toContain("valid UUID");
    });

    it("should return 404 Not Found when lead with valid UUID does not exist", async () => {
      const nonExistentId = "a0000000-0000-0000-0000-000000000000";
      const req = new Request(`http://localhost:3000/api/leads/${nonExistentId}`, {
        headers: AUTH_HEADERS,
      });
      const res = await GET(req, {
        params: Promise.resolve({ id: nonExistentId }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("should return lead details and immutable audit trail with 200 OK for valid lead", async () => {
      // 1. Create a lead via repository
      const repo = new LeadRepository();
      const created = await repo.createLead({
        companyName: "Detail Test Corp",
        websiteUrl: "https://detail-test.com",
        contactName: "Diana Detail",
        contactEmail: "diana@detail-test.com",
        actorId: "detail_operator_01",
        actorRole: "SALES_OPERATOR",
      });

      // 2. Query via GET /api/leads/[id]
      const req = new Request(`http://localhost:3000/api/leads/${created.id}`, {
        headers: AUTH_HEADERS,
      });
      const res = await GET(req, {
        params: Promise.resolve({ id: created.id }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.lead).toBeDefined();
      expect(json.lead.id).toBe(created.id);
      expect(json.lead.company_name).toBe("Detail Test Corp");
      expect(json.lead.status).toBe("INGESTED");

      expect(json.auditLogs).toBeDefined();
      expect(Array.isArray(json.auditLogs)).toBe(true);
      expect(json.auditLogs.length).toBeGreaterThanOrEqual(1);
      expect(json.auditLogs[0].event_type).toBe("LEAD_INGESTED");
      expect(json.auditLogs[0].actor_id).toBe("detail_operator_01");
    });
  });
});
