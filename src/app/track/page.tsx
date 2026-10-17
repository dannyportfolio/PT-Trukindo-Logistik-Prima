"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  PublicTrackingData,
  STATUS_ORDER,
  STATUS_LABELS,
  ShipmentStatus,
} from "@/types/tracking";

function TrackingContent() {
  const searchParams = useSearchParams();
  const initialWaybill = searchParams.get("waybill") || "";

  const [waybillInput, setWaybillInput] = useState(initialWaybill);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<PublicTrackingData | null>(null);

  const fetchTracking = async (waybillCode: string) => {
    const clean = waybillCode.trim().toUpperCase();
    if (!clean) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/tracking/${encodeURIComponent(clean)}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || "Pengiriman tidak ditemukan.");
        setTrackingData(null);
      } else {
        setTrackingData(json.data || json);
      }
    } catch {
      setError("Terjadi gangguan koneksi saat melacak muatan. Silakan coba kembali.");
      setTrackingData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialWaybill) {
      setWaybillInput(initialWaybill);
      fetchTracking(initialWaybill);
    }
  }, [initialWaybill]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking(waybillInput);
  };

  const handleSelectSample = (sample: string) => {
    setWaybillInput(sample);
    fetchTracking(sample);
  };

  return (
    <div style={{ backgroundColor: "#F7FAFE", minHeight: "100vh", paddingBottom: "60px" }}>
      {/* 1. Hero Header Banner (Deep Blue #0B2D52) */}
      <section
        style={{
          background: "linear-gradient(135deg, #0B2D52 0%, #123B70 60%, #1D5FA7 100%)",
          color: "#FFFFFF",
          padding: "56px 20px 48px 20px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <div
            style={{
              display: "inline-block",
              backgroundColor: "rgba(234, 243, 255, 0.15)",
              color: "#EAF3FF",
              fontSize: "0.8125rem",
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: "20px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "16px",
              border: "1px solid rgba(234, 243, 255, 0.2)",
            }}
          >
            🛰️ Real-Time Fleet Telematics &amp; Waybill Tracking
          </div>
          <h1
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 800,
              lineHeight: 1.25,
              margin: "0 0 16px 0",
              letterSpacing: "-0.02em",
            }}
          >
            Portal Pelacakan Muatan Trukindo
          </h1>
          <p
            style={{
              fontSize: "1rem",
              color: "#D7E2EF",
              lineHeight: 1.6,
              margin: "0 auto 32px auto",
              maxWidth: "600px",
            }}
          >
            Pantau posisi armada, estimasi waktu tiba (ETA), dan riwayat berita acara serah terima pengiriman Anda secara transparan di koridor Trans-Jawa, Bali, dan Sumatra.
          </p>

          {/* Search Box Card */}
          <form
            onSubmit={handleSubmit}
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              padding: "8px",
              boxShadow: "0 10px 25px -5px rgba(11, 45, 82, 0.2)",
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              maxWidth: "640px",
              margin: "0 auto",
            }}
          >
            <input
              type="text"
              id="waybill-input"
              value={waybillInput}
              onChange={(e) => setWaybillInput(e.target.value)}
              placeholder="Masukkan Nomor Surat Jalan / Waybill (cth: TRK-20261017-001)"
              style={{
                flex: "1 1 280px",
                padding: "14px 18px",
                fontSize: "0.9375rem",
                color: "#172B45",
                border: "none",
                outline: "none",
                fontWeight: 600,
              }}
            />
            <button
              type="submit"
              id="track-submit-btn"
              disabled={loading || !waybillInput.trim()}
              style={{
                backgroundColor: loading || !waybillInput.trim() ? "#60738A" : "#1D5FA7",
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: "0.9375rem",
                padding: "14px 28px",
                borderRadius: "8px",
                border: "none",
                cursor: loading || !waybillInput.trim() ? "not-allowed" : "pointer",
                transition: "background-color 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                justifyContent: "center",
              }}
            >
              {loading ? "Mencari..." : "🔍 Lacak Posisi"}
            </button>
          </form>

          {/* Quick Demo Links */}
          <div
            style={{
              marginTop: "20px",
              fontSize: "0.8125rem",
              color: "#D7E2EF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <span>Contoh Resi Aktif:</span>
            <button
              type="button"
              onClick={() => handleSelectSample("TRK-20261017-001")}
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                color: "#FFFFFF",
                borderRadius: "4px",
                padding: "3px 8px",
                fontSize: "0.75rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              TRK-20261017-001 (Trans-Jawa FTL)
            </button>
            <button
              type="button"
              onClick={() => handleSelectSample("TRK-20261016-002")}
              style={{
                background: "rgba(255, 255, 255, 0.12)",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                color: "#FFFFFF",
                borderRadius: "4px",
                padding: "3px 8px",
                fontSize: "0.75rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              TRK-20261016-002 (Bali Ferry)
            </button>
          </div>
        </div>
      </section>

      {/* 2. Main Tracking Results Container */}
      <main style={{ maxWidth: "1000px", margin: "-24px auto 0 auto", padding: "0 20px" }}>
        {/* Error Feedback */}
        {error && (
          <div
            id="tracking-error"
            style={{
              backgroundColor: "#FEE2E2",
              border: "1px solid #FCA5A5",
              borderRadius: "8px",
              padding: "16px 20px",
              color: "#B91C1C",
              fontSize: "0.9375rem",
              marginBottom: "24px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <span style={{ fontSize: "1.25rem" }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700 }}>Nomor Resi Tidak Ditemukan</div>
              <div style={{ fontSize: "0.875rem", marginTop: "2px" }}>{error}</div>
            </div>
          </div>
        )}

        {/* Tracking Details Card */}
        {trackingData && (
          <div
            id="tracking-result-card"
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              border: "1px solid #D7E2EF",
              boxShadow: "0 4px 16px rgba(11, 45, 82, 0.06)",
              overflow: "hidden",
            }}
          >
            {/* A. Header Bar */}
            <div
              style={{
                backgroundColor: "#EEF3F9",
                borderBottom: "1px solid #D7E2EF",
                padding: "20px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#60738A", textTransform: "uppercase" }}>
                  Nomor Surat Jalan / Waybill
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0B2D52", letterSpacing: "0.03em" }}>
                  {trackingData.waybillNumber}
                </div>
              </div>

              {/* Status Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: trackingData.isCompleted ? "#DCFCE7" : "#EAF3FF",
                  color: trackingData.isCompleted ? "#15803D" : "#1D5FA7",
                  border: `1px solid ${trackingData.isCompleted ? "#86EFAC" : "#BFDBFE"}`,
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontWeight: 700,
                  fontSize: "0.875rem",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: trackingData.isCompleted ? "#15803D" : "#2F80D1",
                  }}
                />
                {trackingData.statusLabel}
              </div>
            </div>

            {/* B. Progress Stepper Bar */}
            <div style={{ padding: "28px 24px", borderBottom: "1px solid #D7E2EF" }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#60738A", marginBottom: "16px", textTransform: "uppercase" }}>
                Tahapan Perjalanan Kargo
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "12px",
                }}
              >
                {STATUS_ORDER.map((stepKey, idx) => {
                  const isCurrent = trackingData.status === stepKey;
                  const isPassed = trackingData.statusIndex >= idx;

                  let stepColor = "#60738A";
                  let bgColor = "#F7FAFE";
                  let borderColor = "#D7E2EF";

                  if (isCurrent) {
                    stepColor = "#1D5FA7";
                    bgColor = "#EAF3FF";
                    borderColor = "#1D5FA7";
                  } else if (isPassed) {
                    stepColor = "#15803D";
                    bgColor = "#F0FDF4";
                    borderColor = "#86EFAC";
                  }

                  return (
                    <div
                      key={stepKey}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: `2px solid ${borderColor}`,
                        backgroundColor: bgColor,
                        textAlign: "left",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          color: stepColor,
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          marginBottom: "4px",
                        }}
                      >
                        {isPassed && !isCurrent ? "✓ Selesai" : isCurrent ? "📍 Aktif" : `Tahap ${idx + 1}`}
                      </div>
                      <div
                        style={{
                          fontSize: "0.875rem",
                          fontWeight: 700,
                          color: isCurrent || isPassed ? "#0B2D52" : "#60738A",
                          lineHeight: 1.3,
                        }}
                      >
                        {STATUS_LABELS[stepKey as ShipmentStatus]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* C. Shipment Summary & Live GPS Telematics Row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "24px",
                padding: "24px",
                borderBottom: "1px solid #D7E2EF",
              }}
            >
              {/* Route & Cargo Specifications */}
              <div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#60738A", marginBottom: "12px", textTransform: "uppercase" }}>
                  Informasi Muatan &amp; Koridor
                </div>
                <div
                  style={{
                    backgroundColor: "#F7FAFE",
                    borderRadius: "8px",
                    border: "1px solid #D7E2EF",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                    <div style={{ fontWeight: 800, color: "#0B2D52", fontSize: "1.0625rem" }}>
                      {trackingData.originCity}
                    </div>
                    <span style={{ color: "#1D5FA7", fontWeight: 800 }}>➔</span>
                    <div style={{ fontWeight: 800, color: "#0B2D52", fontSize: "1.0625rem" }}>
                      {trackingData.destinationCity}
                    </div>
                  </div>

                  <table width="100%" cellPadding="4" style={{ fontSize: "0.875rem", color: "#172B45" }}>
                    <tbody>
                      <tr>
                        <td style={{ color: "#60738A", width: "40%" }}>Jenis Armada:</td>
                        <td style={{ fontWeight: 600 }}>{trackingData.truckType}</td>
                      </tr>
                      <tr>
                        <td style={{ color: "#60738A" }}>Nomor Polisi:</td>
                        <td style={{ fontWeight: 700, color: "#0B2D52" }}>{trackingData.licensePlate}</td>
                      </tr>
                      <tr>
                        <td style={{ color: "#60738A" }}>Nama Pengemudi:</td>
                        <td style={{ fontWeight: 600 }}>{trackingData.driverName}</td>
                      </tr>
                      {trackingData.cargoDescription && (
                        <tr>
                          <td style={{ color: "#60738A", verticalAlign: "top" }}>Deskripsi Kargo:</td>
                          <td>{trackingData.cargoDescription}</td>
                        </tr>
                      )}
                      {trackingData.estimatedTonnage && (
                        <tr>
                          <td style={{ color: "#60738A" }}>Berat Muatan:</td>
                          <td style={{ fontWeight: 600 }}>{trackingData.estimatedTonnage} Ton</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Telematics Telemetry & ETA Card */}
              <div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#60738A", marginBottom: "12px", textTransform: "uppercase" }}>
                  Status GPS Telematika Armada
                </div>
                <div
                  style={{
                    backgroundColor: "#F7FAFE",
                    borderRadius: "8px",
                    border: "1px solid #D7E2EF",
                    padding: "16px",
                  }}
                >
                  {/* Live Telematics Indicator */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "14px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          backgroundColor: "#15803D",
                          boxShadow: "0 0 0 3px rgba(21, 128, 61, 0.2)",
                        }}
                      />
                      <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0B2D52" }}>
                        GPS Tracker Aktif (McEasy / EasyGo)
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        backgroundColor: "#EAF3FF",
                        color: "#1D5FA7",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        fontWeight: 600,
                      }}
                    >
                      Mesin: {trackingData.engineStatus || "ON"}
                    </span>
                  </div>

                  <table width="100%" cellPadding="4" style={{ fontSize: "0.875rem", color: "#172B45" }}>
                    <tbody>
                      <tr>
                        <td style={{ color: "#60738A", width: "45%" }}>Kecepatan Jelajah:</td>
                        <td style={{ fontWeight: 700, color: "#0B2D52" }}>
                          {trackingData.currentSpeedKph || 0} km/jam
                        </td>
                      </tr>
                      {trackingData.currentLatitude && trackingData.currentLongitude && (
                        <tr>
                          <td style={{ color: "#60738A" }}>Koordinat Terkini:</td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>
                            {trackingData.currentLatitude.toFixed(4)}, {trackingData.currentLongitude.toFixed(4)}
                          </td>
                        </tr>
                      )}
                      {trackingData.estimatedArrivalAt && (
                        <tr>
                          <td style={{ color: "#60738A" }}>Estimasi Waktu Tiba (ETA):</td>
                          <td style={{ fontWeight: 700, color: "#1D5FA7" }}>
                            {new Date(trackingData.estimatedArrivalAt).toLocaleString("id-ID", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </td>
                        </tr>
                      )}
                      {trackingData.lastTelematicsAt && (
                        <tr>
                          <td style={{ color: "#60738A" }}>Pembaruan Terakhir:</td>
                          <td style={{ fontSize: "0.8125rem", color: "#60738A" }}>
                            {new Date(trackingData.lastTelematicsAt).toLocaleString("id-ID", {
                              dateStyle: "short",
                              timeStyle: "medium",
                            })}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* D. Milestone Timeline Section */}
            <div style={{ padding: "28px 24px" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0B2D52", marginBottom: "20px", textTransform: "uppercase" }}>
                📋 Riwayat Berita Acara &amp; Checkpoint Perjalanan ({trackingData.milestones.length} Peristiwa)
              </div>

              {trackingData.milestones.length === 0 ? (
                <div style={{ color: "#60738A", fontSize: "0.875rem", padding: "12px 0" }}>
                  Belum ada catatan checkpoint transit yang direkam untuk pengiriman ini.
                </div>
              ) : (
                <div style={{ position: "relative", paddingLeft: "28px" }}>
                  {/* Vertical Timeline Guide Line */}
                  <div
                    style={{
                      position: "absolute",
                      left: "9px",
                      top: "8px",
                      bottom: "16px",
                      width: "2px",
                      backgroundColor: "#D7E2EF",
                    }}
                  />

                  {trackingData.milestones.map((m, mIdx) => (
                    <div
                      key={mIdx}
                      style={{
                        position: "relative",
                        marginBottom: "24px",
                      }}
                    >
                      {/* Timeline Bullet Node */}
                      <div
                        style={{
                          position: "absolute",
                          left: "-28px",
                          top: "2px",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          backgroundColor: mIdx === trackingData.milestones.length - 1 ? "#1D5FA7" : "#FFFFFF",
                          border: `3px solid ${mIdx === trackingData.milestones.length - 1 ? "#1D5FA7" : "#60738A"}`,
                          boxShadow: "0 0 0 2px #FFFFFF",
                        }}
                      />

                      <div
                        style={{
                          backgroundColor: "#F7FAFE",
                          border: "1px solid #D7E2EF",
                          borderRadius: "8px",
                          padding: "16px 18px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                            gap: "8px",
                            marginBottom: "6px",
                          }}
                        >
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: "#0B2D52" }}>
                            {m.title}
                          </div>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#60738A",
                              backgroundColor: "#FFFFFF",
                              border: "1px solid #D7E2EF",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontWeight: 600,
                            }}
                          >
                            {new Date(m.recordedAt).toLocaleString("id-ID", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </div>
                        </div>

                        <div style={{ fontSize: "0.875rem", color: "#1D5FA7", fontWeight: 600, marginBottom: "8px" }}>
                          📍 {m.locationName}
                        </div>

                        {m.notes && (
                          <div style={{ fontSize: "0.875rem", color: "#172B45", lineHeight: 1.5, marginBottom: "8px" }}>
                            {m.notes}
                          </div>
                        )}

                        {m.handoverOfficer && (
                          <div style={{ fontSize: "0.75rem", color: "#60738A", borderTop: "1px solid #EEF3F9", paddingTop: "6px" }}>
                            ✍️ Berita Acara Disahkan Oleh: <strong>{m.handoverOfficer}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* E. Help Card / Hotline */}
        <div
          style={{
            marginTop: "32px",
            backgroundColor: "#FFFFFF",
            border: "1px solid #D7E2EF",
            borderRadius: "12px",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: "#0B2D52", fontSize: "0.9375rem" }}>
              Butuh Bantuan Pelacakan atau Informasi Tambahan?
            </div>
            <div style={{ fontSize: "0.8125rem", color: "#60738A", marginTop: "4px" }}>
              Tim Dispatch Operasional Trukindo siaga 24/7 untuk memastikan kelancaran bongkar muat Anda.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <a
              href="tel:+62215558785"
              style={{
                backgroundColor: "#EEF3F9",
                color: "#0B2D52",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "0.8125rem",
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              📞 (021) 555-8785
            </a>
            <Link
              href="/contact"
              style={{
                backgroundColor: "#0B2D52",
                color: "#FFFFFF",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "0.8125rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Hubungi Support
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: "80px 20px", textAlign: "center", color: "#0B2D52" }}>
          Memuat portal pelacakan...
        </div>
      }
    >
      <TrackingContent />
    </Suspense>
  );
}
