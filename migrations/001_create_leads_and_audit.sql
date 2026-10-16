-- Migration 001: Create leads, audit_logs tables, immutability trigger, and role permissions
-- Milestone 1: Project Foundation and Lead Management

-- 1. Ensure cryptographic UUID generation is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create leads table
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    website_url TEXT NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'INGESTED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_lead_status CHECK (
        status IN (
            'INGESTED',
            'RESEARCHING',
            'QUALIFIED',
            'DISQUALIFIED',
            'PROPOSAL_DRAFTED',
            'OUTREACH_ACTIVE',
            'ARCHIVED'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_contact_email ON leads (contact_email);

-- 3. Create audit_logs table (Append-Only)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE RESTRICT,
    event_type VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255) NOT NULL DEFAULT 'system',
    actor_role VARCHAR(100) NOT NULL DEFAULT 'system',
    state_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    change_diff JSONB DEFAULT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_lead_id ON audit_logs (lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_recorded_at ON audit_logs (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs (event_type);

-- 4. Trigger to maintain updated_at on leads
CREATE OR REPLACE FUNCTION set_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at
BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION set_leads_updated_at();

-- 5. Immutability Trigger for audit_logs (Strict append-only defense-in-depth)
CREATE OR REPLACE FUNCTION enforce_audit_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are immutable: updates and deletes are strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_immutable ON audit_logs;
CREATE TRIGGER trg_audit_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION enforce_audit_immutability();

-- 6. Role-Based Privilege Hardening
-- Separates migration owner from application runtime role (astraops_app)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'astraops_app') THEN
        GRANT USAGE ON SCHEMA public TO astraops_app;
        GRANT SELECT, INSERT, UPDATE ON leads TO astraops_app;
        GRANT SELECT, INSERT ON audit_logs TO astraops_app;
        REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM astraops_app;
    END IF;
END
$$;
