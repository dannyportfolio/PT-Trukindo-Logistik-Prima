"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { PublicNavbar } from "./public/PublicNavbar";

interface SessionUser {
  actorId: string;
  role: string;
}

export function Navbar() {
  const pathname = usePathname();

  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/about") ||
    pathname.startsWith("/services") ||
    pathname.startsWith("/fleet-cargo") ||
    pathname.startsWith("/industries") ||
    pathname.startsWith("/operations-safety") ||
    pathname.startsWith("/quote") ||
    pathname.startsWith("/contact");

  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const checkSession = async () => {
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        setAuthenticated(data.authenticated === true);
        if (data.authenticated && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      } else {
        setAuthenticated(false);
        setUser(null);
      }
    } catch {
      setAuthenticated(false);
      setUser(null);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setLoginError("Please enter an authentication token.");
      return;
    }

    setLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error?.message || "Invalid authentication token.");
      } else {
        setIsLoginOpen(false);
        setTokenInput("");
        checkSession();
        window.location.reload();
      }
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : "Failed to connect to authentication service.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      setAuthenticated(false);
      setUser(null);
      window.location.reload();
    } catch {
      // Ignored
    }
  };

  if (isPublicRoute) {
    return <PublicNavbar />;
  }

  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        backgroundColor: "rgba(17, 24, 39, 0.95)",
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 24px",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Brand / Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontWeight: 700,
              fontSize: "1.25rem",
              color: "#60a5fa",
              letterSpacing: "-0.02em",
            }}
          >
            <span
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: "#1D5FA7",
                boxShadow: "0 0 10px #2F80D1",
                display: "inline-block",
              }}
            />
            Trukindo Commercial
          </Link>

          {/* Navigation Links */}
          <nav style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Link
              href="/"
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "var(--muted-foreground)",
                transition: "all 0.15s ease",
              }}
            >
              ← Website Publik
            </Link>
            <Link
              href="/leads"
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: pathname.startsWith("/leads") ? "#ffffff" : "var(--muted-foreground)",
                backgroundColor: pathname.startsWith("/leads") ? "var(--muted)" : "transparent",
                transition: "all 0.15s ease",
              }}
            >
              Leads & Inkuiri
            </Link>
          </nav>
        </div>

        {/* Auth / Session Status Area */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {authenticated === null ? (
            <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Checking session...</span>
          ) : authenticated && user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.8rem",
                  color: "var(--muted-foreground)",
                  backgroundColor: "rgba(30, 41, 59, 0.6)",
                  padding: "4px 10px",
                  borderRadius: "9999px",
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: "#15803D",
                  }}
                />
                <span>
                  <strong>{user.role}</strong> ({user.actorId})
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="btn btn-outline btn-sm"
                title="Log out operator session"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.8rem",
                  color: "#B45309",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: "#B45309",
                  }}
                />
                <span>Unauthenticated</span>
              </div>
              <button
                type="button"
                onClick={() => setIsLoginOpen(true)}
                className="btn btn-primary btn-sm"
              >
                Authenticate
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Operator Session Modal */}
      {isLoginOpen && (
        <div className="modal-overlay" onClick={() => setIsLoginOpen(false)}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "440px" }}
          >
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1.125rem", color: "var(--foreground)", marginBottom: "6px" }}>
                Operator Authentication
              </h3>
              <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
                Authenticate your browser session using your AstraOps bearer token. Token is saved in a secure, HttpOnly session cookie and never exposed to client script bundles.
              </p>
            </div>

            {loginError && (
              <div
                style={{
                  backgroundColor: "var(--danger-muted)",
                  border: "1px solid var(--danger)",
                  color: "#fca5a5",
                  padding: "10px 14px",
                  borderRadius: "var(--radius)",
                  fontSize: "0.875rem",
                  marginBottom: "16px",
                }}
              >
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: "18px" }}>
                <label
                  htmlFor="operator-token"
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    marginBottom: "6px",
                    color: "var(--card-foreground)",
                  }}
                >
                  API / Admin Token
                </label>
                <input
                  id="operator-token"
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Enter API token..."
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    color: "var(--foreground)",
                    fontSize: "0.875rem",
                  }}
                  autoFocus
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setIsLoginOpen(false)}
                  className="btn btn-secondary"
                  disabled={loggingIn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loggingIn}
                >
                  {loggingIn ? (
                    <>
                      <span className="spinner" />
                      Authenticating...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
