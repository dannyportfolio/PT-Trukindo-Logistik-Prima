"use client";

import React, { useState } from "react";
import { LeadInputSchema, LeadInput } from "@/types/lead";
import { Lead } from "@/lib/lead-repository";

interface LeadFormProps {
  onSuccess?: (createdLead: Lead) => void;
  onCancel?: () => void;
}

interface FormErrors {
  companyName?: string;
  websiteUrl?: string;
  contactName?: string;
  contactEmail?: string;
  general?: string;
}

export function LeadForm({ onSuccess, onCancel }: LeadFormProps) {
  const [formData, setFormData] = useState<LeadInput>({
    companyName: "",
    websiteUrl: "",
    contactName: "",
    contactEmail: "",
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validateField = (field: keyof LeadInput, value: string) => {
    const singleFieldSchema = LeadInputSchema.pick({ [field]: true } as Record<keyof LeadInput, true>);
    const result = singleFieldSchema.safeParse({ [field]: value });
    if (!result.success) {
      const issue = result.error.errors[0]?.message;
      setErrors((prev) => ({ ...prev, [field]: issue, general: undefined }));
    } else {
      setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }));
    }
  };

  const handleChange = (field: keyof LeadInput, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSuccessMessage(null);
  };

  const handleBlur = (field: keyof LeadInput) => {
    validateField(field, formData[field]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);

    // 1. Client-side Zod validation
    const result = LeadInputSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const err of result.error.errors) {
        const fieldName = err.path[0] as keyof LeadInput;
        if (fieldName && !fieldErrors[fieldName]) {
          fieldErrors[fieldName] = err.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      // 2. Submit to backend API with idempotency key
      const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `lead-${Date.now()}`;

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        credentials: "same-origin",
        body: JSON.stringify(result.data),
      });

      const data = await res.json();

      if (res.status === 201 || res.status === 200) {
        setSuccessMessage(`Lead successfully created! ID: ${data.id}`);
        setFormData({
          companyName: "",
          websiteUrl: "",
          contactName: "",
          contactEmail: "",
        });
        if (onSuccess) {
          onSuccess(data);
        }
      } else if (res.status === 400) {
        if (data.error?.details && Array.isArray(data.error.details)) {
          const remoteErrors: FormErrors = {};
          for (const err of data.error.details) {
            const field = err.path?.[0] as keyof LeadInput;
            if (field) remoteErrors[field] = err.message;
          }
          setErrors(remoteErrors);
        } else {
          setErrors({ general: data.error?.message || "Validation failed" });
        }
      } else if (res.status === 401) {
        setErrors({ general: "Authentication required (401). Please log in with valid operator credentials." });
      } else if (res.status === 403) {
        setErrors({ general: "Forbidden (403). Your account does not have permission to create leads." });
      } else if (res.status === 409) {
        setErrors({ general: data.error?.message || "Conflict: duplicate submission detected." });
      } else {
        setErrors({ general: data.error?.message || "An unexpected error occurred while saving the lead." });
      }
    } catch {
      setErrors({ general: "Network error. Failed to connect to AstraOps server." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "24px",
        boxShadow: "var(--shadow)",
      }}
    >
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--card-foreground)" }}>
          Manual Lead Intake
        </h2>
        <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", marginTop: "4px" }}>
          Directly register a new enterprise prospect with verified contact details.
        </p>
      </div>

      {successMessage && (
        <div
          role="status"
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--success-muted)",
            border: "1px solid var(--success)",
            color: "var(--success)",
            borderRadius: "var(--radius)",
            fontSize: "0.875rem",
            marginBottom: "16px",
          }}
        >
          ✓ {successMessage}
        </div>
      )}

      {errors.general && (
        <div
          role="alert"
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--danger-muted)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            borderRadius: "var(--radius)",
            fontSize: "0.875rem",
            marginBottom: "16px",
          }}
        >
          ⚠ {errors.general}
        </div>
      )}

      <div style={{ display: "grid", gap: "16px" }}>
        {/* Company Name */}
        <div>
          <label
            htmlFor="companyName"
            style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "6px" }}
          >
            Company Name <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            id="companyName"
            name="companyName"
            type="text"
            placeholder="e.g. Acme Corporation"
            value={formData.companyName}
            onChange={(e) => handleChange("companyName", e.target.value)}
            onBlur={() => handleBlur("companyName")}
            aria-invalid={!!errors.companyName}
            aria-describedby={errors.companyName ? "companyName-error" : undefined}
            style={{
              width: "100%",
              padding: "10px 12px",
              backgroundColor: "var(--background)",
              border: `1px solid ${errors.companyName ? "var(--danger)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
              color: "var(--foreground)",
              fontSize: "0.875rem",
            }}
          />
          {errors.companyName && (
            <p id="companyName-error" role="alert" style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "4px" }}>
              {errors.companyName}
            </p>
          )}
        </div>

        {/* Website URL */}
        <div>
          <label
            htmlFor="websiteUrl"
            style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "6px" }}
          >
            Website URL <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            placeholder="https://example.com"
            value={formData.websiteUrl}
            onChange={(e) => handleChange("websiteUrl", e.target.value)}
            onBlur={() => handleBlur("websiteUrl")}
            aria-invalid={!!errors.websiteUrl}
            aria-describedby={errors.websiteUrl ? "websiteUrl-error" : undefined}
            style={{
              width: "100%",
              padding: "10px 12px",
              backgroundColor: "var(--background)",
              border: `1px solid ${errors.websiteUrl ? "var(--danger)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
              color: "var(--foreground)",
              fontSize: "0.875rem",
            }}
          />
          {errors.websiteUrl && (
            <p id="websiteUrl-error" role="alert" style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "4px" }}>
              {errors.websiteUrl}
            </p>
          )}
        </div>

        {/* Contact Name & Email grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label
              htmlFor="contactName"
              style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "6px" }}
            >
              Contact Person <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              id="contactName"
              name="contactName"
              type="text"
              placeholder="e.g. Jane Doe"
              value={formData.contactName}
              onChange={(e) => handleChange("contactName", e.target.value)}
              onBlur={() => handleBlur("contactName")}
              aria-invalid={!!errors.contactName}
              aria-describedby={errors.contactName ? "contactName-error" : undefined}
              style={{
                width: "100%",
                padding: "10px 12px",
                backgroundColor: "var(--background)",
                border: `1px solid ${errors.contactName ? "var(--danger)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                color: "var(--foreground)",
                fontSize: "0.875rem",
              }}
            />
            {errors.contactName && (
              <p id="contactName-error" role="alert" style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "4px" }}>
                {errors.contactName}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="contactEmail"
              style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "6px" }}
            >
              Contact Email <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              placeholder="jane@example.com"
              value={formData.contactEmail}
              onChange={(e) => handleChange("contactEmail", e.target.value)}
              onBlur={() => handleBlur("contactEmail")}
              aria-invalid={!!errors.contactEmail}
              aria-describedby={errors.contactEmail ? "contactEmail-error" : undefined}
              style={{
                width: "100%",
                padding: "10px 12px",
                backgroundColor: "var(--background)",
                border: `1px solid ${errors.contactEmail ? "var(--danger)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                color: "var(--foreground)",
                fontSize: "0.875rem",
              }}
            />
            {errors.contactEmail && (
              <p id="contactEmail-error" role="alert" style={{ fontSize: "0.75rem", color: "var(--danger)", marginTop: "4px" }}>
                {errors.contactEmail}
              </p>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: "10px 18px",
              backgroundColor: "transparent",
              color: "var(--muted-foreground)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 22px",
            backgroundColor: "var(--primary)",
            color: "var(--primary-foreground)",
            border: "none",
            borderRadius: "var(--radius)",
            fontSize: "0.875rem",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            opacity: submitting ? 0.7 : 1,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting && <span className="spinner" />}
          {submitting ? "Saving Lead..." : "Submit Lead"}
        </button>
      </div>
    </form>
  );
}
