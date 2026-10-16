import { MODEL_ALLOWLIST, AllowedModel } from "../../types/agent";

/**
 * Hard ceiling on input payload bytes (100KB) to prevent unbounded prompt expansion
 */
export const MAX_INPUT_PAYLOAD_BYTES = 100_000;

/**
 * Per-message ChatML / OpenAI formatting envelope token overhead:
 * <|im_start|>{role}\n{content}<|im_end|>\n -> ~4 tokens per message
 * + 3 tokens for assistant priming
 */
export const MESSAGE_TOKEN_OVERHEAD = 4;
export const PRIMING_TOKEN_OVERHEAD = 3;

/**
 * Model Pricing entry per 1,000,000 tokens in USD
 */
export interface ModelPricing {
  model: AllowedModel | string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  inputCostPerToken: number;
  outputCostPerToken: number;
  effectiveDate: string;
  currency: "USD";
  availabilityStatus?: "verified_local" | "upstream_vendor";
}

/**
 * Versioned internal pricing catalog schema
 */
export interface PricingCatalog {
  version: string;
  effectiveDate: string;
  models: Record<string, ModelPricing>;
}

/**
 * Error thrown when model pricing is missing or unverifiable
 */
export class GatewayPricingError extends Error {
  constructor(message: string, public readonly code: string = "PRICING_ERROR") {
    super(message);
    this.name = "GatewayPricingError";
  }
}

export class UnknownModelPricingError extends GatewayPricingError {
  constructor(model: string, version: string) {
    super(
      `Model '${model}' pricing is not defined in pricing catalog version '${version}'. Halting execution (fail-closed policy).`,
      "UNVERIFIABLE_COST_HALT"
    );
    this.name = "UnknownModelPricingError";
  }
}

export class PayloadTooLargeError extends GatewayPricingError {
  constructor(bytes: number, maxBytes: number) {
    super(
      `Input payload size of ${bytes} bytes exceeds maximum allowed limit of ${maxBytes} bytes. Request halted before network dispatch.`,
      "PAYLOAD_TOO_LARGE"
    );
    this.name = "PayloadTooLargeError";
  }
}

/**
 * Authoritative internal pricing catalogs.
 * Rates are explicitly defined based on trusted provider rate cards.
 *
 * NOTE ON MODEL COMPATIBILITY:
 * - 'ag/*' IDs are verified active models exposed by the local 9Router instance (GET /v1/models).
 * - 'openai/*' and 'anthropic/*' IDs are upstream vendor references retained for mock test suites
 *   and direct provider parity, but are not exposed directly as local 9Router aliases.
 */
export const PRICING_CATALOGS: Record<string, PricingCatalog> = {
  "2026-10-15-v1": {
    version: "2026-10-15-v1",
    effectiveDate: "2026-10-15",
    models: {
      // 9Router verified local gateway model IDs
      "ag/gemini-3.8-flash-high": {
        model: "ag/gemini-3.8-flash-high",
        inputCostPer1M: 0.15,
        outputCostPer1M: 0.6,
        inputCostPerToken: 0.15 / 1_000_000,
        outputCostPerToken: 0.6 / 1_000_000,
        effectiveDate: "2026-10-15",
        currency: "USD",
        availabilityStatus: "verified_local",
      },
      "ag/gemini-3.8-flash": {
        model: "ag/gemini-3.8-flash",
        inputCostPer1M: 0.15,
        outputCostPer1M: 0.6,
        inputCostPerToken: 0.15 / 1_000_000,
        outputCostPerToken: 0.6 / 1_000_000,
        effectiveDate: "2026-10-15",
        currency: "USD",
        availabilityStatus: "verified_local",
      },
      "ag/gemini-3.7-flash": {
        model: "ag/gemini-3.7-flash",
        inputCostPer1M: 0.1,
        outputCostPer1M: 0.4,
        inputCostPerToken: 0.1 / 1_000_000,
        outputCostPerToken: 0.4 / 1_000_000,
        effectiveDate: "2026-10-15",
        currency: "USD",
        availabilityStatus: "verified_local",
      },
      "ag/claude-sonnet-5-5": {
        model: "ag/claude-sonnet-5-5",
        inputCostPer1M: 3.0,
        outputCostPer1M: 15.0,
        inputCostPerToken: 3.0 / 1_000_000,
        outputCostPerToken: 15.0 / 1_000_000,
        effectiveDate: "2026-10-15",
        currency: "USD",
        availabilityStatus: "verified_local",
      },
      "ag/gpt-oss-120b-medium": {
        model: "ag/gpt-oss-120b-medium",
        inputCostPer1M: 0.0,
        outputCostPer1M: 0.0,
        inputCostPerToken: 0.0,
        outputCostPerToken: 0.0,
        effectiveDate: "2026-10-15",
        currency: "USD",
        availabilityStatus: "verified_local",
      },
      // Upstream vendor IDs (retained for backward compatibility and test mock suites)
      "openai/gpt-4o-mini": {
        model: "openai/gpt-4o-mini",
        inputCostPer1M: 0.15,
        outputCostPer1M: 0.6,
        inputCostPerToken: 0.15 / 1_000_000,
        outputCostPerToken: 0.6 / 1_000_000,
        effectiveDate: "2026-10-15",
        currency: "USD",
        availabilityStatus: "upstream_vendor",
      },
      "openai/gpt-4o": {
        model: "openai/gpt-4o",
        inputCostPer1M: 2.5,
        outputCostPer1M: 10.0,
        inputCostPerToken: 2.5 / 1_000_000,
        outputCostPerToken: 10.0 / 1_000_000,
        effectiveDate: "2026-10-15",
        currency: "USD",
        availabilityStatus: "upstream_vendor",
      },
      "anthropic/claude-3-5-sonnet": {
        model: "anthropic/claude-3-5-sonnet",
        inputCostPer1M: 3.0,
        outputCostPer1M: 15.0,
        inputCostPerToken: 3.0 / 1_000_000,
        outputCostPerToken: 15.0 / 1_000_000,
        effectiveDate: "2026-10-15",
        currency: "USD",
        availabilityStatus: "upstream_vendor",
      },
      "local/llama-3-8b": {
        model: "local/llama-3-8b",
        inputCostPer1M: 0.0,
        outputCostPer1M: 0.0,
        inputCostPerToken: 0.0,
        outputCostPerToken: 0.0,
        effectiveDate: "2026-10-15",
        currency: "USD",
        availabilityStatus: "upstream_vendor",
      },
    },
  },
};

