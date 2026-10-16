-- Migration 002: Create persistent idempotency_keys table for concurrency-safe POST requests
-- Milestone 1: Project Foundation and Lead Management

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    payload_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
    status_code INTEGER NOT NULL DEFAULT 0,
    response_body JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_idempotency_status CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys (created_at DESC);

-- Grants for application runtime role (astraops_app)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'astraops_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO astraops_app;
    END IF;
END
$$;
