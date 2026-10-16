import {
  AllowedModel,
  MODEL_ALLOWLIST,
} from "../../types/agent";
import { getConfig } from "../config";
import {
  calculateActualCost,
  calculateWorstCaseCost,
  CURRENT_PRICING_CATALOG_VERSION,
  estimateInputTokens,
  isModelAllowlisted,
  RESIDUAL_FINANCIAL_UNCERTAINTY_DISCLAIMER,
} from "./pricing-catalog";

/**
 * Bounds on inference requests
 */
export const GATEWAY_BOUNDS = {
  MIN_OUTPUT_TOKENS: 1,
  MAX_OUTPUT_TOKENS: 4096,
  DEFAULT_TIMEOUT_MS: 30000,
  DEFAULT_MODEL: "openai/gpt-4o-mini" as AllowedModel,
} as const;

/**
 * Chat message contract
 */
export interface GatewayChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Gateway request parameters
 */
export interface GatewayCompletionRequest {
  model: AllowedModel | string;
  messages: GatewayChatMessage[];
  maxTokens: number;
  temperature?: number;
  responseFormat?:
    | { type: "json_object" }
    | { type: "json_schema"; json_schema: Record<string, unknown> };
  timeoutMs?: number;
  signal?: AbortSignal;
  accruedCostUsd?: number;
  budgetLimitUsd?: number;
  pricingCatalogVersion?: string;
}

/**
 * Gateway token usage
 */
export interface GatewayUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Cost calculation and residual risk tracking
 */
export interface GatewayCostMetadata {
  pricingVersion: string;
  estimatedWorstCaseCostUsd: number;
  actualCostUsd: number;
  remainingBudgetUsd?: number;
  residualUncertaintyNote: string;
  usageVerified: boolean;
  actualModel: string;
}

/**
 * Gateway completion response
 */
export interface GatewayCompletionResponse {
  content: string;
  model: string;
  usage: GatewayUsage;
  cost: GatewayCostMetadata;
  durationMs: number;
  rawResponse?: unknown;
}

/**
 * Error hierarchy for Model Gateway
 */
export class GatewayError extends Error {
  constructor(message: string, public readonly code: string = "GATEWAY_ERROR") {
    super(sanitizeErrorMessage(message));
    this.name = "GatewayError";
  }
}

export class ModelNotPermittedError extends GatewayError {
  constructor(model: string) {
    super(
      `Model '${model}' is not in the approved allowlist: ${MODEL_ALLOWLIST.join(
        ", "
      )}. Execution halted before network dispatch.`,
      "MODEL_NOT_PERMITTED"
    );
    this.name = "ModelNotPermittedError";
  }
}

export class InvalidTokenBoundError extends GatewayError {
  constructor(message: string) {
    super(message, "INVALID_TOKEN_BOUND");
    this.name = "InvalidTokenBoundError";
  }
}

export class GatewayBudgetExceededError extends GatewayError {
  constructor(projectedCost: number, budgetLimit: number, currentAccrued: number) {
    super(
      `Pre-request worst-case cost $${projectedCost.toFixed(
        4
      )} exceeds remaining budget ceiling of $${budgetLimit.toFixed(
        4
      )} (current accrued: $${currentAccrued.toFixed(
        4
      )}). Request halted before network dispatch.`,
      "BUDGET_EXCEEDED"
    );
    this.name = "GatewayBudgetExceededError";
  }
}

export class UnverifiableCostError extends GatewayError {
  constructor(message: string) {
    super(message, "UNVERIFIABLE_COST_HALT");
    this.name = "UnverifiableCostError";
  }
}

export class GatewayTimeoutError extends GatewayError {
  constructor(timeoutMs: number) {
    super(`Model gateway request timed out after ${timeoutMs}ms`, "GATEWAY_TIMEOUT");
    this.name = "GatewayTimeoutError";
  }
}

export class GatewayAbortedError extends GatewayError {
  constructor(reason: string = "aborted") {
    super(`Model gateway request aborted by caller: ${reason}`, "GATEWAY_ABORTED");
    this.name = "GatewayAbortedError";
  }
}

export class GatewayConnectionError extends GatewayError {
  constructor(message: string) {
    super(`Failed to connect to model gateway: ${message}`, "GATEWAY_CONNECTION_ERROR");
    this.name = "GatewayConnectionError";
  }
}

export class GatewayHttpError extends GatewayError {
  constructor(public readonly statusCode: number, responseBody: string) {
    super(
      `Gateway returned HTTP ${statusCode}: ${responseBody.slice(0, 300)}`,
      "GATEWAY_HTTP_ERROR"
    );
    this.name = "GatewayHttpError";
  }
}

