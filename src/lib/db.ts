import { Pool, PoolClient, PoolConfig } from "pg";
import { getConfig, AppConfig } from "./config";

export class DatabaseError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = "DatabaseError";
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(message: string, originalError?: unknown) {
    super(message, originalError);
    this.name = "DatabaseConnectionError";
  }
}

/**
 * Strips password and sensitive auth parameters from a connection string for safe logging.
 */
export function sanitizeConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = "******";
    }
    return url.toString();
  } catch {
    return "[redacted-connection-string]";
  }
}

let appPool: Pool | null = null;
let migrationPool: Pool | null = null;

export function createPoolConfig(config: AppConfig, isMigration = false): PoolConfig {
  const connectionString = isMigration
    ? config.MIGRATION_DATABASE_URL || config.DATABASE_URL
    : config.DATABASE_URL;

  return {
    connectionString,
    max: isMigration ? 2 : config.DB_POOL_MAX,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
  };
}

export function getPool(): Pool {
  if (!appPool) {
    const config = getConfig();
    appPool = new Pool(createPoolConfig(config, false));

    appPool.on("error", (err) => {
      // Unhandled idle client errors
      console.error("[Database Pool Error] Idle client experienced an error:", err.message);
    });
  }
  return appPool;
}

export function getMigrationPool(): Pool {
  if (!migrationPool) {
    const config = getConfig();
    migrationPool = new Pool(createPoolConfig(config, true));

    migrationPool.on("error", (err) => {
      console.error("[Migration Pool Error] Idle client experienced an error:", err.message);
    });
  }
  return migrationPool;
}

export async function closePools(): Promise<void> {
  if (appPool) {
    await appPool.end();
    appPool = null;
  }
  if (migrationPool) {
    await migrationPool.end();
    migrationPool = null;
  }
}

export interface HealthCheckResult {
  isHealthy: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Pings the database with a lightweight SELECT 1 query and measures round-trip latency.
 */
export async function checkDatabaseHealth(pool: Pool = getPool()): Promise<HealthCheckResult> {
  const start = Date.now();
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    await client.query("SELECT 1 AS ok;");
    const latencyMs = Date.now() - start;
    return {
      isHealthy: true,
      latencyMs,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const safeMsg = err instanceof Error ? err.message : String(err);
    return {
      isHealthy: false,
      latencyMs,
      error: safeMsg,
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Executes a callback within a managed database transaction.
 * Automatically handles BEGIN, COMMIT, and ROLLBACK upon error.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
  pool: Pool = getPool()
): Promise<T> {
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (err: unknown) {
    throw new DatabaseConnectionError(
      "Failed to acquire client from database pool for transaction",
      err
    );
  }

  try {
    await client.query("BEGIN;");
    const result = await callback(client);
    await client.query("COMMIT;");
    return result;
  } catch (error: unknown) {
    try {
      await client.query("ROLLBACK;");
    } catch (rollbackErr: unknown) {
      console.error("[Transaction Rollback Error] Failed to rollback transaction:", rollbackErr);
    }
    throw error;
  } finally {
    client.release();
  }
}
