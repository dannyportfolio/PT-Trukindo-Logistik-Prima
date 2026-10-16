import http from "http";
import https from "https";
import net from "net";
import zlib from "zlib";
import * as cheerio from "cheerio";
import {
  validateAndPinTarget,
  createPinnedHttpAgent,
  createPinnedHttpsAgent,
  ValidatedTarget,
  SsrfError,
  ValidateTargetOptions,
} from "./ssrf-guard";
import { AgentRepository } from "../repository";

export const SCRAPER_BOUNDS = {
  MAX_PAYLOAD_BYTES: 2 * 1024 * 1024, // 2MB hard streaming ceiling
  MAX_REDIRECT_HOPS: 3,               // 3 hops max
  DEFAULT_TIMEOUT_MS: 10000,          // 10 seconds per request socket inactivity timeout
  DEFAULT_ABSOLUTE_TIMEOUT_MS: 10000, // 10 seconds per request absolute deadline
  MAX_TEXT_LENGTH: 50000,             // 50,000 chars max extracted text
} as const;

export class ScraperError extends Error {
  constructor(message: string, public readonly code: string = "SCRAPER_ERROR") {
    super(message);
    this.name = "ScraperError";
  }
}

export class PayloadSizeExceededError extends ScraperError {
  constructor(bytesReceived: number) {
    super(
      `Response payload exceeded maximum allowed size of ${SCRAPER_BOUNDS.MAX_PAYLOAD_BYTES} bytes (received > ${bytesReceived} bytes)`,
      "PAYLOAD_SIZE_EXCEEDED"
    );
    this.name = "PayloadSizeExceededError";
  }
}

export class UnsupportedContentTypeError extends ScraperError {
  constructor(contentType: string) {
    super(
      `Unsupported or binary Content-Type '${contentType}'. Only HTML and text formats are supported.`,
      "UNSUPPORTED_CONTENT_TYPE"
    );
    this.name = "UnsupportedContentTypeError";
  }
}

export class MaxRedirectsExceededError extends ScraperError {
  constructor(hops: number) {
    super(
      `Maximum allowed HTTP redirect hops (${hops}) exceeded`,
      "MAX_REDIRECTS_EXCEEDED"
    );
    this.name = "MaxRedirectsExceededError";
  }
}

export class RedirectLoopError extends ScraperError {
  constructor(url: string) {
    super(`HTTP redirect loop detected targeting '${url}'`, "REDIRECT_LOOP");
    this.name = "RedirectLoopError";
  }
}

export class InvalidRedirectError extends ScraperError {
  constructor(message: string) {
    super(`Invalid redirect: ${message}`, "INVALID_REDIRECT");
    this.name = "InvalidRedirectError";
  }
}

export class RequestTimeoutError extends ScraperError {
  constructor(timeoutMs: number) {
    super(
      `Scraper socket inactivity timed out after ${timeoutMs}ms without receiving data`,
      "REQUEST_TIMEOUT"
    );
    this.name = "RequestTimeoutError";
  }
}

export class AbsoluteRequestTimeoutError extends ScraperError {
  constructor(timeoutMs: number) {
    super(
      `Scraper request exceeded absolute deadline of ${timeoutMs}ms (including connection, TLS, headers, streaming, and decompression)`,
      "ABSOLUTE_REQUEST_TIMEOUT"
    );
    this.name = "AbsoluteRequestTimeoutError";
  }
}

export class ScraperExecutionAbortedError extends ScraperError {
  constructor(reason: string = "aborted") {
    super(`Scraper execution aborted: ${reason}`, "EXECUTION_ABORTED");
    this.name = "ScraperExecutionAbortedError";
  }
}

export interface ScraperAgentContext {
  agentRepo: AgentRepository;
  runId: string;
  stepNumber: number;
}

export interface ScraperOptions extends ValidateTargetOptions {
  timeoutMs?: number;         // Socket inactivity timeout (default: 10000ms)
  absoluteTimeoutMs?: number; // Absolute request timeout per HTTP hop (default: 10000ms, max 10000ms)
  deadlineMs?: number;        // Wall-clock timestamp (Date.now() + ms) for overall scraper run
  signal?: AbortSignal;
  agentContext?: ScraperAgentContext;
  ca?: string | Buffer | Array<string | Buffer>;
  rejectUnauthorized?: boolean;
}

