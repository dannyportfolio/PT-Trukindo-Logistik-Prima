"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ServiceCategory,
  CargoClassification,
  ShippingFrequency,
  TruckTypePreference,
} from "@/types/inquiry";
import { getScenarioById, LogisticsScenario } from "@/lib/content/trukindo-config";

export interface QuoteRequestFormProps {
  initialScenarioId?: string;
}

interface FormData {
  // Step 1: Contact & Company
  contactName: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  jobTitle: string;

  // Step 2: Cargo & Route
  serviceCategory: ServiceCategory;
  cargoType: CargoClassification;
  originCity: string;
  destinationCity: string;
  truckType: TruckTypePreference;
  estimatedVolumeWeight: string;
  tonnageNeedsConsultation: boolean;
  estimatedShippingFrequency: ShippingFrequency;
  firstLoadingDate: string;
  scheduleFlexible: boolean;
  additionalNotes: string;

  // Anti-Spam
  honeypot: string;
  formRenderTimestamp: number;
}

interface FormErrors {
  [key: string]: string | undefined;
}

const INITIAL_FORM_DATA: FormData = {
  contactName: "",
  companyName: "",
  contactEmail: "",
  contactPhone: "",
  jobTitle: "",

  serviceCategory: "FTL_TRUCKING",
  cargoType: "FMCG_CONSUMER_GOODS",
  originCity: "",
  destinationCity: "",
  truckType: "ANY_APPROPRIATE",
  estimatedVolumeWeight: "",
  tonnageNeedsConsultation: false,
  estimatedShippingFrequency: "ONE_TIME",
  firstLoadingDate: "",
  scheduleFlexible: false,
  additionalNotes: "",

  honeypot: "",
  formRenderTimestamp: 0,
};

const SERVICE_OPTIONS: Array<{
  id: ServiceCategory;
  title: string;
  badge: string;
  description: string;
  icon: string;
}> = [
  {
    id: "FTL_TRUCKING",
    title: "Full Truckload (FTL)",
    badge: "Paling Populer",
    description: "Carter satu armada penuh point-to-point tanpa transit atau muatan pihak ketiga.",
    icon: "🚚",
  },
  {
    id: "SCHEDULED_LINEHAUL",
    title: "Scheduled Linehaul",
    badge: "Rute Reguler",
    description: "Jadwal keberangkatan tetap di koridor industri utama Jawa, Sumatra, dan Bali.",
    icon: "🛣️",
  },
  {
    id: "CONTRACT_LOGISTICS",
    title: "Dedicated Contract",
    badge: "Kemitraan",
    description: "Armada dan pengemudi terdedikasi jangka panjang untuk manufaktur & FMCG.",
    icon: "🤝",
  },
];

const CARGO_OPTIONS: Array<{ id: CargoClassification; label: string; desc: string }> = [
  { id: "FMCG_CONSUMER_GOODS", label: "FMCG & Konsumsi", desc: "Makanan, minuman kemasan, personal care" },
  { id: "INDUSTRIAL_RAW_MATERIALS", label: "Bahan Baku Industri", desc: "Plastik, resin, drum kimia non-B3" },
  { id: "FINISHED_GOODS", label: "Barang Jadi / Manufaktur", desc: "Produk pabrik dalam karton/palet" },
  { id: "BUILDING_MATERIALS", label: "Material Bangunan", desc: "Keramik, semen, baja, pipa" },
  { id: "ELECTRONICS", label: "Elektronik & Komponen", desc: "Perangkat konsumsi, suku cadang" },
  { id: "OTHER_GENERAL_CARGO", label: "Kargo Umum Lainnya", desc: "Muatan kering umum lainnya" },
];

const FREQUENCY_OPTIONS: Array<{ id: ShippingFrequency; label: string }> = [
  { id: "ONE_TIME", label: "Satu Kali Kirim (Ad-hoc)" },
  { id: "WEEKLY", label: "Rutin Mingguan" },
  { id: "MONTHLY", label: "Rutin Bulanan" },
  { id: "CONTRACT_REGULAR", label: "Kontrak Reguler" },
  { id: "CONSULTATION_NEEDED", label: "Perlu Konsultasi Jadwal" },
];

