import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { TRUKINDO_PROFILE } from "@/lib/content/trukindo-config";

export const metadata: Metadata = {
  title: "Tentang Kami — PT Trukindo Logistik Prima",
  description:
    "Profil perusahaan, komitmen operasional, dan integritas layanan transportasi darat B2B PT Trukindo Logistik Prima.",
};

export default function AboutPage() {
  return (
    <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <section style={{ marginBottom: "48px" }}>
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
          Profil Perusahaan
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
          Tentang PT Trukindo Logistik Prima
        </h1>
        <p
          style={{
            fontSize: "1.125rem",
            color: "#60738A",
            lineHeight: 1.6,
          }}
        >
          {TRUKINDO_PROFILE.description}
        </p>
      </section>

      {/* Corporate Pillars */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "24px",
          marginBottom: "56px",
        }}
      >
        <div className="card" style={{ padding: "28px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
          <div style={{ fontSize: "1.75rem", marginBottom: "12px" }}>🎯</div>
          <h2 style={{ fontSize: "1.1875rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
            Fokus Layanan Angkutan Penuh
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6 }}>
            Kami mengkhususkan diri pada layanan pengangkutan carter penuh (Full Truck Load) dan
            kontrak terdedikasi antarkota. Pendekatan ini menghilangkan risiko kerusakan atau
            keterlambatan akibat bongkar muat transit pihak ketiga.
          </p>
        </div>

        <div className="card" style={{ padding: "28px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
          <div style={{ fontSize: "1.75rem", marginBottom: "12px" }}>🛡️</div>
          <h2 style={{ fontSize: "1.1875rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
            Komitmen Integritas Fakta
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6 }}>
            Kami hanya mempublikasikan kapabilitas dan standar operasional yang terverifikasi. Kami
            tidak mengklaim jumlah armada, kepemilikan aset, atau sertifikasi yang belum memiliki
            bukti legalitas operasional resmi.
          </p>
        </div>

        <div className="card" style={{ padding: "28px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
          <div style={{ fontSize: "1.75rem", marginBottom: "12px" }}>🤝</div>
          <h2 style={{ fontSize: "1.1875rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
            Kemitraan Komersial B2B
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.6 }}>
            Setiap kesepakatan komersial berlandaskan analisis rute yang transparan, SLA ketepatan waktu,
            serta komunikasi proaktif dari peninjauan kebutuhan awal hingga penerimaan muatan di gudang tujuan.
          </p>
        </div>
      </section>

      {/* Operational Principles */}
      <section
        style={{
          backgroundColor: "#EEF3F9",
          border: "1px solid #D7E2EF",
          borderRadius: "12px",
          padding: "36px",
          marginBottom: "56px",
        }}
      >
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0B2D52", marginBottom: "16px" }}>
          Prinsip Penyelenggaraan Transportasi
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: "#172B45", fontSize: "0.9375rem", lineHeight: 1.6 }}>
          <p>
            <strong style={{ color: "#0B2D52" }}>1. Disiplin Batas Beban Muatan (Over-Dimension & Over-Load / ODOL):</strong> Trukindo
            berkomitmen mematuhi regulasi batas tonase jalan nasional demi menjaga keselamatan pengemudi,
            kelancaran perjalanan di jembatan timbang, dan keutuhan sasis kendaraan.
          </p>
          <p>
            <strong style={{ color: "#0B2D52" }}>2. Pemeriksaan Harian Teknis Pra-Perjalanan:</strong> Seluruh armada diwajibkan
            melalui checklist kelayakan sistem pengereman, lampu indikator, dan kondisi ban sebelum
            diberangkatkan ke titik muat pengirim.
          </p>
          <p>
            <strong style={{ color: "#0B2D52" }}>3. Peninjauan Manusia untuk Setiap Penawaran:</strong> Kami tidak menghasilkan
            estimasi tarif acak atau fiktif secara instan. Setiap rute dan karakteristik muatan dianalisis
            oleh personel komersial berpengalaman.
          </p>
        </div>
      </section>

      {/* CTA Box */}
      <div style={{ textAlign: "center" }}>
        <Link href="/quote" className="btn btn-primary" style={{ padding: "12px 32px", fontSize: "1rem" }}>
          Minta Penawaran Rute Anda →
        </Link>
      </div>
    </div>
  );
}
