import { describe, it, expect, afterAll } from "vitest";
import {
  checkDatabaseHealth,
  getPool,
  getMigrationPool,
  closePools,
  withTransaction,
  sanitizeConnectionString,
} from "@/lib/db";
import { runMigrations, getAppliedMigrations } from "@/lib/migrator";
import { LeadRepository } from "@/lib/lead-repository";
import { getConfig } from "@/lib/config";
import { PoolClient } from "pg";

describe("Live PostgreSQL Integration Suite", () => {
  afterAll(async () => {
    await closePools();
  });

  it("should probe database health and verify live ping latency via TCP socket", async (ctx) => {
    const health = await checkDatabaseHealth();

    if (!health.isHealthy) {
      const sanitizedUrl = sanitizeConnectionString(getConfig().DATABASE_URL);
      ctx.skip(
        `PostgreSQL is offline or unreachable at ${sanitizedUrl}: ${health.error || "Connection failed"}`
      );
      return;
    }

    expect(health.isHealthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("should execute migrations and verify idempotency with matching checksums", async (ctx) => {
    const health = await checkDatabaseHealth();
    if (!health.isHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const migrationPool = getMigrationPool();

    // 1. First migration run (executed by migration admin/owner)
    const firstRun = await runMigrations(migrationPool);
    expect(firstRun.appliedCount + firstRun.skippedCount).toBeGreaterThanOrEqual(1);

    // 2. Second migration run to verify strict idempotency (0 new applied, matching checksums)
    const secondRun = await runMigrations(migrationPool);
    expect(secondRun.appliedCount).toBe(0);
    expect(secondRun.skippedCount).toBeGreaterThanOrEqual(1);

    // 3. Verify schema_migrations table has records
    const client = await migrationPool.connect();
    try {
      const applied = await getAppliedMigrations(client);
      expect(applied.length).toBeGreaterThanOrEqual(1);
      expect(applied[0].version).toBe("001");
      expect(applied[0].checksum).toBeDefined();
    } finally {
      client.release();
    }
  });

  it("should verify astraops_app role is not a superuser and not the table owner", async (ctx) => {
    const health = await checkDatabaseHealth();
    if (!health.isHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const migrationPool = getMigrationPool();
    const client = await migrationPool.connect();

    try {
      // 1. Check superuser status of astraops_app
      const roleRes = await client.query<{ rolsuper: boolean }>(
        "SELECT rolsuper FROM pg_roles WHERE rolname = 'astraops_app';"
      );
      expect(roleRes.rows.length).toBe(1);
      expect(roleRes.rows[0].rolsuper).toBe(false);

      // 2. Check table owner of leads and audit_logs (must NOT be astraops_app)
      const ownerRes = await client.query<{ tablename: string; tableowner: string }>(
        "SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('leads', 'audit_logs');"
      );
      expect(ownerRes.rows.length).toBe(2);
      for (const row of ownerRes.rows) {
        expect(row.tableowner).not.toBe("astraops_app");
      }
    } finally {
      client.release();
    }
  });

  it("should atomically commit lead and audit log via TCP application connection", async (ctx) => {
    const health = await checkDatabaseHealth();
    if (!health.isHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const pool = getPool();
    const repo = new LeadRepository(pool);

    // 1. Successful atomic insertion using application role
    const lead = await repo.createLead({
      companyName: "Acme Live Test Corp",
      websiteUrl: "https://acme-live.com",
      contactName: "Alice Tester",
      contactEmail: "alice@acme-live.com",
      actorId: "integration_test",
      actorRole: "TEST_RUNNER",
    });

    expect(lead.id).toBeDefined();
    expect(lead.status).toBe("INGESTED");

    // Verify audit log exists
    const fetched = await repo.getLeadWithAudit(lead.id);
    expect(fetched.lead).not.toBeNull();
    expect(fetched.auditLogs.length).toBe(1);
    expect(fetched.auditLogs[0].event_type).toBe("LEAD_INGESTED");
  });

  it("should rollback transaction completely when audit log writing fails", async (ctx) => {
    const health = await checkDatabaseHealth();
    if (!health.isHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const pool = getPool();
    let uncommittedLeadId: string | null = null;

    await expect(
      withTransaction(async (client: PoolClient) => {
        const leadRes = await client.query<{ id: string }>(
          "INSERT INTO leads (company_name, website_url, contact_name, contact_email) VALUES ('Rollback Co', 'https://rollback.com', 'Bob', 'bob@rollback.com') RETURNING id;"
        );
        uncommittedLeadId = leadRes.rows[0].id;

        // Force intentional transaction abort
        throw new Error("Simulated failure during audit log recording");
      }, pool)
    ).rejects.toThrow("Simulated failure during audit log recording");

    // Assert that the lead was rolled back and does not exist in the database
    expect(uncommittedLeadId).not.toBeNull();
    const client = await pool.connect();
    try {
      const checkRes = await client.query("SELECT * FROM leads WHERE id = $1;", [uncommittedLeadId]);
      expect(checkRes.rows.length).toBe(0);
    } finally {
      client.release();
    }
  });

  it("should reject UPDATE, DELETE, and TRUNCATE on audit_logs for the application role", async (ctx) => {
    const health = await checkDatabaseHealth();
    if (!health.isHealthy) {
      ctx.skip("Skipped: PostgreSQL is not available.");
      return;
    }

    const pool = getPool();
    const repo = new LeadRepository(pool);

    // Create a lead to generate an audit log record
    const lead = await repo.createLead({
      companyName: "Immutable Test Corp",
      websiteUrl: "https://immutable.com",
      contactName: "Carol Tester",
      contactEmail: "carol@immutable.com",
    });

    const client = await pool.connect();
    try {
      // 1. Attempting UPDATE on audit_logs must be rejected
      await expect(
        client.query("UPDATE audit_logs SET event_type = 'TAMPERED' WHERE lead_id = $1;", [lead.id])
      ).rejects.toThrow(/permission denied for table audit_logs|Audit log entries are immutable/);

      // 2. Attempting DELETE on audit_logs must be rejected
      await expect(
        client.query("DELETE FROM audit_logs WHERE lead_id = $1;", [lead.id])
      ).rejects.toThrow(/permission denied for table audit_logs|Audit log entries are immutable/);

      // 3. Attempting TRUNCATE on audit_logs must be rejected
      await expect(
        client.query("TRUNCATE TABLE audit_logs;")
      ).rejects.toThrow(/permission denied for table audit_logs|Audit log entries are immutable/);
    } finally {
      client.release();
    }
  });
});
