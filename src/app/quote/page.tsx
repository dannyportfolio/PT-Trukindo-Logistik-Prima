import React from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { QuoteRequestForm } from "@/components/public/QuoteRequestForm";

export const metadata: Metadata = {
  title: "Minta Penawaran Harga Pengiriman — PT Trukindo Logistik Prima",
  description:
    "Ajukan permintaan penawaran harga pengangkutan logistik B2B untuk kebutuhan Full Truck Load (FTL), Scheduled Linehaul, atau Dedicated Contract Logistics.",
};

export default async function QuotePage({
  searchParams,
}: {
  searchParams?: Promise<{ scenario?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const initialScenarioId = resolvedParams?.scenario;

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "40px 24px 64px" }}>
      {/* Editorial Quotation Hero */}
      <section
        style={{
          position: "relative",
          marginBottom: "48px",
          padding: "36px 32px",
          borderRadius: "12px",
          backgroundColor: "#EEF3F9",
          border: "1px solid #D7E2EF",
          boxShadow: "0 4px 20px rgba(18, 59, 112, 0.05)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
            gap: "36px",
            alignItems: "center",
          }}
        >
          <div>
            {/* Eyebrow */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 12px",
                borderRadius: "4px",
                backgroundColor: "#EAF3FF",
                border: "1px solid #D7E2EF",
                color: "#123B70",
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "16px",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "#1D5FA7",
                }}
              />
              SOLUSI TRANSPORTASI B2B
            </div>

            {/* Headline */}
            <h1
              style={{
                fontSize: "clamp(1.875rem, 3.5vw, 2.5rem)",
                fontWeight: 800,
                color: "#0B2D52",
                lineHeight: 1.2,
                letterSpacing: "-0.025em",
                marginBottom: "16px",
              }}
            >
              Rencanakan Pengiriman Anda. Mulai dengan Penawaran yang Tepat.
            </h1>

            {/* Supporting Copy */}
            <p
              style={{
                fontSize: "1rem",
                color: "#60738A",
                lineHeight: 1.6,
                marginBottom: "28px",
                maxWidth: "640px",
              }}
            >
              Ceritakan kebutuhan transportasi, karakteristik muatan, dan rute pengiriman Anda. Tim
              komersial kami menganalisis spesifikasi rute, batas muatan jembatan timbang (Zero ODOL),
              dan menyiapkan tindak lanjut resmi.
            </p>

            {/* Hero CTAs */}
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center", marginBottom: "28px" }}>
              <a
                href="#quote-form-workspace"
                className="btn btn-primary"
                style={{
                  padding: "12px 28px",
                  fontSize: "0.9375rem",
                  borderRadius: "6px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                Mulai Permintaan Penawaran ↓
              </a>
              <a
                href="/contact"
                className="btn btn-secondary"
                style={{
                  padding: "12px 24px",
                  fontSize: "0.9375rem",
                  borderRadius: "6px",
                  textDecoration: "none",
                }}
              >
                Hubungi Tim Kami
              </a>
            </div>

            {/* Interactive Verified Corridor Highlights */}
            <div
              style={{
                paddingTop: "20px",
                borderTop: "1px solid #D7E2EF",
              }}
            >
              <div
                style={{
                  fontSize: "0.6875rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#123B70",
                  fontWeight: 700,
                  marginBottom: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>🛣️</span>
                <span>Koridor Distribusi Reguler Terlayani</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #D7E2EF",
                    fontSize: "0.75rem",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#0B2D52" }}>Trans-Jawa Express</div>
                  <div style={{ color: "#60738A" }}>Jabodetabek ⇄ Semarang ⇄ Surabaya</div>
                </div>

                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #D7E2EF",
                    fontSize: "0.75rem",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#0B2D52" }}>Lintas Jawa - Bali</div>
                  <div style={{ color: "#60738A" }}>Surabaya ⇄ Ketapang ⇄ Denpasar</div>
                </div>

                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #D7E2EF",
                    fontSize: "0.75rem",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "#0B2D52" }}>Lintas Sumatra Utama</div>
                  <div style={{ color: "#60738A" }}>Jakarta ⇄ Lampung ⇄ Palembang</div>
                </div>
              </div>
            </div>
          </div>

          {/* Authentic Unbranded Logistics Image */}
          <div
            style={{
              position: "relative",
              borderRadius: "12px",
              overflow: "hidden",
              border: "1px solid #D7E2EF",
              boxShadow: "0 8px 24px rgba(18, 59, 112, 0.08)",
              aspectRatio: "16 / 10",
              backgroundColor: "#EEF3F9",
            }}
          >
            <Image
              src="/images/hero/quote-dispatch-fleet.jpg"
              alt="Armada truk niaga komersial unbranded di pusat operasional logistik siap melayani pengiriman darat B2B di Indonesia"
              fill
              sizes="(max-width: 768px) 100vw, 540px"
              priority
              style={{ objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(11, 45, 82, 0.65) 0%, transparent 60%)",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
            <div
              style={{
                position: "absolute",
                bottom: "12px",
                left: "14px",
                right: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
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
                Pusat Koordinasi Pengiriman B2B
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  color: "#172B45",
                  backgroundColor: "rgba(255, 255, 255, 0.9)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontWeight: 600,
                  border: "1px solid #D7E2EF",
                }}
              >
                Armada Netral Unbranded
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Quotation Form Workspace */}
      <div id="quote-form-workspace">
        <QuoteRequestForm initialScenarioId={initialScenarioId} />
      </div>

      {/* Information & Assistance Guide */}
      <section
        style={{
          marginTop: "64px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "24px",
        }}
      >
        <div className="card" style={{ padding: "24px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "12px" }}>⏱️</div>
          <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
            Proses Peninjauan Komersial
          </h3>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6 }}>
            Setiap formulir yang dikirimkan langsung masuk ke antrean verifikasi tim komersial. Kami
            menganalisis kesesuaian koridor rute, batas muatan jembatan timbang, dan efisiensi tipe armada.
          </p>
        </div>

        <div className="card" style={{ padding: "24px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "12px" }}>🔒</div>
          <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
            Kerahasiaan Data Usaha
          </h3>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6 }}>
            Spesifikasi muatan dan informasi kontak perusahaan Anda dijaga kerahasiaannya dan hanya
            digunakan oleh internal Trukindo untuk keperluan penyusunan proposal logistik resmi.
          </p>
        </div>

        <div className="card" style={{ padding: "24px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
          <div style={{ fontSize: "1.5rem", marginBottom: "12px" }}>💬</div>
          <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
            Konsultasi Rute Khusus
          </h3>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6 }}>
            Memiliki kebutuhan pengiriman multi-drop, jadwal bongkar muat malam hari, atau alokasi
            armada kontrak terdedikasi? Tuliskan pada catatan tambahan atau hubungi tim kami.
          </p>
        </div>
      </section>
    </div>
  );
}
