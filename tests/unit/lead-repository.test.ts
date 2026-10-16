import { describe, it, expect, vi } from "vitest";
import { LeadRepository } from "@/lib/lead-repository";
import { Pool, PoolClient } from "pg";

describe("LeadRepository Transactional Unit Tests", () => {
  it("should rollback lead creation if writing audit log throws an error", async () => {
    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO leads")) {
        return Promise.resolve({
          rows: [
            {
              id: "550e8400-e29b-41d4-a716-446655440000",
              company_name: "Acme Corp",
              website_url: "https://acme.com",
              contact_name: "John Doe",
              contact_email: "john@acme.com",
              status: "INGESTED",
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });
      }

      if (sql.includes("INSERT INTO audit_logs")) {
        // Simulate database constraint failure or trigger exception on audit log insert
        return Promise.reject(new Error("Audit log insert failed: database disk write error"));
      }

      return Promise.resolve({ rows: [] });
    });

    const mockClient = {
      query: mockQuery,
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    const repo = new LeadRepository(mockPool);

    await expect(
      repo.createLead({
        companyName: "Acme Corp",
        websiteUrl: "https://acme.com",
        contactName: "John Doe",
        contactEmail: "john@acme.com",
      })
    ).rejects.toThrow("Audit log insert failed: database disk write error");

    // Verify BEGIN was called
    expect(mockQuery).toHaveBeenCalledWith("BEGIN;");
    // Verify ROLLBACK was called because audit log failed
    expect(mockQuery).toHaveBeenCalledWith("ROLLBACK;");
    // Verify COMMIT was never called
    expect(mockQuery).not.toHaveBeenCalledWith("COMMIT;");
  });

  it("should commit lead and audit log atomically on successful creation", async () => {
    const mockLead = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      company_name: "Acme Corp",
      website_url: "https://acme.com",
      contact_name: "John Doe",
      contact_email: "john@acme.com",
      status: "INGESTED" as const,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO leads")) {
        return Promise.resolve({ rows: [mockLead] });
      }
      if (sql.includes("INSERT INTO audit_logs")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const mockClient = {
      query: mockQuery,
      release: vi.fn(),
    } as unknown as PoolClient;

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    const repo = new LeadRepository(mockPool);

    const created = await repo.createLead({
      companyName: "Acme Corp",
      websiteUrl: "https://acme.com",
      contactName: "John Doe",
      contactEmail: "john@acme.com",
      actorId: "operator_01",
      actorRole: "SALES_OPERATOR",
    });

    expect(created.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(mockQuery).toHaveBeenCalledWith("BEGIN;");
    expect(mockQuery).toHaveBeenCalledWith("COMMIT;");
    expect(mockQuery).not.toHaveBeenCalledWith("ROLLBACK;");
  });
});