export interface ScrapedStructuredContent {
  origin: string;
  title: string;
  metaDescription: string;
  headings: string[];
  textContent: string;
  truncated: boolean;
}

export interface ScrapeResult {
  originalUrl: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  rawHtml: string;
  sanitizedText: string;
  quarantineEnvelope: string;
  title: string;
  metaDescription: string;
  headings: string[];
  redirectCount: number;
  durationMs: number;
  retryCount: number;
  backoffMs: number;
  triggerStatusCode: number | null;
  structuredData?: ScrapedStructuredContent;
}

/**
 * Evaluates whether an error or status code is transient/recoverable.
 * Recoverable: HTTP 429, 502, 503, 504, and network ECONNRESET.
 */
export function isRecoverableFailure(err: unknown, statusCode?: number): boolean {
  if (statusCode && [429, 502, 503, 504].includes(statusCode)) {
    return true;
  }
  if (err && typeof err === "object") {
    const msg = "message" in err && typeof err.message === "string" ? err.message : "";
    const code = "code" in err && typeof err.code === "string" ? err.code : "";
    if (code === "ECONNRESET" || msg.includes("ECONNRESET")) {
      return true;
    }
  }
  return false;
}

/**
 * Parses the Retry-After header if present, returning backoff delay in milliseconds.
 */
export function parseRetryAfterHeader(headerValue: string | undefined): number | null {
  if (!headerValue || !headerValue.trim()) {
    return null;
  }
  const trimmed = headerValue.trim();
  // 1. Seconds format: "120"
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    return Math.min(seconds * 1000, 10000); // capped at 10s
  }
  // 2. HTTP Date format: "Wed, 21 Oct 2026 07:28:00 GMT"
  const parsedDate = Date.parse(trimmed);
  if (!isNaN(parsedDate)) {
    const diffMs = parsedDate - Date.now();
    return Math.max(0, Math.min(diffMs, 10000));
  }
  return null;
}

/**
 * Neutralizes XML quarantine envelope opening and closing tags in untrusted scraped text
 * regardless of casing, attributes, or internal whitespace (e.g. </untrusted_scraped_data>,
 * </ UNTRUSTED_SCRAPED_DATA >, < untrusted_scraped_data origin="..." >).
 */
export function escapeEnvelopeDelimiters(text: string): string {
  if (!text) return "";
  return text
    .replace(/<\s*\/\s*untrusted_scraped_data\b[^>]*>/gi, "&lt;/untrusted_scraped_data&gt;")
    .replace(/<\s*untrusted_scraped_data\b[^>]*>/gi, "&lt;untrusted_scraped_data&gt;");
}

/**
 * Sanitizes scraped HTML using Cheerio, stripping executable/hidden elements,
 * extracting title, headings, neutralizing delimiter breakouts, and wrapping in an XML quarantine envelope.
 *
 * Security Note:
 * Neutralizing delimiters prevents prompt breakout and structural boundary forgery.
 * However, textual content may still contain adversarial prompt injection instructions.
 * Downstream LLM stages must consume structured representations (Zod schemas) and treat
 * evidence critically without assuming HTML/XML sanitization eliminates prompt injection.
 */