export class GatewayMalformedResponseError extends GatewayError {
  constructor(message: string) {
    super(`Malformed gateway response: ${message}`, "MALFORMED_RESPONSE");
    this.name = "GatewayMalformedResponseError";
  }
}

/**
 * Sanitizes sensitive credentials, authorization tokens, and API keys from error messages and logs.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return "";
  return message
    .replace(/Bearer\s+[\w\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|token|secret|password)=[\w\-._~+/]+/gi, "$1=[REDACTED]")
    .replace(/Authorization:\s*[^\r\n]+/gi, "Authorization: [REDACTED]");
}

/**
 * Generic interface for pluggable LLM gateway adapters.
 * Allows future providers while ensuring MVP routes strictly through 9Router.
 */
export interface LlmGatewayClient {
  complete(request: GatewayCompletionRequest): Promise<GatewayCompletionResponse>;
}

export interface NineRouterClientOptions {
  baseUrl?: string;
  apiKey?: string;
  defaultTimeoutMs?: number;
  pricingCatalogVersion?: string;
  failClosedOnMissingUsage?: boolean;
}

/**
 * NineRouterClient: Primary adapter targeting 9Router OpenAI-compatible local gateway.
 *
 * Enforces:
 * - Strict model allowlist checking before network connection
 * - Authoritative internal pricing catalog lookup
 * - Mandatory bounded max_tokens
 * - Conservative pre-request worst-case cost estimation
 * - Pre-request budget cap check
 * - Single request dispatch (no uncontrolled blind retries)
 * - Safe response validation and usage metadata verification
 * - Fail-closed halt on unverifiable cost or missing usage metadata
 * - Credential and token redaction across all errors
 */
export class NineRouterClient implements LlmGatewayClient {
  public readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultTimeoutMs: number;
  private readonly pricingCatalogVersion: string;
  private readonly failClosedOnMissingUsage: boolean;

  constructor(options: NineRouterClientOptions = {}) {
    let resolvedBaseUrl = options.baseUrl;
    if (!resolvedBaseUrl) {
      try {
        const config = getConfig();
        resolvedBaseUrl = config.ROUTER_BASE_URL;
      } catch {
        resolvedBaseUrl = "http://localhost:20128/v1";
      }
    }
    // Trim trailing slashes
    this.baseUrl = resolvedBaseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? GATEWAY_BOUNDS.DEFAULT_TIMEOUT_MS;
    this.pricingCatalogVersion =
      options.pricingCatalogVersion ?? CURRENT_PRICING_CATALOG_VERSION;
    this.failClosedOnMissingUsage = options.failClosedOnMissingUsage ?? true;
  }

