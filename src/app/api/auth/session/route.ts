import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { jsonError, jsonSuccess } from "@/lib/api-response";
import { loginRateLimiter, getClientIdentifier } from "@/lib/rate-limit";
import { validateCsrf } from "@/lib/csrf";

/**
 * GET /api/auth/session
 * Inspects whether current browser request holds a valid authentication session.
 * Never exposes the raw API token, signing secrets, or credentials.
 */
export async function GET(req: Request) {
  const auth = authenticateRequest(req);
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
 * Logs in browser operator by validating token and setting an HttpOnly session cookie.
 * Hardened with:
 * - Origin / CSRF validation
 * - In-memory brute-force sliding-window rate limiting (429 Too Many Requests)
 * - HttpOnly, SameSite=Lax, Path=/, explicit 24h Max-Age, and Secure in production
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

  const { token } = (body as { token?: string }) || {};
  if (!token || typeof token !== "string" || !token.trim()) {
    loginRateLimiter.recordFailure(clientId);
    return jsonError(400, "BAD_REQUEST", "Authentication token is required");
  }

  // 4. Validate token via authenticateRequest
  const probeReq = new Request("http://localhost:3000", {
    headers: { authorization: `Bearer ${token.trim()}` },
  });
  const auth = authenticateRequest(probeReq);

  if (!auth.success) {
    loginRateLimiter.recordFailure(clientId);
    return jsonError(401, "UNAUTHORIZED", "Invalid authentication token");
  }

  // Reset rate limiting counter upon successful authentication
  loginRateLimiter.reset(clientId);

  const res = jsonSuccess({
    success: true,
    user: {
      userId: auth.user.userId,
      actorId: auth.user.actorId || auth.user.userId,
      role: auth.user.role,
    },
  });

  // Set httpOnly session cookie with hardened security attributes
  const isProd = process.env.NODE_ENV === "production";
  res.cookies.set("astraops_session", token.trim(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
    secure: isProd,
  });

  return res;
}

/**
 * DELETE /api/auth/session
 * Logs out browser operator by clearing the httpOnly session cookie with matching security attributes.
 */
export async function DELETE(req: Request) {
  // CSRF Origin validation
  const csrfCheck = validateCsrf(req);
  if (!csrfCheck.valid) {
    return jsonError(403, csrfCheck.code || "CSRF_FORBIDDEN", csrfCheck.message || "Cross-origin request rejected");
  }

  const res = jsonSuccess({ success: true, message: "Logged out successfully" });
  const isProd = process.env.NODE_ENV === "production";

  res.cookies.set("astraops_session", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    secure: isProd,
  });

  return res;
}
