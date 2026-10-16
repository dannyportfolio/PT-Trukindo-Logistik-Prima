import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { TRUKINDO_PROFILE } from "@/lib/content/trukindo-config";

export const metadata: Metadata = {
  title: "Standar Operasional & Keselamatan — PT Trukindo Logistik Prima",
  description:
    "Komitmen protokol inspeksi kendaraan harian, SOP lashing kargo, pembinaan keselamatan pengemudi, dan kepatuhan regulasi jalan.",
};

export default function OperationsSafetyPage() {
  const inspectionChecklist = [
    "Pemeriksaan ketebalan tapak dan tekanan angin ban utama serta ban cadangan",
    "Pengecekan fungsi sistem pengereman udara (air brake) dan rem tangan",
    "Uji kelayakan lampu utama, lampu sein, lampu rem, dan lampu hazard",
    "Pemeriksaan level oli mesin, air radiator, dan cairan pembersih kaca",
    "Pemeriksaan kebersihan dinding boks, lantai karoseri, dan kekedapan terpal",
    "Pemeriksaan kelengkapan sabuk pengikat muatan (ratchet straps) dan dongkrak",
  ];

  return (
    <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "48px 24px" }}>
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
          Budaya Keselamatan
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
          Standar Operasional & Keselamatan Jalan
        </h1>
        <p
          style={{
            fontSize: "1.125rem",
            color: "#60738A",
            lineHeight: 1.6,
          }}
        >
          Keselamatan pengemudi, integritas muatan klien, dan ketertiban berlalu lintas adalah fondasi
          mutlak dalam setiap kilometer operasional PT Trukindo Logistik Prima.
        </p>
      </section>

      {/* Safety Standards Grid */}
      <section style={{ display: "flex", flexDirection: "column", gap: "24px", marginBottom: "56px" }}>
        {TRUKINDO_PROFILE.safetyStandards.map((std, i) => (
          <div
            key={i}
            className="card"
            style={{ padding: "28px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF", boxShadow: "0 4px 16px rgba(18, 59, 112, 0.06)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  backgroundColor: "#EAF3FF",
                  color: "#15803D",
                  border: "1px solid #D7E2EF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "0.875rem",
                }}
              >
                ✓
              </div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0B2D52" }}>
                {std.title}
              </h2>
            </div>
            <p style={{ fontSize: "0.9375rem", color: "#60738A", lineHeight: 1.6, paddingLeft: "44px" }}>
              {std.description}
            </p>
          </div>
        ))}
      </section>

      {/* Daily Pre-Trip Inspection Protocol */}
      <section
        style={{
          backgroundColor: "#EEF3F9",
          border: "1px solid #D7E2EF",
          borderRadius: "12px",
          padding: "36px",
          marginBottom: "56px",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "32px", alignItems: "center", marginBottom: "28px" }}>
          <div>
            <h2 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#0B2D52", marginBottom: "12px" }}>
              Protokol Checklist Pemeriksaan Harian Pra-Perjalanan
            </h2>
            <p style={{ color: "#60738A", fontSize: "0.875rem", lineHeight: 1.6, margin: 0 }}>
              Sebelum menerima surat jalan keberangkatan, pengemudi dan pengawas pool wajib menyelesaikan
              verifikasi fisik komponen kritis kendaraan untuk memastikan kesiapan teknis di rute tol maupun arteri nasional.
            </p>
          </div>

          <div
            style={{
              position: "relative",
              borderRadius: "10px",
              overflow: "hidden",
              border: "1px solid #D7E2EF",
              aspectRatio: "16 / 10",
              backgroundColor: "#FFFFFF",
              boxShadow: "0 8px 24px rgba(18, 59, 112, 0.08)",
            }}
          >
            <Image
              src="/images/operations/safety-inspection.jpg"
              alt="Prosedur pemeriksaan fisik tapak ban, tekanan angin, dan sistem pengikatan muatan pra-perjalanan di depo logistik"
              fill
              sizes="(max-width: 768px) 100vw, 440px"
              loading="lazy"
              style={{ objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                bottom: "10px",
                left: "12px",
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: "#123B70",
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                padding: "4px 10px",
                borderRadius: "4px",
                backdropFilter: "blur(4px)",
                border: "1px solid #D7E2EF",
              }}
            >
              Inspeksi Teknis Pra-Perjalanan
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
          {inspectionChecklist.map((item, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #D7E2EF",
                borderRadius: "6px",
                padding: "12px 14px",
                fontSize: "0.875rem",
                color: "#172B45",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <span style={{ color: "#1D5FA7", fontWeight: 700 }}>•</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <div style={{ textAlign: "center" }}>
        <Link href="/quote" className="btn btn-primary" style={{ padding: "12px 32px", fontSize: "1rem" }}>
          Minta Penawaran dengan Standar Terjamin →
        </Link>
      </div>
    </div>
  );
}
