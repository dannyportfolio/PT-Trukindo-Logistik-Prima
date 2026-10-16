import { describe, it, expect, beforeEach } from "vitest";
import { GET as getSession, POST as postSession, DELETE as deleteSession } from "@/app/api/auth/session/route";
import { GET as getLeads, POST as createLead } from "@/app/api/leads/route";
import { loginRateLimiter } from "@/lib/rate-limit";

describe("Browser Session Authentication & CSRF Security Boundary", () => {
  beforeEach(() => {
    loginRateLimiter.clear();
  });

  describe("Session Inspection & Token Non-Exposure", () => {
    it("should return authenticated: false when no session cookie or header is present", async () => {
      const req = new Request("http://localhost:3000/api/auth/session");
      const res = await getSession(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(false);
      expect(json.user).toBeUndefined();
    });

    it("should never expose secret token in GET /api/auth/session response body", async () => {
      const req = new Request("http://localhost:3000/api/auth/session", {
        headers: { cookie: "astraops_session=astraops-secret-token" },
      });
      const res = await getSession(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.user.role).toBe("SALES_OPERATOR");
      expect(json.user.userId).toBe("service_operator");
      expect(json.user.actorId).toBe("service_operator");

      // Verify no tokens or secrets are leaked
      const rawText = JSON.stringify(json);
      expect(rawText).not.toContain("astraops-secret-token");
      expect(rawText).not.toContain("token");
    });
  });

  describe("Authentication Credentials & Secure Cookie Attributes", () => {
    it("should reject login with invalid token with 401 Unauthorized", async () => {
      const req = new Request("http://localhost:3000/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "totally-fake-token-xyz" }),
      });
      const res = await postSession(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject login without token with 400 Bad Request", async () => {
      const req = new Request("http://localhost:3000/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await postSession(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("BAD_REQUEST");
    });

    it("should login with valid token and set secure HttpOnly cookie with SameSite=Lax", async () => {
      const req = new Request("http://localhost:3000/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "astraops-secret-token" }),
      });
      const res = await postSession(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.user.role).toBe("SALES_OPERATOR");
      expect(json.user.actorId).toBe("service_operator");

      // Verify Set-Cookie header contains astraops_session, HttpOnly, and SameSite
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("astraops_session=astraops-secret-token");
      expect(setCookie?.toLowerCase()).toContain("httponly");
      expect(setCookie?.toLowerCase()).toContain("samesite=lax");
      expect(setCookie).toContain("Max-Age=86400"); // 24 hours
    });

    it("should clear session cookie upon DELETE /api/auth/session with matching attributes", async () => {
      const req = new Request("http://localhost:3000/api/auth/session", {
        method: "DELETE",
      });
      const res = await deleteSession(req);
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("astraops_session=");
      expect(setCookie).toContain("Max-Age=0");
      expect(setCookie?.toLowerCase()).toContain("httponly");
      expect(setCookie?.toLowerCase()).toContain("samesite=lax");
    });
  });

  describe("Brute-Force Rate Limiting on Login", () => {
    it("should enforce sliding window rate limiting and return 429 Too Many Requests after consecutive failures", async () => {
      const clientIp = "192.168.1.100";
      const makeFailedAttempt = () =>
        new Request("http://localhost:3000/api/auth/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": clientIp,
          },
          body: JSON.stringify({ token: "wrong-pass-attempt" }),
        });

      // Execute 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const res = await postSession(makeFailedAttempt());
        expect(res.status).toBe(401);
      }

      // 6th attempt should be blocked with 429 Too Many Requests
      const blockedRes = await postSession(makeFailedAttempt());
      expect(blockedRes.status).toBe(429);
      const json = await blockedRes.json();
      expect(json.error.code).toBe("TOO_MANY_REQUESTS");
      expect(blockedRes.headers.get("Retry-After")).toBeTruthy();
    });
  });

  describe("CSRF Defense & Origin Validation", () => {
    it("should reject cross-origin POST /api/auth/session with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "https://evil-attacker.com",
        },
        body: JSON.stringify({ token: "astraops-secret-token" }),
      });
      const res = await postSession(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("CSRF_FORBIDDEN");
    });

    it("should reject cross-origin DELETE /api/auth/session with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/auth/session", {
        method: "DELETE",
        headers: {
          origin: "https://evil-attacker.com",
        },
      });
      const res = await deleteSession(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("CSRF_FORBIDDEN");
    });

    it("should reject cross-origin state-changing POST /api/leads when authenticated via cookie with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "astraops_session=astraops-secret-token",
          origin: "https://malicious-site.org",
        },
        body: JSON.stringify({
          companyName: "CSRF Exploit Corp",
          websiteUrl: "https://csrf.example.com",
          contactName: "Attacker",
          contactEmail: "attacker@csrf.com",
        }),
      });

      const res = await createLead(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("CSRF_FORBIDDEN");
      expect(json.error.message).toContain("Cross-origin request rejected");
    });

    it("should allow same-origin state-changing POST /api/leads when authenticated via cookie", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "astraops_session=astraops-secret-token",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          companyName: "Same Origin Valid Co",
          websiteUrl: "https://valid-origin.com",
          contactName: "Authorized User",
          contactEmail: "authuser@valid-origin.com",
        }),
      });

      const res = await createLead(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBeDefined();
    });

    it("should NOT block server-to-server calls using Authorization Bearer token even if Origin header is present", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer astraops-secret-token",
          origin: "https://third-party-api-client.com",
        },
        body: JSON.stringify({
          companyName: "S2S Partner Integration",
          websiteUrl: "https://partner.com",
          contactName: "Integration Bot",
          contactEmail: "bot@partner.com",
        }),
      });

      const res = await createLead(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBeDefined();
    });
  });

  describe("Session Role Authorization Boundaries", () => {
    it("should allow browser requests to /api/leads using valid operator astraops_session cookie", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        headers: {
          cookie: "astraops_session=astraops-secret-token",
        },
      });
      const res = await getLeads(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toBeDefined();
      expect(json.pagination).toBeDefined();
    });

    it("should reject viewer session cookie from accessing restricted operations with 403 Forbidden", async () => {
      const req = new Request("http://localhost:3000/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "astraops_session=astraops-viewer-token",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          companyName: "Viewer Creation Co",
          websiteUrl: "https://viewer.com",
          contactName: "Viewer User",
          contactEmail: "viewer@viewer.com",
        }),
      });

      const res = await createLead(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("FORBIDDEN");
      expect(json.error.message).toContain("role 'VIEWER' is not authorized");
    });
  });
});
