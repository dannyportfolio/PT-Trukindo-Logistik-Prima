-- Migration 003: Create agent_runs, agent_steps, company_research, and lead_scores tables
-- Milestone 2: Prospect Research & Qualification Agent Persistence Layer

-- 1. Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Update leads check constraint to support Milestone 2 agent states
ALTER TABLE leads DROP CONSTRAINT IF EXISTS chk_lead_status;
ALTER TABLE leads ADD CONSTRAINT chk_lead_status CHECK (
    status IN (
        'INGESTED',
        'RESEARCHING',
        'RESEARCH_COMPLETED',
        'SCORING',
        'AWAITING_APPROVAL',
        'INSUFFICIENT_EVIDENCE',
        'QUALIFIED',
        'DISQUALIFIED',
        'PROPOSAL_DRAFTED',
        'OUTREACH_ACTIVE',
        'ARCHIVED',
        'FAILED'
    )
);

-- 3. Create generic set_updated_at trigger function if not already present
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create agent_runs table
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    state VARCHAR(50) NOT NULL DEFAULT 'INGESTED',
    current_step INTEGER NOT NULL DEFAULT 0,
    max_steps INTEGER NOT NULL DEFAULT 10,
    tool_calls_count INTEGER NOT NULL DEFAULT 0,
    max_tool_calls INTEGER NOT NULL DEFAULT 5,
    accrued_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    budget_limit_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.5000,
    version_id INTEGER NOT NULL DEFAULT 1,
    checkpoint_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code VARCHAR(100) DEFAULT NULL,
    error_details TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_agent_run_state CHECK (
        state IN (
            'INGESTED',
            'RESEARCHING',
            'RESEARCH_COMPLETED',
            'SCORING',
            'AWAITING_APPROVAL',
            'INSUFFICIENT_EVIDENCE',
            'DISQUALIFIED',
            'CANCELLED',
            'TIMED_OUT',
            'FAILED'
        )
    ),
    CONSTRAINT chk_agent_run_steps CHECK (current_step >= 0 AND current_step <= max_steps),
    CONSTRAINT chk_agent_run_tool_calls CHECK (tool_calls_count >= 0 AND tool_calls_count <= max_tool_calls),
    CONSTRAINT chk_agent_run_cost CHECK (accrued_cost_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_lead_id ON agent_runs (lead_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_state ON agent_runs (state);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs (created_at DESC);

DROP TRIGGER IF EXISTS trg_agent_runs_updated_at ON agent_runs;
CREATE TRIGGER trg_agent_runs_updated_at
BEFORE UPDATE ON agent_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Create agent_steps table (Append-Only execution step log)
CREATE TABLE IF NOT EXISTS agent_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    tool_name VARCHAR(100) NOT NULL,
    input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    backoff_ms INTEGER DEFAULT NULL,
    trigger_status_code INTEGER DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_step_retry_count CHECK (retry_count >= 0 AND retry_count <= 1),
    CONSTRAINT chk_step_tokens CHECK (tokens_used >= 0),
    CONSTRAINT chk_step_cost CHECK (cost_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_agent_steps_run_id ON agent_steps (run_id);
CREATE INDEX IF NOT EXISTS idx_agent_steps_step_number ON agent_steps (run_id, step_number);
CREATE INDEX IF NOT EXISTS idx_agent_steps_created_at ON agent_steps (created_at DESC);

-- 6. Create company_research table
CREATE TABLE IF NOT EXISTS company_research (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    industry VARCHAR(255) DEFAULT NULL,
    company_size VARCHAR(100) DEFAULT NULL,
    offerings JSONB NOT NULL DEFAULT '[]'::jsonb,
    tech_stack JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary TEXT DEFAULT NULL,
    content_hash VARCHAR(64) DEFAULT NULL,
    raw_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_research_lead_id ON company_research (lead_id);
CREATE INDEX IF NOT EXISTS idx_company_research_run_id ON company_research (run_id);

DROP TRIGGER IF EXISTS trg_company_research_updated_at ON company_research;
CREATE TRIGGER trg_company_research_updated_at
BEFORE UPDATE ON company_research
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. Create lead_scores table (Decoupled score, confidence, and evidence_coverage)
CREATE TABLE IF NOT EXISTS lead_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    score NUMERIC(5, 2) NOT NULL,
    confidence NUMERIC(3, 2) NOT NULL,
    evidence_coverage NUMERIC(3, 2) NOT NULL,
    tier VARCHAR(30) NOT NULL,
    criteria_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    missing_info JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    rationale TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_lead_scores_score CHECK (score >= 0.00 AND score <= 100.00),
    CONSTRAINT chk_lead_scores_confidence CHECK (confidence >= 0.00 AND confidence <= 1.00),
    CONSTRAINT chk_lead_scores_coverage CHECK (evidence_coverage >= 0.00 AND evidence_coverage <= 1.00),
    CONSTRAINT chk_lead_scores_tier CHECK (tier IN ('TIER_1', 'TIER_2', 'INSUFFICIENT_EVIDENCE', 'DISQUALIFIED'))
);

CREATE INDEX IF NOT EXISTS idx_lead_scores_lead_id ON lead_scores (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_run_id ON lead_scores (run_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_tier ON lead_scores (tier);

DROP TRIGGER IF EXISTS trg_lead_scores_updated_at ON lead_scores;
CREATE TRIGGER trg_lead_scores_updated_at
BEFORE UPDATE ON lead_scores
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8. Role-based privileges for application runtime role (astraops_app)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'astraops_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON agent_runs TO astraops_app;
        GRANT SELECT, INSERT ON agent_steps TO astraops_app;
        REVOKE UPDATE, DELETE, TRUNCATE ON agent_steps FROM astraops_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON company_research TO astraops_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON lead_scores TO astraops_app;
    END IF;
END
$$;
