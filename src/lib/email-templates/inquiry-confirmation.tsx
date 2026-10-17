/**
 * PT Trukindo Logistik Prima — Inbound Quotation Confirmation Email Template
 * Trukindo Blue & White Design System
 * 
 * Provides responsive, clean corporate HTML email markup and plain text fallback
 * for commercial inbound inquiry acknowledgment.
 */

export interface InquiryConfirmationData {
  referenceNumber: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  originCity: string;
  destinationCity: string;
  serviceCategory: string;
  cargoType: string;
  truckType?: string;
  estimatedVolumeWeight?: string;
  estimatedShippingFrequency?: string;
  firstLoadingDate?: string;
  additionalNotes?: string;
  submittedAt?: string;
}

const SERVICE_LABELS: Record<string, string> = {
  FTL_TRUCKING: "Charter Truk Penuh (Full Truckload / FTL)",
  SCHEDULED_LINEHAUL: "Linehaul Terjadwal & Reguler",
  CONTRACT_LOGISTICS: "Kontrak Terdedikasi & Manajemen Armada",
};

const CARGO_LABELS: Record<string, string> = {
  FMCG_CONSUMER_GOODS: "Fast-Moving Consumer Goods (FMCG)",
  INDUSTRIAL_RAW_MATERIALS: "Bahan Baku Industri & Kimia Non-B3",
  FINISHED_GOODS: "Barang Jadi / Manufaktur",
  BUILDING_MATERIALS: "Material Bangunan & Konstruksi",
  ELECTRONICS: "Elektronik & Perangkat Presisi",
  OTHER_GENERAL_CARGO: "Kargo Umum / Lainnya",
};

const TRUCK_LABELS: Record<string, string> = {
  CDE_ENGKEL: "CDE Engkel (4 Roda, Kapasitas ~2.5 Ton)",
  CDD_DOUBLE: "CDD Double (6 Roda, Kapasitas ~5 Ton)",
  FUSO: "Fuso Berat (Kapasitas ~8-10 Ton)",
  TRONTON_BOX: "Tronton Box Tertutup (~15 Ton)",
  TRONTON_WINGBOX: "Tronton Wingbox (~15-20 Ton, 45-50 CBM)",
  TRAILER_20FT: "Trailer 20 Feet Container",
  TRAILER_40FT: "Trailer 40 Feet Container",
  ANY_APPROPRIATE: "Rekomendasi Terbaik dari Tim Trukindo",
};

const FREQUENCY_LABELS: Record<string, string> = {
  ONE_TIME: "Pengiriman Sekali Jalan (Spot Charter)",
  WEEKLY: "Rutin Mingguan (1-3 Ritase / Minggu)",
  MONTHLY: "Rutin Bulanan",
  CONTRACT_REGULAR: "Kontrak Jangka Panjang Terdedikasi (Bulanan / Tahunan)",
  CONSULTATION_NEEDED: "Membutuhkan Konsultasi Tim Komersial",
};

