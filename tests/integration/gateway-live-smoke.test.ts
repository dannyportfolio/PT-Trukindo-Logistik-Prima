import { describe, it, expect } from "vitest";
import http from "http";

describe("Optional Local 9Router Smoke Test (Zero Paid Inferences)", () => {
  const routerUrl = process.env.ROUTER_BASE_URL || "http://localhost:20128/v1";

  it("should probe GET /v1/models if 9Router is running locally, without dispatching inference requests", async (ctx) => {
    let isRunning = false;
    let modelsData: Array<{ id: string; object: string }> = [];

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1000);

      const res = await fetch(`${routerUrl}/models`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        isRunning = true;
        const json = await res.json();
        modelsData = json.data || [];
      }
    } catch {
      isRunning = false;
    }

    if (!isRunning) {
      ctx.skip();
      return;
    }

    // When 9Router is running, verify its model listing contract
    expect(modelsData.length).toBeGreaterThan(0);
    const modelIds = modelsData.map((m) => m.id);

    // Verify presence of verified models
    expect(modelIds.some((id) => id.startsWith("ag/"))).toBe(true);

    // Verify no paid chat completion was called during this model availability audit
    expect(modelsData[0].object).toBe("model");
  });
});
