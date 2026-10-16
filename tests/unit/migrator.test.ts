import { describe, it, expect, vi } from "vitest";
import {
  calculateChecksum,
  loadMigrationFiles,
  runMigrations,
  MigrationChecksumMismatchError,
} from "@/lib/migrator";
import { Pool, PoolClient } from "pg";
import path from "path";

describe("Database Migration Runner & Integrity Engine", () => {
  it("should calculate identical checksums regardless of Windows (CRLF) or Linux (LF) line endings", () => {
    const unixSql = "CREATE TABLE users (\n  id SERIAL PRIMARY KEY\n);\n";
    const windowsSql = "CREATE TABLE users (\r\n  id SERIAL PRIMARY KEY\r\n);\r\n";

    const unixChecksum = calculateChecksum(unixSql);
    const windowsChecksum = calculateChecksum(windowsSql);

    expect(unixChecksum).toBe(windowsChecksum);
    expect(unixChecksum).toHaveLength(64); // SHA256 length
  });

  it("should discover and parse migration 001_create_leads_and_audit.sql", () => {
    const migrationsDir = path.resolve(process.cwd(), "migrations");
    const migrations = loadMigrationFiles(migrationsDir);

    expect(migrations.length).toBeGreaterThanOrEqual(1);

    const first = migrations[0];
    expect(first.version).toBe("001");
    expect(first.name).toBe("create_leads_and_audit");
    expect(first.sql).toContain("CREATE TABLE IF NOT EXISTS leads");
    expect(first.sql).toContain("CREATE TABLE IF NOT EXISTS audit_logs");
    expect(first.sql).toContain("enforce_audit_immutability");
    expect(first.checksum).toBeDefined();
  });

  it("should discover and parse migration 003_create_agent_runs_and_research.sql", () => {
    const migrationsDir = path.resolve(process.cwd(), "migrations");
    const migrations = loadMigrationFiles(migrationsDir);

    const m003 = migrations.find((m) => m.version === "003");
    expect(m003).toBeDefined();
    expect(m003?.name).toBe("create_agent_runs_and_research");
    expect(m003?.sql).toContain("CREATE TABLE IF NOT EXISTS agent_runs");
    expect(m003?.sql).toContain("CREATE TABLE IF NOT EXISTS agent_steps");
    expect(m003?.sql).toContain("CREATE TABLE IF NOT EXISTS company_research");
    expect(m003?.sql).toContain("CREATE TABLE IF NOT EXISTS lead_scores");
    expect(m003?.sql).toContain("chk_lead_status");
    expect(m003?.checksum).toBeDefined();
    expect(m003?.checksum).toHaveLength(64);
  });

  it("should detect already applied migrations and skip them cleanly without re-executing", async () => {
    const mockQuery = vi.fn().mockImplementation((queryText: string) => {
      if (queryText.includes("SELECT id, version, name, checksum")) {
        const files = loadMigrationFiles();
        return Promise.resolve({
          rows: files.map((f, idx) => ({
            id: idx + 1,
            version: f.version,
            name: f.name,
            checksum: calculateChecksum(f.sql),
            applied_at: new Date(),
          })),
        });
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

    const summary = await runMigrations(mockPool);

    expect(summary.appliedCount).toBe(0);
    expect(summary.skippedCount).toBe(loadMigrationFiles().length);
    expect(summary.appliedVersions).toEqual([]);
    // Verify BEGIN was NOT called since no migration was pending
    expect(mockQuery).not.toHaveBeenCalledWith("BEGIN;");
  });

  it("should throw MigrationChecksumMismatchError if a previously applied migration was altered", async () => {
    const mockQuery = vi.fn().mockImplementation((queryText: string) => {
      if (queryText.includes("SELECT id, version, name, checksum")) {
        return Promise.resolve({
          rows: [
            {
              id: 1,
              version: "001",
              name: "create_leads_and_audit",
              checksum: "stale_tampered_checksum_that_does_not_match",
              applied_at: new Date(),
            },
          ],
        });
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

    await expect(runMigrations(mockPool)).rejects.toThrow(MigrationChecksumMismatchError);
  });

  it("should acquire and release pg_advisory_lock to prevent concurrent execution collisions", async () => {
    const mockQuery = vi.fn().mockImplementation((queryText: string) => {
      if (queryText.includes("SELECT id, version, name, checksum")) {
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

    await runMigrations(mockPool);

    // Verify advisory lock was acquired with MIGRATION_ADVISORY_LOCK_ID
    expect(mockQuery).toHaveBeenCalledWith("SELECT pg_advisory_lock($1);", [849204812]);
    // Verify advisory lock was released
    expect(mockQuery).toHaveBeenCalledWith("SELECT pg_advisory_unlock($1);", [849204812]);
  });
});
