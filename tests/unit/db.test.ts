import { describe, it, expect, vi } from "vitest";
import {
  sanitizeConnectionString,
  createPoolConfig,
  buildSslConfig,
  normalizeCaCert,
  withTransaction,
} from "@/lib/db";
import { AppConfig } from "@/lib/config";
import { Pool, PoolClient } from "pg";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    PORT: 3000,
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/app_db",
    MIGRATION_DATABASE_URL: "postgresql://admin:adminpass@localhost:5432/app_db",
    DB_POOL_MAX: 15,
    DB_IDLE_TIMEOUT_MS: 45000,
    DB_CONNECTION_TIMEOUT_MS: 3000,
    DB_SSL_MODE: "auto",
    DB_APPLICATION_NAME: "astraops",
    ROUTER_BASE_URL: "http://localhost:20128/v1",
    LLM_GATEWAY_PROVIDER: "9router",
    API_AUTH_TOKEN: "astraops-secret-token",
    ADMIN_AUTH_TOKEN: "astraops-admin-token",
    VIEWER_AUTH_TOKEN: "astraops-viewer-token",
    LLM_FALLBACK_ON_ERROR: true,
    OPENAI_API_BASE_URL: "https://api.openai.com/v1",
    EMAIL_FROM: "PT Trukindo Logistik Prima <inquiry@trukindo.co.id>",
    TELEMATICS_WEBHOOK_SECRET: "trukindo-telematics-secret-2026",
    ...overrides,
  };
}

describe("Database Pool & Security Utilities", () => {
  it("should sanitize passwords in database connection strings", () => {
    const rawUrl = "postgresql://astraops_user:superSecretPassword123@db.internal:5432/astraops";
    const sanitized = sanitizeConnectionString(rawUrl);

    expect(sanitized).not.toContain("superSecretPassword123");
    expect(sanitized).toContain("******");
    expect(sanitized).toContain("db.internal:5432");
  });

  it("should generate proper pool configuration with defaults", () => {
    const mockConfig = makeConfig();

    const appPoolConfig = createPoolConfig(mockConfig, false);
    expect(appPoolConfig.connectionString).toBe("postgresql://user:pass@localhost:5432/app_db");
    expect(appPoolConfig.max).toBe(15);
    expect(appPoolConfig.idleTimeoutMillis).toBe(45000);
    expect(appPoolConfig.connectionTimeoutMillis).toBe(3000);
    expect(appPoolConfig.application_name).toBe("astraops");
    // In "auto" mode we must not force an ssl option, so the connection string's
    // own sslmode (if any) is respected by the driver.
    expect(appPoolConfig.ssl).toBeUndefined();

    const migrationPoolConfig = createPoolConfig(mockConfig, true);
    expect(migrationPoolConfig.connectionString).toBe(
      "postgresql://admin:adminpass@localhost:5432/app_db"
    );
    expect(migrationPoolConfig.max).toBe(2);
  });

  describe("TLS / SSL configuration for managed PostgreSQL", () => {
    it("should build TLS options per mode", () => {
      const requireConfig = makeConfig({ DB_SSL_MODE: "require" });
      expect(buildSslConfig(requireConfig)).toEqual({ rejectUnauthorized: false });

      const verifyConfig = makeConfig({ DB_SSL_MODE: "verify-full" });
      expect(buildSslConfig(verifyConfig)).toEqual({ rejectUnauthorized: true });

      const disableConfig = makeConfig({ DB_SSL_MODE: "disable" });
      expect(buildSslConfig(disableConfig)).toBe(false);

      const autoConfig = makeConfig({ DB_SSL_MODE: "auto" });
      expect(buildSslConfig(autoConfig)).toBeUndefined();
    });

    it("should attach the CA certificate in verify-full mode", () => {
      const pem = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
      const verifyConfig = makeConfig({ DB_SSL_MODE: "verify-full", DB_SSL_CA_CERT: pem });

      expect(buildSslConfig(verifyConfig)).toEqual({
        rejectUnauthorized: true,
        ca: pem,
      });
    });

    it("should normalize escaped newlines in single-line CA env values", () => {
      const escaped = "-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----";
      expect(normalizeCaCert(escaped)).toBe(
        "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----"
      );
      expect(normalizeCaCert(undefined)).toBeUndefined();
    });

    it("should include ssl in the pool config when a mode is set explicitly", () => {
      const poolConfig = createPoolConfig(makeConfig({ DB_SSL_MODE: "require" }), false);
      expect(poolConfig.ssl).toEqual({ rejectUnauthorized: false });
    });
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
