import fs from "fs";
import path from "path";
import crypto from "crypto";
import pg from "pg";

const { Pool } = pg;

function calculateChecksum(sql) {
  const normalized = sql.replace(/\r\n/g, "\n").trim();
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

async function main() {
  const connectionString =
    process.env.MIGRATION_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://astraops_admin:adminpass@localhost:5432/astraops";

  console.log(`[AstraOps Migrator] Connecting to database...`);
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    // Acquire PostgreSQL advisory lock to serialize concurrent migrations
    await client.query("SELECT pg_advisory_lock(849204812);");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows: applied } = await client.query(
      "SELECT version, checksum FROM schema_migrations ORDER BY id ASC;"
    );
    const appliedMap = new Map(applied.map((r) => [r.version, r.checksum]));

    const migrationsDir = path.resolve(process.cwd(), "migrations");
    if (!fs.existsSync(migrationsDir)) {
      console.log(`[AstraOps Migrator] No migrations directory found at ${migrationsDir}`);
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) continue;
      const [, version, name] = match;
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      const checksum = calculateChecksum(sql);

      if (appliedMap.has(version)) {
        if (appliedMap.get(version) !== checksum) {
          throw new Error(
            `Migration checksum mismatch for ${version} (${file})! Recorded: ${appliedMap.get(version)}, Computed: ${checksum}`
          );
        }
        continue;
      }

      console.log(`[AstraOps Migrator] Applying migration: ${file}...`);
      await client.query("BEGIN;");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3);",
          [version, name, checksum]
        );
        await client.query("COMMIT;");
        appliedCount++;
        console.log(`[AstraOps Migrator] Successfully applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK;");
        throw err;
      }
    }

    console.log(
      `[AstraOps Migrator] Migration check complete. ${appliedCount} new migration(s) applied. Total applied: ${
        applied.length + appliedCount
      }.`
    );
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(849204812);");
    } catch {
      // Ignored
    }
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[AstraOps Migrator] Migration failed:", err.message);
  process.exit(1);
});
