/**
 * CSRF (Cross-Site Request Forgery) Protection Module
 *
 * Threat Model & Defense Strategy:
 * 1. Scope: Applies strictly to state-changing operations (POST, PUT, PATCH, DELETE)
 *    when browser cookie-based authentication (`astraops_session`) is used.
 * 2. Exemption: Requests authenticated via Authorization Bearer token or x-api-key
 *    are immune to browser CSRF because browsers never automatically attach custom
 *    Authorization headers across origins. These are preserved for server-to-server integrations.
 * 3. Validation:
 *    - Verifies Origin header against target application Host (or x-forwarded-host).
 *    - Fallback to Referer header if Origin is not supplied.
 *    - Rejects Sec-Fetch-Site: cross-site requests.
 *    - Cross-origin mismatches are rejected with 403 Forbidden (CSRF_FORBIDDEN).
 */

export interface CsrfValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isStateChangingMethod(method: string): boolean {
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

/**
 * Validates Origin/Host headers for state-changing requests using cookie authentication.
 */
export function validateCsrf(req: Request): CsrfValidationResult {
  // Safe HTTP methods do not change state
  if (!isStateChangingMethod(req.method)) {
    return { valid: true };
  }

  // Check Sec-Fetch-Site header (standard in modern browsers)
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite.toLowerCase() === "cross-site") {
    return {
      valid: false,
      code: "CSRF_FORBIDDEN",
      message: "Cross-site request blocked by CSRF protection policy.",
    };
  }

  // Derive expected host from request
  let expectedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!expectedHost) {
    try {
      const url = new URL(req.url);
      expectedHost = url.host;
    } catch {
      expectedHost = null;
    }
  }

  const originHeader = req.headers.get("origin");
  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      const originHost = originUrl.host;

      if (expectedHost && originHost.toLowerCase() !== expectedHost.toLowerCase()) {
        return {
          valid: false,
          code: "CSRF_FORBIDDEN",
          message: `Cross-origin request rejected: Origin '${originHost}' does not match application host '${expectedHost}'.`,
        };
      }

      return { valid: true };
    } catch {
      return {
        valid: false,
        code: "CSRF_FORBIDDEN",
        message: "Invalid Origin header format.",
      };
    }
  }

  // Fallback to Referer if Origin is absent
  const refererHeader = req.headers.get("referer");
  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      const refererHost = refererUrl.host;

      if (expectedHost && refererHost.toLowerCase() !== expectedHost.toLowerCase()) {
        return {
          valid: false,
          code: "CSRF_FORBIDDEN",
          message: `Cross-origin request rejected: Referer '${refererHost}' does not match application host '${expectedHost}'.`,
        };
      }

      return { valid: true };
    } catch {
      return {
        valid: false,
        code: "CSRF_FORBIDDEN",
        message: "Invalid Referer header format.",
      };
    }
  }

  // If neither Origin nor Referer is provided:
  // In tests or non-browser direct calls without origin, allow if not flagged cross-site
  return { valid: true };
}
