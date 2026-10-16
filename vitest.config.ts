import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "tests/e2e/**"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.DATABASE_URL ||
        "postgresql://astraops_app:app_secure_password@localhost:5432/astraops",
      MIGRATION_DATABASE_URL:
        process.env.MIGRATION_DATABASE_URL ||
        "postgresql://astraops_admin:adminpass@localhost:5432/astraops",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