export function sanitizeHtmlContent(html: string, sourceUrl: string): {
  sanitizedText: string;
  quarantineEnvelope: string;
  title: string;
  metaDescription: string;
  headings: string[];
  structuredData: ScrapedStructuredContent;
} {
  const $ = cheerio.load(html);

  // 1. Strip script, style, iframe, svg, form, embed, and media elements
  $(
    "script, style, iframe, svg, form, noscript, object, embed, applet, canvas, audio, video"
  ).remove();

  // 2. Strip hidden CSS elements
  $(
    "[hidden], [aria-hidden='true'], [style*='display:none'], [style*='display: none'], [style*='visibility:hidden'], [style*='visibility: hidden']"
  ).remove();

  // 3. Extract metadata
  const rawTitle = $("title").first().text().trim();
  const rawMetaDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    "";

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      headings.push(escapeEnvelopeDelimiters(text));
    }
  });

  const title = escapeEnvelopeDelimiters(rawTitle);
  const metaDescription = escapeEnvelopeDelimiters(rawMetaDescription);

  // 4. Extract readable body text
  let rawText = $("body").length ? $("body").text() : $.text();

  // Normalize excessive whitespaces and blank lines
  rawText = rawText
    .replace(/[ \t]+/g, " ")
    .replace(/(\r?\n\s*){3,}/g, "\n\n")
    .trim();

  // Enforce string length cap
  let truncated = false;
  if (rawText.length > SCRAPER_BOUNDS.MAX_TEXT_LENGTH) {
    rawText = rawText.slice(0, SCRAPER_BOUNDS.MAX_TEXT_LENGTH) + "\n...[truncated]";
    truncated = true;
  }

  // Neutralize delimiter tags in body text
  const sanitizedText = escapeEnvelopeDelimiters(rawText);

  // Safe origin XML attribute escaping
  const safeOrigin = sourceUrl
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 5. Wrap in XML quarantine envelope
  const quarantineEnvelope = `<untrusted_scraped_data origin="${safeOrigin}">\n${sanitizedText}\n</untrusted_scraped_data>`;

  return {
    sanitizedText,
    quarantineEnvelope,
    title,
    metaDescription,
    headings,
    structuredData: {
      origin: sourceUrl,
      title,
      metaDescription,
      headings,
      textContent: sanitizedText,
      truncated,
    },
  };
}

