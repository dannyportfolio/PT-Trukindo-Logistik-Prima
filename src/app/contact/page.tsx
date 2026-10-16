import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { TRUKINDO_PROFILE } from "@/lib/content/trukindo-config";

export const metadata: Metadata = {
  title: "Kontak Perusahaan — PT Trukindo Logistik Prima",
  description:
    "Saluran komunikasi resmi, wilayah operasional, dan kontak tim komersial PT Trukindo Logistik Prima.",
};

export default function ContactPage() {
  return (
    <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <section style={{ marginBottom: "56px" }}>
        <div
          style={{
            display: "inline-block",
            padding: "4px 14px",
            borderRadius: "9999px",
            backgroundColor: "#EAF3FF",
            border: "1px solid #D7E2EF",
            color: "#123B70",
            fontSize: "0.8125rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "16px",
          }}
        >
          Hubungi Kami
        </div>
        <h1
          style={{
            fontSize: "2.5rem",
            fontWeight: 800,
            color: "#0B2D52",
            lineHeight: 1.2,
            letterSpacing: "-0.03em",
            marginBottom: "16px",
          }}
        >
          Kontak & Layanan Komersial
        </h1>
        <p
          style={{
            fontSize: "1.125rem",
            color: "#60738A",
            lineHeight: 1.6,
          }}
        >
          Tim komersial dan operasional PT Trukindo Logistik Prima siap melayani konsultasi koridor rute,
          alokasi armada terdedikasi, serta penjadwalan linehaul antarkota.
        </p>
      </section>

      {/* Contact Cards Grid */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "24px",
          marginBottom: "56px",
        }}
      >
        <div className="card" style={{ padding: "32px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
          <div style={{ fontSize: "1.75rem", marginBottom: "12px" }}>🏢</div>
          <h2 style={{ fontSize: "1.1875rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
            Koordinasi Operasional
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6, marginBottom: "12px" }}>
            <strong style={{ color: "#0B2D52" }}>Pusat Operasional:</strong>
            <br />
            DKI Jakarta, Indonesia
          </p>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6 }}>
            <strong style={{ color: "#0B2D52" }}>Cakupan Koridor:</strong>
            <br />
            {TRUKINDO_PROFILE.contactInfo.serviceCorridor}
          </p>
        </div>

        <div className="card" style={{ padding: "32px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
          <div style={{ fontSize: "1.75rem", marginBottom: "12px" }}>✉️</div>
          <h2 style={{ fontSize: "1.1875rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
            Komunikasi Komersial
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6, marginBottom: "12px" }}>
            <strong style={{ color: "#0B2D52" }}>Email Penawaran & Bisnis:</strong>
            <br />
            <a href={`mailto:${TRUKINDO_PROFILE.contactInfo.email}`} style={{ color: "#1D5FA7", textDecoration: "underline", fontWeight: 600 }}>
              {TRUKINDO_PROFILE.contactInfo.email}
            </a>
          </p>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6 }}>
            <strong style={{ color: "#0B2D52" }}>Jam Layanan Kantor:</strong>
            <br />
            {TRUKINDO_PROFILE.contactInfo.workingHours}
          </p>
        </div>

        <div className="card" style={{ padding: "32px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
          <div style={{ fontSize: "1.75rem", marginBottom: "12px" }}>📋</div>
          <h2 style={{ fontSize: "1.1875rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
            Formulir Penawaran Cepat
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6, marginBottom: "20px" }}>
            Untuk respon tercepat terkait tarif rute dan ketersediaan armada, silakan langsung mengisi
            spesifikasi muatan melalui formulir online 3 langkah.
          </p>
          <Link href="/quote" className="btn btn-primary" style={{ width: "100%", padding: "10px 16px", textAlign: "center" }}>
            Buka Formulir Penawaran →
          </Link>
        </div>
      </section>

      {/* Security & Commercial Privacy Notice */}
      <section
        style={{
          backgroundColor: "#EEF3F9",
          border: "1px solid #D7E2EF",
          borderRadius: "8px",
          padding: "24px",
          fontSize: "0.875rem",
          color: "#172B45",
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "#0B2D52" }}>Kebijakan Privasi Komersial:</strong> PT Trukindo Logistik Prima
        menghormati kerahasiaan data calon mitra pengirim. Seluruh rincian volume kargo, frekuensi transit,
        dan data kontak yang disampaikan melalui website ini hanya digunakan untuk keperluan kalkulasi operasional
        dan tidak dibagikan kepada pihak ketiga manapun tanpa izin tertulis.
      </section>
    </div>
  );
}
