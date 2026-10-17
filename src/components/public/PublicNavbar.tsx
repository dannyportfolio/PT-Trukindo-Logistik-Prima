"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function PublicNavbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Beranda" },
    { href: "/about", label: "Tentang Kami" },
    { href: "/services", label: "Layanan" },
    { href: "/fleet-cargo", label: "Armada & Muatan" },
    { href: "/industries", label: "Sektor Industri" },
    { href: "/operations-safety", label: "Operasional & Safety" },
    { href: "/track", label: "Lacak Muatan" },
    { href: "/contact", label: "Kontak" },
  ];

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      {/* A. Compact Corporate Utility Bar (Deep Blue #0B2D52) */}
      <div
        style={{
          backgroundColor: "#0B2D52",
          color: "#EEF3F9",
          borderBottom: "1px solid rgba(215, 226, 239, 0.15)",
          fontSize: "0.75rem",
          fontWeight: 600,
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "6px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          {/* Contact Details */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#EAF3FF" }}>📞</span>
              <span>Hotline Bisnis:</span>
              <a
                href="tel:+62215558785"
                style={{ color: "#FFFFFF", textDecoration: "none" }}
                className="hover-underline"
              >
                +62 21 555-TRUK
              </a>
              <span style={{ color: "rgba(215, 226, 239, 0.4)" }}>|</span>
              <a
                href="mailto:info@trukindo.co.id"
                style={{ color: "#FFFFFF", textDecoration: "none" }}
                className="hover-underline"
              >
                info@trukindo.co.id
              </a>
            </div>
            <div className="hidden-mobile" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#D7E2EF" }}>⏰</span>
              <span style={{ color: "#D7E2EF" }}>Jam Operasional: Sen - Jum 08.00 - 17.00 WIB</span>
            </div>
          </div>

          {/* Operational Status (Verified Service Indicator) */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(21, 128, 61, 0.2)",
                color: "#EAF3FF",
                padding: "2px 8px",
                borderRadius: "9999px",
                fontSize: "0.6875rem",
                fontWeight: 700,
                border: "1px solid rgba(21, 128, 61, 0.4)",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#15803D",
                  boxShadow: "0 0 6px #15803D",
                }}
              />
              Layanan Logistik Beroperasi
            </span>
          </div>
        </div>
      </div>

      {/* B. Clean White Corporate Header */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderBottom: "1px solid #D7E2EF",
          boxShadow: "0 1px 4px rgba(18, 59, 112, 0.05)",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 24px",
            height: "68px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Brand Logo */}
          <Link
            href="/"
            onClick={closeMobileMenu}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "6px",
                backgroundColor: "#123B70",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                color: "#FFFFFF",
                fontSize: "1.25rem",
                boxShadow: "0 2px 8px rgba(18, 59, 112, 0.25)",
              }}
            >
              T
            </div>
            <div>
              <div
                style={{
                  fontSize: "1.1875rem",
                  fontWeight: 800,
                  color: "#123B70",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                TRUKINDO
              </div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  color: "#60738A",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Logistik Prima
              </div>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav
            style={{
              display: "none",
              alignItems: "center",
              gap: "6px",
            }}
            className="desktop-nav"
            aria-label="Navigasi Utama"
          >
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "#123B70" : "#172B45",
                    backgroundColor: isActive ? "#EAF3FF" : "transparent",
                    border: isActive ? "1px solid #D7E2EF" : "1px solid transparent",
                    transition: "all 0.15s ease",
                    textDecoration: "none",
                  }}
                  className="nav-link-item"
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Actions Area */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <a
              href="https://wa.me/628115557788"
              target="_blank"
              rel="noopener noreferrer"
              className="desktop-whatsapp-link"
              style={{
                display: "none",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#123B70",
                padding: "8px 14px",
                borderRadius: "6px",
                backgroundColor: "#EEF3F9",
                border: "1px solid #D7E2EF",
                textDecoration: "none",
              }}
              title="Hubungi Customer Support via WhatsApp"
            >
              <span>💬</span> WhatsApp CS
            </a>

            <Link
              href="/quote"
              className="btn btn-primary"
              style={{
                padding: "8px 18px",
                fontSize: "0.875rem",
                borderRadius: "6px",
                textDecoration: "none",
              }}
            >
              Minta Penawaran
            </Link>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "38px",
                height: "38px",
                borderRadius: "6px",
                backgroundColor: "#EEF3F9",
                border: "1px solid #D7E2EF",
                color: "#123B70",
                fontSize: "1.25rem",
              }}
              className="mobile-hamburger"
            >
              {mobileMenuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer (White & Light Blue Border) */}
      {mobileMenuOpen && (
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderBottom: "2px solid #D7E2EF",
            padding: "16px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            boxShadow: "0 10px 25px rgba(18, 59, 112, 0.1)",
          }}
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMobileMenu}
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  fontSize: "0.9375rem",
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#123B70" : "#172B45",
                  backgroundColor: isActive ? "#EAF3FF" : "transparent",
                  border: isActive ? "1px solid #D7E2EF" : "1px solid transparent",
                  textDecoration: "none",
                }}
              >
                {link.label}
              </Link>
            );
          })}
          <div style={{ marginTop: "10px", paddingTop: "12px", borderTop: "1px solid #D7E2EF", display: "flex", flexDirection: "column", gap: "8px" }}>
            <a
              href="https://wa.me/628115557788"
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMobileMenu}
              style={{
                padding: "10px 14px",
                borderRadius: "6px",
                fontSize: "0.875rem",
                color: "#123B70",
                backgroundColor: "#EEF3F9",
                border: "1px solid #D7E2EF",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              💬 Hubungi via WhatsApp (+62 811 555 7788)
            </a>
            <Link
              href="/leads"
              onClick={closeMobileMenu}
              style={{
                display: "block",
                padding: "8px 14px",
                borderRadius: "6px",
                fontSize: "0.8125rem",
                color: "#60738A",
                textDecoration: "none",
              }}
            >
              🔒 Portal Komersial (Internal) →
            </Link>
          </div>
        </div>
      )}

      <style jsx>{`
        .hover-underline:hover {
          text-decoration: underline !important;
        }
        .nav-link-item:hover {
          color: #1D5FA7 !important;
          background-color: #F7FAFE !important;
        }
        @media (min-width: 992px) {
          .desktop-nav {
            display: flex !important;
          }
          .desktop-whatsapp-link {
            display: inline-flex !important;
          }
          .mobile-hamburger {
            display: none !important;
          }
        }
        @media (max-width: 767px) {
          .hidden-mobile {
            display: none !important;
          }
        }
      `}</style>
    </header>
  );
}
