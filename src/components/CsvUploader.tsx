"use client";

import React, { useState, useRef } from "react";
import { CsvInvalidRow } from "@/lib/csv-parser";

interface CsvUploadResult {
  success: boolean;
  importedCount: number;
  totalRows: number;
  validRows?: unknown[];
  invalidRows?: CsvInvalidRow[];
}

interface CsvUploaderProps {
  onSuccess?: (result: CsvUploadResult) => void;
  onClose?: () => void;
}

export function CsvUploader({ onSuccess, onClose }: CsvUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<CsvUploadResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    setClientError(null);
    setServerError(null);

    // 1. File extension validation
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setClientError("Invalid file type: Please select an RFC-4180 CSV file (.csv).");
      return false;
    }

    // 2. Empty file validation
    if (file.size === 0) {
      setClientError("File is empty: The selected CSV file contains 0 bytes.");
      return false;
    }

    // 3. Client-side size limit validation (5MB)
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setClientError(`File exceeds maximum size limit: ${sizeMb} MB found, maximum 5.00 MB allowed.`);
      return false;
    }

    return true;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        setUploadResult(null);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        setUploadResult(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setServerError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/leads/upload-csv", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });

      const data = await res.json();

      if (res.status === 200) {
        setUploadResult(data);
        if (onSuccess) {
          onSuccess(data);
        }
      } else if (res.status === 400) {
        setServerError(data.error?.message || "Invalid CSV format or missing headers.");
      } else if (res.status === 401) {
        setServerError("Authentication required (401). Please log in with valid operator credentials.");
      } else if (res.status === 403) {
        setServerError("Forbidden (403). Your account does not have permission to upload leads.");
      } else if (res.status === 413) {
        setServerError("File too large (413). CSV file exceeds maximum 5MB size limit.");
      } else if (res.status === 500) {
        setServerError("Database batch transaction failed (500). All valid leads were rolled back.");
      } else {
        setServerError(data.error?.message || "Failed to process CSV file upload.");
      }
    } catch {
      setServerError("Network error: Failed to connect to upload endpoint.");
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setClientError(null);
    setServerError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "24px",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--card-foreground)" }}>
            Bulk CSV Lead Intake
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", marginTop: "4px" }}>
            Upload prospect rows up to 5MB. Valid records will be imported atomically.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close CSV uploader modal"
            style={{
              color: "var(--muted-foreground)",
              fontSize: "1.25rem",
              padding: "4px 8px",
              borderRadius: "var(--radius)",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Error Banners */}
      {(clientError || serverError) && (
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
          ⚠ {clientError || serverError}
        </div>
      )}

      {/* Drag & Drop Area */}
      {!uploadResult && (
        <>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? "var(--primary)" : "var(--border)"}`,
              backgroundColor: dragActive ? "rgba(59, 130, 246, 0.05)" : "var(--background)",
              borderRadius: "var(--radius-lg)",
              padding: "40px 20px",
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📄</div>
            <p style={{ fontWeight: 500, fontSize: "1rem", color: "var(--foreground)" }}>
              {selectedFile ? selectedFile.name : "Drag and drop your CSV file here"}
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)", marginTop: "4px" }}>
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(1)} KB — Ready to upload`
                : "or click to browse your files (.csv, max 5MB)"}
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            {selectedFile && (
              <button
                type="button"
                onClick={handleReset}
                disabled={uploading}
                style={{
                  padding: "8px 16px",
                  color: "var(--muted-foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: "0.875rem",
                }}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              style={{
                padding: "10px 22px",
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
                borderRadius: "var(--radius)",
                fontSize: "0.875rem",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                opacity: !selectedFile || uploading ? 0.6 : 1,
                cursor: !selectedFile || uploading ? "not-allowed" : "pointer",
              }}
            >
              {uploading && <span className="spinner" />}
              {uploading ? "Parsing & Importing..." : "Start Batch Import"}
            </button>
          </div>
        </>
      )}

      {/* Upload Results Summary & Error Rows Table */}
      {uploadResult && (
        <div style={{ marginTop: "12px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <div style={{ backgroundColor: "var(--background)", padding: "12px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>Total Rows</span>
              <p style={{ fontSize: "1.25rem", fontWeight: 700, marginTop: "2px" }}>{uploadResult.totalRows}</p>
            </div>
            <div style={{ backgroundColor: "var(--background)", padding: "12px", borderRadius: "var(--radius)", border: "1px solid var(--success)" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--success)", textTransform: "uppercase" }}>Imported Leads</span>
              <p style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--success)", marginTop: "2px" }}>{uploadResult.importedCount}</p>
            </div>
            <div style={{ backgroundColor: "var(--background)", padding: "12px", borderRadius: "var(--radius)", border: `1px solid ${uploadResult.invalidRows?.length ? "var(--danger)" : "var(--border)"}` }}>
              <span style={{ fontSize: "0.75rem", color: uploadResult.invalidRows?.length ? "var(--danger)" : "var(--muted-foreground)", textTransform: "uppercase" }}>Invalid Rows</span>
              <p style={{ fontSize: "1.25rem", fontWeight: 700, color: uploadResult.invalidRows?.length ? "var(--danger)" : "var(--muted-foreground)", marginTop: "2px" }}>
                {uploadResult.invalidRows?.length ?? 0}
              </p>
            </div>
          </div>

          {/* Table of Failed Rows */}
          {uploadResult.invalidRows && uploadResult.invalidRows.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--danger)", marginBottom: "8px" }}>
                Failed Rows Report ({uploadResult.invalidRows.length})
              </h3>
              <div
                style={{
                  maxHeight: "220px",
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", textAlign: "left" }}>
                  <thead style={{ backgroundColor: "var(--muted)", position: "sticky", top: 0 }}>
                    <tr>
                      <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>Line #</th>
                      <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>Company / Raw Value</th>
                      <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>Validation Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.invalidRows.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 12px", color: "var(--warning)" }}>Row {row.rowNumber}</td>
                        <td style={{ padding: "8px 12px", color: "var(--muted-foreground)" }}>
                          {row.raw?.company_name || row.raw?.companyName || Object.values(row.raw || {})[0] || "N/A"}
                        </td>
                        <td style={{ padding: "8px 12px", color: "var(--danger)" }}>
                          {row.errors.map((e, errIdx) => (
                            <div key={errIdx}>
                              <strong>{e.field}:</strong> {e.message}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: "8px 16px",
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
                borderRadius: "var(--radius)",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              Upload Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
