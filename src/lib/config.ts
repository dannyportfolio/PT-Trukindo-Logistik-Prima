import { z } from "zod";

export const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MIGRATION_DATABASE_URL: z.string().min(1).optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  ROUTER_BASE_URL: z.string().url().default("http://localhost:20128/v1"),
  LLM_GATEWAY_PROVIDER: z.enum(["9router", "direct"]).default("9router"),
  API_AUTH_TOKEN: z.string().default("astraops-secret-token"),
  ADMIN_AUTH_TOKEN: z.string().default("astraops-admin-token"),
  VIEWER_AUTH_TOKEN: z.string().default("astraops-viewer-token"),
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