interface SingleHopResponse {
  isRedirect: boolean;
  statusCode: number;
  location?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/**
 * Dispatches a single HTTP request using the pinned IP agent, enforcing socket inactivity timeout
 * and an absolute request timeout (max 10s) covering connect, headers, streaming body, and decompression.
 */
async function fetchSingleHop(
  target: ValidatedTarget,
  options: ScraperOptions
): Promise<SingleHopResponse> {
  const socketInactivityMs = options.timeoutMs ?? SCRAPER_BOUNDS.DEFAULT_TIMEOUT_MS;
  const maxHopAbsoluteMs = Math.min(
    options.absoluteTimeoutMs ?? SCRAPER_BOUNDS.DEFAULT_ABSOLUTE_TIMEOUT_MS,
    SCRAPER_BOUNDS.DEFAULT_ABSOLUTE_TIMEOUT_MS
  );

  // Check remaining runtime deadline if overall deadlineMs is set
  const remainingRunMs = options.deadlineMs ? options.deadlineMs - Date.now() : Infinity;
  if (remainingRunMs <= 0) {
    throw new AbsoluteRequestTimeoutError(0);
  }

  const effectiveAbsoluteMs = Math.min(maxHopAbsoluteMs, remainingRunMs);
  const effectiveInactivityMs = Math.min(socketInactivityMs, effectiveAbsoluteMs);

  const agent =
    target.protocol === "https:"
      ? createPinnedHttpsAgent(target, {
          timeoutMs: effectiveInactivityMs,
          ca: options.ca,
          rejectUnauthorized: options.rejectUnauthorized,
        })
      : createPinnedHttpAgent(target, { timeoutMs: effectiveInactivityMs });

  const pathAndQuery =
    (target.parsedUrl.pathname || "/") + (target.parsedUrl.search || "");

  const requestFn = target.protocol === "https:" ? https.request : http.request;

  return new Promise<SingleHopResponse>((resolve, reject) => {
    let isSettled = false;
    let absoluteTimer: NodeJS.Timeout | null = null;
    let activeSocket: net.Socket | null = null;
    let activeRes: http.IncomingMessage | null = null;
    let activeDecompressor: (zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress) | null = null;
    let targetStream: (NodeJS.ReadableStream & { destroy?: (err?: Error) => void }) | null = null;

    const cleanup = () => {
      if (absoluteTimer) {
        clearTimeout(absoluteTimer);
        absoluteTimer = null;
      }
      if (options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
      if (activeRes) {
        activeRes.removeAllListeners();
        activeRes.on("error", () => {});
      }
      if (targetStream && targetStream !== (activeRes as unknown as NodeJS.ReadableStream)) {
        targetStream.removeAllListeners();
        if ("on" in targetStream && typeof targetStream.on === "function") {
          targetStream.on("error", () => {});
        }
      }
      if (activeDecompressor) {
        activeDecompressor.removeAllListeners();
        activeDecompressor.on("error", () => {});
      }
      if (activeSocket) {
        activeSocket.removeAllListeners("timeout");
        activeSocket.on("error", () => {});
      }
      req.removeAllListeners();
      req.on("error", () => {});
      agent.destroy();
    };

    const destroyAll = (err?: Error) => {
      if (activeSocket) {
        try { activeSocket.destroy(err); } catch {}
      }
      try { req.destroy(err); } catch {}
      if (activeRes) {
        try { activeRes.destroy(err); } catch {}
      }
      if (activeDecompressor) {
        try { activeDecompressor.destroy(err); } catch {}
      }
      try { agent.destroy(); } catch {}
    };

    const fail = (err: Error) => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        destroyAll(err);
        reject(err);
      }
    };

    // Check cancellation signal
    if (options.signal?.aborted) {
      fail(new ScraperExecutionAbortedError(String(options.signal.reason || "aborted")));
      return;
    }

    const onAbort = () => {
      fail(new ScraperExecutionAbortedError(String(options.signal?.reason || "aborted")));
    };

    if (options.signal) {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    // Absolute request deadline covering connection, TLS, headers, streaming body, and decompression
    absoluteTimer = setTimeout(() => {
      fail(new AbsoluteRequestTimeoutError(effectiveAbsoluteMs));
    }, effectiveAbsoluteMs);

    const req = requestFn(
      {
        host: target.pinnedIp,
        port: target.port,
        path: pathAndQuery,
        method: "GET",
        agent,
        headers: {
          Host: target.hostname,
          "User-Agent":
            "AstraOps-ProspectResearch/1.0 (+https://astraops.com/research-bot)",
          Accept:
            "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "close",
        },
      },
      (res) => {
        activeRes = res;
        const statusCode = res.statusCode || 0;

        // Check for HTTP redirect
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = res.headers.location;
          res.resume(); // discard body
          cleanup();
          isSettled = true;
          resolve({
            isRedirect: true,
            statusCode,
            location,
            headers: res.headers,
            body: "",
          });
          return;
        }

        // Validate Content-Length header early if provided
        const contentLengthHeader = res.headers["content-length"];
        if (contentLengthHeader) {
          const declaredLength = parseInt(contentLengthHeader, 10);
          if (!isNaN(declaredLength) && declaredLength > SCRAPER_BOUNDS.MAX_PAYLOAD_BYTES) {
            fail(new PayloadSizeExceededError(declaredLength));
            return;
          }
        }

        // Validate Content-Type
        const rawContentType = (res.headers["content-type"] || "").toLowerCase();
        const mimeType = rawContentType.split(";")[0].trim();
        const ALLOWED_MIME_PREFIXES = [
          "text/html",
          "application/xhtml+xml",
          "text/plain",
          "", // allow missing content-type if fallback
        ];

        if (
          mimeType &&
          !ALLOWED_MIME_PREFIXES.includes(mimeType) &&
          !mimeType.startsWith("text/")
        ) {
          fail(new UnsupportedContentTypeError(rawContentType));
          return;
        }

        // Stream reader with 2MB ceiling and decompression
        let rawBytesReceived = 0;
        let decompressedBytesReceived = 0;
        const chunks: Buffer[] = [];

        const contentEncoding = (res.headers["content-encoding"] || "").toLowerCase().trim();

        if (contentEncoding === "gzip") {
          activeDecompressor = zlib.createGunzip();
        } else if (contentEncoding === "deflate") {
          activeDecompressor = zlib.createInflate();
        } else if (contentEncoding === "br") {
          activeDecompressor = zlib.createBrotliDecompress();
        }

        res.on("data", (chunk: Buffer) => {
          rawBytesReceived += chunk.length;
          if (rawBytesReceived > SCRAPER_BOUNDS.MAX_PAYLOAD_BYTES) {
            fail(new PayloadSizeExceededError(rawBytesReceived));
          }
        });

        res.on("error", (err: Error) => {
          fail(err);
        });

        targetStream = activeDecompressor ? res.pipe(activeDecompressor) : res;

        targetStream.on("data", (chunk: Buffer) => {
          decompressedBytesReceived += chunk.length;
          if (decompressedBytesReceived > SCRAPER_BOUNDS.MAX_PAYLOAD_BYTES) {
            fail(new PayloadSizeExceededError(decompressedBytesReceived));
            return;
          }
          chunks.push(chunk);
        });

        targetStream.on("end", () => {
          if (!isSettled) {
            isSettled = true;
            cleanup();
            const body = Buffer.concat(chunks).toString("utf-8");
            resolve({
              isRedirect: false,
              statusCode,
              headers: res.headers,
              body,
            });
          }
        });

        targetStream.on("error", (err: Error) => {
          fail(err);
        });
      }
    );

    req.on("socket", (sock) => {
      activeSocket = sock;
      // Inactivity timeout on the socket
      sock.setTimeout(effectiveInactivityMs, () => {
        fail(new RequestTimeoutError(effectiveInactivityMs));
      });
    });

    req.on("error", (err: Error) => {
      fail(err);
    });

    req.end();
  });
}

