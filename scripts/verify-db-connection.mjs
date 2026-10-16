// Connectivity & runtime verification for the AstraOps PostgreSQL database.
//
// Reports server version, current role/database, TLS status, replication role,
// round-trip latency and applied migration count. Exits non-zero on failure so it
// can be used as a deployment / readiness gate.
//
// Usage:
//   npm run db:verify

import pg from "pg";
import { resolveConnection, redactConnection, parseConnection } from "./lib/pg-cli.mjs";

const { Client } = pg;

function sslFromEnv() {
  const mode = process.env.DB_SSL_MODE || "auto";
  if (mode === "disable") {
    return false;
  }
  if (mode === "require") {
    return { rejectUnauthorized: false };
  }
  if (mode === "verify-full") {
    const ca = process.env.DB_SSL_CA_CERT
      ? process.env.DB_SSL_CA_CERT.replace(/\\n/g, "\n")
      : undefined;
    return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  }
  return undefined;
}

async function main() {
  const connection = resolveConnection();
  const { host, port, database } = parseConnection(connection);
  const sslMode = process.env.DB_SSL_MODE || "auto";

  console.log(`[db:verify] target   : ${redactConnection(connection)}`);
  console.log(`[db:verify] host     : ${host}:${port}  db=${database}`);
  console.log(`[db:verify] ssl mode : ${sslMode}`);

  const client = new Client({
    connectionString: connection,
    application_name: process.env.DB_APPLICATION_NAME || "astraops-verify",
    ...(sslFromEnv() !== undefined ? { ssl: sslFromEnv() } : {}),
  });

  const start = Date.now();
  try {
    await client.connect();
  } catch (err) {
    console.error(`[db:verify] FAIL: unable to connect — ${err.message}`);
    process.exit(1);
  }
  const latencyMs = Date.now() - start;

  try {
    const version = await client.query("SHOW server_version;");
    const identity = await client.query("SELECT current_user AS user, current_database() AS db;");
    const ssl = await client.query(
      "SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid();"
    );
    const recovery = await client.query("SELECT pg_is_in_recovery() AS replica;");
    const migrationsTable = await client.query(
      "SELECT to_regclass('public.schema_migrations') AS tbl;"
    );

    let migrationsApplied = 0;
    if (migrationsTable.rows[0]?.tbl) {
      const res = await client.query("SELECT count(*)::int AS count FROM schema_migrations;");
      migrationsApplied = res.rows[0].count;
    }

    console.log(`[db:verify] latency  : ${latencyMs} ms`);
    console.log(`[db:verify] server   : PostgreSQL ${version.rows[0].server_version}`);
    console.log(`[db:verify] identity : ${identity.rows[0].user}@${identity.rows[0].db}`);
    console.log(
      `[db:verify] tls      : ${ssl.rows[0]?.ssl ? `active (${ssl.rows[0].version})` : "inactive (plaintext)"}`
    );
    console.log(
      `[db:verify] role     : ${recovery.rows[0].replica ? "standby/replica (read-only)" : "primary (read-write)"}`
    );
    console.log(`[db:verify] migrations applied: ${migrationsApplied}`);
    console.log(`[db:verify] PASS`);
  } catch (err) {
    console.error(`[db:verify] FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[db:verify] FAIL: ${err.message}`);
  process.exit(1);
});
