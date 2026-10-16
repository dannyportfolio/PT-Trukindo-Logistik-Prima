import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST, GET } from "@/app/api/leads/route";
import { getPool, closePools, checkDatabaseHealth } from "@/lib/db";
import { LeadRepository } from "@/lib/lead-repository";

const AUTH_HEADERS = {
  authorization: "Bearer astraops-secret-token",
  "x-actor-id": "test_operator_01",
  "x-actor-role": "SALES_OPERATOR",
};

describe("API Route Handlers: /api/leads", () => {
  beforeAll(async () => {
    const health = await checkDatabaseHealth();
    if (!health.isHealthy) {
      console.warn("Database healthcheck failed in test suite setup:", health.error);
    }
  });

  afterAll(async () => {
    // Clean up created test leads
    const pool = getPool();
    try {
      await pool.query("DELETE FROM audit_logs WHERE actor_id = 'test_operator_01';");
      await pool.query("DELETE FROM leads WHERE contact_email LIKE '%@test-api-leads.com';");
    } catch {
      // Ignore cleanup error if DB is down
    }
    await closePools();
  });

  describe("Authentication and Authorization Boundary", () => {
    it("should reject POST /api/leads without authorization header with 401 Unauthorized", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: "Acme Corp",
          websiteUrl: "https://acme.com",
          contactName: "John Doe",
          contactEmail: "john@test-api-leads.com",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject POST /api/leads with invalid Bearer token with 401 Unauthorized", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer invalid-secret-token",
        },
        body: JSON.stringify({
          companyName: "Acme Corp",
          websiteUrl: "https://acme.com",
          contactName: "John Doe",
          contactEmail: "john@test-api-leads.com",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject POST /api/leads with unauthorized role token (e.g. VIEWER) with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer astraops-viewer-token",
        },
        body: JSON.stringify({
          companyName: "Acme Corp",
          websiteUrl: "https://acme.com",
          contactName: "John Doe",
          contactEmail: "john@test-api-leads.com",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("FORBIDDEN");
    });

    it("should ignore spoofed client role header x-actor-role: ADMIN and reject privilege escalation", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer astraops-secret-token",
          "x-actor-role": "ADMIN",
          "x-actor-id": "spoofed_superadmin",
        },
        body: JSON.stringify({
          companyName: "Spoof Audit Co",
          websiteUrl: "https://spoof-audit.com",
          contactName: "Eve Spoof",
          contactEmail: "eve@test-api-leads.com",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();

      // Verify audit log recorded verified server identity, not spoofed header
      const repo = new LeadRepository();
      const fetched = await repo.getLeadWithAudit(json.id);
      expect(fetched.auditLogs[0].actor_id).toBe("service_operator");
      expect(fetched.auditLogs[0].actor_role).toBe("SALES_OPERATOR");
    });

    it("should reject GET /api/leads without authorization header with 401 Unauthorized", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "GET",
      });

      const res = await GET(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject GET /api/leads with unauthorized viewer token when restricted with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "GET",
        headers: {
          authorization: "Bearer astraops-viewer-token",
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("FORBIDDEN");
    });
  });

  describe("POST /api/leads Validation & Persistence", () => {
    it("should reject malformed JSON body with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "application/json",
        },
        body: "invalid-json-syntax{",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("BAD_REQUEST");
    });

    it("should reject invalid website URL protocol with 400 Validation Error", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Malicious Co",
          websiteUrl: "javascript:alert(document.cookie)",
          contactName: "Bad Actor",
          contactEmail: "bad@test-api-leads.com",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(json.error.details)).toContain("valid HTTP or HTTPS URL");
    });

    it("should reject invalid email format with 400 Validation Error", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Acme Corp",
          websiteUrl: "https://acme.com",
          contactName: "John Doe",
          contactEmail: "not-an-email-address",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject missing required company name with 400 Validation Error", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "",
          websiteUrl: "https://acme.com",
          contactName: "John Doe",
          contactEmail: "john@test-api-leads.com",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("should atomically create lead and audit record with 201 Created on valid input", async () => {
      const leadPayload = {
        companyName: "Atomic Sales Inc",
        websiteUrl: "https://atomic-sales.com",
        contactName: "Alice Walker",
        contactEmail: "alice@test-api-leads.com",
      };

      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "application/json",
        },
        body: JSON.stringify(leadPayload),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();

      expect(json.id).toBeDefined();
      expect(json.company_name).toBe("Atomic Sales Inc");
      expect(json.status).toBe("INGESTED");

      // Verify persistence in database and audit log entry with verified server identity
      const repo = new LeadRepository();
      const fetched = await repo.getLeadWithAudit(json.id);
      expect(fetched.lead).not.toBeNull();
      expect(fetched.lead?.id).toBe(json.id);
      expect(fetched.auditLogs.length).toBe(1);
      expect(fetched.auditLogs[0].event_type).toBe("LEAD_INGESTED");
      expect(fetched.auditLogs[0].actor_id).toBe("service_operator");
      expect(fetched.auditLogs[0].actor_role).toBe("SALES_OPERATOR");
    });

    it("should support idempotency key to prevent duplicate submissions on retry", async () => {
      const idempotencyKey = "idemp-key-test-999";
      const leadPayload = {
        companyName: "Retry Corp",
        websiteUrl: "https://retry-corp.io",
        contactName: "Bob Retry",
        contactEmail: "bob@test-api-leads.com",
      };

      // First submission
      const req1 = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(leadPayload),
      });
      const res1 = await POST(req1);
      expect(res1.status).toBe(201);
      const lead1 = await res1.json();

      // Second submission with identical idempotency key
      const req2 = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(leadPayload),
      });
      const res2 = await POST(req2);
      expect([200, 201]).toContain(res2.status);
      const lead2 = await res2.json();

      expect(lead2.id).toBe(lead1.id);
    });

    it("should reject idempotency key reuse with different payload with 409 Conflict", async () => {
      const conflictKey = "idemp-conflict-test-key";
      const originalPayload = {
        companyName: "Original Corp",
        websiteUrl: "https://original.com",
        contactName: "Alice",
        contactEmail: "alice@test-api-leads.com",
      };
      const alteredPayload = {
        companyName: "Altered Corp",
        websiteUrl: "https://altered.com",
        contactName: "Bob",
        contactEmail: "bob@test-api-leads.com",
      };

      // 1. Initial request with original payload
      const req1 = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "application/json",
          "idempotency-key": conflictKey,
        },
        body: JSON.stringify(originalPayload),
      });
      const res1 = await POST(req1);
      expect(res1.status).toBe(201);

      // 2. Second request with identical key but altered payload
      const req2 = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          ...AUTH_HEADERS,
          "content-type": "application/json",
          "idempotency-key": conflictKey,
        },
        body: JSON.stringify(alteredPayload),
      });
      const res2 = await POST(req2);
      expect(res2.status).toBe(409);
      const json = await res2.json();
      expect(json.error.code).toBe("IDEMPOTENCY_CONFLICT");
      expect(json.error.message).toContain("different request payload");
    });

    it("should serialize concurrent requests with the same idempotency key and return identical response without duplicate records", async () => {
      const concurrencyKey = "idemp-concurrency-test-key";
      const concurrentPayload = {
        companyName: "Concurrent Corp",
        websiteUrl: "https://concurrent.com",
        contactName: "Charlie",
        contactEmail: "charlie@test-api-leads.com",
      };

      const makeRequest = () =>
        new Request("http://localhost:3000/api/leads", {
          method: "POST",
          headers: {
            ...AUTH_HEADERS,
            "content-type": "application/json",
            "idempotency-key": concurrencyKey,
          },
          body: JSON.stringify(concurrentPayload),
        });

      // Fire 3 simultaneous concurrent POST requests
      const [res1, res2, res3] = await Promise.all([
        POST(makeRequest()),
        POST(makeRequest()),
        POST(makeRequest()),
      ]);

      expect([200, 201]).toContain(res1.status);
      expect([200, 201]).toContain(res2.status);
      expect([200, 201]).toContain(res3.status);

      const [lead1, lead2, lead3] = await Promise.all([
        res1.json(),
        res2.json(),
        res3.json(),
      ]);

      // All 3 return identical lead ID
      expect(lead1.id).toBeDefined();
      expect(lead2.id).toBe(lead1.id);
      expect(lead3.id).toBe(lead1.id);

      // Verify in database: exactly ONE lead was created in leads table
      const pool = getPool();
      const countRes = await pool.query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM leads WHERE contact_email = 'charlie@test-api-leads.com';"
      );
      expect(Number(countRes.rows[0].count)).toBe(1);
    });
  });

  describe("GET /api/leads Pagination & Query Validation", () => {
    beforeAll(async () => {
      // Seed a few leads for pagination test
      const repo = new LeadRepository();
      for (let i = 1; i <= 5; i++) {
        await repo.createLead({
          companyName: `Pagination Co ${i}`,
          websiteUrl: `https://pagination-${i}.com`,
          contactName: `Contact ${i}`,
          contactEmail: `contact${i}@test-api-leads.com`,
          actorId: "test_operator_01",
          actorRole: "SALES_OPERATOR",
        });
      }
    });

    it("should return default paginated leads (page: 1, limit: 20)", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "GET",
        headers: AUTH_HEADERS,
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data).toBeDefined();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.pagination).toBeDefined();
      expect(json.pagination.page).toBe(1);
      expect(json.pagination.limit).toBe(20);
      expect(json.pagination.total).toBeGreaterThanOrEqual(5);
    });

    it("should respect custom page and limit query parameters", async () => {
      const req = new Request("http://localhost:3000/api/leads?page=1&limit=2", {
        method: "GET",
        headers: AUTH_HEADERS,
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data.length).toBeLessThanOrEqual(2);
      expect(json.pagination.limit).toBe(2);
      expect(json.pagination.page).toBe(1);
      expect(json.pagination.totalPages).toBeGreaterThanOrEqual(1);
    });

    it("should reject limit exceeding maximum of 100 with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/leads?limit=150", {
        method: "GET",
        headers: AUTH_HEADERS,
      });

      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(json.error.details)).toContain("Limit cannot exceed 100");
    });

    it("should reject non-positive page number with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/leads?page=0", {
        method: "GET",
        headers: AUTH_HEADERS,
      });

      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("should filter by valid lead status", async () => {
      const req = new Request("http://localhost:3000/api/leads?status=INGESTED&limit=5", {
        method: "GET",
        headers: AUTH_HEADERS,
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      for (const lead of json.data) {
        expect(lead.status).toBe("INGESTED");
      }
    });

    it("should reject invalid status filter with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/leads?status=INVALID_STATUS", {
        method: "GET",
        headers: AUTH_HEADERS,
      });

      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
