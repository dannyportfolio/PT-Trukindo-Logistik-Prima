import { Pool, PoolClient } from "pg";
import { getPool, withTransaction } from "./db";
import { LeadStatus } from "../types/lead";

export type { LeadStatus };

export interface Lead {
  id: string;
  company_name: string;
  website_url: string;
  contact_name: string;
  contact_email: string;
  phone?: string | null;
  status: LeadStatus;
  source?: string;
  inquiry_details?: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: string;
  lead_id: string;
  event_type: string;
  actor_id: string;
  actor_role: string;
  state_snapshot: Record<string, unknown>;
  change_diff: Record<string, unknown> | null;
  recorded_at: Date;
}

export interface CreateLeadParams {
  companyName: string;
  websiteUrl: string;
  contactName: string;
  contactEmail: string;
  actorId?: string;
  actorRole?: string;
}

export interface UpdateLeadStatusParams {
  leadId: string;
  newStatus: LeadStatus;
  actorId?: string;
  actorRole?: string;
}

export interface CreateInboundInquiryParams {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl?: string;
  inquiryDetails: Record<string, unknown>;
  actorId?: string;
  actorRole?: string;
}

export interface ListLeadsParams {
  page?: number;
  limit?: number;
  status?: LeadStatus;
  source?: string;
}

