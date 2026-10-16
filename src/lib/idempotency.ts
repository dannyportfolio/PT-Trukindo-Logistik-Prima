import crypto from "crypto";
import { Pool } from "pg";
import { getPool } from "./db";

export class IdempotencyConflictError extends Error {
  constructor(
    message: string = "Idempotency key was previously used with a different request payload"
  ) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export interface StoredIdempotencyResult {
  statusCode: number;
  body: unknown;
}

export function computePayloadHash(payload: unknown): string {
  const normalized = JSON.stringify(payload, Object.keys(payload as object || {}).sort());
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

export interface AcquireLeaseOptions {
  maxWaitMs?: number;
  leaseTimeoutMs?: number;
}

/**
 * Handles persistent, concurrency-safe request idempotency backed by PostgreSQL.
 */
export class IdempotencyService {
  constructor(private pool: Pool = getPool()) { }

  /**
   * Attempts to acquire an execution lease for an idempotency key.
   * - If key does not exist: Inserts record in 'PROCESSING' state and returns { acquired: true }
   * - If key exists and completed with identical payload: Returns { acquired: false, cached: { statusCode, body } }
   * - If key exists but payload hash differs: Throws IdempotencyConflictError
   * - If key exists and is 'PROCESSING': Waits up to maxWaitMs for completion, or reclaims expired lease
   */
  async acquireOrGetResult(
    key: string,
    payloadHash: string,
    optionsOrMaxWait?: number | AcquireLeaseOptions
  ): Promise<
    | { acquired: true }
    | { acquired: false; cached: StoredIdempotencyResult }
  > {
    const maxWaitMs =
      typeof optionsOrMaxWait === "number"
        ? optionsOrMaxWait
        : optionsOrMaxWait?.maxWaitMs ?? 3000;
    const leaseTimeoutMs =
      typeof optionsOrMaxWait === "object"
        ? optionsOrMaxWait?.leaseTimeoutMs ?? 10000
        : 10000;

    const client = await this.pool.connect();
    try {
      // 1. Try to atomically insert a 'PROCESSING' lock
      const insertSql = `
        INSERT INTO idempotency_keys (key, payload_hash, status, status_code, response_body)
        VALUES ($1, $2, 'PROCESSING', 0, '{}'::jsonb)
        ON CONFLICT (key) DO NOTHING
        RETURNING key;
      `;
      const insertRes = await client.query(insertSql, [key, payloadHash]);

      if (insertRes.rows.length > 0) {
        // Lease successfully acquired
        return { acquired: true };
      }

      // 2. Key already exists: inspect stored state
      const startWait = Date.now();
      while (Date.now() - startWait < maxWaitMs) {
        const checkSql = `
          SELECT key, payload_hash, status, status_code, response_body,
                 (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) * 1000)::bigint AS age_ms
          FROM idempotency_keys
          WHERE key = $1;
        `;
        const checkRes = await client.query<{
          key: string;
          payload_hash: string;
          status: "PROCESSING" | "COMPLETED" | "FAILED";
          status_code: number;
          response_body: unknown;
          age_ms: number;
        }>(checkSql, [key]);

        if (checkRes.rows.length === 0) {
          // Key was removed after failure, try acquiring again
          return this.acquireOrGetResult(key, payloadHash, {
            maxWaitMs: Math.max(500, maxWaitMs - (Date.now() - startWait)),
            leaseTimeoutMs,
          });
        }

        const record = checkRes.rows[0];

        // Validate payload consistency immediately
        if (record.payload_hash !== payloadHash) {
          throw new IdempotencyConflictError(
            "Idempotency key was previously used with a different request payload"
          );
        }

        if (record.status === "COMPLETED") {
          return {
            acquired: false,
            cached: {
              statusCode: record.status_code,
              body: record.response_body,
            },
          };
        }

        if (record.status === "FAILED") {
          // Previous execution failed, allow re-acquisition
          await client.query("DELETE FROM idempotency_keys WHERE key = $1;", [key]);
          return this.acquireOrGetResult(key, payloadHash, {
            maxWaitMs: Math.max(500, maxWaitMs - (Date.now() - startWait)),
            leaseTimeoutMs,
          });
        }

        // Check if PROCESSING lease has expired on the database clock
        const ageMs = Number(record.age_ms || 0);
        if (ageMs >= leaseTimeoutMs) {
          // Lease expired due to previous process crash or abandonment
          await client.query(
            "DELETE FROM idempotency_keys WHERE key = $1 AND status = 'PROCESSING';",
            [key]
          );
          return this.acquireOrGetResult(key, payloadHash, {
            maxWaitMs: Math.max(500, maxWaitMs - (Date.now() - startWait)),
            leaseTimeoutMs,
          });
        }

        // Wait 50ms before polling again
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // If lease wait timed out and record was left abandoned in PROCESSING:
      // Reclaim the expired processing lease so retry can recover safely
      const finalCheck = await client.query<{ status: string; payload_hash: string }>(
        "SELECT status, payload_hash FROM idempotency_keys WHERE key = $1;",
        [key]
      );
      if (finalCheck.rows.length > 0 && finalCheck.rows[0].status === "PROCESSING") {
        if (finalCheck.rows[0].payload_hash !== payloadHash) {
          throw new IdempotencyConflictError(
            "Idempotency key was previously used with a different request payload"
          );
        }
        await client.query(
          "DELETE FROM idempotency_keys WHERE key = $1 AND status = 'PROCESSING';",
          [key]
        );
        return this.acquireOrGetResult(key, payloadHash, { maxWaitMs: 1000, leaseTimeoutMs });
      }

      throw new Error("Timeout waiting for in-flight concurrent idempotent request to complete");
    } finally {
      client.release();
    }
  }

  /**
   * Finalizes an idempotency record upon successful request execution.
   */
  async completeExecution(
    key: string,
    statusCode: number,
    responseBody: unknown
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `
        UPDATE idempotency_keys
        SET status = 'COMPLETED', status_code = $2, response_body = $3
        WHERE key = $1;
      `;
      await client.query(sql, [key, statusCode, JSON.stringify(responseBody)]);
    } finally {
      client.release();
    }
  }

  /**
   * Cleans up or marks an idempotency lock as failed if the execution threw an error.
   */
  async releaseLock(key: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sql = `
        DELETE FROM idempotency_keys
        WHERE key = $1 AND status = 'PROCESSING';
      `;
      await client.query(sql, [key]);
    } catch {
      // Ignore cleanup error on release
    } finally {
      client.release();
    }
  }
}
