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
  const [authMode, setAuthMode] = useState<"credentials" | "token">("credentials");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
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

    let payload: Record<string, string>;
    if (authMode === "credentials") {
      if (!emailInput.trim() || !passwordInput) {
        setLoginError("Silakan masukkan email dan password operator.");
        return;
      }
      payload = { email: emailInput.trim(), password: passwordInput };
    } else {
      if (!tokenInput.trim()) {
        setLoginError("Silakan masukkan token autentikasi.");
        return;
      }
      payload = { token: tokenInput.trim() };
    }

    setLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error?.message || "Autentikasi gagal. Silakan periksa kembali kredensial Anda.");
      } else {
        setIsLoginOpen(false);
        setEmailInput("");
        setPasswordInput("");
        setTokenInput("");
        checkSession();
        window.location.reload();
      }
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : "Gagal terhubung ke layanan autentikasi.");
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
                Masuk ke AstraOps internal desk menggunakan akun terdaftar atau bearer token resmi. Sesi diamankan dengan HttpOnly cookie (8 jam).
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px",
                padding: "4px",
                backgroundColor: "var(--muted)",
                borderRadius: "var(--radius)",
                marginBottom: "16px",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setAuthMode("credentials");
                  setLoginError(null);
                }}
                style={{
                  padding: "8px 12px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  borderRadius: "calc(var(--radius) - 2px)",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: authMode === "credentials" ? "var(--background)" : "transparent",
                  color: authMode === "credentials" ? "var(--foreground)" : "var(--muted-foreground)",
                  boxShadow: authMode === "credentials" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                Akun Operator
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("token");
                  setLoginError(null);
                }}
                style={{
                  padding: "8px 12px",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  borderRadius: "calc(var(--radius) - 2px)",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: authMode === "token" ? "var(--background)" : "transparent",
                  color: authMode === "token" ? "var(--foreground)" : "var(--muted-foreground)",
                  boxShadow: authMode === "token" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                Access Token
              </button>
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
              {authMode === "credentials" ? (
                <>
                  <div style={{ marginBottom: "14px" }}>
                    <label
                      htmlFor="operator-email"
                      style={{
                        display: "block",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        marginBottom: "6px",
                        color: "var(--card-foreground)",
                      }}
                    >
                      Email Operator
                    </label>
                    <input
                      id="operator-email"
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="admin@trukindo.co.id"
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

                  <div style={{ marginBottom: "18px" }}>
                    <label
                      htmlFor="operator-password"
                      style={{
                        display: "block",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        marginBottom: "6px",
                        color: "var(--card-foreground)",
                      }}
                    >
                      Password
                    </label>
                    <input
                      id="operator-password"
                      type="password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="••••••••"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        backgroundColor: "var(--background)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        color: "var(--foreground)",
                        fontSize: "0.875rem",
                      }}
                    />
                  </div>
                </>
              ) : (
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
              )}

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
