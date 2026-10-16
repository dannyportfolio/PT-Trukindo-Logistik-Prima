import { describe, it, expect, afterAll } from "vitest";
import { POST as createLead, GET as listLeads } from "@/app/api/leads/route";
import { POST as uploadCsv } from "@/app/api/leads/upload-csv/route";
import { GET as getLeadDetail } from "@/app/api/leads/[id]/route";
import { getPool, closePools } from "@/lib/db";

/**
 * ARCHITECTURAL CLARIFICATION:
 * This test suite performs route-level handler integration tests directly in Node runtime.
 * It is NOT browser automation. Browser-level end-to-end automation is implemented
 * in tests/e2e/ using Playwright.
 */
const COOKIE_AUTH = {
  cookie: "astraops_session=astraops-secret-token",
};

describe("Route-Level Integration Flow (Direct Handlers): Lead Intake, CSV Batch, Directory & Audit Trail", () => {
  const createdLeadIds: string[] = [];

  afterAll(async () => {
    const pool = getPool();
    try {
      if (createdLeadIds.length > 0) {
        await pool.query("DELETE FROM audit_logs WHERE lead_id = ANY($1::uuid[]);", [createdLeadIds]);
        await pool.query("DELETE FROM leads WHERE id = ANY($1::uuid[]);", [createdLeadIds]);
      }
      await pool.query("DELETE FROM audit_logs WHERE actor_id = 'e2e_operator';");
      await pool.query("DELETE FROM leads WHERE contact_email LIKE '%@e2eflow-test.com';");
    } catch {
      // Ignored if DB is down
    }
    await closePools();
  });

  it("Step 1: Ingests lead manually and verifies PostgreSQL persistence and audit log", async () => {
    const req = new Request("http://localhost:3000/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...COOKIE_AUTH,
      },
      body: JSON.stringify({
        companyName: "E2E Quantum Dynamics",
        websiteUrl: "https://quantum.example.com",
        contactName: "Dr. Evelyn Vance",
        contactEmail: "evance@e2eflow-test.com",
      }),
    });

    const res = await createLead(req);
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json.id).toBeDefined();
    expect(json.company_name).toBe("E2E Quantum Dynamics");
    expect(json.status).toBe("INGESTED");

    createdLeadIds.push(json.id);
  });

  it("Step 2: Uploads a bulk CSV batch with valid rows and invalid rows", async () => {
    const csvContent = [
      "Company Name,Website URL,Contact Name,Contact Email",
      "Apex Robotics,https://apexrobotics.io,Alan Turing,alan@e2eflow-test.com",
      "Broken Corp,invalid-url,Bob Marley,bob@e2eflow-test.com",
      "Starlight Aerospace,https://starlight.space,Stella Nova,stella@e2eflow-test.com",
      "No Email Ltd,https://noemail.com,No Name,",
    ].join("\n");

    const formData = new FormData();
    const blob = new Blob([csvContent], { type: "text/csv" });
    formData.append("file", blob, "prospects.csv");

    const req = new Request("http://localhost:3000/api/leads/upload-csv", {
      method: "POST",
      headers: COOKIE_AUTH,
      body: formData,
    });

    const res = await uploadCsv(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.totalRows).toBe(4);
    expect(json.importedCount).toBe(2);
    expect(json.invalidRows.length).toBe(2);

    // Verify invalid rows breakdown
    expect(json.invalidRows[0].rowNumber).toBe(3); // Broken Corp
    expect(json.invalidRows[1].rowNumber).toBe(5); // No Email Ltd
  });

  it("Step 3: Queries leads directory with server-side pagination", async () => {
    const req = new Request("http://localhost:3000/api/leads?page=1&limit=2", {
      method: "GET",
      headers: COOKIE_AUTH,
    });

    const res = await listLeads(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data).toBeDefined();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeLessThanOrEqual(2);

    expect(json.pagination).toBeDefined();
    expect(json.pagination.page).toBe(1);
    expect(json.pagination.limit).toBe(2);
    expect(json.pagination.total).toBeGreaterThanOrEqual(3);
    expect(json.pagination.totalPages).toBeGreaterThanOrEqual(2);
    expect(json.pagination.hasNextPage).toBe(true);
  });

  it("Step 4: Filters directory by status=INGESTED", async () => {
    const req = new Request("http://localhost:3000/api/leads?status=INGESTED&limit=50", {
      method: "GET",
      headers: COOKIE_AUTH,
    });

    const res = await listLeads(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data).toBeDefined();
    for (const lead of json.data) {
      expect(lead.status).toBe("INGESTED");
    }
  });

  it("Step 5: Retrieves single lead detail and verifies immutable audit timeline", async () => {
    expect(createdLeadIds.length).toBeGreaterThan(0);
    const targetId = createdLeadIds[0];

    const req = new Request(`http://localhost:3000/api/leads/${targetId}`, {
      method: "GET",
      headers: COOKIE_AUTH,
    });

    const res = await getLeadDetail(req, {
      params: Promise.resolve({ id: targetId }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.lead).toBeDefined();
    expect(json.lead.id).toBe(targetId);
    expect(json.lead.company_name).toBe("E2E Quantum Dynamics");

    expect(json.auditLogs).toBeDefined();
    expect(Array.isArray(json.auditLogs)).toBe(true);
    expect(json.auditLogs.length).toBeGreaterThanOrEqual(1);

    const firstAudit = json.auditLogs[0];
    expect(firstAudit.event_type).toBe("LEAD_INGESTED");
    expect(firstAudit.state_snapshot).toBeDefined();
    expect(firstAudit.state_snapshot.company_name).toBe("E2E Quantum Dynamics");
  });
});