export function renderInquiryConfirmationHtml(data: InquiryConfirmationData): string {
  const serviceText = SERVICE_LABELS[data.serviceCategory] || data.serviceCategory;
  const cargoText = CARGO_LABELS[data.cargoType] || data.cargoType;
  const truckText = data.truckType ? (TRUCK_LABELS[data.truckType] || data.truckType) : "Sesuai Kebutuhan";
  const frequencyText = data.estimatedShippingFrequency ? (FREQUENCY_LABELS[data.estimatedShippingFrequency] || data.estimatedShippingFrequency) : "Sekali Jalan";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Konfirmasi Permintaan Penawaran - PT Trukindo Logistik Prima</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F7FAFE; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #172B45;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F7FAFE; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 8px; border: 1px solid #D7E2EF; overflow: hidden; box-shadow: 0 4px 12px rgba(11, 45, 82, 0.05);" cellpadding="0" cellspacing="0">
          
          <!-- Top Corporate Header -->
          <tr>
            <td style="background-color: #0B2D52; padding: 28px 32px; text-align: left; border-bottom: 3px solid #1D5FA7;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size: 20px; font-weight: 800; letter-spacing: 0.05em; color: #FFFFFF; text-transform: uppercase;">
                      PT TRUKINDO LOGISTIK PRIMA
                    </div>
                    <div style="font-size: 12px; color: #EAF3FF; font-weight: 500; margin-top: 4px;">
                      Mitra Logistik Angkutan Darat &amp; Distribusi B2B Terpercaya
                    </div>
                  </td>
                  <td align="right" style="vertical-align: top;">
                    <span style="display: inline-block; background-color: #1D5FA7; color: #FFFFFF; font-size: 11px; font-weight: 700; padding: 6px 12px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em;">
                      Tanda Terima Resmi
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h1 style="font-size: 20px; font-weight: 700; color: #0B2D52; margin: 0 0 12px 0;">
                Permintaan Penawaran Terverifikasi
              </h1>
              <p style="font-size: 15px; line-height: 1.6; color: #172B45; margin: 0 0 20px 0;">
                Yth. <strong>Bpk/Ibu ${escapeHtml(data.contactName)}</strong> (${escapeHtml(data.companyName)}),
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #60738A; margin: 0 0 24px 0;">
                Terima kasih telah mempercayakan kebutuhan transportasi logistik bisnis Anda kepada PT Trukindo Logistik Prima. Permintaan penawaran harga Anda telah tercatat dengan nomor referensi unik di bawah ini:
              </p>

              <!-- Reference Badge Card -->
              <div style="background-color: #EAF3FF; border: 1px solid #D7E2EF; border-left: 4px solid #1D5FA7; border-radius: 6px; padding: 16px 20px; margin-bottom: 28px;">
                <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #1D5FA7; margin-bottom: 4px;">
                  Nomor Referensi Inkuiri:
                </div>
                <div style="font-size: 22px; font-weight: 800; color: #0B2D52; letter-spacing: 0.04em;">
                  ${escapeHtml(data.referenceNumber)}
                </div>
                <div style="font-size: 12px; color: #60738A; margin-top: 4px;">
                  Gunakan nomor ini saat berkomunikasi dengan representatif komersial kami.
                </div>
              </div>

              <!-- Route Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #EEF3F9; border-radius: 6px; border: 1px solid #D7E2EF; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 11px; font-weight: 700; color: #60738A; text-transform: uppercase; margin-bottom: 8px;">
                      Rute Koridor Pengiriman
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="45%" style="vertical-align: top;">
                          <div style="font-size: 11px; color: #1D5FA7; font-weight: 700;">🟢 ASAL PENJEMPUTAN</div>
                          <div style="font-size: 16px; font-weight: 700; color: #0B2D52; margin-top: 4px;">${escapeHtml(data.originCity)}</div>
                        </td>
                        <td width="10%" align="center" style="font-size: 20px; color: #1D5FA7; font-weight: bold;">
                          ➔
                        </td>
                        <td width="45%" style="vertical-align: top; text-align: right;">
                          <div style="font-size: 11px; color: #1D5FA7; font-weight: 700;">🏁 TUJUAN BONGKAR</div>
                          <div style="font-size: 16px; font-weight: 700; color: #0B2D52; margin-top: 4px;">${escapeHtml(data.destinationCity)}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Specification Table -->
              <div style="font-size: 14px; font-weight: 700; color: #0B2D52; margin-bottom: 12px; border-bottom: 2px solid #EEF3F9; padding-bottom: 6px;">
                Rincian Muatan &amp; Preferensi Operasional
              </div>
              <table width="100%" cellpadding="8" cellspacing="0" style="font-size: 13px; line-height: 1.5; margin-bottom: 28px; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #EEF3F9;">
                  <td width="40%" style="color: #60738A; font-weight: 600;">Layanan</td>
                  <td width="60%" style="color: #172B45; font-weight: 600;">${escapeHtml(serviceText)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #EEF3F9;">
                  <td style="color: #60738A; font-weight: 600;">Klasifikasi Kargo</td>
                  <td style="color: #172B45;">${escapeHtml(cargoText)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #EEF3F9;">
                  <td style="color: #60738A; font-weight: 600;">Preferensi Armada</td>
                  <td style="color: #172B45;">${escapeHtml(truckText)}</td>
                </tr>
                ${data.estimatedVolumeWeight ? `
                <tr style="border-bottom: 1px solid #EEF3F9;">
                  <td style="color: #60738A; font-weight: 600;">Estimasi Tonase / Volume</td>
                  <td style="color: #172B45; font-weight: 600; color: #0B2D52;">${escapeHtml(data.estimatedVolumeWeight)}</td>
                </tr>` : ""}
                <tr style="border-bottom: 1px solid #EEF3F9;">
                  <td style="color: #60738A; font-weight: 600;">Frekuensi Pengiriman</td>
                  <td style="color: #172B45;">${escapeHtml(frequencyText)}</td>
                </tr>
                ${data.firstLoadingDate ? `
                <tr style="border-bottom: 1px solid #EEF3F9;">
                  <td style="color: #60738A; font-weight: 600;">Target Jadwal Muat</td>
                  <td style="color: #172B45;">${escapeHtml(data.firstLoadingDate)}</td>
                </tr>` : ""}
                ${data.additionalNotes ? `
                <tr style="border-bottom: 1px solid #EEF3F9;">
                  <td style="color: #60738A; font-weight: 600; vertical-align: top;">Catatan Tambahan</td>
                  <td style="color: #172B45;">${escapeHtml(data.additionalNotes)}</td>
                </tr>` : ""}
              </table>

              <!-- SLA Box -->
              <div style="background-color: #F7FAFE; border: 1px dashed #D7E2EF; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="36" style="vertical-align: top; font-size: 20px;">⏱️</td>
                    <td>
                      <div style="font-size: 13px; font-weight: 700; color: #0B2D52;">
                        SLA Peninjauan Komersial: 1 - 2 Jam Kerja
                      </div>
                      <div style="font-size: 12px; color: #60738A; margin-top: 4px; line-height: 1.5;">
                        Spesialis rute kami sedang menghitung ketersediaan unit armada terdekat, penyesuaian tarif koridor, dan SLA penjemputan terbaik. Penawaran harga resmi akan dikirimkan ke email ini atau dikonfirmasikan via WhatsApp resmi kami.
                      </div>
                    </td>
                  </tr>
                </table>
              </div>

            </td>
          </tr>

          <!-- Corporate Footer -->
          <tr>
            <td style="background-color: #0B2D52; color: #EEF3F9; padding: 24px 32px; border-top: 1px solid #D7E2EF; font-size: 12px; line-height: 1.6;">
              <div style="font-weight: 700; font-size: 13px; color: #FFFFFF; margin-bottom: 6px;">
                PT Trukindo Logistik Prima
              </div>
              <div style="color: #D7E2EF; margin-bottom: 12px;">
                Kantor Pusat: Gedung Trukindo Center, Jl. Raya Cakung Cilincing KM 4.5, Jakarta Timur 13910<br>
                Hotline Komersial: <a href="tel:+62215558785" style="color: #EAF3FF; text-decoration: none; font-weight: 600;">(021) 555-8785</a> | WhatsApp: <a href="https://wa.me/628129998877" style="color: #EAF3FF; text-decoration: none; font-weight: 600;">+62 812-9998-877</a>
              </div>
              <div style="font-size: 11px; color: #60738A; border-top: 1px solid rgba(215, 226, 239, 0.2); padding-top: 10px;">
                Email ini dikirimkan secara otomatis dari platform komersial AstraOps. Hak Cipta &copy; ${new Date().getFullYear()} PT Trukindo Logistik Prima. Seluruh hak cipta dilindungi.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderInquiryConfirmationText(data: InquiryConfirmationData): string {
  const serviceText = SERVICE_LABELS[data.serviceCategory] || data.serviceCategory;
  const cargoText = CARGO_LABELS[data.cargoType] || data.cargoType;
  const truckText = data.truckType ? (TRUCK_LABELS[data.truckType] || data.truckType) : "Sesuai Kebutuhan";
  const frequencyText = data.estimatedShippingFrequency ? (FREQUENCY_LABELS[data.estimatedShippingFrequency] || data.estimatedShippingFrequency) : "Sekali Jalan";

  return `PT TRUKINDO LOGISTIK PRIMA
Tanda Terima Resmi Permintaan Penawaran Logistik
==================================================

Yth. Bpk/Ibu ${data.contactName} (${data.companyName}),

Terima kasih atas permintaan penawaran transportasi logistik yang Anda kirimkan. Inkuiri Anda telah tercatat dengan rincian sebagai berikut:

NOMOR REFERENSI: ${data.referenceNumber}
--------------------------------------------------
Rute Pengiriman    : ${data.originCity} ➔ ${data.destinationCity}
Kategori Layanan   : ${serviceText}
Klasifikasi Muatan : ${cargoText}
Preferensi Armada  : ${truckText}
Estimasi Volume/Ton: ${data.estimatedVolumeWeight || "-"}
Frekuensi Kirim    : ${frequencyText}
Target Jadwal Muat : ${data.firstLoadingDate || "-"}
Catatan Khusus     : ${data.additionalNotes || "-"}

SLA PENINJAUAN KOMERSIAL: 1 - 2 Jam Kerja
Spesialis rute kami sedang memproses ketersediaan unit terdekat dan perhitungan kalkulasi tarif koridor. Penawaran harga resmi akan dikirimkan ke email atau dikonfirmasikan oleh representatif kami melalui telepon/WhatsApp.

Layanan Pelanggan & Hotline Bisnis:
Telepon : (021) 555-8785
WhatsApp: +62 812-9998-877
Email   : inquiry@trukindo.co.id
Website : https://logistikprima.com

Hak Cipta © ${new Date().getFullYear()} PT Trukindo Logistik Prima.
`;
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
