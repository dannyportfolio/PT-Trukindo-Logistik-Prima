import React from "react";
import Link from "next/link";
import Image from "next/image";
import { TRUKINDO_PROFILE, getPublicServices } from "@/lib/content/trukindo-config";
import { LogisticsScenariosSection } from "@/components/public/LogisticsScenariosSection";

export default function HomePage() {
  const services = getPublicServices();

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "40px 24px" }}>
      {/* Editorial Hero Section */}
      <section
        style={{
          padding: "24px 0 64px",
          textAlign: "left",
          borderBottom: "1px solid #D7E2EF",
          marginBottom: "56px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))",
            gap: "40px",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-block",
                padding: "6px 16px",
                borderRadius: "9999px",
                backgroundColor: "#EAF3FF",
                border: "1px solid #D7E2EF",
                color: "#123B70",
                fontSize: "0.8125rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "20px",
              }}
            >
              {TRUKINDO_PROFILE.legalName} — B2B Freight Logistics
            </div>

            <h1
              style={{
                fontSize: "clamp(2.25rem, 4.5vw, 3.25rem)",
                fontWeight: 800,
                color: "#0B2D52",
                lineHeight: 1.15,
                letterSpacing: "-0.03em",
                marginBottom: "20px",
              }}
            >
              Menghubungkan Bisnis, Menggerakkan Logistik Indonesia.
            </h1>

            <p
              style={{
                fontSize: "1.125rem",
                color: "#60738A",
                lineHeight: 1.6,
                marginBottom: "32px",
              }}
            >
              Penyedia transportasi muatan darat terpercaya untuk pengiriman Full Truck Load (FTL),
              scheduled linehaul, dan armada kontrak terdedikasi di sepanjang koridor industri utama
              Jawa, Bali, dan Sumatra.
            </p>

            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center", marginBottom: "32px" }}>
              <Link
                href="/quote"
                className="btn btn-primary"
                style={{ padding: "14px 32px", fontSize: "1rem", borderRadius: "6px" }}
              >
                Minta Penawaran Muatan →
              </Link>
              <Link
                href="/services"
                className="btn btn-secondary"
                style={{ padding: "14px 28px", fontSize: "0.9375rem", borderRadius: "6px" }}
              >
                Pelajari Layanan Kami
              </Link>
            </div>

            {/* Operational Key Commitments */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "20px",
                paddingTop: "20px",
                borderTop: "1px solid #D7E2EF",
                fontSize: "0.8125rem",
                color: "#172B45",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#15803D", fontWeight: 700 }}>✓</span>
                <span>Rute Langsung Point-to-Point</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#15803D", fontWeight: 700 }}>✓</span>
                <span>Kepatuhan Batas Muatan (Zero ODOL)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#15803D", fontWeight: 700 }}>✓</span>
                <span>Inspeksi Pra-Perjalanan Harian</span>
              </div>
            </div>
          </div>

          {/* Hero Unbranded Commercial Vehicle Photo */}
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
              src="/images/hero/hero-truck-highway.jpg"
              alt="Truk niaga komersial unbranded boks putih melintas di jalan tol Trans-Jawa dalam operasi logistik antarkota"
              fill
              sizes="(max-width: 768px) 100vw, 620px"
              priority
              style={{ objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(11, 45, 82, 0.6) 0%, transparent 45%)",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
            <div
              style={{
                position: "absolute",
                bottom: "16px",
                left: "16px",
                right: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "#123B70",
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  padding: "4px 12px",
                  borderRadius: "6px",
                  backdropFilter: "blur(4px)",
                  border: "1px solid #D7E2EF",
                }}
              >
                Koridor Tol Trans-Jawa & Antarpulau
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  color: "#172B45",
                  backgroundColor: "rgba(255, 255, 255, 0.85)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                Armada Netral
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Verified Core Services */}
      <section style={{ marginBottom: "64px" }}>
        <div style={{ marginBottom: "32px" }}>
          <div style={{ fontSize: "0.8125rem", color: "#1D5FA7", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
            Layanan Terverifikasi
          </div>
          <h2 style={{ fontSize: "1.875rem", fontWeight: 800, color: "#0B2D52", letterSpacing: "-0.02em" }}>
            Solusi Pengangkutan Darat Terstruktur
          </h2>
          <p style={{ color: "#60738A", fontSize: "0.9375rem", maxWidth: "680px", marginTop: "6px" }}>
            Setiap model layanan dirancang untuk memenuhi ritme operasional manufaktur, FMCG, dan jaringan distribusi B2B.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "24px",
          }}
        >
          {services.map((svc) => (
            <div key={svc.id} className="card" style={{ padding: "28px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "8px",
                    backgroundColor: "#EAF3FF",
                    color: "#1D5FA7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.25rem",
                    marginBottom: "16px",
                  }}
                >
                  🚚
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
                  {svc.title}
                </h3>
                <p style={{ color: "#60738A", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "20px" }}>
                  {svc.fullDesc}
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {svc.features.map((feat, idx) => (
                    <li key={idx} style={{ fontSize: "0.8125rem", color: "#172B45", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#15803D", fontWeight: 700 }}>✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                href="/quote"
                style={{
                  color: "#1D5FA7",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                Minta Penawaran {svc.title} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Authentic Indonesian Logistics Case Studies / Scenarios */}
      <LogisticsScenariosSection />

      {/* Fleet & Technical Standards Preview */}
      <section style={{ marginBottom: "64px" }}>
        <div style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "#1D5FA7", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
              Spesifikasi Teknis Armada
            </div>
            <h2 style={{ fontSize: "1.875rem", fontWeight: 800, color: "#0B2D52", letterSpacing: "-0.02em" }}>
              Pilihan Armada Standar Industri
            </h2>
            <p style={{ color: "#60738A", fontSize: "0.9375rem", maxWidth: "640px", marginTop: "6px" }}>
              Spesifikasi dimensi, kapasitas beban, dan volume untuk estimasi efisiensi pengiriman Anda dengan ilustrasi kendaraan niaga unbranded.
            </p>
          </div>
          <Link href="/fleet-cargo" style={{ color: "#1D5FA7", fontSize: "0.875rem", fontWeight: 600 }}>
            Lihat Spesifikasi Lengkap & Panduan Kargo →
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "20px",
          }}
        >
          {TRUKINDO_PROFILE.truckClasses.map((truck) => (
            <div
              key={truck.id}
              className="card"
              style={{
                overflow: "hidden",
                borderRadius: "10px",
                backgroundColor: "#FFFFFF",
                border: "1px solid #D7E2EF",
                display: "flex",
                flexDirection: "column",
                padding: 0,
              }}
            >
              {truck.imageSrc && (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "16 / 10",
                    overflow: "hidden",
                    backgroundColor: "#EEF3F9",
                  }}
                >
                  <Image
                    src={truck.imageSrc}
                    alt={truck.imageAlt || truck.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 260px"
                    loading="lazy"
                    style={{ objectFit: "cover" }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(to top, rgba(11, 45, 82, 0.65) 0%, transparent 40%)",
                      pointerEvents: "none",
                    }}
                    aria-hidden="true"
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: "8px",
                      left: "10px",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      color: "#123B70",
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      padding: "3px 8px",
                      borderRadius: "4px",
                      border: "1px solid #D7E2EF",
                    }}
                  >
                    {truck.wheels} Roda
                  </div>
                </div>
              )}
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
                    {truck.name}
                  </h3>
                  <div style={{ fontSize: "0.8125rem", color: "#172B45", display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
                    <div><strong>Kapasitas:</strong> {truck.maxPayloadTon}</div>
                    <div><strong>Volume:</strong> ~{truck.approxVolumeCbm}</div>
                    <div><strong>Dimensi:</strong> {truck.typicalDimensions}</div>
                  </div>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#60738A", lineHeight: 1.4, margin: 0 }}>
                  {truck.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Safety & Operations Principles */}
      <section
        style={{
          backgroundColor: "#EEF3F9",
          border: "1px solid #D7E2EF",
          borderRadius: "12px",
          padding: "36px",
          marginBottom: "64px",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "0.8125rem", color: "#1D5FA7", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
            Standard Operasional
          </div>
          <h2 style={{ fontSize: "1.625rem", fontWeight: 800, color: "#0B2D52" }}>
            Disiplin Keselamatan dan Integritas Muatan
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "24px" }}>
          {TRUKINDO_PROFILE.safetyStandards.map((std, i) => (
            <div key={i}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#123B70", marginBottom: "6px" }}>
                {std.title}
              </h3>
              <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.5 }}>
                {std.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section
        style={{
          backgroundColor: "#0B2D52",
          border: "1px solid rgba(215, 226, 239, 0.2)",
          borderRadius: "12px",
          padding: "48px 36px",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#FFFFFF", marginBottom: "12px" }}>
          Siap Mengoptimalkan Angkutan Muatan Perusahaan Anda?
        </h2>
        <p style={{ fontSize: "1rem", color: "#EEF3F9", maxWidth: "680px", margin: "0 auto 28px", lineHeight: 1.6 }}>
          Kirimkan spesifikasi rute dan muatan Anda melalui formulir online 3 langkah yang cepat dan terstruktur.
          Tim komersial Trukindo siap menyiapkan proposal penawaran resmi.
        </p>
        <Link
          href="/quote"
          className="btn btn-primary"
          style={{ padding: "14px 36px", fontSize: "1.0625rem", borderRadius: "6px", fontWeight: 700 }}
        >
          Minta Penawaran Sekarang →
        </Link>
      </section>
    </div>
  );
}
