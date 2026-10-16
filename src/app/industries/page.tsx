import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { TRUKINDO_PROFILE } from "@/lib/content/trukindo-config";
import { LogisticsScenariosSection } from "@/components/public/LogisticsScenariosSection";

export const metadata: Metadata = {
  title: "Sektor Industri yang Dilayani — PT Trukindo Logistik Prima",
  description:
    "Solusi transportasi darat terdedikasi untuk sektor FMCG, Manufaktur, Material Bangunan, dan Elektronik.",
};

export default function IndustriesPage() {
  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <section style={{ marginBottom: "56px" }}>
        <div
          style={{
            display: "inline-block",
            padding: "6px 14px",
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
          Spesialisasi Sektor
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
          Solusi Logistik Khusus Sektor Industri
        </h1>
        <p
          style={{
            fontSize: "1.125rem",
            color: "#60738A",
            maxWidth: "760px",
            lineHeight: 1.6,
          }}
        >
          Setiap sektor industri memiliki karakteristik supply chain unik. Kami menyesuaikan standar
          penanganan, jenis armada, dan ritme transit dengan alur produksi serta distribusi bisnis Anda.
        </p>
      </section>

      {/* Industry Cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "28px",
          marginBottom: "64px",
        }}
      >
        {TRUKINDO_PROFILE.industries.map((ind) => (
          <div
            key={ind.id}
            className="card"
            style={{
              padding: "32px",
              backgroundColor: "#FFFFFF",
              border: "1px solid #D7E2EF",
              boxShadow: "0 4px 16px rgba(18, 59, 112, 0.06)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0B2D52", marginBottom: "16px" }}>
                {ind.name}
              </h2>

              <div style={{ marginBottom: "16px" }}>
                <span style={{ fontSize: "0.75rem", color: "#1D5FA7", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
                  Tantangan Distribusi:
                </span>
                <p style={{ fontSize: "0.875rem", color: "#172B45", lineHeight: 1.5 }}>
                  {ind.painPoints}
                </p>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <span style={{ fontSize: "0.75rem", color: "#15803D", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>
                  Solusi Trukindo:
                </span>
                <p style={{ fontSize: "0.875rem", color: "#172B45", lineHeight: 1.5 }}>
                  {ind.solution}
                </p>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#F7FAFE",
                border: "1px solid #D7E2EF",
                borderRadius: "6px",
                padding: "14px",
                fontSize: "0.8125rem",
              }}
            >
              <strong style={{ color: "#60738A" }}>Armada Direkomendasikan:</strong>{" "}
              <span style={{ color: "#123B70", fontWeight: 700 }}>{ind.recommendedFleet}</span>
            </div>
          </div>
        ))}
      </section>

      {/* Logistics Scenarios Section */}
      <LogisticsScenariosSection
        title="Simulasi Skenario Pengiriman Berdasarkan Kebutuhan Sektor"
        subtitle="Pelajari bagaimana konfigurasi armada unbranded dan alur operasional dirancang untuk memenuhi kebutuhan distribusi FMCG, suku cadang manufaktur, material konstruksi, dan rute antarpulau."
      />

      {/* Bottom CTA */}
      <div style={{ textAlign: "center" }}>
        <Link href="/quote" className="btn btn-primary" style={{ padding: "12px 32px", fontSize: "1rem" }}>
          Diskusikan Kebutuhan Industri Anda →
        </Link>
      </div>
    </div>
  );
}
