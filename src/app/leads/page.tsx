"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Lead } from "@/lib/lead-repository";
import { LeadForm } from "@/components/LeadForm";
import { CsvUploader } from "@/components/CsvUploader";

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const ALL_STATUSES: Array<{ label: string; value: string }> = [
  { label: "All Statuses", value: "" },
  { label: "Ingested", value: "INGESTED" },
  { label: "Researching", value: "RESEARCHING" },
  { label: "Awaiting Approval", value: "AWAITING_APPROVAL" },
  { label: "Insufficient Evidence", value: "INSUFFICIENT_EVIDENCE" },
  { label: "Qualified", value: "QUALIFIED" },
  { label: "Disqualified", value: "DISQUALIFIED" },
  { label: "Proposal Drafted", value: "PROPOSAL_DRAFTED" },
  { label: "Outreach Active", value: "OUTREACH_ACTIVE" },
  { label: "Archived", value: "ARCHIVED" },
  { label: "Failed", value: "FAILED" },
];

export default function LeadsDirectoryPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [limit, setLimit] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);

  // Modals
  const [isAddLeadOpen, setIsAddLeadOpen] = useState<boolean>(false);
  const [isCsvUploadOpen, setIsCsvUploadOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    query.set("page", String(currentPage));
    query.set("limit", String(limit));
    if (statusFilter) {
      query.set("status", statusFilter);
    }
    if (sourceFilter) {
      query.set("source", sourceFilter);
    }

    try {
      const res = await fetch(`/api/leads?${query.toString()}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setError({
            code: "UNAUTHORIZED",
            message: "Authentication required: Please authenticate your operator session using the top bar.",
          });
        } else if (res.status === 403) {
          setError({
            code: "FORBIDDEN",
            message: "Access forbidden: Your role lacks permission to browse lead records.",
          });
        } else {
          setError({
            code: json.error?.code || "ERROR",
            message: json.error?.message || "Failed to load leads from the server.",
          });
        }
        setLeads([]);
      } else {
        setLeads(json.data || []);
        if (json.pagination) {
          setPagination(json.pagination);
        }
      }
    } catch (err: unknown) {
      setError({
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Network error connecting to AstraOps API.",
      });
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, limit, statusFilter, sourceFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLimit(Number(e.target.value));
    setCurrentPage(1);
  };

  const handleLeadCreated = (createdLead: Lead) => {
    setIsAddLeadOpen(false);
    setToastMessage(`Lead for "${createdLead.company_name}" created successfully.`);
    fetchLeads();
    setTimeout(() => setToastMessage(null), 5000);
  };

  const handleCsvSuccess = (result: { importedCount: number }) => {
    setIsCsvUploadOpen(false);
    setToastMessage(`Batch CSV import completed: ${result.importedCount} leads imported.`);
    fetchLeads();
    setTimeout(() => setToastMessage(null), 5000);
  };

  const getStatusBadgeClass = (status: string) => {
    const s = status.toLowerCase();
    return `badge badge-${s}`;
  };

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 24px" }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="animate-fade-in"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            backgroundColor: "#065f46",
            border: "1px solid #059669",
            color: "#ecfdf5",
            padding: "12px 20px",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 2000,
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "28px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "var(--foreground)",
              marginBottom: "6px",
              letterSpacing: "-0.02em",
            }}
          >
            Leads Directory
          </h1>
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
            Sales target directory, contact information, and immutable audit logs.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setIsCsvUploadOpen(true)}
            className="btn btn-secondary"
            title="Bulk import prospect leads via CSV file"
          >
            Upload CSV
          </button>
          <button
            type="button"
            onClick={() => setIsAddLeadOpen(true)}
            className="btn btn-primary"
            title="Manually intake a prospective lead"
          >
            + Add Lead
          </button>
        </div>
      </div>

      {/* Filters & Controls Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "14px 18px",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Status Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label
              htmlFor="status-filter"
              style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)", fontWeight: 500 }}
            >
              Status:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={handleStatusFilterChange}
              style={{
                backgroundColor: "var(--background)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "0.8125rem",
              }}
            >
              {ALL_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Source Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label
              htmlFor="source-filter"
              style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)", fontWeight: 500 }}
            >
              Source:
            </label>
            <select
              id="source-filter"
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                backgroundColor: "var(--background)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "0.8125rem",
              }}
            >
              <option value="">All Sources</option>
              <option value="INBOUND_INQUIRY">Inbound Inquiries</option>
              <option value="MANUAL_PROSPECT">Manual / CSV Leads</option>
            </select>
          </div>

          {/* Page Limit Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label
              htmlFor="limit-selector"
              style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)", fontWeight: 500 }}
            >
              Per Page:
            </label>
            <select
              id="limit-selector"
              value={limit}
              onChange={handleLimitChange}
              style={{
                backgroundColor: "var(--background)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "0.8125rem",
              }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => fetchLeads()}
          disabled={loading}
          className="btn btn-outline btn-sm"
          title="Reload table"
        >
          {loading ? <span className="spinner" /> : "↻ Refresh"}
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "64px 20px",
            textAlign: "center",
          }}
        >
          <div
            className="spinner"
            style={{ width: "32px", height: "32px", borderWidth: "3px", marginBottom: "16px" }}
          />
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.9375rem" }}>
            Loading leads directory from PostgreSQL...
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          style={{
            backgroundColor: "var(--card)",
            border: `1px solid ${error.code === "UNAUTHORIZED" ? "var(--warning)" : "var(--danger)"}`,
            borderRadius: "var(--radius)",
            padding: "36px 24px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: "1.125rem",
              color: error.code === "UNAUTHORIZED" ? "#fbbf24" : "#f87171",
              marginBottom: "8px",
            }}
          >
            {error.code === "UNAUTHORIZED"
              ? "Authentication Required"
              : error.code === "FORBIDDEN"
              ? "Access Forbidden"
              : "Failed to Load Leads"}
          </h2>
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem", marginBottom: "20px" }}>
            {error.message}
          </p>
          <button type="button" onClick={() => fetchLeads()} className="btn btn-secondary">
            Retry Loading
          </button>
        </div>
      ) : leads.length === 0 ? (
        <div
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "64px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              color: "#60a5fa",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              fontSize: "1.5rem",
            }}
          >
            📋
          </div>
          <h2 style={{ fontSize: "1.125rem", color: "var(--foreground)", marginBottom: "8px" }}>
            No Leads Found
          </h2>
          <p
            style={{
              color: "var(--muted-foreground)",
              fontSize: "0.875rem",
              maxWidth: "400px",
              margin: "0 auto 24px auto",
            }}
          >
            {statusFilter
              ? `There are no leads currently matching status "${statusFilter}". Try selecting a different filter.`
              : "Your sales directory is currently empty. Start by manually creating a prospect or uploading a bulk CSV list."}
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={() => setIsCsvUploadOpen(true)}
              className="btn btn-secondary"
            >
              Upload CSV
            </button>
            <button
              type="button"
              onClick={() => setIsAddLeadOpen(true)}
              className="btn btn-primary"
            >
              + Create First Lead
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Leads Table */}
          <div className="table-container">
            <table className="lead-table" aria-label="Leads Directory Table">
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">Website</th>
                  <th scope="col">Contact Name</th>
                  <th scope="col">Contact Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ingested At</th>
                  <th scope="col" style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={{ fontWeight: 600, color: "var(--card-foreground)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span>{lead.company_name}</span>
                        {lead.source === "INBOUND_INQUIRY" && (
                          <span
                            className="badge badge-inbound"
                            style={{ fontSize: "0.6875rem", padding: "1px 6px" }}
                            title="Inbound quotation request from public portal"
                          >
                            INBOUND
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <a
                        href={lead.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#60a5fa", textDecoration: "underline" }}
                        title={lead.website_url}
                      >
                        {lead.website_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                      </a>
                    </td>
                    <td>{lead.contact_name}</td>
                    <td>
                      <a
                        href={`mailto:${lead.contact_email}`}
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {lead.contact_email}
                      </a>
                    </td>
                    <td>
                      <span className={getStatusBadgeClass(lead.status)}>
                        {lead.status.replace("_", " ")}
                      </span>
                    </td>
                    <td style={{ color: "var(--muted-foreground)", fontSize: "0.8125rem" }}>
                      {new Date(lead.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="btn btn-outline btn-sm"
                        title="View single lead details and audit trail"
                      >
                        View Detail →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Server-Side Pagination Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "16px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <p style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
              Showing{" "}
              <strong>
                {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}
              </strong>{" "}
              to{" "}
              <strong>
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </strong>{" "}
              of <strong>{pagination.total}</strong> leads
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPrevPage || loading}
                className="btn btn-secondary btn-sm"
              >
                ← Previous
              </button>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)", padding: "0 6px" }}>
                Page {pagination.page} of {Math.max(1, pagination.totalPages)}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={!pagination.hasNextPage || loading}
                className="btn btn-secondary btn-sm"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      {/* Manual Intake Modal */}
      {isAddLeadOpen && (
        <div className="modal-overlay" onClick={() => setIsAddLeadOpen(false)}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "560px" }}
          >
            <LeadForm onSuccess={handleLeadCreated} onCancel={() => setIsAddLeadOpen(false)} />
          </div>
        </div>
      )}

      {/* CSV Drag-and-Drop Modal */}
      {isCsvUploadOpen && (
        <div className="modal-overlay" onClick={() => setIsCsvUploadOpen(false)}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "680px" }}
          >
            <CsvUploader onSuccess={handleCsvSuccess} onClose={() => setIsCsvUploadOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