/**
 * Executes a full redirect chain (max 3 hops), re-validating the target at each hop
 * and enforcing the total run deadline before each request.
 */
async function executeRedirectChain(
  initialUrl: string,
  options: ScraperOptions
): Promise<{
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  redirectCount: number;
}> {
  let currentUrl = initialUrl;
  let hopCount = 0;
  const visitedUrls = new Set<string>();

  while (true) {
    if (options.deadlineMs && Date.now() >= options.deadlineMs) {
      throw new AbsoluteRequestTimeoutError(0);
    }

    if (visitedUrls.has(currentUrl)) {
      throw new RedirectLoopError(currentUrl);
    }
    visitedUrls.add(currentUrl);

    if (hopCount > SCRAPER_BOUNDS.MAX_REDIRECT_HOPS) {
      throw new MaxRedirectsExceededError(SCRAPER_BOUNDS.MAX_REDIRECT_HOPS);
    }

    const validated = await validateAndPinTarget(currentUrl, options);
    const hopRes = await fetchSingleHop(validated, options);

    if (hopRes.isRedirect) {
      if (!hopRes.location) {
        throw new InvalidRedirectError("Redirect response missing Location header");
      }
      const nextUrl = new URL(hopRes.location, currentUrl).toString();
      currentUrl = nextUrl;
      hopCount++;
      continue;
    }

    return {
      finalUrl: currentUrl,
      statusCode: hopRes.statusCode,
      headers: hopRes.headers,
      body: hopRes.body,
      redirectCount: hopCount,
    };
  }
}

/**
 * High-level scraping entrypoint:
 * - Performs pre-request URL validation and IP pinning
 * - Executes redirect chain up to 3 hops with per-hop re-validation
 * - Applies exactly 1 transient retry on recoverable failures (429, 502, 503, 504, ECONNRESET)
 * - Enforces overall run deadline across retries and redirects without resetting
 * - Sanitizes HTML via Cheerio into an XML quarantine envelope with neutralized delimiters
 * - Persists execution step to PostgreSQL via AgentRepository if agentContext is provided
 */
