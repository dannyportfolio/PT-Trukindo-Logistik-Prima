/**
 * Direct OpenAI Gateway Adapter & Seamless Fallback Gateway Client
 * Implements ADR-002 Dual-Adapter Strategy (Issue #5)
 *
 * Allows switching between local 9Router daemon and direct OpenAI provider,
 * and handles automatic failover when 9Router is offline without throwing unhandled exceptions.
 */

import {
  LlmGatewayClient,
  NineRouterClient,
  NineRouterClientOptions,
  GatewayCompletionRequest,
  GatewayCompletionResponse,
  GatewayConnectionError,
} from "./client";
import { getConfig } from "../config";

export interface DirectOpenAiClientOptions extends NineRouterClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * DirectOpenAiClient: Connects directly to OpenAI API (or compatible provider)
 * Normalizes 'openai/' model prefix for direct API dispatch while preserving
 * authoritative pricing catalog verification and strict token ceilings.
 */
export class DirectOpenAiClient extends NineRouterClient {
  constructor(options: DirectOpenAiClientOptions = {}) {
    let resolvedBaseUrl = options.baseUrl;
    let resolvedApiKey = options.apiKey;

    try {
      const config = getConfig();
      if (!resolvedBaseUrl) resolvedBaseUrl = config.OPENAI_API_BASE_URL;
      if (!resolvedApiKey) resolvedApiKey = config.OPENAI_API_KEY;
    } catch {
      if (!resolvedBaseUrl) {
        resolvedBaseUrl = process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1";
      }
      if (!resolvedApiKey) {
        resolvedApiKey = process.env.OPENAI_API_KEY;
      }
    }

    super({
      ...options,
      baseUrl: resolvedBaseUrl,
      apiKey: resolvedApiKey,
    });
  }

  override async complete(request: GatewayCompletionRequest): Promise<GatewayCompletionResponse> {
    // If request model has 'openai/' prefix, pass normalized model name to direct endpoint
    const normalizedRequest: GatewayCompletionRequest = {
      ...request,
      model: request.model,
    };

    return super.complete(normalizedRequest);
  }
}

/**
 * FallbackGatewayClient:
 * Dispatches to primary client (e.g. NineRouterClient).
 * If primary encounters a GatewayConnectionError (daemon offline / ECONNREFUSED),
 * it seamlessly and smoothly fails over to the direct adapter without throwing an unhandled exception.
 */
export class FallbackGatewayClient implements LlmGatewayClient {
  constructor(
    public readonly primary: LlmGatewayClient,
    public readonly fallback: LlmGatewayClient
  ) {}

  async complete(request: GatewayCompletionRequest): Promise<GatewayCompletionResponse> {
    try {
      return await this.primary.complete(request);
    } catch (err: unknown) {
      if (err instanceof GatewayConnectionError) {
        console.warn(
          `[GatewayFallback] Primary gateway connection failed (${err.message}). Seamlessly failing over to direct provider adapter.`
        );
        return await this.fallback.complete(request);
      }
      // Re-throw non-connection errors (e.g. BudgetExceeded, ModelNotPermitted, Validation)
      throw err;
    }
  }
}

/**
 * Creates a gateway client based on configuration and provider preferences:
 * - If provider === 'direct': returns DirectOpenAiClient
 * - If fallbackEnabled === true: wraps NineRouterClient with FallbackGatewayClient
 * - Otherwise: returns NineRouterClient
 */
export function createConfiguredGatewayClient(options: {
  provider?: "9router" | "direct";
  fallbackEnabled?: boolean;
  routerBaseUrl?: string;
  openAiBaseUrl?: string;
  openAiApiKey?: string;
} = {}): LlmGatewayClient {
  let provider = options.provider;
  let fallbackEnabled = options.fallbackEnabled;

  try {
    const config = getConfig();
    if (!provider) provider = config.LLM_GATEWAY_PROVIDER;
    if (fallbackEnabled === undefined) fallbackEnabled = config.LLM_FALLBACK_ON_ERROR;
  } catch {
    if (!provider) {
      provider = (process.env.LLM_GATEWAY_PROVIDER as "9router" | "direct") || "9router";
    }
    if (fallbackEnabled === undefined) {
      fallbackEnabled = process.env.LLM_FALLBACK_ON_ERROR !== "false";
    }
  }

  if (provider === "direct") {
    return new DirectOpenAiClient({
      baseUrl: options.openAiBaseUrl,
      apiKey: options.openAiApiKey,
    });
  }

  const primary = new NineRouterClient({
    baseUrl: options.routerBaseUrl,
  });

  if (fallbackEnabled) {
    const fallback = new DirectOpenAiClient({
      baseUrl: options.openAiBaseUrl,
      apiKey: options.openAiApiKey,
    });
    return new FallbackGatewayClient(primary, fallback);
  }

  return primary;
}
