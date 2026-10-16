import { describe, it, expect } from "vitest";
import { loadConfig } from "@/lib/config";

describe("Centralized Environment Configuration (loadConfig)", () => {
  it("should load configuration with valid values and apply defaults", () => {
    const rawEnv = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/astraops",
    };

    const config = loadConfig(rawEnv);

    expect(config.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/astraops");
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe("development");
    expect(config.ROUTER_BASE_URL).toBe("http://localhost:20128/v1");
    expect(config.LLM_GATEWAY_PROVIDER).toBe("9router");
  });

  it("should respect custom environment overrides", () => {
    const rawEnv = {
      PORT: "8080",
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://remote-host:5432/production_db",
      ROUTER_BASE_URL: "http://10.0.0.5:20128/v1",
      LLM_GATEWAY_PROVIDER: "direct",
    };

    const config = loadConfig(rawEnv);

    expect(config.PORT).toBe(8080);
    expect(config.NODE_ENV).toBe("production");
    expect(config.DATABASE_URL).toBe("postgresql://remote-host:5432/production_db");
    expect(config.ROUTER_BASE_URL).toBe("http://10.0.0.5:20128/v1");
    expect(config.LLM_GATEWAY_PROVIDER).toBe("direct");
  });

  it("should throw error when DATABASE_URL is missing", () => {
    const rawEnv = {};

    expect(() => loadConfig(rawEnv)).toThrow(
      /Environment configuration validation failed: DATABASE_URL: Required|DATABASE_URL is required/
    );
  });

  it("should throw error when ROUTER_BASE_URL is not a valid URL", () => {
    const rawEnv = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/astraops",
      ROUTER_BASE_URL: "not-a-valid-url",
    };

    expect(() => loadConfig(rawEnv)).toThrow(
      /ROUTER_BASE_URL: Invalid url/
    );
  });

  it("should default TLS mode to 'auto' and application name to 'astraops'", () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/astraops",
    });

    expect(config.DB_SSL_MODE).toBe("auto");
    expect(config.DB_APPLICATION_NAME).toBe("astraops");
    expect(config.DB_SSL_CA_CERT).toBeUndefined();
  });

  it("should accept explicit TLS modes for managed PostgreSQL", () => {
    for (const mode of ["disable", "require", "verify-full"] as const) {
      const config = loadConfig({
        DATABASE_URL: "postgresql://postgres:postgres@db.example.com:5432/astraops",
        DB_SSL_MODE: mode,
        DB_APPLICATION_NAME: "astraops-web",
      });

      expect(config.DB_SSL_MODE).toBe(mode);
      expect(config.DB_APPLICATION_NAME).toBe("astraops-web");
    }
  });

  it("should reject an invalid TLS mode", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/astraops",
        DB_SSL_MODE: "prefer",
      })
    ).toThrow(/DB_SSL_MODE/);
  });
});
