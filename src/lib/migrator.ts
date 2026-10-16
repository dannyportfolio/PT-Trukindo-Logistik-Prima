import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Pool, PoolClient } from "pg";
import { getMigrationPool } from "./db";

export interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  id: number;
  version: string;
  name: string;
  checksum: string;
  applied_at: Date;
}

export class MigrationError extends Error {
  constructor(message: string, public readonly migrationVersion?: string) {
    super(message);
    this.name = "MigrationError";
  }
}

export class MigrationChecksumMismatchError extends MigrationError {
  constructor(version: string, expectedChecksum: string, recordedChecksum: string) {
    super(
      `Migration ${version} has been modified after being applied. Recorded: ${recordedChecksum}, Computed: ${expectedChecksum}`,
      version
    );
    this.name = "MigrationChecksumMismatchError";
  }
}

/**
 * Calculates SHA256 hex digest of file content normalized for line endings.
 */
export function calculateChecksum(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Discovers and parses all .sql migration files in the target directory in sorted order.
 */
export function loadMigrationFiles(migrationsDir: string = path.resolve(process.cwd(), "migrations")): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  return files.map((filename) => {
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, "utf8");
    const checksum = calculateChecksum(sql);

    // Extract version and name e.g. 001_create_leads_and_audit.sql
    const match = filename.match(/^(\d+)_(.+)\.sql$/);
    const version = match ? match[1] : filename;
    const name = match ? match[2] : filename;

    return {
      version,
      name,
      filename,
      sql,
      checksum,
    };
  });
}

/**
 * Ensures schema_migrations tracking table exists.
 */
export async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `;
  await client.query(sql);
}

/**
 * Fetches all applied migrations sorted by id ascending.
 */
export async function getAppliedMigrations(client: PoolClient): Promise<AppliedMigration[]> {
  await ensureMigrationsTable(client);
  const result = await client.query<AppliedMigration>(
    "SELECT id, version, name, checksum, applied_at FROM schema_migrations ORDER BY id ASC;"
  );
  return result.rows;
}

export interface MigrationRunSummary {
  appliedCount: number;
  skippedCount: number;
  appliedVersions: string[];
}

export const MIGRATION_ADVISORY_LOCK_ID = 849204812;

/**
 * Executes pending database migrations transactionally with concurrency safety.
 * Uses PostgreSQL advisory locking to serialize concurrent migration runs across processes.
 * Rejects with error if an already applied migration has an altered checksum.
 */
export async function runMigrations(
  pool: Pool = getMigrationPool(),
  migrationsDir?: string
): Promise<MigrationRunSummary> {
  const client = await pool.connect();
  const appliedVersions: string[] = [];
  let skippedCount = 0;
  let lockAcquired = false;

  try {
    // Acquire exclusive session-level advisory lock to serialize concurrent migrations
    await client.query("SELECT pg_advisory_lock($1);", [MIGRATION_ADVISORY_LOCK_ID]);
    lockAcquired = true;

    await ensureMigrationsTable(client);
    const appliedList = await getAppliedMigrations(client);
    const appliedMap = new Map(appliedList.map((m) => [m.version, m]));

    const availableMigrations = loadMigrationFiles(migrationsDir);

    for (const migration of availableMigrations) {
      const alreadyApplied = appliedMap.get(migration.version);

      if (alreadyApplied) {
        if (alreadyApplied.checksum !== migration.checksum) {
          throw new MigrationChecksumMismatchError(
            migration.version,
            migration.checksum,
            alreadyApplied.checksum
          );
        }
        skippedCount++;
        continue;
      }

      // Apply migration inside a dedicated transaction block
      await client.query("BEGIN;");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3);",
          [migration.version, migration.name, migration.checksum]
        );
        await client.query("COMMIT;");
        appliedVersions.push(migration.version);
      } catch (err) {
        await client.query("ROLLBACK;");
        throw new MigrationError(
          `Failed to execute migration ${migration.version} (${migration.filename}): ${
            err instanceof Error ? err.message : String(err)
          }`,
          migration.version
        );
      }
    }

    return {
      appliedCount: appliedVersions.length,
      skippedCount,
      appliedVersions,
    };
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1);", [MIGRATION_ADVISORY_LOCK_ID]);
      } catch (unlockErr) {
        console.error(
          "[Migration Concurrency] Failed to release advisory lock:",
          unlockErr instanceof Error ? unlockErr.message : String(unlockErr)
        );
      }
    }
    client.release();
  }
}
