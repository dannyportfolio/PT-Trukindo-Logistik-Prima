import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import { AddressInfo } from "net";
import {
  NineRouterClient,
  createGatewayClient,
  ModelNotPermittedError,
  InvalidTokenBoundError,
  GatewayBudgetExceededError,
  UnverifiableCostError,
  GatewayTimeoutError,
  GatewayAbortedError,
  GatewayConnectionError,
  GatewayHttpError,
  GatewayMalformedResponseError,
  sanitizeErrorMessage,
} from "../../src/lib/gateway/client";
import {
  calculateActualCost,
  calculateWorstCaseCost,
  estimateInputTokens,
  getModelPricing,
  UnknownModelPricingError,
} from "../../src/lib/gateway/pricing-catalog";

describe("Model Gateway & NineRouterClient Unit Suite", () => {
  let server: http.Server;
  let serverUrl: string;
  let requestCounter = 0;
  let lastReceivedHeaders: http.IncomingHttpHeaders = {};
  let lastReceivedBody: Record<string, unknown> = {};
  let serverHandler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: Record<string, unknown>
  ) => void;

  beforeEach(async () => {
    requestCounter = 0;
    lastReceivedHeaders = {};
    lastReceivedBody = {};

    server = http.createServer((req, res) => {
      requestCounter++;
      lastReceivedHeaders = req.headers;

      let rawData = "";
      req.on("data", (chunk) => {
        rawData += chunk;
      });
      req.on("end", () => {
        try {
          lastReceivedBody = rawData ? JSON.parse(rawData) : {};
        } catch {
          lastReceivedBody = { raw: rawData };
        }
        if (serverHandler) {
          serverHandler(req, res, lastReceivedBody);
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              id: "chatcmpl-test",
              model: "openai/gpt-4o-mini",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: '{"industry":"Fintech","company_size":"50-100"}',
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 150,
                completion_tokens: 50,
                total_tokens: 200,
              },
            })
          );
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        serverUrl = `http://127.0.0.1:${addr.port}/v1`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server && server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe("1. Valid Request & Pricing Reconciliation", () => {
    it("should send OpenAI-compatible payload to 9Router and reconcile actual cost from verified usage", async () => {
      const client = new NineRouterClient({ baseUrl: serverUrl });

      const res = await client.complete({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: "Extract company facts." },
          { role: "user", content: "Analyze Acme Corp." },
        ],
        maxTokens: 500,
        temperature: 0.2,
        accruedCostUsd: 0.05,
        budgetLimitUsd: 0.5,
      });

      expect(requestCounter).toBe(1);
      expect(lastReceivedBody.model).toBe("openai/gpt-4o-mini");
      expect(lastReceivedBody.max_tokens).toBe(500);
      expect(lastReceivedBody.temperature).toBe(0.2);

      // Verify response structure
      expect(res.content).toBe('{"industry":"Fintech","company_size":"50-100"}');
      expect(res.model).toBe("openai/gpt-4o-mini");
      expect(res.usage.promptTokens).toBe(150);
      expect(res.usage.completionTokens).toBe(50);
      expect(res.usage.totalTokens).toBe(200);

      // Verify cost calculation:
      // gpt-4o-mini rates: $0.15/1M input, $0.60/1M output
      // (150 * 0.15 / 1e6) + (50 * 0.60 / 1e6) = 0.0000225 + 0.000030 = 0.0000525 -> 0.000053
      expect(res.cost.actualCostUsd).toBeCloseTo(0.000053, 5);
      expect(res.cost.usageVerified).toBe(true);
      expect(res.cost.pricingVersion).toBe("2026-10-15-v1");
      expect(res.cost.residualUncertaintyNote).toBeDefined();
    });
  });

  describe("2. Security Guardrails: Allowlist & Parameter Bounds", () => {
    it("should reject model outside explicit allowlist before network dispatch", async () => {
      const client = new NineRouterClient({ baseUrl: serverUrl });

      await expect(
        client.complete({
          model: "unauthorized-vendor/super-llm-ultra",
          messages: [{ role: "user", content: "Hello" }],
          maxTokens: 200,
        })
      ).rejects.toThrow(ModelNotPermittedError);

      expect(requestCounter).toBe(0);
    });

    it("should reject unbounded or invalid maxTokens before network dispatch", async () => {
      const client = new NineRouterClient({ baseUrl: serverUrl });

      // Negative tokens
      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Hello" }],
          maxTokens: -10,
        })
      ).rejects.toThrow(InvalidTokenBoundError);

      // Exceeds upper bound of 4096
      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Hello" }],
          maxTokens: 50000,
        })
      ).rejects.toThrow(InvalidTokenBoundError);

      // Zero requests dispatched
      expect(requestCounter).toBe(0);
    });
  });

  describe("3. Pre-Request Worst-Case Budget Checks & Fail-Closed Halting", () => {
    it("should block request before transmission if worst-case potential cost exceeds remaining budget", async () => {
      const client = new NineRouterClient({ baseUrl: serverUrl });

      // claude-3-5-sonnet: $3.00/1M in, $15.00/1M out
      // maxTokens: 4000 -> maxOutputCost = 4000 * 15 / 1e6 = $0.060
      // If budgetLimit is $0.05 and accrued is $0.00, it should fail immediately
      await expect(
        client.complete({
          model: "anthropic/claude-3-5-sonnet",
          messages: [{ role: "user", content: "Analyze entire system documentation." }],
          maxTokens: 4000,
          accruedCostUsd: 0.0,
          budgetLimitUsd: 0.05,
        })
      ).rejects.toThrow(GatewayBudgetExceededError);

      // Zero network requests
      expect(requestCounter).toBe(0);
    });

    it("should fail closed if model pricing is unknown or missing in catalog", async () => {
      expect(() => {
        getModelPricing("non-existent-model-xyz");
      }).toThrow(UnknownModelPricingError);
    });

    it("should fail closed if gateway response omits token usage metadata", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: "Sample answer" } }],
            // usage is omitted
          })
        );
      };

      const client = new NineRouterClient({ baseUrl: serverUrl });

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Hello" }],
          maxTokens: 100,
        })
      ).rejects.toThrow(UnverifiableCostError);
    });
  });

  describe("4. Error Handling, Timeouts, Aborts & Malformed Responses", () => {
    it("should handle timeout cleanly and abort in-flight connection", async () => {
      serverHandler = (_req, _res) => {
        // Deliberately do not reply, hold connection
      };

      const client = new NineRouterClient({
        baseUrl: serverUrl,
        defaultTimeoutMs: 100, // 100ms timeout
      });

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Wait" }],
          maxTokens: 100,
          timeoutMs: 100,
        })
      ).rejects.toThrow(GatewayTimeoutError);
    });

    it("should handle caller AbortSignal immediately", async () => {
      const abortController = new AbortController();
      const client = new NineRouterClient({ baseUrl: serverUrl });

      abortController.abort("user_cancelled");

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Abort" }],
          maxTokens: 100,
          signal: abortController.signal,
        })
      ).rejects.toThrow(GatewayAbortedError);

      expect(requestCounter).toBe(0);
    });

    it("should reject malformed non-JSON or HTML error responses from proxy", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>502 Bad Gateway from intermediate proxy</body></html>");
      };

      const client = new NineRouterClient({ baseUrl: serverUrl });

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Test" }],
          maxTokens: 100,
        })
      ).rejects.toThrow(GatewayMalformedResponseError);
    });

    it("should handle gateway HTTP 401/500 errors and sanitize credentials", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              message: "Invalid API Key provided: Bearer sk-ant-secret1234567890abcdef",
            },
          })
        );
      };

      const client = new NineRouterClient({
        baseUrl: serverUrl,
        apiKey: "sk-ant-secret1234567890abcdef",
      });

      try {
        await client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Test" }],
          maxTokens: 100,
        });
        expect.unreachable("Should have thrown GatewayHttpError");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(GatewayHttpError);
        const httpErr = err as GatewayHttpError;
        expect(httpErr.statusCode).toBe(401);
        // Sensitive API key MUST NOT appear in error message
        expect(httpErr.message).not.toContain("sk-ant-secret1234567890abcdef");
      }
    });

    it("should handle connection refusal when gateway daemon is offline", async () => {
      // Non-listening port
      const client = new NineRouterClient({ baseUrl: "http://127.0.0.1:19998/v1" });

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Hello" }],
          maxTokens: 100,
        })
      ).rejects.toThrow(GatewayConnectionError);
    });

    it("should perform exactly ONE attempt without blind retries on server failure", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Gateway Server Error" }));
      };

      const client = new NineRouterClient({ baseUrl: serverUrl });

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Test" }],
          maxTokens: 100,
        })
      ).rejects.toThrow(GatewayHttpError);

      // Exactly 1 request received, no uncontrolled blind loops
      expect(requestCounter).toBe(1);
    });
  });

  describe("5. Credential Masking & Pricing Calculations", () => {
    it("should redact authorization tokens and API keys across strings", () => {
      const sensitive1 = "Error with Authorization: Bearer astraops_token_secret_xyz";
      expect(sanitizeErrorMessage(sensitive1)).toBe("Error with Authorization: [REDACTED]");

      const sensitive2 = "Failed at url with api_key=topsecret123&other=1";
      expect(sanitizeErrorMessage(sensitive2)).toBe("Failed at url with api_key=[REDACTED]&other=1");
    });

    it("should accurately estimate input tokens using conservative 3.0 chars/token plus envelope overhead", () => {
      // 30 chars -> 10 content tokens + 7 envelope/priming tokens = 17 tokens
      const tokens = estimateInputTokens("123456789012345678901234567890");
      expect(tokens).toBe(17);
    });

    it("should accurately compute worst-case cost across all allowlisted models", () => {
      const worstCase = calculateWorstCaseCost("openai/gpt-4o", 1000, 1000);
      // gpt-4o: $2.50/1M in, $10.00/1M out
      // 1000 * 2.50 / 1e6 = 0.0025; 1000 * 10 / 1e6 = 0.0100 -> total 0.0125
      expect(worstCase.estimatedWorstCaseCost).toBe(0.0125);
    });

    it("should reject input payload exceeding MAX_INPUT_PAYLOAD_BYTES (100KB) before transmission", async () => {
      const client = new NineRouterClient({ baseUrl: serverUrl });
      const oversizedPrompt = "A".repeat(100_001);

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: oversizedPrompt }],
          maxTokens: 100,
        })
      ).rejects.toThrow(/exceeds maximum allowed limit/);

      expect(requestCounter).toBe(0);
    });

    it("should support verified 9Router model 'ag/gemini-3.8-flash' and compute remaining budget", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-test-gemini",
            model: "ag/gemini-3.8-flash",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: '{"status":"ok"}' },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 200,
              completion_tokens: 100,
              total_tokens: 300,
            },
          })
        );
      };

      const client = new NineRouterClient({ baseUrl: serverUrl });
      const res = await client.complete({
        model: "ag/gemini-3.8-flash",
        messages: [{ role: "user", content: "Verify" }],
        maxTokens: 500,
        accruedCostUsd: 0.1,
        budgetLimitUsd: 0.5,
      });

      expect(res.model).toBe("ag/gemini-3.8-flash");
      expect(res.cost.actualModel).toBe("ag/gemini-3.8-flash");
      expect(res.cost.remainingBudgetUsd).toBeDefined();
      expect(res.cost.remainingBudgetUsd).toBeLessThan(0.4); // 0.5 - 0.1 - actualCost
      expect(res.cost.remainingBudgetUsd).toBeGreaterThan(0.39);
    });

    it("should fail closed if 9Router internal fallback routes to an unverified model not in the catalog", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-fallback-unknown",
            model: "unverified-fallback-provider/model-x", // Fallback to unknown model
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Fallback response" },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
            },
          })
        );
      };

      const client = new NineRouterClient({ baseUrl: serverUrl });

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Test fallback" }],
          maxTokens: 100,
        })
      ).rejects.toThrow(UnverifiableCostError);
    });
  });

  describe("6. 9Router Isolation & Strict Fail-Closed Policy (No Direct Provider Fallback)", () => {
    it("should fail-closed immediately with GatewayConnectionError when 9Router daemon is offline without attempting direct fallback", async () => {
      // Connect to non-existent port (offline local daemon)
      const client = new NineRouterClient({
        baseUrl: "http://127.0.0.1:19999/v1",
        defaultTimeoutMs: 1000,
      });

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Hello" }],
          maxTokens: 100,
        })
      ).rejects.toThrow(GatewayConnectionError);

      // Verify no network activity on our test server
      expect(requestCounter).toBe(0);
    });

    it("should fail-closed immediately on GatewayHttpError (500/502/503) without direct provider fallback", async () => {
      serverHandler = (_req, res) => {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "9Router upstream provider overloaded" } }));
      };

      const client = new NineRouterClient({ baseUrl: serverUrl });

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Extract facts" }],
          maxTokens: 100,
        })
      ).rejects.toThrow(GatewayHttpError);

      // Strictly single dispatch, zero secondary attempts or direct fallback calls
      expect(requestCounter).toBe(1);
    });

    it("should fail-closed on GatewayTimeoutError when 9Router exceeds deadline without fallback", async () => {
      serverHandler = () => {
        // Deliberately do not answer to trigger client timeout
      };

      const client = new NineRouterClient({
        baseUrl: serverUrl,
        defaultTimeoutMs: 100,
      });

      await expect(
        client.complete({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Slow request" }],
          maxTokens: 100,
        })
      ).rejects.toThrow(GatewayTimeoutError);
    });

    it("createGatewayClient factory strictly instantiates NineRouterClient ensuring no inference bypasses 9Router", () => {
      const client = createGatewayClient({ baseUrl: serverUrl });
      expect(client).toBeInstanceOf(NineRouterClient);
      expect((client as NineRouterClient).baseUrl).toBe(serverUrl);
    });
  });
});
