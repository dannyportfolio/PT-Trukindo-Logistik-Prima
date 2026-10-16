import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { TRUKINDO_PROFILE } from "@/lib/content/trukindo-config";

export const metadata: Metadata = {
  title: "Armada & Klasifikasi Muatan — PT Trukindo Logistik Prima",
  description:
    "Spesifikasi teknis standar armada truk (CDE, CDD, Fuso, Tronton, Trailer) dan panduan jenis kargo darat B2B.",
};

export default function FleetCargoPage() {
  const cargoCategories = [
    {
      title: "FMCG & Fast-Moving Consumer Goods",
      desc: "Produk makanan kemasan, minuman, personal care, dan kebutuhan ritel cepat berputar.",
      packing: "Karton di atas palet kayu/plastik bersusut film (shrink-wrapped).",
      fleet: "Tronton Wingbox, CDD Box.",
    },
    {
      title: "Bahan Baku Industri & Kimia Non-B3",
      desc: "Biji plastik, resin, kalsium karbonat, drum cairan non-berbahaya, lembaran logam.",
      packing: "Jumbo bag, drum berpengunci, atau palet terikat erat (strapped).",
      fleet: "Fuso Berat, Tronton Flatbed/Box.",
    },
    {
      title: "Barang Jadi & Komponen Manufaktur",
      desc: "Suku cadang otomotif, perlengkapan rumah tangga, perabot dalam kemasan, tekstil.",
      packing: "Karton bersegel dengan penandaan batas tumpuk (stacking limit).",
      fleet: "Tronton Wingbox, Fuso Box.",
    },
    {
      title: "Material Bangunan & Konstruksi",
      desc: "Keramik, semen instan, sanitary ware, pipa PVC, dan profil baja ringan.",
      packing: "Peti kayu, palet strapping baja, atau ikatan bundle pabrik.",
      fleet: "Fuso, Tronton Flatbed.",
    },
    {
      title: "Elektronik & Perangkat Konsumsi",
      desc: "Peralatan elektronik rumah tangga, audio visual, dan suku cadang komputer.",
      packing: "Karton berpelindung styrofoam dengan peringatan 'Fragile' & anti-lembab.",
      fleet: "CDD Box, Tronton Box bersegel.",
    },
  ];

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
          Spesifikasi Teknis
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
          Armada Truk & Klasifikasi Muatan
        </h1>
        <p
          style={{
            fontSize: "1.125rem",
            color: "#60738A",
            maxWidth: "760px",
            lineHeight: 1.6,
            marginBottom: "20px",
          }}
        >
          Panduan spesifikasi armada transportasi darat berstandar nasional dan rekomendasi penanganan
          muatan kargo industri B2B yang aman, efisien, dan sesuai batas muatan jalan.
        </p>

        {/* Content Integrity & Unbranded Fleet Disclosure */}
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
          <span style={{ color: "#1D5FA7", fontSize: "1rem" }}>ℹ️</span>
          <span>
            <strong style={{ color: "#123B70" }}>Standar Armada Komersial:</strong> Seluruh foto armada di
            bawah merupakan representasi teknis kendaraan niaga Indonesia unbranded tanpa identitas
            merek pihak ketiga, ditampilkan sebagai referensi visual kelas armada untuk estimasi kubikasi
            dan kapasitas muatan.
          </span>
        </div>
      </section>

      {/* Visual Fleet Class Cards Showcase */}
      <section style={{ marginBottom: "64px" }}>
        <h2 style={{ fontSize: "1.625rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
          Klasifikasi Visual Kendaraan Niaga
        </h2>
        <p style={{ color: "#60738A", fontSize: "0.9375rem", marginBottom: "28px" }}>
          Konfigurasi roda, bentuk karoseri, dan dimensi riil kendaraan niaga yang umum beroperasi di Indonesia.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
            gap: "24px",
          }}
        >
          {TRUKINDO_PROFILE.truckClasses.map((truck) => (
            <div
              key={truck.id}
              className="card"
              style={{
                borderRadius: "12px",
                overflow: "hidden",
                backgroundColor: "#FFFFFF",
                border: "1px solid #D7E2EF",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 4px 16px rgba(18, 59, 112, 0.06)",
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
                    sizes="(max-width: 768px) 100vw, 400px"
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
                      top: "12px",
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
                    {truck.wheels} Roda · Sasis Indonesia
                  </div>
                </div>
              )}

              <div style={{ padding: "24px", display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "space-between" }}>
                <div>
                  <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
                    {truck.name}
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.5, marginBottom: "16px" }}>
                    {truck.description}
                  </p>

                  <div
                    style={{
                      backgroundColor: "#F7FAFE",
                      border: "1px solid #D7E2EF",
                      borderRadius: "6px",
                      padding: "14px",
                      fontSize: "0.8125rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#60738A" }}>Estimasi Payload:</span>
                      <strong style={{ color: "#1D5FA7" }}>{truck.maxPayloadTon}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#60738A" }}>Estimasi Volume:</span>
                      <strong style={{ color: "#123B70" }}>~{truck.approxVolumeCbm}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#60738A" }}>Dimensi Karoseri:</span>
                      <strong style={{ color: "#172B45" }}>{truck.typicalDimensions}</strong>
                    </div>
                  </div>

                  <div style={{ fontSize: "0.75rem", color: "#60738A", marginBottom: "16px" }}>
                    <strong style={{ color: "#172B45" }}>Kesesuaian Kargo:</strong>{" "}
                    {truck.suitableCargo.join(", ")}
                  </div>
                </div>

                <Link
                  href={`/quote?truck=${truck.id}#quote-form-workspace`}
                  className="btn btn-secondary"
                  style={{
                    padding: "10px 16px",
                    fontSize: "0.8125rem",
                    textAlign: "center",
                    borderRadius: "6px",
                  }}
                >
                  Minta Penawaran Tipe {truck.name} →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Fleet Specification Table */}
      <section style={{ marginBottom: "64px" }}>
        <h2 style={{ fontSize: "1.625rem", fontWeight: 700, color: "#0B2D52", marginBottom: "20px" }}>
          Tabel Spesifikasi Teknis Armada Standar
        </h2>
        <div className="table-container">
          <table className="lead-table">
            <thead>
              <tr>
                <th>Tipe Armada</th>
                <th>Roda</th>
                <th>Estimasi Payload (Ton)</th>
                <th>Estimasi Volume (CBM)</th>
                <th>Dimensi Rata-rata (P × L × T)</th>
                <th>Kesesuaian Muatan Utama</th>
              </tr>
            </thead>
            <tbody>
              {TRUKINDO_PROFILE.truckClasses.map((truck) => (
                <tr key={truck.id}>
                  <td style={{ fontWeight: 700, color: "#0B2D52" }}>{truck.name}</td>
                  <td>{truck.wheels} Roda</td>
                  <td style={{ color: "#1D5FA7", fontWeight: 700 }}>{truck.maxPayloadTon}</td>
                  <td style={{ color: "#123B70" }}>~{truck.approxVolumeCbm}</td>
                  <td>{truck.typicalDimensions}</td>
                  <td style={{ fontSize: "0.8125rem", color: "#60738A" }}>
                    {truck.suitableCargo.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: "12px", fontSize: "0.8125rem", color: "#60738A" }}>
          Catatan: Dimensi dan kapasitas di atas merupakan spesifikasi standar industri transportasi darat Indonesia.
          Kapasitas efektif aktual bergantung pada berat jenis muatan dan toleransi jembatan timbang pada rute yang dilalui.
        </div>
      </section>

      {/* Cargo Classification Section */}
      <section style={{ marginBottom: "64px" }}>
        <h2 style={{ fontSize: "1.625rem", fontWeight: 700, color: "#0B2D52", marginBottom: "20px" }}>
          Klasifikasi Muatan & Standar Pengemasan
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "24px",
          }}
        >
          {cargoCategories.map((cat, i) => (
            <div key={i} className="card" style={{ padding: "24px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF" }}>
              <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#0B2D52", marginBottom: "8px" }}>
                {cat.title}
              </h3>
              <p style={{ fontSize: "0.875rem", color: "#60738A", lineHeight: 1.5, marginBottom: "14px" }}>
                {cat.desc}
              </p>
              <div style={{ fontSize: "0.8125rem", color: "#60738A", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div>
                  <strong style={{ color: "#172B45" }}>Standard Kemasan:</strong> {cat.packing}
                </div>
                <div>
                  <strong style={{ color: "#172B45" }}>Rekomendasi Truk:</strong> {cat.fleet}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ODOL Compliance Notice */}
      <section
        style={{
          backgroundColor: "#EEF3F9",
          border: "1px solid #D7E2EF",
          borderRadius: "12px",
          padding: "32px",
          marginBottom: "56px",
        }}
      >
        <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0B2D52", marginBottom: "12px" }}>
          Kebijakan Kepatuhan Batas Muatan Jalan (Zero ODOL)
        </h3>
        <p style={{ fontSize: "0.9375rem", color: "#172B45", lineHeight: 1.6 }}>
          PT Trukindo Logistik Prima menjunjung tinggi keselamatan di jalan raya dan kelestarian
          infrastruktur logistik nasional. Kami secara ketat memberlakukan pengangkutan yang mematuhi
          Jumlah Berat yang Diizinkan (JBI) sesuai kelas jalan. Untuk muatan berbobot tinggi, tim
          komersial kami akan menyusun skema alokasi armada bertonase sesuai agar pengiriman tetap aman,
          bebas hambatan di jembatan timbang, dan terlindungi asuransi pengangkutan.
        </p>
      </section>

      <div style={{ textAlign: "center" }}>
        <Link href="/quote" className="btn btn-primary" style={{ padding: "12px 32px", fontSize: "1rem" }}>
          Konsultasikan Spesifikasi Muatan Anda →
        </Link>
      </div>
    </div>
  );
}