export const CURRENT_PRICING_CATALOG_VERSION = "2026-10-15-v1";

/**
 * Residual financial uncertainty disclaimer:
 * Character heuristic token estimation cannot guarantee exact external billing parity.
 * In-flight requests cannot always be cancelled mid-stream or refunded if connection drops.
 */
export const RESIDUAL_FINANCIAL_UNCERTAINTY_DISCLAIMER =
  "Heuristic input token estimation (ceil(chars / 3.0)) is an unverified operational rule of thumb, NOT an authoritative or mathematically guaranteed upper bound. Actual billing must be reconciled against provider usage metadata. Dispatched requests interrupted by timeouts, aborts, network drops, or unmetered routes carry residual financial risk.";

/**
 * Conservative input token estimator.
 *
 * CRITICAL BUDGET AUDIT NOTE:
 * `Math.ceil(charCount / 3.0)` is NOT an absolute or guaranteed token upper bound.
 * Tokenizer implementations vary widely across natural languages, Unicode symbols, and JSON syntax.
 * This estimator provides an operational pre-flight heuristic that adds message envelope overhead
 * and verifies that input byte length does not exceed `MAX_INPUT_PAYLOAD_BYTES`.
 */
export function estimateInputTokens(textOrMessages: string | Array<{ content: string }>): number {
  let charCount = 0;
  let totalBytes = 0;
  let messageCount = 1;

  if (typeof textOrMessages === "string") {
    charCount = textOrMessages.length;
    totalBytes = Buffer.byteLength(textOrMessages, "utf8");
  } else if (Array.isArray(textOrMessages)) {
    messageCount = Math.max(1, textOrMessages.length);
    for (const msg of textOrMessages) {
      const content = msg.content || "";
      charCount += content.length;
      totalBytes += Buffer.byteLength(content, "utf8");
    }
  }

  // Hard input size barrier
  if (totalBytes > MAX_INPUT_PAYLOAD_BYTES) {
    throw new PayloadTooLargeError(totalBytes, MAX_INPUT_PAYLOAD_BYTES);
  }

  // Conservative heuristic: chars / 3.0 + envelope overhead per message
  const envelopeTokens = messageCount * MESSAGE_TOKEN_OVERHEAD + PRIMING_TOKEN_OVERHEAD;
  const contentTokens = Math.ceil(charCount / 3.0);

  return Math.max(1, contentTokens + envelopeTokens);
}

/**
 * Look up pricing from versioned catalog with fail-closed validation
 */
export function getModelPricing(
  model: string,
  catalogVersion: string = CURRENT_PRICING_CATALOG_VERSION
): ModelPricing {
  const catalog = PRICING_CATALOGS[catalogVersion];
  if (!catalog) {
    throw new GatewayPricingError(
      `Pricing catalog version '${catalogVersion}' does not exist. Halting execution (fail-closed policy).`,
      "UNKNOWN_CATALOG_VERSION"
    );
  }

  const pricing = catalog.models[model];
  if (!pricing) {
    throw new UnknownModelPricingError(model, catalogVersion);
  }

  return pricing;
}

/**
 * Check whether a model is in the allowlist
 */
export function isModelAllowlisted(model: string): model is AllowedModel {
  return (MODEL_ALLOWLIST as readonly string[]).includes(model);
}

/**
 * Calculate worst-case maximum potential cost before request transmission
 */
export function calculateWorstCaseCost(
  model: string,
  estimatedInputTokens: number,
  maxTokens: number,
  catalogVersion: string = CURRENT_PRICING_CATALOG_VERSION
): {
  estimatedWorstCaseCost: number;
  pricingVersion: string;
  inputRatePerToken: number;
  outputRatePerToken: number;
} {
  const pricing = getModelPricing(model, catalogVersion);
  const estimatedInputCost = estimatedInputTokens * pricing.inputCostPerToken;
  const maxOutputCost = maxTokens * pricing.outputCostPerToken;
  const total = Number((estimatedInputCost + maxOutputCost).toFixed(6));

  return {
    estimatedWorstCaseCost: total,
    pricingVersion: catalogVersion,
    inputRatePerToken: pricing.inputCostPerToken,
    outputRatePerToken: pricing.outputCostPerToken,
  };
}

/**
 * Calculate actual accrued cost from verified response usage metadata
 */
export function calculateActualCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  catalogVersion: string = CURRENT_PRICING_CATALOG_VERSION
): {
  actualCost: number;
  pricingVersion: string;
} {
  const pricing = getModelPricing(model, catalogVersion);
  const promptCost = promptTokens * pricing.inputCostPerToken;
  const completionCost = completionTokens * pricing.outputCostPerToken;
  const total = Number((promptCost + completionCost).toFixed(6));

  return {
    actualCost: total,
    pricingVersion: catalogVersion,
  };
}
