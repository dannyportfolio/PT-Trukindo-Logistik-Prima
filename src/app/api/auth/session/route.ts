import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { loginRateLimiter, getClientIdentifier } from "@/lib/rate-limit";
import { validateCsrf } from "@/lib/csrf";
import { UserRepository } from "@/lib/user-repository";

/**
 * GET /api/auth/session
 * Inspects whether current browser request holds a valid authentication session.
 * Never exposes the raw API token, signing secrets, or credentials.
 */
export async function GET(req: Request) {
  const auth = await authenticateRequest(req, ["ADMIN", "SALES_OPERATOR", "VIEWER"]);
  if (!auth.success) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      userId: auth.user.userId,
      actorId: auth.user.actorId || auth.user.userId,
      role: auth.user.role,
    },
  });
}

/**
 * POST /api/auth/session
 * Logs in browser operator by validating email/password or service token and setting an HttpOnly session cookie.
 * Hardened with:
 * - Origin / CSRF validation
 * - In-memory brute-force sliding-window rate limiting (429 Too Many Requests)
 * - HttpOnly, SameSite=Lax, Path=/, explicit 8h Max-Age, and Secure in production
 */
export async function POST(req: Request) {
  // 1. CSRF Origin validation
  const csrfCheck = validateCsrf(req);
  if (!csrfCheck.valid) {
    return jsonError(403, csrfCheck.code || "CSRF_FORBIDDEN", csrfCheck.message || "Cross-origin request rejected");
  }

  // 2. Brute-force rate limiting check
  const clientId = getClientIdentifier(req);
  const rateLimitStatus = loginRateLimiter.check(clientId);
  if (!rateLimitStatus.allowed) {
    const retryAfter = rateLimitStatus.retryAfterSeconds || 60;
    const res = jsonError(
      429,
      "TOO_MANY_REQUESTS",
      `Too many failed login attempts. Please wait ${retryAfter} seconds before trying again.`
    );
    res.headers.set("Retry-After", String(retryAfter));
    return res;
  }

  // 3. Parse JSON Body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    loginRateLimiter.recordFailure(clientId);
    return jsonError(400, "BAD_REQUEST", "Invalid JSON body");
  }

  const { email, password, token } = (body as { email?: string; password?: string; token?: string }) || {};

  let sessionToken: string | null = null;
  let authenticatedUser: { userId: string; actorId: string; role: string } | null = null;

  // Case A: Email & Password Authentication (Database-backed RBAC)
  if (email && typeof email === "string" && password && typeof password === "string") {
    try {
      const userRepo = new UserRepository();
      const authResult = await userRepo.authenticateCredentials({
        email: email.trim(),
        password,
      });

      if (!authResult.success) {
        loginRateLimiter.recordFailure(clientId);
        return jsonError(401, "UNAUTHORIZED", authResult.reason);
      }

      const session = await userRepo.createSession({
        userId: authResult.user.id,
        ipAddress: clientId,
        userAgent: req.headers.get("user-agent"),
        durationHours: 8,
      });

      sessionToken = session.token;
      authenticatedUser = {
        userId: authResult.user.id,
        actorId: authResult.user.email,
        role: authResult.user.role,
      };
    } catch (err: unknown) {
      console.error("[POST /api/auth/session] User credentials verification error:", err);
      loginRateLimiter.recordFailure(clientId);
      return jsonError(500, "INTERNAL_ERROR", "Authentication service temporarily unavailable");
    }
  }
  // Case B: Static Token Authentication (Fallback / M2M)
  else if (token && typeof token === "string" && token.trim()) {
    const probeReq = new Request("http://localhost:3000", {
      headers: { authorization: `Bearer ${token.trim()}` },
    });
    const auth = await authenticateRequest(probeReq, ["ADMIN", "SALES_OPERATOR", "VIEWER"]);

    if (!auth.success) {
      loginRateLimiter.recordFailure(clientId);
      return jsonError(401, "UNAUTHORIZED", "Invalid authentication token");
    }

    sessionToken = token.trim();
    authenticatedUser = {
      userId: auth.user.userId,
      actorId: auth.user.actorId || auth.user.userId,
      role: auth.user.role,
    };
  } else {
    loginRateLimiter.recordFailure(clientId);
    return jsonError(400, "BAD_REQUEST", "Email & password or authentication token is required");
  }

  // Reset rate limiting counter upon successful authentication
  loginRateLimiter.reset(clientId);

  const res = jsonSuccess({
    success: true,
    user: authenticatedUser,
  });

  // Set httpOnly session cookie with hardened security attributes
  const isProd = process.env.NODE_ENV === "production";
  const cookieMaxAge = !email && token ? 86400 : 8 * 60 * 60;
  res.cookies.set("astraops_session", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAge,
    secure: isProd,
  });

  return res;
}

/**
 * DELETE /api/auth/session
 * Logs out browser operator by revoking session in database and clearing the session cookie.
 */
export async function DELETE(req: Request) {
  const csrfCheck = validateCsrf(req);
  if (!csrfCheck.valid) {
    return jsonError(403, csrfCheck.code || "CSRF_FORBIDDEN", csrfCheck.message || "Cross-origin request rejected");
  }

  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)astraops_session=([^;]+)/);
    if (match) {
      const rawToken = decodeURIComponent(match[1].trim());
      try {
        const userRepo = new UserRepository();
        await userRepo.revokeSession(rawToken);
      } catch {
        // Ignored
      }
    }
  }

  const res = jsonSuccess({ message: "Logged out successfully" });
  res.cookies.set("astraops_session", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
