import { defineConfig, devices } from "@playwright/test";

// Ensure test runner environment variables are set for direct DB calls in e2e beforeAll
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://astraops_app:app_secure_password@localhost:5432/astraops";
process.env.MIGRATION_DATABASE_URL =
  process.env.MIGRATION_DATABASE_URL ||
  "postgresql://astraops_admin:adminpass@localhost:5432/astraops";
process.env.API_AUTH_TOKEN = process.env.API_AUTH_TOKEN || "astraops-secret-token";
process.env.ADMIN_AUTH_TOKEN = process.env.ADMIN_AUTH_TOKEN || "astraops-admin-token";
process.env.VIEWER_AUTH_TOKEN = process.env.VIEWER_AUTH_TOKEN || "astraops-viewer-token";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60 * 1000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ||
        "postgresql://astraops_app:app_secure_password@localhost:5432/astraops",
      MIGRATION_DATABASE_URL:
        process.env.MIGRATION_DATABASE_URL ||
        "postgresql://astraops_admin:adminpass@localhost:5432/astraops",
    },
  },
});
