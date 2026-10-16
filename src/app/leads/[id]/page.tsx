"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { Lead } from "@/lib/lead-repository";

interface AuditLogEntry {
  id: string;
  lead_id: string;
  event_type: string;
  actor_id: string;
  actor_role: string;
  state_snapshot: Record<string, unknown> | null;
  change_diff: Record<string, unknown> | null;
  recorded_at: string;
}

interface CriterionEvaluation {
  score: number;
  maxScore: number;
  evidence: string | null;
  verified: boolean;
  rationale?: string | null;
}

interface LeadScoreData {
  score: number;
  confidence: number;
  evidenceCoverage?: number;
  evidence_coverage?: number;
  tier: "TIER_1" | "TIER_2" | "INSUFFICIENT_EVIDENCE" | "DISQUALIFIED";
  criteriaBreakdown?: Record<string, CriterionEvaluation>;
  criteria_breakdown?: Record<string, CriterionEvaluation>;
  missingInfo?: string[];
  missing_info?: string[];
  evidenceUrls?: string[];
  evidence_urls?: string[];
  rationale: string | null;
  created_at?: string;
}

interface CompanyResearchData {
  industry: string | null;
  companySize?: string | null;
  company_size?: string | null;
  offerings: string[];
  techStack?: string[];
  tech_stack?: string[];
  summary: string | null;
  contentHash?: string | null;
  content_hash?: string | null;
  created_at?: string;
}

interface AgentRunSummary {
  id: string;
  state: string;
  currentStep: number;
  maxSteps: number;
  toolCallsCount: number;
  maxToolCalls: number;
  accruedCostUsd: number;
  budgetLimitUsd: number;
  errorCode: string | null;
  errorDetails: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ResearchDossierResponse {
  lead: Lead;
  research: CompanyResearchData | null;
  score: LeadScoreData | null;
  runs: AgentRunSummary[];
}

interface LeadDetailData {
  lead: Lead;
  auditLogs: AuditLogEntry[];
}

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const leadId = resolvedParams.id;