export interface PaginatedLeads {
  data: Lead[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead with ID '${leadId}' not found`);
    this.name = "LeadNotFoundError";
  }
}

export class IllegalReviewStateError extends Error {
  constructor(leadId: string, currentStatus: string, reason?: string) {
    super(
      reason ||
        `Cannot submit review decision for lead '${leadId}': lead is in status '${currentStatus}', but review is only permitted for 'AWAITING_APPROVAL' or 'INSUFFICIENT_EVIDENCE'`
    );
    this.name = "IllegalReviewStateError";
  }
}

export class OverrideRationaleRequiredError extends Error {
  constructor(leadId: string) {
    super(
      `Manual approval of lead '${leadId}' with INSUFFICIENT_EVIDENCE requires explicit manualOverride: true and a non-empty justification rationale.`
    );
    this.name = "OverrideRationaleRequiredError";
  }
}

export interface ReviewDecisionParams {
  leadId: string;
  decision: "APPROVE" | "REJECT";
  rationale?: string;
  manualOverride?: boolean;
  actorId?: string;
  actorRole?: string;
}

export class LeadRepository {
  constructor(private pool: Pool = getPool()) {}

  /**
   * Persists a new lead and mandatory audit log entry within a single atomic ACID transaction.
   * If writing to audit_logs fails, the lead insert is rolled back completely.
   */
  async createLead(params: CreateLeadParams): Promise<Lead> {
    return withTransaction(async (client: PoolClient) => {
      // 1. Insert lead record
      const leadSql = `
        INSERT INTO leads (company_name, website_url, contact_name, contact_email, status)
        VALUES ($1, $2, $3, $4, 'INGESTED')
        RETURNING id, company_name, website_url, contact_name, contact_email, phone, status, source, inquiry_details, created_at, updated_at;
      `;
      const leadRes = await client.query<Lead>(leadSql, [
        params.companyName,
        params.websiteUrl,
        params.contactName,
        params.contactEmail,
      ]);
      const createdLead = leadRes.rows[0];

      // 2. Insert audit log record (mandatory in same transaction)
      const auditSql = `
        INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot)
        VALUES ($1, 'LEAD_INGESTED', $2, $3, $4);
      `;
      await client.query(auditSql, [
        createdLead.id,
        params.actorId || "system",
        params.actorRole || "system",
        JSON.stringify(createdLead),
      ]);

      return createdLead;
    }, this.pool);
  }

  /**
   * Persists a public inbound quotation/contact inquiry and an immutable audit log entry
   * inside a single atomic transaction. Initial status is strictly 'INGESTED', source is 'INBOUND_INQUIRY'.
   * Never triggers synchronous AI agent runs or outbound messaging.
   */
  async createInboundInquiry(params: CreateInboundInquiryParams): Promise<Lead> {
    return withTransaction(async (client: PoolClient) => {
      const leadSql = `
        INSERT INTO leads (company_name, website_url, contact_name, contact_email, phone, status, source, inquiry_details)
        VALUES ($1, $2, $3, $4, $5, 'INGESTED', 'INBOUND_INQUIRY', $6)
        RETURNING id, company_name, website_url, contact_name, contact_email, phone, status, source, inquiry_details, created_at, updated_at;
      `;
      const leadRes = await client.query<Lead>(leadSql, [
        params.companyName,
        params.websiteUrl || "https://inbound-inquiry.trukindo.internal",
        params.contactName,
        params.contactEmail,
        params.contactPhone,
        JSON.stringify(params.inquiryDetails),
      ]);
      const createdLead = leadRes.rows[0];

      const auditSql = `
        INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot)
        VALUES ($1, 'INQUIRY_RECEIVED', $2, $3, $4);
      `;
      await client.query(auditSql, [
        createdLead.id,
        params.actorId || "public_inquiry",
        params.actorRole || "public_inquiry",
        JSON.stringify(createdLead),
      ]);

      return createdLead;
    }, this.pool);
  }

  /**
   * Updates lead status and writes an audit diff in a single atomic transaction.
   */
  async updateStatus(params: UpdateLeadStatusParams): Promise<Lead> {
    return withTransaction(async (client: PoolClient) => {
      // 1. Fetch current lead state for diffing
      const currentRes = await client.query<Lead>(
        "SELECT * FROM leads WHERE id = $1 FOR UPDATE;",
        [params.leadId]
      );
      if (currentRes.rows.length === 0) {
        throw new Error(`Lead with ID ${params.leadId} not found`);
      }
      const previousLead = currentRes.rows[0];

      // 2. Update status
      const updateSql = `
        UPDATE leads
        SET status = $1
        WHERE id = $2
        RETURNING id, company_name, website_url, contact_name, contact_email, status, created_at, updated_at;
      `;
      const updateRes = await client.query<Lead>(updateSql, [
        params.newStatus,
        params.leadId,
      ]);
      const updatedLead = updateRes.rows[0];

      // 3. Insert audit log record with change diff
      const auditSql = `
        INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot, change_diff)
        VALUES ($1, 'LEAD_STATUS_CHANGED', $2, $3, $4, $5);
      `;
      await client.query(auditSql, [
        params.leadId,
        params.actorId || "system",
        params.actorRole || "system",
        JSON.stringify(updatedLead),
        JSON.stringify({
          fromStatus: previousLead.status,
          toStatus: params.newStatus,
        }),
      ]);

      return updatedLead;
    }, this.pool);
  }

  /**
   * Retrieves single lead and its entire audit trail.
   */
  async getLeadWithAudit(leadId: string): Promise<{ lead: Lead | null; auditLogs: AuditLog[] }> {
    const client = await this.pool.connect();
    try {
      const leadRes = await client.query<Lead>("SELECT * FROM leads WHERE id = $1;", [leadId]);
      if (leadRes.rows.length === 0) {
        return { lead: null, auditLogs: [] };
      }

      const auditRes = await client.query<AuditLog>(
        "SELECT * FROM audit_logs WHERE lead_id = $1 ORDER BY recorded_at ASC;",
        [leadId]
      );

      return {
        lead: leadRes.rows[0],
        auditLogs: auditRes.rows,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves a paginated list of leads with server-side filtering, total count,
   * and deterministic ordering (created_at DESC, id DESC).
   */
  async listLeads(params: ListLeadsParams = {}): Promise<PaginatedLeads> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    const client = await this.pool.connect();
    try {
      const conditions: string[] = [];
      const queryValues: unknown[] = [];

      if (params.status) {
        queryValues.push(params.status);
        conditions.push(`status = $${queryValues.length}`);
      }

      if (params.source) {
        queryValues.push(params.source);
        conditions.push(`source = $${queryValues.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // 1. Get total count
      const countSql = `SELECT COUNT(*)::int AS total FROM leads ${whereClause};`;
      const countRes = await client.query<{ total: number }>(countSql, queryValues);
      const total = Number(countRes.rows[0]?.total ?? 0);

      // 2. Query paginated slice
      const selectSql = `
        SELECT id, company_name, website_url, contact_name, contact_email, phone, status, source, inquiry_details, created_at, updated_at
        FROM leads
        ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT $${queryValues.length + 1} OFFSET $${queryValues.length + 2};
      `;
      const dataRes = await client.query<Lead>(selectSql, [...queryValues, limit, offset]);

      const totalPages = Math.ceil(total / limit);

      return {
        data: dataRes.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } finally {
      client.release();
    }
  }

  /**
   * Persists an array of valid leads and corresponding audit log entries
   * inside a SINGLE atomic transaction.
   * If any lead or audit log insert fails, all changes are rolled back.
   */
  async createLeadsBatch(
    leads: Array<{
      companyName: string;
      websiteUrl: string;
      contactName: string;
      contactEmail: string;
    }>,
    actorId: string = "system",
    actorRole: string = "system"
  ): Promise<Lead[]> {
    if (leads.length === 0) {
      return [];
    }

    return withTransaction(async (client: PoolClient) => {
      const createdLeads: Lead[] = [];

      for (const item of leads) {
        const leadSql = `
          INSERT INTO leads (company_name, website_url, contact_name, contact_email, status)
          VALUES ($1, $2, $3, $4, 'INGESTED')
          RETURNING id, company_name, website_url, contact_name, contact_email, phone, status, source, inquiry_details, created_at, updated_at;
        `;
        const leadRes = await client.query<Lead>(leadSql, [
          item.companyName,
          item.websiteUrl,
          item.contactName,
          item.contactEmail,
        ]);
        const createdLead = leadRes.rows[0];
        createdLeads.push(createdLead);

        const auditSql = `
          INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot)
          VALUES ($1, 'LEAD_INGESTED', $2, $3, $4);
        `;
        await client.query(auditSql, [
          createdLead.id,
          actorId,
          actorRole,
          JSON.stringify(createdLead),
        ]);
      }

      return createdLeads;
    }, this.pool);
  }

  /**
   * Applies an authenticated human review decision (APPROVE or REJECT) on a lead in
   * AWAITING_APPROVAL or INSUFFICIENT_EVIDENCE status inside an atomic transaction.
   *
   * Rules:
   * - Lead must exist (or throws LeadNotFoundError).
   * - Lead must be in AWAITING_APPROVAL or INSUFFICIENT_EVIDENCE (or throws IllegalReviewStateError).
   * - APPROVE on INSUFFICIENT_EVIDENCE strictly requires manualOverride: true and a non-empty rationale
   *   (or throws OverrideRationaleRequiredError).
   * - Updates lead status to QUALIFIED (APPROVE) or DISQUALIFIED (REJECT).
   * - Appends immutable HUMAN_REVIEW_DECISION audit log entry with actor ID, role, and diff.
   * - Preserves existing research and qualification scores without modification or deletion.
   */
  async submitReviewDecision(params: ReviewDecisionParams): Promise<Lead> {
    return withTransaction(async (client: PoolClient) => {
      // 1. Fetch current lead state with row lock
      const currentRes = await client.query<Lead>(
        "SELECT * FROM leads WHERE id = $1 FOR UPDATE;",
        [params.leadId]
      );
      if (currentRes.rows.length === 0) {
        throw new LeadNotFoundError(params.leadId);
      }
      const currentLead = currentRes.rows[0];

      // 2. Validate current status eligibility for human review
      if (
        currentLead.status !== "AWAITING_APPROVAL" &&
        currentLead.status !== "INSUFFICIENT_EVIDENCE"
      ) {
        throw new IllegalReviewStateError(
          params.leadId,
          currentLead.status,
          `Cannot submit review decision for lead '${params.leadId}': lead is in status '${currentLead.status}', but review is only permitted for 'AWAITING_APPROVAL' or 'INSUFFICIENT_EVIDENCE'`
        );
      }

      // 3. For INSUFFICIENT_EVIDENCE approval: require explicit manualOverride flag and non-empty rationale
      if (currentLead.status === "INSUFFICIENT_EVIDENCE" && params.decision === "APPROVE") {
        const rationaleTrimmed = (params.rationale || "").trim();
        if (!params.manualOverride || rationaleTrimmed.length === 0) {
          throw new OverrideRationaleRequiredError(params.leadId);
        }
      }

      // 4. Determine target status
      const targetStatus: LeadStatus =
        params.decision === "APPROVE" ? "QUALIFIED" : "DISQUALIFIED";

      // 5. Update lead status in PostgreSQL
      const updateSql = `
        UPDATE leads
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, company_name, website_url, contact_name, contact_email, status, created_at, updated_at;
      `;
      const updateRes = await client.query<Lead>(updateSql, [
        targetStatus,
        params.leadId,
      ]);
      const updatedLead = updateRes.rows[0];

      // 6. Record immutable HUMAN_REVIEW_DECISION audit log entry in the same transaction
      const auditSql = `
        INSERT INTO audit_logs (lead_id, event_type, actor_id, actor_role, state_snapshot, change_diff)
        VALUES ($1, 'HUMAN_REVIEW_DECISION', $2, $3, $4, $5);
      `;
      await client.query(auditSql, [
        params.leadId,
        params.actorId || "system",
        params.actorRole || "system",
        JSON.stringify(updatedLead),
        JSON.stringify({
          fromStatus: currentLead.status,
          toStatus: targetStatus,
          decision: params.decision,
          rationale: params.rationale?.trim() || null,
          manualOverride: params.manualOverride || false,
        }),
      ]);

      return updatedLead;
    }, this.pool);
  }
}

