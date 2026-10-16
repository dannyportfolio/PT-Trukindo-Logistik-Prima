import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { POST } from "@/app/api/inquiries/route";
import { getPool, closePools } from "@/lib/db";
import { inquiryRateLimiter } from "@/lib/rate-limit";

describe("API Route Handlers: POST /api/inquiries", () => {
  beforeEach(() => {
    inquiryRateLimiter.clear();
  });

  afterAll(async () => {
    inquiryRateLimiter.clear();
    await closePools();
  });

  const validPayload = {
    companyName: "PT Sukses Logistik Makmur",
    contactName: "Budi Santoso",
    contactEmail: "budi.santoso@sukseslogistik.co.id",
    contactPhone: "+6281234567890",
    jobTitle: "Supply Chain Manager",
    serviceCategory: "FTL_TRUCKING",
    cargoType: "FMCG_CONSUMER_GOODS",
    originCity: "Jakarta Barat",
    destinationCity: "Surabaya",
    truckType: "TRONTON_WINGBOX",
    estimatedVolumeWeight: "15 Ton / 45 CBM",
    estimatedShippingFrequency: "WEEKLY",
    firstLoadingDate: "2026-11-01",
    additionalNotes: "Membutuhkan armada dengan driver berseragam dan terpal rapat.",
    honeypot: "",
    formRenderTimestamp: Date.now() - 5000, // 5 seconds ago
  };

  it("should successfully ingest valid inquiry, persist to PostgreSQL, and return 201 with reference number", async () => {
    const req = new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "103.20.10.1",
      },
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.inquiryId).toBeDefined();
    expect(json.referenceNumber).toMatch(/^TRK-[A-F0-9]{8}$/);
    expect(json.message).toContain("berhasil dikirim");

    // Verify persistence in PostgreSQL
    const pool = getPool();
    const leadRes = await pool.query("SELECT * FROM leads WHERE id = $1;", [json.inquiryId]);
    expect(leadRes.rows.length).toBe(1);

    const lead = leadRes.rows[0];
    expect(lead.company_name).toBe(validPayload.companyName);
    expect(lead.contact_name).toBe(validPayload.contactName);
    expect(lead.contact_email).toBe(validPayload.contactEmail);
    expect(lead.phone).toBe(validPayload.contactPhone);
    expect(lead.status).toBe("INGESTED");
    expect(lead.source).toBe("INBOUND_INQUIRY");
    expect(lead.inquiry_details).toBeDefined();
    expect(lead.inquiry_details.originCity).toBe("Jakarta Barat");
    expect(lead.inquiry_details.destinationCity).toBe("Surabaya");
    expect(lead.inquiry_details.serviceCategory).toBe("FTL_TRUCKING");
    expect(lead.inquiry_details.cargoType).toBe("FMCG_CONSUMER_GOODS");

    // Verify audit log entry exists
    const auditRes = await pool.query(
      "SELECT * FROM audit_logs WHERE lead_id = $1 ORDER BY recorded_at DESC;",
      [json.inquiryId]
    );
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].event_type).toBe("INQUIRY_RECEIVED");
    expect(auditRes.rows[0].actor_id).toBe("public_inquiry");
    expect(auditRes.rows[0].actor_role).toBe("public_inquiry");

    // Verify no agent run was triggered automatically
    const runsRes = await pool.query("SELECT * FROM agent_runs WHERE lead_id = $1;", [json.inquiryId]);
    expect(runsRes.rows.length).toBe(0);
  });

  it("should reject bot submissions when honeypot field is filled with 422", async () => {
    const req = new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "103.20.10.2",
      },
      body: JSON.stringify({
        ...validPayload,
        honeypot: "http://malicious-spam-url.com",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error?.code).toBe("BOT_DETECTED");
  });

  it("should reject sub-second rapid submissions (< 3000ms) with 422", async () => {
    const req = new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "103.20.10.3",
      },
      body: JSON.stringify({
        ...validPayload,
        formRenderTimestamp: Date.now() - 500, // Only 500ms elapsed
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error?.code).toBe("SUBMISSION_TOO_FAST");
  });

  it("should reject invalid email or missing required fields with 400", async () => {
    const req = new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "103.20.10.4",
      },
      body: JSON.stringify({
        ...validPayload,
        contactEmail: "not-an-email",
        companyName: "",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should enforce 5 requests per hour rate limiting and return 429 on 6th attempt", async () => {
    const ip = "192.168.100.50";

    for (let i = 1; i <= 5; i++) {
      const req = new Request("http://localhost:3000/api/inquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({
          ...validPayload,
          contactEmail: `tester${i}@example.com`,
          formRenderTimestamp: Date.now() - 5000,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
    }

    // 6th request within window must be rate limited
    const blockedReq = new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({
        ...validPayload,
        contactEmail: "tester6@example.com",
        formRenderTimestamp: Date.now() - 5000,
      }),
    });

    const blockedRes = await POST(blockedReq);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("Retry-After")).toBeDefined();

    const blockedJson = await blockedRes.json();
    expect(blockedJson.error?.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("should respect Idempotency-Key and avoid duplicate submissions on retry", async () => {
    const idempotencyKey = "inquiry-idem-test-" + Date.now();

    const req1 = new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "103.20.10.7",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(validPayload),
    });

    const res1 = await POST(req1);
    expect(res1.status).toBe(201);
    const json1 = await res1.json();

    // Second request with same idempotency key and identical body
    const req2 = new Request("http://localhost:3000/api/inquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "103.20.10.7",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(validPayload),
    });

    const res2 = await POST(req2);
    expect(res2.status).toBe(201);
    const json2 = await res2.json();

    expect(json2.inquiryId).toBe(json1.inquiryId);
    expect(json2.referenceNumber).toBe(json1.referenceNumber);

    // Verify only one record was inserted into database
    const pool = getPool();
    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM leads WHERE id = $1;",
      [json1.inquiryId]
    );
    expect(countRes.rows[0].cnt).toBe(1);
  });
});