  async complete(request: GatewayCompletionRequest): Promise<GatewayCompletionResponse> {
    const startTime = Date.now();

    // 1. Model Allowlist Validation
    if (!isModelAllowlisted(request.model)) {
      throw new ModelNotPermittedError(request.model);
    }

    // 2. Mandatory Bounded Output-Tokens Check
    if (
      typeof request.maxTokens !== "number" ||
      !Number.isInteger(request.maxTokens) ||
      request.maxTokens < GATEWAY_BOUNDS.MIN_OUTPUT_TOKENS ||
      request.maxTokens > GATEWAY_BOUNDS.MAX_OUTPUT_TOKENS
    ) {
      throw new InvalidTokenBoundError(
        `maxTokens must be an integer between ${GATEWAY_BOUNDS.MIN_OUTPUT_TOKENS} and ${GATEWAY_BOUNDS.MAX_OUTPUT_TOKENS}. Received: ${request.maxTokens}`
      );
    }

    // 3. Pre-Request Conservative Token & Worst-Case Cost Estimation
    const catalogVersion = request.pricingCatalogVersion ?? this.pricingCatalogVersion;
    const estimatedInputTokens = estimateInputTokens(request.messages);
    const worstCaseCost = calculateWorstCaseCost(
      request.model,
      estimatedInputTokens,
      request.maxTokens,
      catalogVersion
    );

    // 4. Pre-Request Budget Ceiling Check
    const accrued = request.accruedCostUsd ?? 0;
    if (request.budgetLimitUsd !== undefined) {
      const projectedTotal = accrued + worstCaseCost.estimatedWorstCaseCost;
      if (projectedTotal > request.budgetLimitUsd) {
        throw new GatewayBudgetExceededError(
          projectedTotal,
          request.budgetLimitUsd,
          accrued
        );
      }
    }

    // 5. Check if caller signal is already aborted
    if (request.signal?.aborted) {
      throw new GatewayAbortedError(String(request.signal.reason || "aborted"));
    }

    // 6. Network Dispatch with Timeout & Abort Handling (Single Attempt — No Blind Retries)
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort(new Error(`Gateway timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    // Combine caller signal with internal timeout signal
    let onCallerAbort: (() => void) | null = null;
    if (request.signal) {
      onCallerAbort = () => {
        timeoutController.abort(request.signal?.reason);
      };
      request.signal.addEventListener("abort", onCallerAbort, { once: true });
    }

    const endpoint = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const payload: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
    };
    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.responseFormat) {
      payload.response_format = request.responseFormat;
    }

    let rawResponseText = "";
    let httpStatus = 0;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: timeoutController.signal,
      });

      httpStatus = res.status;
      rawResponseText = await res.text();

      if (!res.ok) {
        throw new GatewayHttpError(httpStatus, rawResponseText);
      }
    } catch (err: unknown) {
      if (timedOut) {
        throw new GatewayTimeoutError(timeoutMs);
      }
      if (request.signal?.aborted) {
        throw new GatewayAbortedError(String(request.signal.reason || "aborted"));
      }
      if (err instanceof GatewayHttpError) {
        throw err;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new GatewayConnectionError(errMsg);
    } finally {
      clearTimeout(timer);
      if (request.signal && onCallerAbort) {
        request.signal.removeEventListener("abort", onCallerAbort);
      }
    }

    // 7. Parse and Validate Gateway JSON Response
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawResponseText);
    } catch (parseErr: unknown) {
      throw new GatewayMalformedResponseError(
        `Failed to parse gateway response JSON: ${
          parseErr instanceof Error ? parseErr.message : String(parseErr)
        }`
      );
    }

    if (!parsed || typeof parsed !== "object") {
      throw new GatewayMalformedResponseError("Response is not a valid JSON object");
    }

    const choices = parsed.choices as Array<{ message?: { content?: string } }>;
    if (!Array.isArray(choices) || choices.length === 0 || !choices[0]?.message) {
      throw new GatewayMalformedResponseError(
        "OpenAI-compatible choices array is missing or empty"
      );
    }

    const content = choices[0].message.content ?? "";

    // 8. Reconcile Usage and Calculate Authoritative Accrued Cost
    const usage = parsed.usage as {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      total_tokens?: unknown;
    } | null;

    const hasValidUsage =
      usage !== null &&
      typeof usage === "object" &&
      typeof usage.prompt_tokens === "number" &&
      typeof usage.completion_tokens === "number" &&
      usage.prompt_tokens >= 0 &&
      usage.completion_tokens >= 0;

    if (!hasValidUsage) {
      if (this.failClosedOnMissingUsage) {
        throw new UnverifiableCostError(
          `Gateway response omitted or returned invalid token usage metadata for model '${request.model}'. Halting execution (fail-closed policy).`
        );
      }
    }

    const promptTokens = hasValidUsage ? Number(usage.prompt_tokens) : estimatedInputTokens;
    const completionTokens = hasValidUsage ? Number(usage.completion_tokens) : request.maxTokens;
    const totalTokens = hasValidUsage
      ? Number(usage.total_tokens ?? promptTokens + completionTokens)
      : promptTokens + completionTokens;

    const actualModel = typeof parsed.model === "string" ? parsed.model : request.model;

    // Reconcile cost against the actual model route (fail-closed if actual model pricing cannot be verified)
    let actualCostResult: { actualCost: number; pricingVersion: string };
    try {
      actualCostResult = calculateActualCost(
        actualModel,
        promptTokens,
        completionTokens,
        catalogVersion
      );
    } catch {
      throw new UnverifiableCostError(
        `Actual model '${actualModel}' returned by gateway cannot be verified in pricing catalog version '${catalogVersion}'. Halting execution (fail-closed policy).`
      );
    }

    const remainingBudgetUsd =
      request.budgetLimitUsd !== undefined
        ? Math.max(
            0,
            Number((request.budgetLimitUsd - (accrued + actualCostResult.actualCost)).toFixed(6))
          )
        : undefined;

    const durationMs = Date.now() - startTime;

    return {
      content,
      model: actualModel,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      cost: {
        pricingVersion: catalogVersion,
        estimatedWorstCaseCostUsd: worstCaseCost.estimatedWorstCaseCost,
        actualCostUsd: actualCostResult.actualCost,
        remainingBudgetUsd,
        residualUncertaintyNote: RESIDUAL_FINANCIAL_UNCERTAINTY_DISCLAIMER,
        usageVerified: hasValidUsage,
        actualModel,
      },
      durationMs,
      rawResponse: parsed,
    };
  }
}

/**
 * Factory function creating configured gateway client
 */
export function createGatewayClient(options: NineRouterClientOptions = {}): LlmGatewayClient {
  return new NineRouterClient(options);
}
