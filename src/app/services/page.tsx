import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getPublicServices } from "@/lib/content/trukindo-config";
import { LogisticsScenariosSection } from "@/components/public/LogisticsScenariosSection";

export const metadata: Metadata = {
  title: "Layanan Logistik & Transportasi Darat — PT Trukindo Logistik Prima",
  description:
    "Solusi layanan Full Truck Load (FTL), Scheduled Linehaul, dan Dedicated Contract Logistics antarkota dan antarpulau di Indonesia.",
};

export default function ServicesPage() {
  const services = getPublicServices();

  const serviceImageMap: Record<string, { src: string; alt: string; tag: string }> = {
    "ftl-trucking": {
      src: "/images/hero/hero-truck-highway.jpg",
      alt: "Layanan Full Truck Load (FTL) carter satu armada truk boks putih unbranded melintas point-to-point di jalan tol antarkota",
      tag: "Armada Carter Penuh Point-to-Point",
    },
    "scheduled-linehaul": {
      src: "/images/fleet/trailer-container.jpg",
      alt: "Layanan Scheduled Linehaul terjadwal di koridor industri nasional menghubungkan sentra logistik",
      tag: "Jadwal Reguler Antarkota & Pelabuhan",
    },
    "contract-logistics": {
      src: "/images/scenarios/scenario-dedicated.jpg",
      alt: "Layanan Dedicated Contract Logistics pengelolaan armada truk boks wingbox terdedikasi di fasilitas fulfillment",
      tag: "Armada Kontrak Dedicated",
    },
  };

  const workflowSteps = [
    {
      num: "01",
      title: "Konsultasi Kebutuhan & Spesifikasi",
      desc: "Pengirim mengisi spesifikasi kargo, tonase, kota asal, tujuan, dan jadwal muat melalui formulir penawaran.",
    },
    {
      num: "02",
      title: "Analisis Rute & Rekomendasi Armada",
      desc: "Tim komersial meninjau ketersediaan armada, dimensi muatan, dan kalkulasi tarif resmi yang transparan.",
    },
    {
      num: "03",
      title: "Pengangkutan Langsung Point-to-Point",
      desc: "Armada diberangkatkan langsung dari gudang asal pengirim tanpa transit atau konsolidasi pihak ketiga.",
    },
    {
      num: "04",
      title: "Serah Terima & Berita Acara (BAST)",
      desc: "Pemeriksaan fisik integritas muatan di titik bongkar disertai penandatanganan dokumen serah terima resmi.",
    },
  ];

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <section style={{ marginBottom: "56px", textAlign: "left" }}>
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
          Layanan Komersial Terverifikasi
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
          Layanan Transportasi Darat B2B
        </h1>
        <p
          style={{
            fontSize: "1.125rem",
            color: "#60738A",
            maxWidth: "760px",
            lineHeight: 1.6,
          }}
        >
          Dirancang untuk memastikan efisiensi supply chain dan ketepatan distribusi bagi sektor
          manufaktur, FMCG, ritel, dan material industri di seluruh koridor utama nasional.
        </p>
      </section>

      {/* Services List */}
      <section style={{ display: "flex", flexDirection: "column", gap: "32px", marginBottom: "64px" }}>
        {services.map((svc) => {
          const imgInfo = serviceImageMap[svc.id];

          return (
            <div
              key={svc.id}
              className="card"
              style={{
                padding: "32px",
                backgroundColor: "#FFFFFF",
                border: "1px solid #D7E2EF",
                boxShadow: "0 4px 16px rgba(18, 59, 112, 0.06)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
                gap: "32px",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    backgroundColor: "#EAF3FF",
                    border: "1px solid #D7E2EF",
                    color: "#1D5FA7",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    marginBottom: "12px",
                  }}
                >
                  TERVERIFIKASI
                </div>
                <h2 style={{ fontSize: "1.625rem", fontWeight: 700, color: "#0B2D52", marginBottom: "12px" }}>
                  {svc.title}
                </h2>
                <p style={{ fontSize: "0.9375rem", color: "#60738A", lineHeight: 1.6, marginBottom: "20px" }}>
                  {svc.fullDesc}
                </p>

                <div
                  style={{
                    backgroundColor: "#F7FAFE",
                    border: "1px solid #D7E2EF",
                    borderRadius: "8px",
                    padding: "20px",
                    marginBottom: "24px",
                  }}
                >
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#123B70", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Fitur & Standar Layanan:
                  </h3>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                    {svc.features.map((feat, i) => (
                      <li key={i} style={{ fontSize: "0.8125rem", color: "#172B45", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <span style={{ color: "#15803D", fontWeight: 700 }}>✓</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href={`/quote?service=${svc.id}#quote-form-workspace`}
                  className="btn btn-primary"
                  style={{ padding: "12px 28px", fontSize: "0.875rem", display: "inline-block" }}
                >
                  Minta Penawaran {svc.title} →
                </Link>
              </div>

              {imgInfo && (
                <div
                  style={{
                    position: "relative",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid #D7E2EF",
                    boxShadow: "0 8px 24px rgba(18, 59, 112, 0.08)",
                    aspectRatio: "16 / 11",
                    backgroundColor: "#EEF3F9",
                  }}
                >
                  <Image
                    src={imgInfo.src}
                    alt={imgInfo.alt}
                    fill
                    sizes="(max-width: 768px) 100vw, 480px"
                    loading="lazy"
                    style={{ objectFit: "cover" }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(to top, rgba(11, 45, 82, 0.65) 0%, transparent 45%)",
                      pointerEvents: "none",
                    }}
                    aria-hidden="true"
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: "12px",
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
                    {imgInfo.tag}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Logistics Scenarios Section */}
      <LogisticsScenariosSection
        title="Simulasi Skenario Pengiriman Lapangan"
        subtitle="Lihat bagaimana layanan FTL, linehaul, dan kontrak dedicated diaplikasikan pada skenario pengangkutan FMCG, manufaktur, material proyek, dan koridor antarpulau."
      />

      {/* Workflow */}
      <section style={{ marginBottom: "64px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "0.8125rem", color: "#1D5FA7", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
            Alur Kerjasama
          </div>
          <h2 style={{ fontSize: "1.875rem", fontWeight: 800, color: "#0B2D52" }}>
            Tahapan Eksekusi Pengiriman
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "24px",
          }}
        >
          {workflowSteps.map((step) => (
            <div key={step.num} className="card" style={{ padding: "24px", position: "relative", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 900,
                  color: "#D7E2EF",
                  marginBottom: "8px",
                  lineHeight: 1,
                }}
              >
                {step.num}
              </div>
              <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
                {step.title}
              </h3>
              <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.5 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section
        style={{
          textAlign: "center",
          backgroundColor: "#0B2D52",
          border: "1px solid rgba(215, 226, 239, 0.2)",
          borderRadius: "12px",
          padding: "40px 24px",
        }}
      >
        <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#FFFFFF", marginBottom: "12px" }}>
          Butuh Solusi Pengangkutan Sesuai Jadwal Bisnis Anda?
        </h2>
        <p style={{ color: "#EEF3F9", maxWidth: "600px", margin: "0 auto 24px", fontSize: "0.9375rem" }}>
          Isi detail muatan Anda sekarang dan tim komersial kami akan segera meninjau kebutuhan rute Anda.
        </p>
        <Link href="/quote" className="btn btn-primary" style={{ padding: "12px 32px", fontSize: "0.9375rem" }}>
          Mulai Minta Penawaran →
        </Link>
      </section>
    </div>
  );
}