export async function scrapeWebsite(
  url: string,
  options: ScraperOptions = {}
): Promise<ScrapeResult> {
  const startTime = Date.now();
  let retryCount = 0;
  let backoffMs = 0;
  let triggerStatusCode: number | null = null;

  // Establish run-wide deadline to prevent unbounded retries from resetting time
  const totalRunDeadlineMs = options.deadlineMs ?? (Date.now() + 25000);
  const runOptions: ScraperOptions = {
    ...options,
    deadlineMs: totalRunDeadlineMs,
  };

  let executionResult: {
    finalUrl: string;
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
    redirectCount: number;
  } | null = null;

  try {
    // Attempt 0 (Initial Attempt)
    try {
      executionResult = await executeRedirectChain(url, runOptions);

      // Check if response status indicates an error
      if (executionResult.statusCode >= 400) {
        throw new ScraperError(
          `HTTP request failed with status ${executionResult.statusCode}`,
          `HTTP_${executionResult.statusCode}`
        );
      }
    } catch (firstErr) {
      // If deadline has expired, fail immediately without retry
      if (Date.now() >= totalRunDeadlineMs || firstErr instanceof AbsoluteRequestTimeoutError) {
        throw firstErr;
      }

      const isRecoverable =
        isRecoverableFailure(firstErr, executionResult?.statusCode) ||
        (firstErr instanceof ScraperError &&
          [502, 503, 504, 429].some((code) =>
            firstErr.code.includes(String(code))
          ));

      // SSRF violations, TLS cert errors, invalid URLs, and client 4xx are non-retryable
      if (!isRecoverable || firstErr instanceof SsrfError) {
        throw firstErr;
      }

      // Compute backoff delay (honor Retry-After or jittered base backoff 1500ms ± 500ms)
      retryCount = 1;
      triggerStatusCode = executionResult?.statusCode || null;

      const retryAfterHeader = executionResult?.headers?.["retry-after"];
      const headerVal = Array.isArray(retryAfterHeader)
        ? retryAfterHeader[0]
        : retryAfterHeader;
      const parsedRetryAfter = parseRetryAfterHeader(headerVal);

      if (parsedRetryAfter !== null) {
        backoffMs = parsedRetryAfter;
      } else {
        // Base backoff 1500ms with ± 500ms jitter (1000ms - 2000ms)
        backoffMs = Math.floor(1500 + (Math.random() * 1000 - 500));
      }

      // Ensure backoff + minimal execution buffer does not exceed remaining run deadline
      if (Date.now() + backoffMs >= totalRunDeadlineMs) {
        throw firstErr;
      }

      // Await backoff delay respecting cancellation signal
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, backoffMs);
        if (options.signal) {
          options.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(
                new ScraperExecutionAbortedError(
                  String(options.signal?.reason || "aborted")
                )
              );
            },
            { once: true }
          );
        }
      });

      // Verify deadline after waking from backoff
      if (Date.now() >= totalRunDeadlineMs) {
        throw firstErr;
      }

      // Attempt 1 (Final Permitted Retry)
      executionResult = await executeRedirectChain(url, runOptions);
      if (executionResult.statusCode >= 400) {
        throw new ScraperError(
          `HTTP request failed with status ${executionResult.statusCode} on retry`,
          `HTTP_${executionResult.statusCode}`
        );
      }
    }

    const durationMs = Date.now() - startTime;
    const sanitized = sanitizeHtmlContent(executionResult.body, executionResult.finalUrl);

    const result: ScrapeResult = {
      originalUrl: url,
      finalUrl: executionResult.finalUrl,
      statusCode: executionResult.statusCode,
      headers: executionResult.headers,
      rawHtml: executionResult.body,
      sanitizedText: sanitized.sanitizedText,
      quarantineEnvelope: sanitized.quarantineEnvelope,
      title: sanitized.title,
      metaDescription: sanitized.metaDescription,
      headings: sanitized.headings,
      redirectCount: executionResult.redirectCount,
      durationMs,
      retryCount,
      backoffMs,
      triggerStatusCode,
      structuredData: sanitized.structuredData,
    };

    // If agentContext is supplied, persist step event to AgentRepository
    if (options.agentContext) {
      await options.agentContext.agentRepo.recordStep({
        runId: options.agentContext.runId,
        stepNumber: options.agentContext.stepNumber,
        toolName: "scrapeWebsite",
        inputPayload: { url },
        outputPayload: {
          statusCode: result.statusCode,
          finalUrl: result.finalUrl,
          title: result.title,
          contentLength: result.sanitizedText.length,
          headingsCount: result.headings.length,
          redirectCount: result.redirectCount,
        },
        tokensUsed: 0,
        costUsd: 0,
        durationMs,
        retryCount,
        backoffMs: backoffMs || null,
        triggerStatusCode,
        isToolCall: true,
        deadlineMs: options.deadlineMs,
        signal: options.signal,
      });
    }

    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;

    // Record failed attempt in AgentRepository if context provided
    if (options.agentContext) {
      try {
        await options.agentContext.agentRepo.recordStep({
          runId: options.agentContext.runId,
          stepNumber: options.agentContext.stepNumber,
          toolName: "scrapeWebsite",
          inputPayload: { url },
          outputPayload: {
            error: err instanceof Error ? err.message : String(err),
            errorCode: (err as Record<string, unknown>).code || "SCRAPE_FAILED",
          },
          tokensUsed: 0,
          costUsd: 0,
          durationMs,
          retryCount,
          backoffMs: backoffMs || null,
          triggerStatusCode,
          isToolCall: true,
          deadlineMs: options.deadlineMs,
          signal: options.signal,
        });
      } catch {
        // Do not suppress primary scraping error if step logging encounters an issue
      }
    }

    throw err;
  }
}
