import { z } from "zod";

/**
 * TLS mode for the PostgreSQL connection.
 *
 * - "auto"        : defer to the connection string (e.g. `?sslmode=require`) and the
 *                   driver defaults. Used for local development and backward compatibility.
 * - "disable"     : force a plaintext connection. Local development only.
 * - "require"     : encrypt the transport but do not verify the server certificate chain.
 *                   Typical for managed providers that terminate TLS with their own CA.
 * - "verify-full" : encrypt and verify both the certificate chain and the hostname.
 *                   Provide DB_SSL_CA_CERT when the provider CA is not in the system trust store.
 */
export const SslModeSchema = z.enum(["auto", "disable", "require", "verify-full"]).default("auto");

export const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MIGRATION_DATABASE_URL: z.string().min(1).optional(),

  // Connection pool tuning (see docs/DATABASE_OPERATIONS.md for sizing guidance)
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  // Transport security & observability (managed PostgreSQL / connection pooler)
  DB_SSL_MODE: SslModeSchema,
  DB_SSL_CA_CERT: z.string().optional(),
  DB_APPLICATION_NAME: z.string().min(1).default("astraops"),

  ROUTER_BASE_URL: z.string().url().default("http://localhost:20128/v1"),
  LLM_GATEWAY_PROVIDER: z.enum(["9router", "direct"]).default("9router"),
  LLM_FALLBACK_ON_ERROR: z.coerce.boolean().default(true),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  API_AUTH_TOKEN: z.string().default("astraops-secret-token"),
  ADMIN_AUTH_TOKEN: z.string().default("astraops-admin-token"),
  VIEWER_AUTH_TOKEN: z.string().default("astraops-viewer-token"),

  // Transactional Email & Internal Sales Alerts (Milestone 2 Issue #2)
  RESEND_API_KEY: z.string().optional(),
  SALES_ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
  EMAIL_FROM: z.string().default("PT Trukindo Logistik Prima <inquiry@trukindo.co.id>"),

  // Fleet Telematics Webhook Security (Milestone 4 Issue #6)
  TELEMATICS_WEBHOOK_SECRET: z.string().default("trukindo-telematics-secret-2026"),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(rawEnv: Record<string, string | undefined> = process.env): AppConfig {
  const result = ConfigSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `${err.path.join(".")}: ${err.message}`)
      .join(", ");
    throw new Error(`Environment configuration validation failed: ${errorDetails}`);
  }

  return result.data;
}

// Lazy getter or memoized singleton
let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}
