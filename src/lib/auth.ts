import { getConfig } from "./config";
import { validateCsrf, isStateChangingMethod } from "./csrf";
import { UserRepository } from "./user-repository";

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
 *    for authentication or privilege assignment. All user identities and permissions are
 *    derived strictly from server-validated credentials.
 *
 * 2. Multi-Tier Authentication Strategy:
 *    - Tier 1: Static Service Tokens (ADMIN_AUTH_TOKEN, API_AUTH_TOKEN, VIEWER_AUTH_TOKEN)
 *      Reserved for machine-to-machine integrations and administrative bootstrap.
 *    - Tier 2: Database-Backed User Sessions (user_sessions table in PostgreSQL)
 *      Stores SHA-256 hashed session tokens tied to specific individual operators with
 *      time-limited expiry, IP logging, and revocation support.
 *
 * 3. CSRF & Session Boundary:
 *    Browser requests authenticated via session cookie (`astraops_session`) executing
 *    state-changing methods (POST, PUT, PATCH, DELETE) undergo strict Origin/Host validation.
 */
export async function authenticateRequest(
  request: Request,
  allowedRoles: UserRole[] = ["SALES_OPERATOR", "ADMIN"]
): Promise<AuthResult> {
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
  let verifiedUser: AuthenticatedUser | null = null;

  // Tier 1: Check static service tokens first (fast path for bootstrap/M2M)
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
    // Tier 2: Check database-backed user session token
    try {
      const userRepo = new UserRepository();
      const sessionResult = await userRepo.validateSession(token);
      if (sessionResult.valid) {
        verifiedUser = {
          userId: sessionResult.user.id,
          actorId: sessionResult.user.email,
          role: sessionResult.user.role,
        };
      }
    } catch {
      // Database unavailable or query error, will return 401 below
    }
  }

  if (!verifiedUser) {
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
