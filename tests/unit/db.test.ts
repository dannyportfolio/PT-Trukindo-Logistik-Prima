import { describe, it, expect, vi } from "vitest";
import { sanitizeConnectionString, createPoolConfig, withTransaction } from "@/lib/db";
import { AppConfig } from "@/lib/config";
import { Pool, PoolClient } from "pg";

describe("Database Pool & Security Utilities", () => {
  it("should sanitize passwords in database connection strings", () => {
    const rawUrl = "postgresql://astraops_user:superSecretPassword123@db.internal:5432/astraops";
    const sanitized = sanitizeConnectionString(rawUrl);

    expect(sanitized).not.toContain("superSecretPassword123");
    expect(sanitized).toContain("******");
    expect(sanitized).toContain("db.internal:5432");
  });

  it("should generate proper pool configuration with defaults", () => {
    const mockConfig: AppConfig = {
      PORT: 3000,
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/app_db",
      MIGRATION_DATABASE_URL: "postgresql://admin:adminpass@localhost:5432/app_db",
      DB_POOL_MAX: 15,
      DB_IDLE_TIMEOUT_MS: 45000,
      DB_CONNECTION_TIMEOUT_MS: 3000,
      ROUTER_BASE_URL: "http://localhost:20128/v1",
      LLM_GATEWAY_PROVIDER: "9router",
      API_AUTH_TOKEN: "astraops-secret-token",
      ADMIN_AUTH_TOKEN: "astraops-admin-token",
      VIEWER_AUTH_TOKEN: "astraops-viewer-token",
    };

    const appPoolConfig = createPoolConfig(mockConfig, false);
    expect(appPoolConfig.connectionString).toBe("postgresql://user:pass@localhost:5432/app_db");
    expect(appPoolConfig.max).toBe(15);
    expect(appPoolConfig.idleTimeoutMillis).toBe(45000);
    expect(appPoolConfig.connectionTimeoutMillis).toBe(3000);

    const migrationPoolConfig = createPoolConfig(mockConfig, true);
    expect(migrationPoolConfig.connectionString).toBe(
      "postgresql://admin:adminpass@localhost:5432/app_db"
    );
    expect(migrationPoolConfig.max).toBe(2);
  });

  it("should properly rollback transaction on error and release client", async () => {
    const mockQuery = vi.fn();
    const mockRelease = vi.fn();

    const mockClient = {
      query: mockQuery,
      release: mockRelease,
    } as unknown as PoolClient;

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    // Simulate callback error during transaction
    const transactionAction = async (client: PoolClient) => {
      await client.query("INSERT INTO leads (company_name) VALUES ('Acme');");
      throw new Error("Simulated failure when inserting audit log");
    };

    await expect(withTransaction(transactionAction, mockPool)).rejects.toThrow(
      "Simulated failure when inserting audit log"
    );

    // Verify BEGIN was called
    expect(mockQuery).toHaveBeenCalledWith("BEGIN;");
    // Verify ROLLBACK was called
    expect(mockQuery).toHaveBeenCalledWith("ROLLBACK;");
    // Verify COMMIT was never called
    expect(mockQuery).not.toHaveBeenCalledWith("COMMIT;");
    // Verify client was released
    expect(mockRelease).toHaveBeenCalled();
  });

  it("should properly commit transaction on success and release client", async () => {
    const mockQuery = vi.fn();
    const mockRelease = vi.fn();

    const mockClient = {
      query: mockQuery,
      release: mockRelease,
    } as unknown as PoolClient;

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as Pool;

    const result = await withTransaction(async (client: PoolClient) => {
      await client.query("SELECT 1;");
      return "SUCCESS_DATA";
    }, mockPool);

    expect(result).toBe("SUCCESS_DATA");
    expect(mockQuery).toHaveBeenCalledWith("BEGIN;");
    expect(mockQuery).toHaveBeenCalledWith("COMMIT;");
    expect(mockQuery).not.toHaveBeenCalledWith("ROLLBACK;");
    expect(mockRelease).toHaveBeenCalled();
  });
});
