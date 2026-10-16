import React from "react";
import Link from "next/link";
import { TRUKINDO_PROFILE, getPublicServices } from "@/lib/content/trukindo-config";

export function PublicFooter() {
  const services = getPublicServices();

  return (
    <footer
      style={{
        backgroundColor: "#0B2D52",
        borderTop: "1px solid rgba(215, 226, 239, 0.2)",
        color: "#D7E2EF",
        padding: "60px 24px 32px",
        marginTop: "80px",
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "40px",
          marginBottom: "48px",
        }}
      >
        {/* Brand & Mission */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "6px",
                backgroundColor: "#1D5FA7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                color: "#FFFFFF",
                fontSize: "1.125rem",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
              }}
            >
              T
            </div>
            <div>
              <span style={{ fontSize: "1.125rem", fontWeight: 800, color: "#FFFFFF", display: "block", lineHeight: 1.1 }}>
                TRUKINDO
              </span>
              <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#D7E2EF", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Logistik Prima
              </span>
            </div>
          </div>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#D7E2EF", marginBottom: "16px" }}>
            {TRUKINDO_PROFILE.description}
          </p>
          <div style={{ fontSize: "0.8125rem", color: "#94A3B8" }}>
            {TRUKINDO_PROFILE.legalName}
          </div>
        </div>

        {/* Layanan Logistik */}
        <div>
          <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#FFFFFF", marginBottom: "16px" }}>
            Layanan Terverifikasi
          </h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            {services.map((svc) => (
              <li key={svc.id}>
                <Link
                  href="/services"
                  style={{ fontSize: "0.875rem", color: "#D7E2EF", textDecoration: "none" }}
                  className="footer-link"
                >
                  {svc.title}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/fleet-cargo"
                style={{ fontSize: "0.875rem", color: "#D7E2EF", textDecoration: "none" }}
                className="footer-link"
              >
                Spesifikasi Armada Truk
              </Link>
            </li>
          </ul>
        </div>

        {/* Akses Informasi */}
        <div>
          <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#FFFFFF", marginBottom: "16px" }}>
            Informasi Perusahaan
          </h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            <li>
              <Link href="/about" style={{ fontSize: "0.875rem", color: "#D7E2EF", textDecoration: "none" }} className="footer-link">
                Tentang Trukindo
              </Link>
            </li>
            <li>
              <Link href="/industries" style={{ fontSize: "0.875rem", color: "#D7E2EF", textDecoration: "none" }} className="footer-link">
                Sektor Industri
              </Link>
            </li>
            <li>
              <Link href="/operations-safety" style={{ fontSize: "0.875rem", color: "#D7E2EF", textDecoration: "none" }} className="footer-link">
                Operasional & Standar Keselamatan
              </Link>
            </li>
            <li>
              <Link href="/quote" style={{ fontSize: "0.875rem", color: "#2F80D1", textDecoration: "none", fontWeight: 700 }} className="footer-cta-link">
                Minta Penawaran Harga →
              </Link>
            </li>
          </ul>
        </div>

        {/* Kontak & Operasional */}
        <div>
          <h4 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#FFFFFF", marginBottom: "16px" }}>
            Pusat Koordinasi
          </h4>
          <div style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#D7E2EF" }}>
            <p style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#FFFFFF" }}>Wilayah Layanan:</strong>
              <br />
              {TRUKINDO_PROFILE.contactInfo.serviceCorridor}
            </p>
            <p style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#FFFFFF" }}>Email Komersial:</strong>
              <br />
              <a href={`mailto:${TRUKINDO_PROFILE.contactInfo.email}`} style={{ color: "#2F80D1", textDecoration: "none" }}>
                {TRUKINDO_PROFILE.contactInfo.email}
              </a>
            </p>
            <p>
              <strong style={{ color: "#FFFFFF" }}>Jam Layanan:</strong>
              <br />
              {TRUKINDO_PROFILE.contactInfo.workingHours}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Bar & Disclaimer */}
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          paddingTop: "24px",
          borderTop: "1px solid rgba(215, 226, 239, 0.15)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          fontSize: "0.8125rem",
          color: "#94A3B8",
        }}
      >
        <div>
          © {new Date().getFullYear()} {TRUKINDO_PROFILE.legalName}. Seluruh hak cipta dilindungi.
        </div>
        <div style={{ maxWidth: "600px", textAlign: "right" }}>
          Pemberitahuan: Layanan B2B komersial. Seluruh kalkulasi tarif dan ketersediaan armada tunduk pada verifikasi fisik dan perjanjian pengangkutan resmi.
        </div>
      </div>

      <style jsx>{`
        .footer-link:hover {
          color: #FFFFFF !important;
          text-decoration: underline !important;
        }
        .footer-cta-link:hover {
          color: #FFFFFF !important;
          text-decoration: underline !important;
        }
      `}</style>
    </footer>
  );
}