export function QuoteRequestForm({ initialScenarioId }: QuoteRequestFormProps = {}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [appliedScenario, setAppliedScenario] = useState<LogisticsScenario | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState<boolean>(false);

  // Submission lifecycle states
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error" | "rate_limited">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [submittedReference, setSubmittedReference] = useState<string>("");

  const formTopRef = useRef<HTMLDivElement>(null);

  // Initialize anti-spam timestamp and idempotency key on mount
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      formRenderTimestamp: Date.now(),
    }));
    setIdempotencyKey(`quote-form-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
  }, []);

  // Check for scenario prefill on mount or initialScenarioId prop change
  useEffect(() => {
    let scenarioKey = initialScenarioId;
    if (!scenarioKey && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      scenarioKey = params.get("scenario") || undefined;
    }

    if (scenarioKey) {
      const matched = getScenarioById(scenarioKey);
      if (matched) {
        setAppliedScenario(matched);
        setFormData((prev) => ({
          ...prev,
          serviceCategory: matched.quotePrefill.serviceCategory,
          cargoType: matched.quotePrefill.cargoType,
          truckType: matched.quotePrefill.truckType,
          originCity: matched.quotePrefill.originCity,
          destinationCity: matched.quotePrefill.destinationCity,
          estimatedShippingFrequency: matched.quotePrefill.estimatedShippingFrequency,
        }));
      }
    }
  }, [initialScenarioId]);

  const handleResetScenario = () => {
    setAppliedScenario(null);
    setFormData((prev) => ({
      ...prev,
      serviceCategory: INITIAL_FORM_DATA.serviceCategory,
      cargoType: INITIAL_FORM_DATA.cargoType,
      truckType: INITIAL_FORM_DATA.truckType,
      originCity: INITIAL_FORM_DATA.originCity,
      destinationCity: INITIAL_FORM_DATA.destinationCity,
      estimatedShippingFrequency: INITIAL_FORM_DATA.estimatedShippingFrequency,
    }));
  };

  const scrollToFormTop = () => {
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  // Step 1 Validation
  const validateStep1 = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.contactName.trim() || formData.contactName.trim().length < 2) {
      newErrors.contactName = "Nama lengkap wajib diisi (minimal 2 karakter)";
    }

    if (!formData.companyName.trim() || formData.companyName.trim().length < 2) {
      newErrors.companyName = "Nama perusahaan wajib diisi (minimal 2 karakter)";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.contactEmail.trim()) {
      newErrors.contactEmail = "Email bisnis wajib diisi";
    } else if (!emailRegex.test(formData.contactEmail.trim())) {
      newErrors.contactEmail = "Format email tidak valid (contoh: nama@perusahaan.co.id)";
    }

    const phoneRegex = /^[0-9+\-\s()]{8,30}$/;
    if (!formData.contactPhone.trim()) {
      newErrors.contactPhone = "Nomor WhatsApp/telepon wajib diisi";
    } else if (!phoneRegex.test(formData.contactPhone.trim())) {
      newErrors.contactPhone = "Nomor telepon minimal 8 digit dan hanya berisi angka/tanda +";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const firstErrorKey = Object.keys(newErrors)[0];
      setTimeout(() => {
        document.getElementById(firstErrorKey)?.focus();
      }, 50);
      return false;
    }

    return true;
  };

  // Step 2 Validation
  const validateStep2 = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.originCity.trim() || formData.originCity.trim().length < 2) {
      newErrors.originCity = "Kota/depo asal pengiriman wajib diisi";
    }

    if (!formData.destinationCity.trim() || formData.destinationCity.trim().length < 2) {
      newErrors.destinationCity = "Kota/depo tujuan pengiriman wajib diisi";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const firstErrorKey = Object.keys(newErrors)[0];
      setTimeout(() => {
        document.getElementById(firstErrorKey)?.focus();
      }, 50);
      return false;
    }

    return true;
  };

  const handleNextToStep2 = () => {
    if (validateStep1()) {
      setStep(2);
      scrollToFormTop();
      setTimeout(() => {
        document.getElementById("originCity")?.focus();
      }, 100);
    }
  };

  const handleNextToStep3 = () => {
    if (validateStep2()) {
      setStep(3);
      scrollToFormTop();
    }
  };

  const handleBackToStep1 = () => {
    setStep(1);
    scrollToFormTop();
    setTimeout(() => {
      document.getElementById("contactName")?.focus();
    }, 100);
  };

  const handleBackToStep2 = () => {
    setStep(2);
    scrollToFormTop();
    setTimeout(() => {
      document.getElementById("originCity")?.focus();
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Re-verify both steps
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (!validateStep2()) {
      setStep(2);
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const payload = {
        companyName: formData.companyName.trim(),
        contactName: formData.contactName.trim(),
        contactEmail: formData.contactEmail.trim(),
        contactPhone: formData.contactPhone.trim(),
        jobTitle: formData.jobTitle.trim() || undefined,
        serviceCategory: formData.serviceCategory,
        cargoType: formData.cargoType,
        originCity: formData.originCity.trim(),
        destinationCity: formData.destinationCity.trim(),
        truckType: formData.truckType,
        estimatedVolumeWeight: formData.tonnageNeedsConsultation
          ? "Perlu Konsultasi"
          : formData.estimatedVolumeWeight.trim() || undefined,
        estimatedShippingFrequency: formData.estimatedShippingFrequency,
        firstLoadingDate: formData.scheduleFlexible
          ? "Fleksibel"
          : formData.firstLoadingDate || undefined,
        additionalNotes: formData.additionalNotes.trim() || undefined,
        honeypot: formData.honeypot,
        formRenderTimestamp: formData.formRenderTimestamp,
      };

      const apiEndpoint = `${process.env.NEXT_PUBLIC_API_URL || ""}/api/inquiries`;

      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setStatus("rate_limited");
          setErrorMessage(
            json.error?.message ||
              "Batas pengiriman tercapai (maksimal 5 kali per jam per IP). Silakan hubungi tim CS langsung jika mendesak."
          );
        } else if (res.status === 400 && json.error?.issues) {
          setStatus("error");
          setErrorMessage(
            "Terdapat kesalahan pada data yang Anda kirimkan. Silakan periksa kembali field yang ditandai."
          );
        } else {
          setStatus("error");
          setErrorMessage(
            json.error?.message ||
              "Gagal mengirimkan formulir penawaran. Data Anda tetap tersimpan, silakan coba kirim kembali."
          );
        }
        return;
      }

      // 201 Created: Server confirmed atomic persistence
      setStatus("success");
      setSubmittedReference(json.data?.reference || `TRK-${Math.floor(100000 + Math.random() * 900000)}`);
      scrollToFormTop();
    } catch (err: unknown) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error
          ? `Kendala koneksi jaringan: ${err.message}. Data Anda aman dan tidak terhapus.`
          : "Kendala koneksi ke server. Silakan periksa jaringan internet Anda dan coba lagi."
      );
    }
  };

  const handleReset = () => {
    setFormData({
      ...INITIAL_FORM_DATA,
      formRenderTimestamp: Date.now(),
    });
    setErrors({});
    setIdempotencyKey(`quote-form-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
    setStatus("idle");
    setErrorMessage("");
    setSubmittedReference("");
    setStep(1);
    scrollToFormTop();
  };

  // Helper labels for summary
  const getServiceLabel = (cat: ServiceCategory) => {
    return SERVICE_OPTIONS.find((s) => s.id === cat)?.title || cat;
  };

  const getCargoLabel = (cargo: CargoClassification) => {
    return CARGO_OPTIONS.find((c) => c.id === cargo)?.label || cargo;
  };

  const getFrequencyLabel = (freq: ShippingFrequency) => {
    return FREQUENCY_OPTIONS.find((f) => f.id === freq)?.label || freq;
  };

  // Derived progress percentages
  const progressPercent = step === 1 ? 33 : step === 2 ? 66 : 100;

  // Live Data Completeness & Group Status (Section 6: Live Quotation Summary)
  const isGroup1Complete =
    formData.contactName.trim().length >= 2 &&
    formData.companyName.trim().length >= 2 &&
    formData.contactEmail.includes("@") &&
    formData.contactPhone.trim().length >= 8;

  const isGroup2Complete =
    Boolean(formData.serviceCategory) &&
    formData.originCity.trim().length >= 2 &&
    formData.destinationCity.trim().length >= 2;

  const coreCompletenessItems = [
    Boolean(formData.contactName.trim().length >= 2),
    Boolean(formData.companyName.trim().length >= 2),
    Boolean(formData.contactEmail.includes("@")),
    Boolean(formData.contactPhone.trim().length >= 8),
    Boolean(formData.serviceCategory),
    Boolean(formData.originCity.trim().length >= 2),
    Boolean(formData.destinationCity.trim().length >= 2),
  ];
  const completedParametersCount = coreCompletenessItems.filter(Boolean).length;
  const totalCoreParameters = 7;
  const completenessPercent = Math.round((completedParametersCount / totalCoreParameters) * 100);

  return (
    <div ref={formTopRef} style={{ width: "100%", margin: "0 auto" }}>
      {/* Contextual Scenario Prefill Alert Banner (Section 6) */}
      {appliedScenario && (
        <div
          style={{
            backgroundColor: "#EAF3FF",
            border: "1px solid #D7E2EF",
            borderRadius: "8px",
            padding: "16px 20px",
            marginBottom: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
          }}
          role="status"
          aria-live="polite"
        >
          <div style={{ maxWidth: "780px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.75rem",
                color: "#123B70",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "4px",
              }}
            >
              <span>📋</span>
              <span>Preferensi Awal Berdasarkan Skenario: {appliedScenario.title}</span>
            </div>
            <p style={{ fontSize: "0.875rem", color: "#172B45", margin: "4px 0 0", lineHeight: 1.5 }}>
              Data rute rekomendasi (<strong>{appliedScenario.originDestination}</strong>), jenis muatan (<strong>{appliedScenario.cargoCharacteristics}</strong>),
              dan tipe armada telah diisi secara otomatis sebagai acuan awal.{" "}
              <em>Konteks ini merupakan preferensi awal, bukan kontrak atau konfirmasi layanan.</em> Anda
              memiliki kebebasan penuh untuk mengubah seluruh pilihan sesuai kebutuhan riil perusahaan Anda
              sebelum menyelesaikan formulir.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetScenario}
            style={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #D7E2EF",
              color: "#60738A",
              fontSize: "0.8125rem",
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: "6px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
            aria-label="Batalkan skenario dan reset preferensi formulir"
          >
            Reset ke Form Kosong ✕
          </button>
        </div>
      )}

      {/* Dynamic Progress Indicator (Section 5) */}
      <div
        className="card"
        style={{
          padding: "20px 24px",
          marginBottom: "28px",
          backgroundColor: "#FFFFFF",
          border: "1px solid #D7E2EF",
          boxShadow: "0 2px 8px rgba(18, 59, 112, 0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#60738A", fontWeight: 700 }}>
            Progres Permohonan Penawaran
          </span>
          <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1D5FA7" }}>
            {progressPercent}% Selesai (Langkah {step} dari 3)
          </span>
        </div>

        {/* Linear Track Fill */}
        <div style={{ width: "100%", height: "6px", backgroundColor: "#EEF3F9", borderRadius: "9999px", overflow: "hidden", marginBottom: "20px" }}>
          <div
            style={{
              width: `${progressPercent}%`,
              height: "100%",
              backgroundColor: progressPercent === 100 ? "#15803D" : "#1D5FA7",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {/* Clickable Step Pills */}
        <div className="step-indicator" role="navigation" aria-label="Langkah Permintaan Penawaran" style={{ margin: 0 }}>
          <button
            type="button"
            className={`step-item ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}
            onClick={() => step > 1 && setStep(1)}
            aria-label="Kembali ke Langkah 1: Kontak & Perusahaan"
            style={{ opacity: step === 1 || step > 1 ? 1 : 0.6 }}
          >
            <div className="step-circle">{step > 1 ? "✓" : "1"}</div>
            <span className="step-label">01 Kontak</span>
          </button>

          <button
            type="button"
            className={`step-item ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}
            onClick={() => {
              if (step > 2) setStep(2);
              else if (step === 1 && validateStep1()) setStep(2);
            }}
            aria-label="Langkah 2: Pengiriman"
            style={{ opacity: step === 2 || step > 2 ? 1 : 0.6 }}
          >
            <div className="step-circle">{step > 2 ? "✓" : "2"}</div>
            <span className="step-label">02 Pengiriman</span>
          </button>

          <button
            type="button"
            className={`step-item ${step === 3 ? "active" : ""}`}
            onClick={() => {
              if (validateStep1() && validateStep2()) setStep(3);
            }}
            aria-label="Langkah 3: Konfirmasi"
            style={{ opacity: step === 3 ? 1 : 0.6 }}
          >
            <div className="step-circle">3</div>
            <span className="step-label">03 Konfirmasi</span>
          </button>
        </div>
      </div>

      {/* Mobile Collapsible Summary Accordion Bar */}
      <div className="mobile-summary-toggle" style={{ marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => setMobileSummaryOpen(!mobileSummaryOpen)}
          style={{
            width: "100%",
            padding: "12px 16px",
            backgroundColor: "#FFFFFF",
            border: "1px solid #D7E2EF",
            borderRadius: "6px",
            color: "#172B45",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
          aria-expanded={mobileSummaryOpen}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📋</span>
            <span>
              Ringkasan Kebutuhan:{" "}
              <strong style={{ color: "#1D5FA7" }}>
                {formData.originCity && formData.destinationCity
                  ? `${formData.originCity} ke ${formData.destinationCity}`
                  : "Dalam Pengisian"}
              </strong>
            </span>
          </span>
          <span style={{ color: "#1D5FA7" }}>{mobileSummaryOpen ? "Tutup ▲" : "Buka ▼"}</span>
        </button>
      </div>

      {/* Workspace Grid (Section 3.D): Left Form (7.5fr) | Right Guidance & Summary Panel (4.5fr) */}
      <div className="quote-workspace-grid">
        {/* ================= LEFT COLUMN: FORM FLOW ================= */}
        <div style={{ width: "100%" }}>
          {/* SUCCESS STATE */}
          {status === "success" ? (
            <div
              className="card animate-fade-in"
              style={{
                backgroundColor: "#F0FDF4",
                border: "2px solid #15803D",
                padding: "40px 32px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(21, 128, 61, 0.15)",
                  color: "#15803D",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "2rem",
                  marginBottom: "20px",
                }}
              >
                ✓
              </div>
              <h2
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 800,
                  color: "#15803D",
                  marginBottom: "12px",
                }}
              >
                Permintaan Penawaran Berhasil Diterima
              </h2>
              <div
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #86EFAC",
                  borderRadius: "6px",
                  marginBottom: "20px",
                }}
              >
                <span style={{ fontSize: "0.8125rem", color: "#60738A" }}>
                  Nomor Referensi Resmi Server:
                </span>{" "}
                <strong style={{ fontSize: "1.125rem", color: "#15803D", letterSpacing: "0.05em" }} className="tabular-nums">
                  {submittedReference}
                </strong>
              </div>
              <p
                style={{
                  color: "#172B45",
                  fontSize: "1rem",
                  lineHeight: 1.6,
                  maxWidth: "640px",
                  margin: "0 auto 24px",
                }}
              >
                Data spesifikasi rute dan muatan Anda telah tersimpan dengan aman di antrean sistem
                komersial kami. Tim komersial PT Trukindo Logistik Prima akan meninjau ketersediaan
                armada dan koridor rute untuk menyiapkan kalkulasi penawaran resmi.
              </p>
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #D7E2EF",
                  borderRadius: "6px",
                  maxWidth: "540px",
                  margin: "0 auto 28px",
                  textAlign: "left",
                  fontSize: "0.875rem",
                  color: "#60738A",
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: "#172B45" }}>Catatan Integritas Komersial:</strong> Penawaran dan tarif resmi
                memerlukan verifikasi spesifikasi fisik muatan. Tidak ada tarif final yang ditentukan
                secara otomatis oleh sistem tanpa tinjauan tim komersial.
              </div>
              <button type="button" onClick={handleReset} className="btn btn-primary" style={{ padding: "12px 28px" }}>
                Kirim Permintaan Lainnya
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate id="quote-form">
              {/* Invisible Honeypot Anti-Spam Field */}
              <div style={{ position: "absolute", left: "-9999px", opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
                <label htmlFor="company_code_hp">Jangan isi field ini:</label>
                <input
                  id="company_code_hp"
                  type="text"
                  name="honeypot"
                  value={formData.honeypot}
                  onChange={handleInputChange}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* Error Alert Banner */}
              {(status === "error" || status === "rate_limited") && (
                <div
                  className="animate-fade-in"
                  role="alert"
                  style={{
                    backgroundColor: "#FEF2F2",
                    border: "1px solid #B91C1C",
                    borderRadius: "6px",
                    padding: "16px",
                    marginBottom: "24px",
                    color: "#B91C1C",
                    fontSize: "0.9375rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div>
                    <strong>Pemberitahuan Sistem:</strong> {errorMessage}
                  </div>
                  {status === "error" && (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="btn btn-sm"
                      style={{ backgroundColor: "#B91C1C", color: "#fff", whiteSpace: "nowrap", padding: "6px 14px", borderRadius: "4px" }}
                    >
                      Coba Lagi
                    </button>
                  )}
                </div>
              )}

              {/* ================= STEP 1: KONTAK & PERUSAHAAN ================= */}
              {step === 1 && (
                <div className="card animate-fade-in" style={{ padding: "32px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF", boxShadow: "0 4px 12px rgba(18, 59, 112, 0.05)" }}>
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontSize: "0.75rem", color: "#1D5FA7", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                      Langkah 1 dari 3
                    </div>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0B2D52", letterSpacing: "-0.015em" }}>
                      Informasi Kontak & Perusahaan
                    </h2>
                    <p style={{ color: "#60738A", fontSize: "0.875rem", marginTop: "4px", lineHeight: 1.5 }}>
                      Pastikan kontak PIC valid agar tim komersial kami dapat mengonfirmasi rute muat depo & jadwal loading.
                    </p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "20px" }}>
                    <div>
                      <label className="form-label" htmlFor="contactName">
                        Nama Lengkap PIC <span style={{ color: "#B91C1C" }}>*</span>
                      </label>
                      <input
                        id="contactName"
                        name="contactName"
                        type="text"
                        autoComplete="name"
                        placeholder="Masukkan nama lengkap Anda"
                        value={formData.contactName}
                        onChange={handleInputChange}
                        aria-invalid={errors.contactName ? "true" : "false"}
                        className={`form-input ${errors.contactName ? "has-error" : ""}`}
                      />
                      {errors.contactName && <div className="form-error">⚠ {errors.contactName}</div>}
                    </div>

                    <div>
                      <label className="form-label" htmlFor="companyName">
                        Nama Badan Usaha / Perusahaan <span style={{ color: "#B91C1C" }}>*</span>
                      </label>
                      <input
                        id="companyName"
                        name="companyName"
                        type="text"
                        autoComplete="organization"
                        placeholder="Contoh: PT Manufaktur Maju Gemilang"
                        value={formData.companyName}
                        onChange={handleInputChange}
                        aria-invalid={errors.companyName ? "true" : "false"}
                        className={`form-input ${errors.companyName ? "has-error" : ""}`}
                      />
                      {errors.companyName && <div className="form-error">⚠ {errors.companyName}</div>}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "20px" }}>
                    <div>
                      <label className="form-label" htmlFor="contactEmail">
                        Email Bisnis Perusahaan <span style={{ color: "#B91C1C" }}>*</span>
                      </label>
                      <input
                        id="contactEmail"
                        name="contactEmail"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="nama@perusahaan.co.id"
                        value={formData.contactEmail}
                        onChange={handleInputChange}
                        aria-invalid={errors.contactEmail ? "true" : "false"}
                        className={`form-input ${errors.contactEmail ? "has-error" : ""}`}
                      />
                      {errors.contactEmail && <div className="form-error">⚠ {errors.contactEmail}</div>}
                    </div>

                    <div>
                      <label className="form-label" htmlFor="contactPhone">
                        Nomor WhatsApp / Telepon <span style={{ color: "#B91C1C" }}>*</span>
                      </label>
                      <input
                        id="contactPhone"
                        name="contactPhone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="08123456789 atau +62812..."
                        value={formData.contactPhone}
                        onChange={handleInputChange}
                        aria-invalid={errors.contactPhone ? "true" : "false"}
                        className={`form-input ${errors.contactPhone ? "has-error" : ""}`}
                      />
                      {errors.contactPhone && <div className="form-error">⚠ {errors.contactPhone}</div>}
                    </div>
                  </div>

                  <div style={{ marginBottom: "28px" }}>
                    <label className="form-label" htmlFor="jobTitle">
                      Jabatan atau Divisi <span style={{ color: "#60738A", fontWeight: 400 }}>(Opsional)</span>
                    </label>
                    <input
                      id="jobTitle"
                      name="jobTitle"
                      type="text"
                      placeholder="Contoh: Logistics Manager, Procurement Officer, Supply Chain Lead"
                      value={formData.jobTitle}
                      onChange={handleInputChange}
                      className="form-input"
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={handleNextToStep2}
                      className="btn btn-primary"
                      style={{ padding: "12px 28px", fontSize: "0.9375rem" }}
                    >
                      Lanjut ke Spesifikasi Muatan →
                    </button>
                  </div>
                </div>
              )}

              {/* ================= STEP 2: SPESIFIKASI & RUTE MUATAN ================= */}
              {step === 2 && (
                <div className="card animate-fade-in" style={{ padding: "32px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF", boxShadow: "0 4px 12px rgba(18, 59, 112, 0.05)" }}>
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontSize: "0.75rem", color: "#1D5FA7", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                      Langkah 2 dari 3
                    </div>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0B2D52", letterSpacing: "-0.015em" }}>
                      Spesifikasi Muatan dan Rute Pengiriman
                    </h2>
                    <p style={{ color: "#60738A", fontSize: "0.875rem", marginTop: "4px", lineHeight: 1.5 }}>
                      Tentukan kategori layanan, karakteristik kargo, dan koridor titik rute pengiriman B2B Anda.
                    </p>
                  </div>

                  {/* Kategori Layanan Cards */}
                  <div style={{ marginBottom: "28px" }}>
                    <label className="form-label" style={{ marginBottom: "12px" }}>
                      Kategori Layanan Transportasi <span style={{ color: "#B91C1C" }}>*</span>
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
                      {SERVICE_OPTIONS.map((svc) => (
                        <div
                          key={svc.id}
                          onClick={() => setFormData((prev) => ({ ...prev, serviceCategory: svc.id }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setFormData((prev) => ({ ...prev, serviceCategory: svc.id }));
                            }
                          }}
                          className={`form-card-selectable ${formData.serviceCategory === svc.id ? "selected" : ""}`}
                          role="radio"
                          aria-checked={formData.serviceCategory === svc.id}
                          tabIndex={0}
                          style={{
                            padding: "18px",
                            borderRadius: "8px",
                            backgroundColor: formData.serviceCategory === svc.id ? "#EAF3FF" : "#FFFFFF",
                            border: formData.serviceCategory === svc.id ? "1.5px solid #1D5FA7" : "1px solid #D7E2EF",
                            cursor: "pointer",
                          }}
                        >
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                              <span style={{ fontSize: "1.25rem" }}>{svc.icon}</span>
                              <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: "4px", backgroundColor: formData.serviceCategory === svc.id ? "rgba(29, 95, 167, 0.15)" : "#EEF3F9", color: formData.serviceCategory === svc.id ? "#123B70" : "#60738A", fontWeight: 700 }}>
                                {svc.badge}
                              </span>
                            </div>
                            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0B2D52", marginBottom: "6px" }}>
                              {svc.title}
                            </h3>
                            <p style={{ fontSize: "0.8125rem", color: "#60738A", lineHeight: 1.5 }}>
                              {svc.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Group A: Kebutuhan Pengiriman */}
                  <div style={{ padding: "20px", backgroundColor: "#F7FAFE", borderRadius: "8px", border: "1px solid #D7E2EF", marginBottom: "24px" }}>
                    <div style={{ fontSize: "0.8125rem", color: "#123B70", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "16px" }}>
                      Kebutuhan Pengiriman & Karakteristik Muatan
                    </div>

                    {/* Jenis Muatan Grid */}
                    <div style={{ marginBottom: "20px" }}>
                      <label className="form-label" style={{ marginBottom: "10px" }}>
                        Karakteristik / Jenis Muatan <span style={{ color: "#B91C1C" }}>*</span>
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                        {CARGO_OPTIONS.map((cargo) => (
                          <div
                            key={cargo.id}
                            onClick={() => setFormData((prev) => ({ ...prev, cargoType: cargo.id }))}
                            className={`form-card-selectable ${formData.cargoType === cargo.id ? "selected" : ""}`}
                            role="radio"
                            aria-checked={formData.cargoType === cargo.id}
                            tabIndex={0}
                            style={{
                              padding: "12px 14px",
                              backgroundColor: formData.cargoType === cargo.id ? "#EAF3FF" : "#FFFFFF",
                              border: formData.cargoType === cargo.id ? "1.5px solid #1D5FA7" : "1px solid #D7E2EF",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 600, fontSize: "0.875rem", color: formData.cargoType === cargo.id ? "#123B70" : "#172B45" }}>
                                {cargo.label}
                              </span>
                              {formData.cargoType === cargo.id && (
                                <span style={{ color: "#1D5FA7", fontWeight: 800, fontSize: "0.875rem" }}>✓</span>
                              )}
                            </div>
                            <span style={{ fontSize: "0.75rem", color: "#60738A", marginTop: "4px", display: "block" }}>
                              {cargo.desc}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Frekuensi dan Volume */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
                      <div>
                        <label className="form-label" htmlFor="estimatedShippingFrequency">
                          Frekuensi Pengiriman <span style={{ color: "#B91C1C" }}>*</span>
                        </label>
                        <select
                          id="estimatedShippingFrequency"
                          name="estimatedShippingFrequency"
                          value={formData.estimatedShippingFrequency}
                          onChange={handleInputChange}
                          className="form-input"
                        >
                          {FREQUENCY_OPTIONS.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <label className="form-label" htmlFor="estimatedVolumeWeight" style={{ marginBottom: 0 }}>
                            Estimasi Tonase / Volume
                          </label>
                          <label style={{ fontSize: "0.75rem", color: "#60738A", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              name="tonnageNeedsConsultation"
                              checked={formData.tonnageNeedsConsultation}
                              onChange={handleInputChange}
                            />
                            Perlu Konsultasi
                          </label>
                        </div>
                        <input
                          id="estimatedVolumeWeight"
                          name="estimatedVolumeWeight"
                          type="text"
                          disabled={formData.tonnageNeedsConsultation}
                          placeholder={formData.tonnageNeedsConsultation ? "Akan dikonsultasikan bersama tim" : "Contoh: 15 Ton / 40 CBM"}
                          value={formData.tonnageNeedsConsultation ? "" : formData.estimatedVolumeWeight}
                          onChange={handleInputChange}
                          className="form-input"
                        />
                        {/* Quick Payload Capacity Presets */}
                        {!formData.tonnageNeedsConsultation && (
                          <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "0.6875rem", color: "#60738A" }}>Preset Kapasitas:</span>
                            <button
                              type="button"
                              className="preset-pill"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  estimatedVolumeWeight: "2 - 3 Ton (~12 CBM)",
                                  tonnageNeedsConsultation: false,
                                }));
                              }}
                            >
                              2-3 Ton (CDE)
                            </button>
                            <button
                              type="button"
                              className="preset-pill"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  estimatedVolumeWeight: "4 - 5 Ton (~24 CBM)",
                                  tonnageNeedsConsultation: false,
                                }));
                              }}
                            >
                              4-5 Ton (CDD)
                            </button>
                            <button
                              type="button"
                              className="preset-pill"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  estimatedVolumeWeight: "8 - 10 Ton (~35 CBM)",
                                  tonnageNeedsConsultation: false,
                                }));
                              }}
                            >
                              8-10 Ton (Fuso)
                            </button>
                            <button
                              type="button"
                              className="preset-pill"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  estimatedVolumeWeight: "15 - 20 Ton (~45 CBM)",
                                  tonnageNeedsConsultation: false,
                                }));
                              }}
                            >
                              15-20 Ton (Tronton)
                            </button>
                            <button
                              type="button"
                              className="preset-pill"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  estimatedVolumeWeight: "25 - 30 Ton (~60 CBM)",
                                  tonnageNeedsConsultation: false,
                                }));
                              }}
                            >
                              25-30 Ton (Trailer)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Group B: Rute Pengiriman */}
                  <div style={{ padding: "20px", backgroundColor: "#F7FAFE", borderRadius: "8px", border: "1px solid #D7E2EF", marginBottom: "24px" }}>
                    <div style={{ fontSize: "0.8125rem", color: "#123B70", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "14px" }}>
                      Koridor Rute & Jadwal Pengiriman
                    </div>

                    {/* Quick Corridor Selection */}
                    <div style={{ marginBottom: "16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.75rem", color: "#60738A", fontWeight: 600 }}>Rute Cepat:</span>
                      <button
                        type="button"
                        className="preset-pill"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            originCity: "Kawasan Industri GIIC Cikarang",
                            destinationCity: "Rungkut Industri Surabaya",
                          }));
                          setErrors((prev) => ({ ...prev, originCity: undefined, destinationCity: undefined }));
                        }}
                      >
                        Jabodetabek → Surabaya
                      </button>
                      <button
                        type="button"
                        className="preset-pill"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            originCity: "KIIC Karawang",
                            destinationCity: "Kawasan Industri Candi Semarang",
                          }));
                          setErrors((prev) => ({ ...prev, originCity: undefined, destinationCity: undefined }));
                        }}
                      >
                        Karawang → Semarang
                      </button>
                      <button
                        type="button"
                        className="preset-pill"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            originCity: "Tanjung Priok, Jakarta",
                            destinationCity: "KIM Medan",
                          }));
                          setErrors((prev) => ({ ...prev, originCity: undefined, destinationCity: undefined }));
                        }}
                      >
                        Jakarta → Medan
                      </button>
                      <button
                        type="button"
                        className="preset-pill"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            originCity: "Surabaya, Jawa Timur",
                            destinationCity: "Denpasar, Bali",
                          }));
                          setErrors((prev) => ({ ...prev, originCity: undefined, destinationCity: undefined }));
                        }}
                      >
                        Surabaya → Denpasar
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px", marginBottom: "20px" }}>
                      <div>
                        <label className="form-label" htmlFor="originCity">
                          Kota / Depo Asal Muat <span style={{ color: "#B91C1C" }}>*</span>
                        </label>
                        <input
                          id="originCity"
                          name="originCity"
                          type="text"
                          placeholder="Contoh: Kawasan Industri GIIC Cikarang"
                          value={formData.originCity}
                          onChange={handleInputChange}
                          aria-invalid={errors.originCity ? "true" : "false"}
                          className={`form-input ${errors.originCity ? "has-error" : ""}`}
                        />
                        {errors.originCity && <div className="form-error">⚠ {errors.originCity}</div>}
                      </div>

                      <div>
                        <label className="form-label" htmlFor="destinationCity">
                          Kota / Depo Tujuan Bongkar <span style={{ color: "#B91C1C" }}>*</span>
                        </label>
                        <input
                          id="destinationCity"
                          name="destinationCity"
                          type="text"
                          placeholder="Contoh: Rungkut Industri Surabaya"
                          value={formData.destinationCity}
                          onChange={handleInputChange}
                          aria-invalid={errors.destinationCity ? "true" : "false"}
                          className={`form-input ${errors.destinationCity ? "has-error" : ""}`}
                        />
                        {errors.destinationCity && <div className="form-error">⚠ {errors.destinationCity}</div>}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <label className="form-label" htmlFor="firstLoadingDate" style={{ marginBottom: 0 }}>
                            Jadwal Muat Perdana
                          </label>
                          <label style={{ fontSize: "0.75rem", color: "#60738A", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              name="scheduleFlexible"
                              checked={formData.scheduleFlexible}
                              onChange={handleInputChange}
                            />
                            Jadwal Fleksibel
                          </label>
                        </div>
                        <input
                          id="firstLoadingDate"
                          name="firstLoadingDate"
                          type={formData.scheduleFlexible ? "text" : "date"}
                          disabled={formData.scheduleFlexible}
                          placeholder={formData.scheduleFlexible ? "Fleksibel / Sesuai Kesepakatan" : ""}
                          value={formData.scheduleFlexible ? "" : formData.firstLoadingDate}
                          onChange={handleInputChange}
                          className="form-input"
                        />
                      </div>

                      <div>
                        <label className="form-label" htmlFor="truckType">
                          Preferensi Tipe Armada
                        </label>
                        <select
                          id="truckType"
                          name="truckType"
                          value={formData.truckType}
                          onChange={handleInputChange}
                          className="form-input"
                        >
                          <option value="ANY_APPROPRIATE">Sesuai Rekomendasi Trukindo</option>
                          <option value="CDE_ENGKEL">CDE (Colt Diesel Engkel - 4 Ban)</option>
                          <option value="CDD_DOUBLE">CDD (Colt Diesel Double - 6 Ban)</option>
                          <option value="FUSO">Fuso Berat (6 Ban)</option>
                          <option value="TRONTON_WINGBOX">Tronton Wingbox (10 Ban)</option>
                          <option value="TRONTON_BOX">Tronton Box Tertutup (10 Ban)</option>
                          <option value="TRAILER_20FT">Trailer 20ft Container</option>
                          <option value="TRAILER_40FT">Trailer 40ft Container</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "28px" }}>
                    <label className="form-label" htmlFor="additionalNotes">
                      Catatan Tambahan & Instruksi Khusus <span style={{ color: "#60738A", fontWeight: 400 }}>(Opsional)</span>
                    </label>
                    <textarea
                      id="additionalNotes"
                      name="additionalNotes"
                      rows={3}
                      placeholder="Informasikan instruksi penanganan khusus, kebutuhan segel, batas jam bongkar muat gudang, atau dokumen perjalanan yang diperlukan."
                      value={formData.additionalNotes}
                      onChange={handleInputChange}
                      className="form-input"
                      style={{ resize: "vertical" }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                    <button
                      type="button"
                      onClick={handleBackToStep1}
                      className="btn btn-secondary"
                      style={{ padding: "10px 20px" }}
                    >
                      Kembali
                    </button>
                    <button
                      type="button"
                      onClick={handleNextToStep3}
                      className="btn btn-primary"
                      style={{ padding: "12px 28px", fontSize: "0.9375rem" }}
                    >
                      Lanjut ke Ringkasan & Konfirmasi →
                    </button>
                  </div>
                </div>
              )}

              {/* ================= STEP 3: RINGKASAN & KONFIRMASI ================= */}
              {step === 3 && (
                <div className="card animate-fade-in" style={{ padding: "32px", backgroundColor: "#FFFFFF", border: "1px solid #D7E2EF", boxShadow: "0 4px 12px rgba(18, 59, 112, 0.05)" }}>
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontSize: "0.75rem", color: "#1D5FA7", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                      Langkah 3 dari 3
                    </div>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0B2D52", letterSpacing: "-0.015em" }}>
                      Ringkasan dan Konfirmasi Permintaan
                    </h2>
                    <p style={{ color: "#60738A", fontSize: "0.875rem", marginTop: "4px", lineHeight: 1.5 }}>
                      Tinjau rincian kebutuhan Anda sebelum mengirimkan permohonan penawaran resmi kepada tim komersial kami.
                    </p>
                  </div>

                  {/* Summary Blocks with Direct Edit Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "28px" }}>
                    {/* Block 1: Kontak & Perusahaan */}
                    <div style={{ backgroundColor: "#F7FAFE", border: "1px solid #D7E2EF", borderRadius: "8px", padding: "18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                        <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#0B2D52" }}>
                          1. Kontak & Perusahaan
                        </h3>
                        <button
                          type="button"
                          onClick={handleBackToStep1}
                          className="btn btn-outline btn-sm"
                          style={{ borderColor: "#D7E2EF", color: "#1D5FA7", padding: "4px 12px" }}
                        >
                          Ubah
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", fontSize: "0.875rem" }}>
                        <div>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Nama PIC:</span>
                          <strong style={{ color: "#172B45" }}>{formData.contactName || "-"}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Perusahaan:</span>
                          <strong style={{ color: "#172B45" }}>{formData.companyName || "-"}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Email Bisnis:</span>
                          <strong style={{ color: "#172B45" }}>{formData.contactEmail || "-"}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Telepon / WhatsApp:</span>
                          <strong style={{ color: "#172B45" }}>{formData.contactPhone || "-"}</strong>
                        </div>
                        {formData.jobTitle && (
                          <div>
                            <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Jabatan / Divisi:</span>
                            <strong style={{ color: "#172B45" }}>{formData.jobTitle}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Block 2: Layanan & Muatan */}
                    <div style={{ backgroundColor: "#F7FAFE", border: "1px solid #D7E2EF", borderRadius: "8px", padding: "18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                        <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#0B2D52" }}>
                          2. Layanan & Muatan
                        </h3>
                        <button
                          type="button"
                          onClick={handleBackToStep2}
                          className="btn btn-outline btn-sm"
                          style={{ borderColor: "#D7E2EF", color: "#1D5FA7", padding: "4px 12px" }}
                        >
                          Ubah
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", fontSize: "0.875rem" }}>
                        <div>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Model Layanan:</span>
                          <strong style={{ color: "#1D5FA7" }}>{getServiceLabel(formData.serviceCategory)}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Jenis Kargo:</span>
                          <strong style={{ color: "#172B45" }}>{getCargoLabel(formData.cargoType)}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Frekuensi Pengiriman:</span>
                          <strong style={{ color: "#172B45" }}>{getFrequencyLabel(formData.estimatedShippingFrequency)}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Estimasi Tonase / Volume:</span>
                          <strong style={{ color: "#172B45" }}>
                            {formData.tonnageNeedsConsultation ? "Perlu Konsultasi" : formData.estimatedVolumeWeight || "Belum ditentukan"}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Block 3: Rute & Jadwal */}
                    <div style={{ backgroundColor: "#F7FAFE", border: "1px solid #D7E2EF", borderRadius: "8px", padding: "18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                        <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#0B2D52" }}>
                          3. Rute & Jadwal
                        </h3>
                        <button
                          type="button"
                          onClick={handleBackToStep2}
                          className="btn btn-outline btn-sm"
                          style={{ borderColor: "#D7E2EF", color: "#1D5FA7", padding: "4px 12px" }}
                        >
                          Ubah
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", fontSize: "0.875rem" }}>
                        <div>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Rute Koridor:</span>
                          <strong style={{ color: "#172B45" }}>
                            {formData.originCity} → {formData.destinationCity}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Jadwal Muat Perdana:</span>
                          <strong style={{ color: "#172B45" }}>
                            {formData.scheduleFlexible ? "Fleksibel" : formData.firstLoadingDate || "Belum ditentukan"}
                          </strong>
                        </div>
                      </div>
                      {formData.additionalNotes && (
                        <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #D7E2EF", fontSize: "0.875rem" }}>
                          <span style={{ color: "#60738A", display: "block", fontSize: "0.8125rem" }}>Catatan Khusus:</span>
                          <p style={{ color: "#172B45", marginTop: "2px" }}>{formData.additionalNotes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mandatory CRO Commercial Integrity Disclaimers (Section 4 & 7) */}
                  <div
                    style={{
                      backgroundColor: "#EAF3FF",
                      border: "1px solid #D7E2EF",
                      borderRadius: "8px",
                      padding: "16px",
                      marginBottom: "28px",
                      fontSize: "0.875rem",
                      color: "#172B45",
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <span style={{ color: "#1D5FA7", fontSize: "1.125rem" }}>ℹ</span>
                      <div>
                        <strong style={{ color: "#123B70", display: "block", marginBottom: "4px" }}>
                          Pernyataan Integritas Komersial:
                        </strong>
                        Permintaan ini digunakan untuk meninjau kebutuhan pengiriman dan menyusun tindak lanjut komersial.
                        Penawaran dan tarif resmi menunggu konfirmasi spesifikasi fisik kargo serta jadwal transit oleh tim terkait.
                        Sistem kami tidak menghasilkan penawaran atau tarif final instan tanpa verifikasi profesional.
                      </div>
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                    <button
                      type="button"
                      onClick={handleBackToStep2}
                      disabled={status === "submitting"}
                      className="btn btn-secondary"
                      style={{ padding: "10px 20px" }}
                    >
                      Kembali ke Formulir
                    </button>
                    <button
                      type="submit"
                      disabled={status === "submitting"}
                      className="btn btn-primary"
                      style={{ padding: "14px 32px", fontSize: "1rem", fontWeight: 700 }}
                    >
                      {status === "submitting" ? (
                        <>
                          <span className="spinner" style={{ marginRight: "8px" }} />
                          Mengirim Permintaan Penawaran...
                        </>
                      ) : (
                        "Kirim Permintaan Penawaran"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        {/* ================= RIGHT COLUMN: CONTEXTUAL QUOTATION ASSISTANCE PANEL (Section 6) ================= */}
        <aside
          className={`quote-guidance-panel ${mobileSummaryOpen ? "mobile-open" : ""}`}
          style={{
            position: "sticky",
            top: "92px",
            width: "100%",
          }}
          aria-label="Panel Ringkasan Kebutuhan Pengiriman"
        >
          <div
            className="card"
            style={{
              padding: "24px",
              backgroundColor: "#FFFFFF",
              border: "1px solid #D7E2EF",
              borderRadius: "8px",
              boxShadow: "0 4px 16px rgba(18, 59, 112, 0.06)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "14px", borderBottom: "1px solid #D7E2EF", marginBottom: "16px" }}>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#60738A", fontWeight: 700 }}>
                Ringkasan Permintaan
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "3px 10px",
                  borderRadius: "4px",
                  backgroundColor: "#EAF3FF",
                  color: "#123B70",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  border: "1px solid #D7E2EF",
                }}
              >
                Langkah {step} dari 3
              </span>
            </div>

            {/* Overall Data Completeness Gauge (Section 6) */}
            <div
              style={{
                marginBottom: "16px",
                padding: "12px 14px",
                backgroundColor: "#F7FAFE",
                borderRadius: "6px",
                border: "1px solid #D7E2EF",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#172B45" }}>
                  Kelengkapan Parameter
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: completenessPercent === 100 ? "#15803D" : "#1D5FA7" }}>
                  {completedParametersCount} dari {totalCoreParameters} ({completenessPercent}%)
                </span>
              </div>
              <div style={{ width: "100%", height: "6px", backgroundColor: "#EEF3F9", borderRadius: "9999px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${completenessPercent}%`,
                    height: "100%",
                    backgroundColor: completenessPercent === 100 ? "#15803D" : "#1D5FA7",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: "0.6875rem", color: "#60738A", marginTop: "6px", lineHeight: 1.4 }}>
                Menunjukkan kelengkapan data administratif, bukan estimasi harga atau ketersediaan armada.
              </div>
            </div>

            {/* Group 1: Entity / PIC */}
            <div style={{ marginBottom: "16px", paddingBottom: "14px", borderBottom: "1px solid #D7E2EF" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "0.75rem", color: "#60738A", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>
                  1. Kontak & Perusahaan
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      color: isGroup1Complete ? "#15803D" : "#60738A",
                    }}
                  >
                    {isGroup1Complete ? "✓ Lengkap" : "○ Belum Lengkap"}
                  </span>
                  <button
                    type="button"
                    onClick={handleBackToStep1}
                    aria-label="Ubah Kontak"
                    style={{
                      background: "transparent",
                      border: "1px solid #D7E2EF",
                      color: "#1D5FA7",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {step === 1 ? "Aktif" : "Ubah Kontak"}
                  </button>
                </div>
              </div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#172B45", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {formData.companyName.trim() || <span style={{ color: "#60738A", fontWeight: 400 }}>Nama Perusahaan: Belum diisi</span>}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "#60738A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: "2px" }}>
                {formData.contactName.trim() ? (
                  `${formData.contactName}${formData.jobTitle ? ` • ${formData.jobTitle}` : ""}`
                ) : (
                  <span style={{ color: "#94A3B8" }}>PIC: Belum ditentukan</span>
                )}
              </div>
            </div>

            {/* Group 2: Service, Cargo, Frequency, Tonnage & Route */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.75rem", color: "#60738A", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>
                  2. Spesifikasi & Rute
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      color: isGroup2Complete ? "#15803D" : "#60738A",
                    }}
                  >
                    {isGroup2Complete ? "✓ Lengkap" : "○ Belum Lengkap"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (step === 1) {
                        handleNextToStep2();
                      } else {
                        handleBackToStep2();
                      }
                    }}
                    aria-label="Ubah Rute"
                    style={{
                      background: "transparent",
                      border: "1px solid #D7E2EF",
                      color: "#1D5FA7",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {step === 2 ? "Aktif" : "Ubah Rute"}
                  </button>
                </div>
              </div>

              {/* Service & Cargo Snapshot */}
              <div style={{ padding: "12px", backgroundColor: "#F7FAFE", borderRadius: "6px", border: "1px solid #D7E2EF", marginBottom: "12px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8125rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#60738A" }}>Moda Layanan:</span>
                  <span style={{ color: "#1D5FA7", fontWeight: 700 }}>{getServiceLabel(formData.serviceCategory)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#60738A" }}>Karakter Muatan:</span>
                  <span style={{ color: "#172B45", fontWeight: 600 }}>{getCargoLabel(formData.cargoType)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#60738A" }}>Frekuensi:</span>
                  <span style={{ color: "#172B45", fontWeight: 600 }}>{getFrequencyLabel(formData.estimatedShippingFrequency)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#60738A" }}>Estimasi Tonase:</span>
                  <span style={{ color: "#172B45", fontWeight: 600 }}>
                    {formData.tonnageNeedsConsultation ? "Perlu Konsultasi" : formData.estimatedVolumeWeight || "Belum diisi"}
                  </span>
                </div>
              </div>

              {/* Corridor Route Visual Line */}
              <div style={{ position: "relative", paddingLeft: "20px" }}>
                {/* Connecting Line */}
                <div style={{ position: "absolute", left: "5px", top: "8px", bottom: "8px", width: "2px", backgroundColor: "#D7E2EF" }} />

                {/* Origin */}
                <div style={{ position: "relative", marginBottom: "12px" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "-19px",
                      top: "4px",
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: "#1D5FA7",
                    }}
                  />
                  <span style={{ fontSize: "0.6875rem", color: "#60738A", display: "block" }}>Titik Asal:</span>
                  <div style={{ fontSize: "0.8125rem", color: formData.originCity ? "#172B45" : "#60738A", fontWeight: 600 }}>
                    {formData.originCity || "Belum ditentukan"}
                  </div>
                </div>

                {/* Destination */}
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "-19px",
                      top: "4px",
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: "#15803D",
                    }}
                  />
                  <span style={{ fontSize: "0.6875rem", color: "#60738A", display: "block" }}>Titik Tujuan:</span>
                  <div style={{ fontSize: "0.8125rem", color: formData.destinationCity ? "#172B45" : "#60738A", fontWeight: 600 }}>
                    {formData.destinationCity || "Belum ditentukan"}
                  </div>
                </div>
              </div>
            </div>

            {/* Step Completion Checklist */}
            <div style={{ paddingTop: "14px", borderTop: "1px solid #D7E2EF", marginBottom: "16px" }}>
              <span style={{ fontSize: "0.75rem", color: "#60738A", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "8px", fontWeight: 700 }}>
                Kelengkapan Data Langkah {step}:
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.75rem" }}>
                {step === 1 && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: formData.contactName.trim().length >= 2 ? "#15803D" : "#60738A" }}>
                      <span>{formData.contactName.trim().length >= 2 ? "✓" : "○"}</span>
                      <span>Nama Lengkap PIC</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: formData.companyName.trim().length >= 2 ? "#15803D" : "#60738A" }}>
                      <span>{formData.companyName.trim().length >= 2 ? "✓" : "○"}</span>
                      <span>Nama Perusahaan</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: formData.contactEmail.includes("@") ? "#15803D" : "#60738A" }}>
                      <span>{formData.contactEmail.includes("@") ? "✓" : "○"}</span>
                      <span>Email Bisnis</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: formData.contactPhone.length >= 8 ? "#15803D" : "#60738A" }}>
                      <span>{formData.contactPhone.length >= 8 ? "✓" : "○"}</span>
                      <span>Nomor Telepon/WA</span>
                    </div>
                  </>
                )}
                {step === 2 && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#15803D" }}>
                      <span>✓</span>
                      <span>Moda Layanan Terpilih</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: formData.originCity.trim().length >= 2 ? "#15803D" : "#60738A" }}>
                      <span>{formData.originCity.trim().length >= 2 ? "✓" : "○"}</span>
                      <span>Kota / Depo Asal</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: formData.destinationCity.trim().length >= 2 ? "#15803D" : "#60738A" }}>
                      <span>{formData.destinationCity.trim().length >= 2 ? "✓" : "○"}</span>
                      <span>Kota / Depo Tujuan</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#15803D" }}>
                      <span>✓</span>
                      <span>Karakteristik Muatan</span>
                    </div>
                  </>
                )}
                {step === 3 && (
                  <div style={{ color: "#15803D", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>✓</span>
                    <span>Seluruh data terekam & siap dikonfirmasi</span>
                  </div>
                )}
              </div>
            </div>

            {/* Contextual Guidance */}
            <div
              style={{
                padding: "12px",
                backgroundColor: "#EEF3F9",
                borderRadius: "6px",
                border: "1px solid #D7E2EF",
                fontSize: "0.75rem",
                color: "#60738A",
                lineHeight: 1.4,
              }}
            >
              {!formData.originCity || !formData.destinationCity
                ? "Lengkapi informasi rute dan muatan untuk melihat ringkasan kebutuhan pengiriman Anda."
                : "Permintaan Anda akan ditinjau langsung oleh tim komersial PT Trukindo Logistik Prima. Penawaran resmi menunggu verifikasi spesifikasi kargo."}
            </div>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .mobile-summary-toggle {
          display: none;
        }
        @media (max-width: 1024px) {
          .mobile-summary-toggle {
            display: block;
          }
          .quote-guidance-panel {
            display: none;
          }
          .quote-guidance-panel.mobile-open {
            display: block !important;
            margin-bottom: 24px;
            position: static !important;
          }
        }
      `}</style>
    </div>
  );
}
