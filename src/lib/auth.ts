import { getConfig } from "./config";
import { validateCsrf, isStateChangingMethod } from "./csrf";

export type UserRole = "SALES_OPERATOR" | "ADMIN" | "VIEWER";

export interface AuthenticatedUser {
  userId: string;
  actorId: string;
  role: UserRole;
}

export type AuthResult =
  | { success: true; user: AuthenticatedUser }
  | { success: false; status: 401 | 403; code: string; message: string };

/**
 * Trust Boundary & Threat Model Documentation:
 * -------------------------------------------------------------
 * 1. External/Client Header Boundary:
 *    Client-supplied headers such as `x-actor-id` and `x-actor-role` MUST NOT be trusted
 *    for authentication or privilege assignment. In an MVP architecture without an external
 *    OIDC/JWT Identity Provider, all user identities and permissions are derived strictly
 *    from server-validated credentials.
 *
 * 2. Token-to-Identity Mapping (Server-Side Source of Truth):
 *    - `ADMIN_AUTH_TOKEN`: Grants verified `ADMIN` role with actor ID `service_admin`.
 *    - `API_AUTH_TOKEN`: Grants verified `SALES_OPERATOR` role with actor ID `service_operator`.
 *    - `VIEWER_AUTH_TOKEN`: Grants verified `VIEWER` role with actor ID `service_viewer`.
 *    Attempting to supply `x-actor-role: ADMIN` or arbitrary `x-actor-id` alongside
 *    the standard operator or viewer token will have ZERO effect; privileges are never elevated.
 *
 * 3. CSRF & Session Boundary:
 *    Browser requests authenticated via session cookie (`astraops_session`) executing
 *    state-changing methods (POST, PUT, PATCH, DELETE) undergo strict Origin/Host validation.
 *    Server-to-server calls authenticated via Authorization Bearer or x-api-key bypass
 *    CSRF checks to preserve API compatibility.
 *
 * 4. Reverse Proxy / Gateway Requirement:
 *    Any edge reverse proxy (Cloudflare, Nginx, Envoy) MUST strip incoming untrusted
 *    `x-actor-*` headers before forwarding traffic to the AstraOps backend.
 */
export function authenticateRequest(
  request: Request,
  allowedRoles: UserRole[] = ["SALES_OPERATOR", "ADMIN"]
): AuthResult {
  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");

  let token: string | null = null;
  let isCookieAuth = false;

  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return {
        success: false,
        status: 401,
        code: "UNAUTHORIZED",
        message: "Invalid Authorization header format. Expected 'Bearer <token>'.",
      };
    }
    token = match[1].trim();
  } else if (apiKeyHeader) {
    token = apiKeyHeader.trim();
  }

  if (!token) {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)astraops_session=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1].trim());
        isCookieAuth = true;
      }
    }
  }

  if (!token) {
    return {
      success: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Authentication credentials required. Please provide a Bearer token or x-api-key.",
    };
  }

  // Enforce CSRF protection for browser cookie sessions on state-changing requests
  if (isCookieAuth && isStateChangingMethod(request.method)) {
    const csrfCheck = validateCsrf(request);
    if (!csrfCheck.valid) {
      return {
        success: false,
        status: 403,
        code: csrfCheck.code || "CSRF_FORBIDDEN",
        message: csrfCheck.message || "Cross-origin request forbidden by CSRF policy.",
      };
    }
  }

  const config = getConfig();

  // Derive identity and role strictly from verified server credentials
  let verifiedUser: AuthenticatedUser | null = null;

  if (token === config.ADMIN_AUTH_TOKEN) {
    verifiedUser = {
      userId: "service_admin",
      actorId: "service_admin",
      role: "ADMIN",
    };
  } else if (token === config.API_AUTH_TOKEN) {
    verifiedUser = {
      userId: "service_operator",
      actorId: "service_operator",
      role: "SALES_OPERATOR",
    };
  } else if (token === config.VIEWER_AUTH_TOKEN) {
    verifiedUser = {
      userId: "service_viewer",
      actorId: "service_viewer",
      role: "VIEWER",
    };
  } else {
    return {
      success: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid or expired authentication credentials.",
    };
  }

  // Verify that the derived role satisfies endpoint authorization requirements
  if (!allowedRoles.includes(verifiedUser.role)) {
    return {
      success: false,
      status: 403,
      code: "FORBIDDEN",
      message: `Forbidden: role '${verifiedUser.role}' is not authorized to access this resource. Required: ${allowedRoles.join(
        ", "
      )}.`,
    };
  }

  return {
    success: true,
    user: verifiedUser,
  };
}