  const [data, setData] = useState<LeadDetailData | null>(null);
  const [dossier, setDossier] = useState<ResearchDossierResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ status: number; code?: string; message: string } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Operator Action State
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modals
  const [showOverrideModal, setShowOverrideModal] = useState<boolean>(false);
  const [overrideRationale, setOverrideRationale] = useState<string>("");
  const [overrideConfirmed, setOverrideConfirmed] = useState<boolean>(false);
  const [showRerunModal, setShowRerunModal] = useState<boolean>(false);

  const fetchLeadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [leadRes, researchRes] = await Promise.all([
        fetch(`/api/leads/${leadId}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }),
        fetch(`/api/leads/${leadId}/research`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }),
      ]);

      const leadJson = await leadRes.json();

      if (!leadRes.ok) {
        setError({
          status: leadRes.status,
          code: leadJson.error?.code,
          message: leadJson.error?.message || `Failed to fetch lead (${leadRes.status})`,
        });
        setData(null);
        setDossier(null);
      } else {
        setData(leadJson);

        if (researchRes.ok) {
          const researchJson = await researchRes.json();
          setDossier(researchJson);
        }
      }
    } catch (err: unknown) {
      setError({
        status: 500,
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Network error connecting to AstraOps API",
      });
      setData(null);
      setDossier(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchLeadData();
  }, [fetchLeadData]);

  const copyIdToClipboard = () => {
    navigator.clipboard.writeText(leadId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadgeClass = (status: string) => {
    const s = status.toLowerCase();
    return `badge badge-${s}`;
  };

  const getTierBadgeStyle = (tier?: string) => {
    switch (tier) {
      case "TIER_1":
        return { backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)" };
      case "TIER_2":
        return { backgroundColor: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", border: "1px solid rgba(59, 130, 246, 0.3)" };
      case "INSUFFICIENT_EVIDENCE":
        return { backgroundColor: "rgba(249, 115, 22, 0.15)", color: "#fb923c", border: "1px solid rgba(249, 115, 22, 0.3)" };
      case "DISQUALIFIED":
        return { backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.3)" };
      default:
        return { backgroundColor: "rgba(148, 163, 184, 0.15)", color: "#94a3b8", border: "1px solid rgba(148, 163, 184, 0.3)" };
    }
  };

  // --------------------------------------------------------------------------
  // Action Handlers
  // --------------------------------------------------------------------------
  const handleStartRun = async (allowRerun: boolean = false) => {
    setActionLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, allowRerun }),
      });

      const json = await res.json();
      if (!res.ok) {
        setActionMessage({
          type: "error",
          text: json.error?.message || `Execution failed (${res.status})`,
        });
      } else {
        setActionMessage({
          type: "success",
          text: `Agent run completed. Resulting state: ${json.run?.state || "COMPLETED"}. Lead status: ${json.lead?.status}.`,
        });
        await fetchLeadData();
      }
    } catch (err: unknown) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to initiate agent run",
      });
    } finally {
      setActionLoading(false);
      setShowRerunModal(false);
    }
  };

  const handleCancelRun = async () => {
    const activeRun = dossier?.runs.find(
      (r) => r.state === "INGESTED" || r.state === "RESEARCHING" || r.state === "SCORING"
    );
    if (!activeRun) {
      setActionMessage({ type: "error", text: "No cancellable in-flight run found." });
      return;
    }

    setActionLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/agent/runs/${activeRun.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual operator cancellation from UI" }),
      });

      const json = await res.json();
      if (!res.ok) {
        setActionMessage({
          type: "error",
          text: json.error?.message || `Cancellation failed (${res.status})`,
        });
      } else {
        setActionMessage({
          type: "success",
          text: "Agent run was cancelled successfully and previous lead status restored.",
        });
        await fetchLeadData();
      }
    } catch (err: unknown) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to cancel run",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewDecision = async (
    decision: "APPROVE" | "REJECT",
    manualOverride: boolean = false,
    rationale?: string
  ) => {
    setActionLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/leads/${leadId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, manualOverride, rationale }),
      });

      const json = await res.json();
      if (!res.ok) {
        setActionMessage({
          type: "error",
          text: json.error?.message || `Review submission failed (${res.status})`,
        });
      } else {
        setActionMessage({
          type: "success",
          text: `Human review decision '${decision}' successfully applied. Lead is now ${json.lead?.status}.`,
        });
        setShowOverrideModal(false);
        setOverrideRationale("");
        setOverrideConfirmed(false);
        await fetchLeadData();
      }
    } catch (err: unknown) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Network error submitting review",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const currentStatus = data?.lead.status || "";
  const isPendingApproval = currentStatus === "AWAITING_APPROVAL";
  const isInsufficientEvidence = currentStatus === "INSUFFICIENT_EVIDENCE";
  const isResearching = currentStatus === "RESEARCHING";
  const isEligibleToStart =
    currentStatus === "INGESTED" || currentStatus === "FAILED";
  const isTerminal =
    currentStatus === "QUALIFIED" ||
    currentStatus === "DISQUALIFIED" ||
    currentStatus === "ARCHIVED" ||
    currentStatus === "PROPOSAL_DRAFTED" ||
    currentStatus === "OUTREACH_ACTIVE";

  return (
    <div style={{ maxWidth: "1050px", margin: "0 auto", padding: "32px 24px" }}>
      {/* Back Link */}
      <div style={{ marginBottom: "20px" }}>
        <Link
          href="/leads"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "#60a5fa",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          ← Back to Leads Directory
        </Link>
      </div>

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
            Retrieving lead dossier, qualification score & audit trail from PostgreSQL...
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          style={{
            backgroundColor: "var(--card)",
            border: `1px solid ${error.status === 404 ? "var(--border)" : "var(--danger)"}`,
            borderRadius: "var(--radius)",
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: "1.25rem",
              color: error.status === 404 ? "var(--foreground)" : "#f87171",
              marginBottom: "8px",
            }}
          >
            {error.status === 404
              ? "Lead Not Found"
              : error.status === 401
              ? "Authentication Required"
              : "Unable to Load Lead"}
          </h2>
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem", marginBottom: "24px" }}>
            {error.message}
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
            <Link href="/leads" className="btn btn-secondary">
              Back to Leads
            </Link>
            {error.status !== 404 && (
              <button type="button" onClick={fetchLeadData} className="btn btn-primary">
                Try Again
              </button>
            )}
          </div>
        </div>
      ) : !data ? null : (
        <>
          {/* Header Card */}
          <div
            className="card"
            style={{
              marginBottom: "20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <h1
                  style={{
                    fontSize: "1.75rem",
                    fontWeight: 700,
                    color: "var(--foreground)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {data.lead.company_name}
                </h1>
                <span className={getStatusBadgeClass(data.lead.status)}>
                  {data.lead.status.replace(/_/g, " ")}
                </span>
                {dossier?.score?.tier && (
                  <span
                    style={{
                      ...getTierBadgeStyle(dossier.score.tier),
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }}
                  >
                    {dossier.score.tier.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>ID:</span>
                <code
                  style={{
                    fontSize: "0.8125rem",
                    backgroundColor: "rgba(30, 41, 59, 0.7)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    color: "var(--card-foreground)",
                  }}
                >
                  {data.lead.id}
                </code>
                <button
                  type="button"
                  onClick={copyIdToClipboard}
                  className="btn btn-outline btn-sm"
                  style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                  title="Copy Lead UUID"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Quick Actions in Header */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {isEligibleToStart && (
                <button
                  type="button"
                  onClick={() => handleStartRun(false)}
                  disabled={actionLoading}
                  className="btn btn-primary"
                  id="start-research-btn"
                >
                  {actionLoading ? <span className="spinner" /> : "▶ Start Prospect Research"}
                </button>
              )}
              {isResearching && (
                <button
                  type="button"
                  onClick={handleCancelRun}
                  disabled={actionLoading}
                  className="btn btn-outline"
                  style={{ borderColor: "#ef4444", color: "#f87171" }}
                  id="cancel-run-btn"
                >
                  {actionLoading ? <span className="spinner" /> : "⏹ Cancel Execution"}
                </button>
              )}
            </div>
          </div>

          {/* Toast / Banner Action Feedback */}
          {actionMessage && (
            <div
              style={{
                marginBottom: "20px",
                padding: "12px 16px",
                borderRadius: "var(--radius)",
                backgroundColor:
                  actionMessage.type === "success"
                    ? "rgba(16, 185, 129, 0.15)"
                    : "rgba(239, 68, 68, 0.15)",
                border: `1px solid ${
                  actionMessage.type === "success"
                    ? "rgba(16, 185, 129, 0.3)"
                    : "rgba(239, 68, 68, 0.3)"
                }`,
                color: actionMessage.type === "success" ? "#34d399" : "#f87171",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "0.875rem" }}>{actionMessage.text}</span>
              <button
                type="button"
                onClick={() => setActionMessage(null)}
                style={{ color: "inherit", fontSize: "1rem", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Human-in-the-Loop Review Banner / Panel */}
          {isPendingApproval && (
            <div
              className="card"
              style={{
                marginBottom: "24px",
                border: "1px solid rgba(139, 92, 246, 0.4)",
                backgroundColor: "rgba(30, 27, 75, 0.5)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#c4b5fd", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>🎯</span> Qualification Complete — Awaiting Sales Operator Decision
                  </h2>
                  <p style={{ fontSize: "0.8125rem", color: "#a5b4fc", marginTop: "4px" }}>
                    This prospect meets actionable ICP criteria. Review the evidence findings below and approve or disqualify.
                    <strong> Automated outreach actions remain strictly suspended until operator sign-off.</strong>
                  </p>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => handleReviewDecision("APPROVE")}
                    disabled={actionLoading}
                    className="btn btn-primary"
                    style={{ backgroundColor: "#10b981", borderColor: "#059669" }}
                    id="approve-lead-btn"
                  >
                    {actionLoading ? <span className="spinner" /> : "✓ Approve (Qualify)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewDecision("REJECT")}
                    disabled={actionLoading}
                    className="btn btn-secondary"
                    style={{ color: "#f87171", borderColor: "rgba(239, 68, 68, 0.4)" }}
                    id="reject-lead-btn"
                  >
                    ✕ Disqualify
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRerunModal(true)}
                    disabled={actionLoading}
                    className="btn btn-outline btn-sm"
                    title="Rerun qualification pipeline with fresh scrape"
                  >
                    🔄 Rerun
                  </button>
                </div>
              </div>
            </div>
          )}

          {isInsufficientEvidence && (
            <div
              className="card"
              style={{
                marginBottom: "24px",
                border: "1px solid rgba(249, 115, 22, 0.4)",
                backgroundColor: "rgba(67, 20, 7, 0.4)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#fdba74", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>⚠️</span> Insufficient Evidence Gate Triggered
                  </h2>
                  <p style={{ fontSize: "0.8125rem", color: "#fed7aa", marginTop: "4px" }}>
                    Prospect findings lack verified primary evidence for mandatory critical criteria (industry or offerings) or evidence coverage is below 70%.
                    Approval requires explicit manual override and written justification rationale.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setShowOverrideModal(true)}
                    disabled={actionLoading}
                    className="btn btn-primary"
                    style={{ backgroundColor: "#B45309", borderColor: "#92400E" }}
                    id="override-approve-btn"
                  >
                    ⚡ Manual Override & Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewDecision("REJECT")}
                    disabled={actionLoading}
                    className="btn btn-secondary"
                    style={{ color: "#f87171", borderColor: "rgba(239, 68, 68, 0.4)" }}
                    id="reject-insufficient-btn"
                  >
                    ✕ Disqualify
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRerunModal(true)}
                    disabled={actionLoading}
                    className="btn btn-outline btn-sm"
                  >
                    🔄 Rerun
                  </button>
                </div>
              </div>
            </div>
          )}

          {isTerminal && (
            <div
              style={{
                marginBottom: "24px",
                padding: "12px 16px",
                borderRadius: "var(--radius)",
                backgroundColor: "rgba(30, 41, 59, 0.4)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "var(--muted-foreground)",
                fontSize: "0.8125rem",
              }}
            >
              <span>🔒</span>
              <span>
                This lead is in terminal business lifecycle state (<strong>{data.lead.status}</strong>).
                Further agent execution runs are restricted to preserve deterministic historical integrity.
              </span>
            </div>
          )}

          {/* Research Dossier & Qualification Scoring Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px",
              marginBottom: "24px",
            }}
          >
            {/* Stage 1: Company Research Dossier */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--card-foreground)" }}>
                  🏢 Stage 1: Verified Company Facts
                </h2>
                {dossier?.research && (
                  <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                    EXTRACTED VIA 9ROUTER
                  </span>
                )}
              </div>

              {!dossier?.research ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted-foreground)" }}>
                  <p style={{ fontSize: "0.875rem", marginBottom: "12px" }}>
                    No automated research dossier gathered yet.
                  </p>
                  {isEligibleToStart && (
                    <button
                      type="button"
                      onClick={() => handleStartRun(false)}
                      disabled={actionLoading}
                      className="btn btn-primary btn-sm"
                    >
                      Start Research
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                      Industry Sector
                    </span>
                    <p style={{ fontSize: "0.9375rem", color: "var(--foreground)", fontWeight: 500 }}>
                      {dossier.research.industry || "Not observed"}
                    </p>
                  </div>

                  <div>
                    <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                      Estimated Company Scale
                    </span>
                    <p style={{ fontSize: "0.9375rem", color: "var(--foreground)" }}>
                      {dossier.research.company_size || dossier.research.companySize || "Not observed"}
                    </p>
                  </div>

                  <div>
                    <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: "6px" }}>
                      Core Offerings & Products
                    </span>
                    {dossier.research.offerings && dossier.research.offerings.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {dossier.research.offerings.map((offering, idx) => (
                          <span
                            key={idx}
                            style={{
                              backgroundColor: "rgba(59, 130, 246, 0.15)",
                              color: "#93c5fd",
                              border: "1px solid rgba(59, 130, 246, 0.3)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                            }}
                          >
                            {offering}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>None extracted</p>
                    )}
                  </div>

                  <div>
                    <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: "6px" }}>
                      Observed Technology Stack
                    </span>
                    {((dossier.research.tech_stack ?? dossier.research.techStack) || []).length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {(dossier.research.tech_stack ?? dossier.research.techStack ?? []).map((tech, idx) => (
                          <span
                            key={idx}
                            style={{
                              backgroundColor: "rgba(148, 163, 184, 0.15)",
                              color: "#cbd5e1",
                              border: "1px solid rgba(148, 163, 184, 0.3)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                            }}
                          >
                            {tech}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>None observed</p>
                    )}
                  </div>

                  <div>
                    <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                      Corporate Findings Summary
                    </span>
                    <p style={{ fontSize: "0.875rem", color: "#cbd5e1", lineHeight: 1.5, marginTop: "2px" }}>
                      {dossier.research.summary || "No factual summary available."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Stage 2: Static ICP Qualification Score Breakdown */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--card-foreground)" }}>
                  📊 Stage 2: Decoupled ICP Qualification
                </h2>
                {dossier?.score?.tier && (
                  <span
                    style={{
                      ...getTierBadgeStyle(dossier.score.tier),
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                    }}
                  >
                    {dossier.score.tier.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              {!dossier?.score ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted-foreground)" }}>
                  <p style={{ fontSize: "0.875rem" }}>
                    Lead has not completed qualification scoring.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Top Metric Strip */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", textAlign: "center" }}>
                    <div style={{ backgroundColor: "rgba(15, 23, 42, 0.5)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 8px" }}>
                      <span style={{ display: "block", fontSize: "0.7rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                        Nominal Fit
                      </span>
                      <strong style={{ fontSize: "1.5rem", color: dossier.score.score >= 80 ? "#34d399" : dossier.score.score >= 60 ? "#60a5fa" : "#f87171" }}>
                        {dossier.score.score}
                        <span style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>/100</span>
                      </strong>
                    </div>

                    <div style={{ backgroundColor: "rgba(15, 23, 42, 0.5)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 8px" }}>
                      <span style={{ display: "block", fontSize: "0.7rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                        Confidence
                      </span>
                      <strong style={{ fontSize: "1.5rem", color: dossier.score.confidence >= 0.75 ? "#34d399" : dossier.score.confidence >= 0.65 ? "#60a5fa" : "#fb923c" }}>
                        {Math.round(dossier.score.confidence * 100)}%
                      </strong>
                    </div>

                    <div style={{ backgroundColor: "rgba(15, 23, 42, 0.5)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 8px" }}>
                      <span style={{ display: "block", fontSize: "0.7rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                        Evidence Coverage
                      </span>
                      <strong style={{ fontSize: "1.5rem", color: (dossier.score.evidenceCoverage ?? dossier.score.evidence_coverage ?? 0) >= 0.70 ? "#34d399" : "#fb923c" }}>
                        {Math.round((dossier.score.evidenceCoverage ?? dossier.score.evidence_coverage ?? 0) * 100)}%
                      </strong>
                    </div>
                  </div>

                  {/* Rubric Breakdown Table */}
                  <div>
                    <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: "8px" }}>
                      Static Rubric Breakdown (30/25/25/20)
                    </span>
                    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                        <thead>
                          <tr style={{ backgroundColor: "rgba(15, 23, 42, 0.8)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "8px 10px", color: "var(--muted-foreground)", fontWeight: 600 }}>Criterion</th>
                            <th style={{ padding: "8px 10px", color: "var(--muted-foreground)", fontWeight: 600 }}>Score</th>
                            <th style={{ padding: "8px 10px", color: "var(--muted-foreground)", fontWeight: 600 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(dossier.score.criteriaBreakdown ?? dossier.score.criteria_breakdown ?? {}).map(([key, item]) => (
                            <tr key={key} style={{ borderBottom: "1px solid rgba(51, 65, 85, 0.4)" }}>
                              <td style={{ padding: "8px 10px", fontWeight: 500, color: "var(--foreground)" }}>
                                {key.replace(/_/g, " ").toUpperCase()}
                              </td>
                              <td style={{ padding: "8px 10px", color: "#93c5fd" }}>
                                {item.score} / {item.maxScore}
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                {item.verified ? (
                                  <span style={{ color: "#34d399", fontSize: "0.75rem", fontWeight: 600 }}>✓ Verified</span>
                                ) : (
                                  <span style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>Unobserved (Baseline)</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Missing Info Callout */}
                  {(dossier.score.missingInfo ?? dossier.score.missing_info) && (dossier.score.missingInfo ?? dossier.score.missing_info)!.length > 0 && (
                    <div
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "rgba(249, 115, 22, 0.1)",
                        border: "1px solid rgba(249, 115, 22, 0.3)",
                        borderRadius: "var(--radius)",
                      }}
                    >
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#fb923c", fontWeight: 600, marginBottom: "4px" }}>
                        Missing Evidence Factors:
                      </span>
                      <ul style={{ paddingLeft: "18px", fontSize: "0.8125rem", color: "#fed7aa" }}>
                        {(dossier.score.missingInfo ?? dossier.score.missing_info ?? []).map((info, idx) => (
                          <li key={idx}>{info}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Verified Citations */}
                  {(dossier.score.evidenceUrls ?? dossier.score.evidence_urls) && (dossier.score.evidenceUrls ?? dossier.score.evidence_urls)!.length > 0 && (
                    <div>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase", marginBottom: "4px" }}>
                        Verified Domain Citations
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {(dossier.score.evidenceUrls ?? dossier.score.evidence_urls ?? []).map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#60a5fa", fontSize: "0.8125rem", textDecoration: "underline", wordBreak: "break-all" }}
                          >
                            {url} ↗
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Scorer Rationale */}
                  {dossier.score.rationale && (
                    <div>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                        ICP Evaluation Rationale
                      </span>
                      <p style={{ fontSize: "0.8125rem", color: "#cbd5e1", lineHeight: 1.5, marginTop: "2px" }}>
                        {dossier.score.rationale}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Previous Execution Runs Table */}
          {dossier?.runs && dossier.runs.length > 0 && (
            <div className="card" style={{ marginBottom: "24px" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "12px", color: "var(--card-foreground)" }}>
                ⏱ Execution Run History
              </h2>
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ backgroundColor: "rgba(15, 23, 42, 0.8)", borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "8px 12px", color: "var(--muted-foreground)" }}>Run ID</th>
                      <th style={{ padding: "8px 12px", color: "var(--muted-foreground)" }}>State</th>
                      <th style={{ padding: "8px 12px", color: "var(--muted-foreground)" }}>Step Progress</th>
                      <th style={{ padding: "8px 12px", color: "var(--muted-foreground)" }}>Accrued Cost</th>
                      <th style={{ padding: "8px 12px", color: "var(--muted-foreground)" }}>Error Code</th>
                      <th style={{ padding: "8px 12px", color: "var(--muted-foreground)" }}>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.runs.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid rgba(51, 65, 85, 0.4)" }}>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#93c5fd" }}>
                          {r.id.slice(0, 8)}...
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span className={getStatusBadgeClass(r.state)}>
                            {r.state}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px", color: "var(--foreground)" }}>
                          {r.currentStep} / {r.maxSteps} ({r.toolCallsCount} tools)
                        </td>
                        <td style={{ padding: "8px 12px", color: "#34d399" }}>
                          ${Number(r.accruedCostUsd).toFixed(4)}
                        </td>
                        <td style={{ padding: "8px 12px", color: r.errorCode ? "#f87171" : "var(--muted-foreground)" }}>
                          {r.errorCode || "—"}
                        </td>
                        <td style={{ padding: "8px 12px", color: "var(--muted-foreground)" }}>
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Inbound Shipment Details Card (if submitted via public quote form) */}
          {(data.lead.source === "INBOUND_INQUIRY" || data.lead.inquiry_details) && (
            <div
              className="card"
              style={{
                marginBottom: "24px",
                backgroundColor: "#0d1b2e",
                border: "1px solid rgba(29, 95, 167, 0.4)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #1e293b", paddingBottom: "10px" }}>
                <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#f8fafc", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>📦</span> Spesifikasi Muatan Inkuiri Publik
                </h2>
                <span className="badge badge-inbound" style={{ fontSize: "0.6875rem" }}>
                  INBOUND QUOTE REQUEST
                </span>
              </div>

              {(() => {
                const inq =
                  typeof data.lead.inquiry_details === "string"
                    ? JSON.parse(data.lead.inquiry_details)
                    : (data.lead.inquiry_details as Record<string, unknown> | null | undefined);

                return (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", fontSize: "0.875rem" }}>
                    <div>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>
                        Kategori Layanan
                      </span>
                      <strong style={{ color: "#2F80D1" }}>
                        {String(inq?.serviceCategory || "FTL_TRUCKING").replace(/_/g, " ")}
                      </strong>
                    </div>

                    <div>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>
                        Karakteristik Kargo
                      </span>
                      <strong style={{ color: "#f8fafc" }}>
                        {String(inq?.cargoType || "GENERAL_CARGO").replace(/_/g, " ")}
                      </strong>
                    </div>

                    <div>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>
                        Rute Pengiriman
                      </span>
                      <strong style={{ color: "#f8fafc" }}>
                        {String(inq?.originCity || "-")} → {String(inq?.destinationCity || "-")}
                      </strong>
                    </div>

                    <div>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>
                        Frekuensi Pengiriman
                      </span>
                      <strong style={{ color: "#f8fafc" }}>
                        {String(inq?.estimatedShippingFrequency || "ONE_TIME").replace(/_/g, " ")}
                      </strong>
                    </div>

                    <div>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>
                        Estimasi Tonase / Volume
                      </span>
                      <strong style={{ color: "#f8fafc" }}>
                        {String(inq?.estimatedVolumeWeight || "Perlu Konsultasi")}
                      </strong>
                    </div>

                    <div>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>
                        Preferensi Armada
                      </span>
                      <strong style={{ color: "#f8fafc" }}>
                        {String(inq?.truckType || "ANY_APPROPRIATE").replace(/_/g, " ")}
                      </strong>
                    </div>

                    <div>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>
                        Jadwal Muat Perdana
                      </span>
                      <strong style={{ color: "#f8fafc" }}>
                        {String(inq?.firstLoadingDate || "Fleksibel")}
                      </strong>
                    </div>

                    {inq?.additionalNotes && (
                      <div style={{ gridColumn: "1 / -1", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #1e293b" }}>
                        <span style={{ display: "block", fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>
                          Catatan Khusus Klien
                        </span>
                        <p style={{ color: "#cbd5e1", marginTop: "4px", lineHeight: 1.5 }}>
                          {String(inq.additionalNotes)}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Primary Lead Details Card */}
          <div className="card" style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "16px", color: "var(--card-foreground)", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
              Lead Information & Contact
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              <div>
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                  Website URL
                </span>
                <a
                  href={data.lead.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#60a5fa", textDecoration: "underline", fontSize: "0.9375rem" }}
                >
                  {data.lead.website_url} ↗
                </a>
              </div>

              <div>
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                  Primary Contact
                </span>
                <p style={{ fontSize: "0.9375rem", color: "var(--foreground)", fontWeight: 500 }}>
                  {data.lead.contact_name}
                </p>
              </div>

              <div>
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                  Contact Email
                </span>
                <a href={`mailto:${data.lead.contact_email}`} style={{ color: "#60a5fa", fontSize: "0.9375rem" }}>
                  {data.lead.contact_email}
                </a>
              </div>

              {data.lead.phone && (
                <div>
                  <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                    Telepon / WA
                  </span>
                  <a href={`tel:${data.lead.phone}`} style={{ color: "#2F80D1", fontSize: "0.9375rem", fontWeight: 600 }}>
                    {data.lead.phone}
                  </a>
                </div>
              )}

              <div>
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>
                  Lead Source
                </span>
                <p style={{ fontSize: "0.875rem", color: "var(--foreground)", fontWeight: 500 }}>
                  {data.lead.source || "MANUAL_PROSPECT"}
                </p>
              </div>
            </div>
          </div>

          {/* Immutable Audit Trail Section */}
          <div className="card">
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--foreground)" }}>
                  Immutable Audit Trail
                </h2>
                <span
                  style={{
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    color: "#34d399",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                  }}
                >
                  APPEND-ONLY
                </span>
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
                Chronological, tamper-evident log entries generated inside PostgreSQL atomic transactions.
              </p>
            </div>

            {data.auditLogs.length === 0 ? (
              <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
                No audit logs found for this lead.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  position: "relative",
                  paddingLeft: "16px",
                  borderLeft: "2px solid var(--border)",
                  marginLeft: "8px",
                }}
              >
                {data.auditLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      position: "relative",
                      backgroundColor: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      padding: "16px",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "-23px",
                        top: "20px",
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        backgroundColor: "#3b82f6",
                        border: "2px solid var(--card)",
                      }}
                    />

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "8px",
                        marginBottom: "10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "0.8125rem",
                            color: "#60a5fa",
                            backgroundColor: "rgba(59, 130, 246, 0.15)",
                            padding: "2px 8px",
                            borderRadius: "4px",
                          }}
                        >
                          {log.event_type}
                        </span>
                        <span style={{ fontSize: "0.8125rem", color: "var(--muted-foreground)" }}>
                          by <strong>{log.actor_id}</strong> ({log.actor_role})
                        </span>
                      </div>
                      <time
                        dateTime={log.recorded_at}
                        style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}
                      >
                        {new Date(log.recorded_at).toLocaleString()}
                      </time>
                    </div>

                    {log.change_diff && (
                      <div style={{ marginTop: "8px" }}>
                        <span
                          style={{
                            display: "block",
                            fontSize: "0.75rem",
                            color: "var(--muted-foreground)",
                            marginBottom: "4px",
                          }}
                        >
                          Change Diff:
                        </span>
                        <pre
                          style={{
                            backgroundColor: "rgba(0, 0, 0, 0.4)",
                            border: "1px solid rgba(51, 65, 85, 0.5)",
                            borderRadius: "4px",
                            padding: "8px 12px",
                            fontSize: "0.75rem",
                            color: "#93c5fd",
                            overflowX: "auto",
                          }}
                        >
                          {JSON.stringify(log.change_diff, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal: Manual Override for INSUFFICIENT_EVIDENCE */}
          {showOverrideModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 50,
                padding: "20px",
              }}
            >
              <div
                className="card"
                style={{
                  maxWidth: "520px",
                  width: "100%",
                  border: "1px solid rgba(249, 115, 22, 0.5)",
                  backgroundColor: "#0f172a",
                }}
              >
                <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#fb923c", marginBottom: "8px" }}>
                  ⚠️ Authorize Manual Override: Insufficient Evidence
                </h3>
                <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", marginBottom: "16px" }}>
                  This prospect failed automated evidence coverage or critical factor requirements.
                  To manually qualify this lead, you must provide a written justification that will be recorded in the immutable audit trail.
                </p>

                <div style={{ marginBottom: "16px" }}>
                  <label
                    htmlFor="override-rationale"
                    style={{ display: "block", fontSize: "0.8125rem", color: "var(--foreground)", fontWeight: 500, marginBottom: "6px" }}
                  >
                    Operator Justification Rationale (Required):
                  </label>
                  <textarea
                    id="override-rationale"
                    value={overrideRationale}
                    onChange={(e) => setOverrideRationale(e.target.value)}
                    placeholder="e.g. Verified company scale and offerings via direct SEC filing and LinkedIn inspection..."
                    rows={4}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "var(--radius)",
                      backgroundColor: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                  <input
                    type="checkbox"
                    id="override-confirm"
                    checked={overrideConfirmed}
                    onChange={(e) => setOverrideConfirmed(e.target.checked)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <label htmlFor="override-confirm" style={{ fontSize: "0.8125rem", color: "var(--foreground)" }}>
                    I confirm this prospect satisfies qualification requirements despite missing web evidence.
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowOverrideModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewDecision("APPROVE", true, overrideRationale)}
                    disabled={!overrideConfirmed || overrideRationale.trim().length === 0 || actionLoading}
                    className="btn btn-primary"
                    style={{ backgroundColor: "#B45309", borderColor: "#92400E" }}
                  >
                    {actionLoading ? <span className="spinner" /> : "Confirm Override & Qualify"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: Confirm Rerun */}
          {showRerunModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 50,
                padding: "20px",
              }}
            >
              <div
                className="card"
                style={{
                  maxWidth: "480px",
                  width: "100%",
                  backgroundColor: "#0f172a",
                }}
              >
                <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--foreground)", marginBottom: "8px" }}>
                  🔄 Rerun Qualification Evaluation
                </h3>
                <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", marginBottom: "20px" }}>
                  This will initiate a fresh web scrape and model evaluation with <code>allowRerun: true</code>.
                  Previous research and scores will be preserved in run history, and the lead will temporarily enter <code>RESEARCHING</code>.
                </p>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowRerunModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartRun(true)}
                    disabled={actionLoading}
                    className="btn btn-primary"
                  >
                    {actionLoading ? <span className="spinner" /> : "Confirm Rerun"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
