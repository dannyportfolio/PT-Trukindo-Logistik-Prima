import React from "react";
import Image from "next/image";
import Link from "next/link";
import { getPublicScenarios, LogisticsScenario } from "@/lib/content/trukindo-config";

interface LogisticsScenariosSectionProps {
  title?: string;
  subtitle?: string;
  limit?: number;
  highlightedId?: string;
}

export function LogisticsScenariosSection({
  title = "Skenario Kebutuhan Logistik & Pengiriman Antarkota",
  subtitle = "Contoh pemetaan kebutuhan transportasi industri di Indonesia. Disusun sebagai simulasi perencanaan kapasitas muatan, pemilihan armada, dan koordinasi koridor rute sebelum pengajuan penawaran resmi.",
  limit,
  highlightedId,
}: LogisticsScenariosSectionProps) {
  const allScenarios = getPublicScenarios();
  const scenarios = limit ? allScenarios.slice(0, limit) : allScenarios;

  return (
    <section style={{ marginBottom: "64px" }} aria-labelledby="scenarios-heading">
      {/* Section Header */}
      <div style={{ marginBottom: "32px", textAlign: "left" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "9999px",
            backgroundColor: "#EAF3FF",
            border: "1px solid #D7E2EF",
            color: "#123B70",
            fontSize: "0.8125rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "12px",
          }}
        >
          <span>📋</span>
          <span>Simulasi Operasional & Perencanaan Rute</span>
        </div>

        <h2
          id="scenarios-heading"
          style={{
            fontSize: "clamp(1.75rem, 3.5vw, 2.25rem)",
            fontWeight: 800,
            color: "#0B2D52",
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
            marginBottom: "12px",
          }}
        >
          {title}
        </h2>

        <p
          style={{
            color: "#60738A",
            fontSize: "1rem",
            maxWidth: "760px",
            lineHeight: 1.6,
            marginBottom: "16px",
          }}
        >
          {subtitle}
        </p>

        {/* Content Integrity & Conceptual Framing Notice */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "flex-start",
            gap: "10px",
            padding: "12px 18px",
            borderRadius: "8px",
            backgroundColor: "#EAF3FF",
            border: "1px solid #D7E2EF",
            fontSize: "0.8125rem",
            color: "#172B45",
            maxWidth: "840px",
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: "#1D5FA7", fontSize: "1rem", lineHeight: 1 }}>ℹ️</span>
          <span>
            <strong style={{ color: "#123B70" }}>Ilustrasi Konseptual:</strong> Skenario di bawah
            merupakan simulasi operasional logistik B2B untuk membantu estimasi kebutuhan Anda, bukan
            klaim proyek pelanggan spesifik atau data kontrak historis. Seluruh foto armada menggunakan
            kendaraan niaga Indonesia unbranded tanpa atribusi merek.
          </span>
        </div>
      </div>

      {/* Scenarios Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
          gap: "28px",
        }}
      >
        {scenarios.map((scenario: LogisticsScenario) => {
          const isHighlighted = highlightedId === scenario.id;

          return (
            <article
              key={scenario.id}
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderRadius: "12px",
                backgroundColor: isHighlighted ? "#F7FAFE" : "#FFFFFF",
                border: isHighlighted
                  ? "2px solid #1D5FA7"
                  : "1px solid #D7E2EF",
                boxShadow: "0 4px 16px rgba(18, 59, 112, 0.06)",
                padding: 0,
                transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              {/* Card Image Container with Aspect Ratio */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "16 / 9",
                  overflow: "hidden",
                  backgroundColor: "#EEF3F9",
                }}
              >
                <Image
                  src={scenario.imageSrc}
                  alt={scenario.imageAlt}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  loading="lazy"
                  style={{
                    objectFit: "cover",
                    transition: "transform 0.4s ease",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(to top, rgba(11, 45, 82, 0.65) 0%, transparent 45%)",
                    pointerEvents: "none",
                  }}
                  aria-hidden="true"
                />

                {/* Status Pills */}
                <div
                  style={{
                    position: "absolute",
                    top: "12px",
                    left: "12px",
                    display: "flex",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      backdropFilter: "blur(4px)",
                      border: "1px solid #D7E2EF",
                      color: "#123B70",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    Simulasi B2B
                  </span>
                </div>

                <div
                  style={{
                    position: "absolute",
                    bottom: "10px",
                    right: "12px",
                    fontSize: "0.6875rem",
                    color: "#172B45",
                    backgroundColor: "rgba(255, 255, 255, 0.9)",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontWeight: 600,
                    border: "1px solid #D7E2EF",
                  }}
                >
                  Armada Netral
                </div>
              </div>

              {/* Card Body */}
              <div
                style={{
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  flexGrow: 1,
                  justifyContent: "space-between",
                  gap: "20px",
                }}
              >
                <div>
                  {/* Category */}
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: "#1D5FA7",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "6px",
                    }}
                  >
                    {scenario.industryCategory}
                  </div>

                  {/* Title */}
                  <h3
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 700,
                      color: "#0B2D52",
                      lineHeight: 1.3,
                      marginBottom: "10px",
                    }}
                  >
                    {scenario.title}
                  </h3>

                  {/* Core Narrative */}
                  <blockquote
                    style={{
                      margin: "0 0 16px",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      backgroundColor: "#F7FAFE",
                      borderLeft: "3px solid #1D5FA7",
                      borderTop: "1px solid #EEF3F9",
                      borderRight: "1px solid #EEF3F9",
                      borderBottom: "1px solid #EEF3F9",
                      fontStyle: "italic",
                      color: "#172B45",
                      fontSize: "0.875rem",
                      lineHeight: 1.5,
                    }}
                  >
                    &ldquo;{scenario.narrative}&rdquo;
                  </blockquote>

                  {/* Operational Summary */}
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "#60738A",
                      lineHeight: 1.6,
                      marginBottom: "18px",
                    }}
                  >
                    {scenario.needsSummary}
                  </p>

                  {/* Scenario Parameters Card */}
                  <div
                    style={{
                      backgroundColor: "#EEF3F9",
                      border: "1px solid #D7E2EF",
                      borderRadius: "8px",
                      padding: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      fontSize: "0.8125rem",
                      marginBottom: "18px",
                    }}
                  >
                    <div>
                      <div style={{ color: "#60738A", fontSize: "0.6875rem", textTransform: "uppercase", fontWeight: 700 }}>
                        Armada Referensi Ilustratif:
                      </div>
                      <div style={{ color: "#0B2D52", fontWeight: 600 }}>
                        {scenario.illustrativeVehicle}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: "#60738A", fontSize: "0.6875rem", textTransform: "uppercase", fontWeight: 700 }}>
                        Koridor Rute Skenario:
                      </div>
                      <div style={{ color: "#1D5FA7", fontWeight: 600 }}>
                        {scenario.originDestination}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: "#60738A", fontSize: "0.6875rem", textTransform: "uppercase", fontWeight: 700 }}>
                        Karakteristik Muatan:
                      </div>
                      <div style={{ color: "#172B45" }}>
                        {scenario.cargoCharacteristics}
                      </div>
                    </div>

                    <div>
                      <div style={{ color: "#60738A", fontSize: "0.6875rem", textTransform: "uppercase", fontWeight: 700 }}>
                        Pola Frekuensi:
                      </div>
                      <div style={{ color: "#172B45" }}>
                        {scenario.dispatchFrequency}
                      </div>
                    </div>
                  </div>

                  {/* Key Operational Considerations */}
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#123B70",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: "8px",
                      }}
                    >
                      Poin Penanganan Kritis:
                    </div>
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      {scenario.keyConsiderations.map((point: string, idx: number) => (
                        <li
                          key={idx}
                          style={{
                            fontSize: "0.8125rem",
                            color: "#60738A",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            lineHeight: 1.4,
                          }}
                        >
                          <span style={{ color: "#15803D", fontWeight: 700, marginTop: "1px" }}>
                            ✓
                          </span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Contextual CTA Button */}
                <div style={{ paddingTop: "12px", borderTop: "1px solid #D7E2EF" }}>
                  <Link
                    href={`/quote?scenario=${scenario.id}#quote-form-workspace`}
                    className="btn btn-primary"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      padding: "12px 20px",
                      width: "100%",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      textAlign: "center",
                      textDecoration: "none",
                    }}
                    aria-label={`${scenario.ctaLabel} - Isi formulir penawaran berdasarkan skenario ${scenario.title}`}
                  >
                    <span>{scenario.ctaLabel}</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
