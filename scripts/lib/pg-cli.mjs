// Shared helpers for PostgreSQL operational scripts (backup, restore, DR drill, verify).
// Supports two execution modes for the pg CLI tools:
//   1. "local"  — pg_dump/pg_restore/psql available on PATH (operator machine).
//   2. "docker" — fall back to running the tool inside the compose `postgres` container.

import { spawnSync } from "node:child_process";

const DEFAULT_CONNECTION = "postgresql://astraops_admin:adminpass@localhost:5432/astraops";

export function resolveConnection(environ = process.env) {
  return environ.MIGRATION_DATABASE_URL || environ.DATABASE_URL || DEFAULT_CONNECTION;
}

export function redactConnection(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "******";
    }
    return parsed.toString();
  } catch {
    return "[redacted-connection]";
  }
}

export function parseConnection(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username || ""),
    password: decodeURIComponent(parsed.password || ""),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres",
    sslmode: parsed.searchParams.get("sslmode"),
  };
}

/** Returns the same connection string but pointing at a different database. */
export function withDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** Locates an executable on PATH. Returns null when it is not available. */
export function findTool(name) {
  const result = spawnSync(`command -v ${name}`, { shell: true, encoding: "utf8" });
  if (result.status === 0) {
    const found = (result.stdout || "").trim();
    if (found) {
      return found;
    }
  }
  return null;
}

/** Returns true when the named docker compose service is currently running. */
export function composeServiceRunning(service = process.env.BACKUP_DOCKER_SERVICE || "postgres") {
  const result = spawnSync("docker", ["compose", "ps", "--status", "running", "--services"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return false;
  }
  return (result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .includes(service);
}

/**
 * Chooses where a pg CLI tool runs.
 *
 * BACKUP_MODE = auto (default) | local | docker
 *
 * In "auto" mode we deliberately prefer the tooling inside the running compose
 * `postgres` container: it ships the exact client version that matches the server,
 * which avoids version-skew problems (e.g. a newer pg_dump emitting GUCs such as
 * `transaction_timeout` that an older server rejects). When no compose service is
 * running (e.g. against a managed database) we use the local binary when present.
 */
export function pickMode(tool) {
  const preferred = (process.env.BACKUP_MODE || "auto").toLowerCase();
  if (preferred === "local") {
    return "local";
  }
  if (preferred === "docker") {
    return "docker";
  }
  if (composeServiceRunning()) {
    return "docker";
  }
  return findTool(tool) ? "local" : "docker";
}

/**
 * Runs a PostgreSQL CLI tool, preferring the local binary and falling back to
 * `docker compose exec` inside the postgres service when unavailable.
 * Always pass explicit `-U <user>` / `-d <database>` flags so both modes behave identically.
 */
export function runPg(tool, args, options = {}) {
  const {
    connection = resolveConnection(),
    dockerService = process.env.BACKUP_DOCKER_SERVICE || "postgres",
    input,
    mode = pickMode(tool),
  } = options;

  if (mode === "local") {
    const localTool = findTool(tool);
    if (!localTool) {
      throw new Error(`pg tool "${tool}" was not found on PATH but BACKUP_MODE=local was requested`);
    }
    const conn = parseConnection(connection);
    return spawnSync(localTool, args, {
      encoding: "buffer",
      input,
      maxBuffer: 1024 * 1024 * 512,
      env: {
        ...process.env,
        PGHOST: conn.host,
        PGPORT: conn.port,
        PGUSER: conn.user,
        PGPASSWORD: conn.password,
        PGDATABASE: conn.database,
      },
    });
  }

  return spawnSync(
    "docker",
    ["compose", "exec", "-T", dockerService, tool, ...args],
    {
      encoding: "buffer",
      input,
      maxBuffer: 1024 * 1024 * 512,
    }
  );
}

export function toText(buffer) {
  if (buffer === undefined || buffer === null) {
    return "";
  }
  return Buffer.isBuffer(buffer) ? buffer.toString("utf8") : String(buffer);
}
