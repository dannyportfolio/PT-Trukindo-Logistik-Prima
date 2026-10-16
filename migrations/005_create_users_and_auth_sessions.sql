-- Migration 005: Create Users and User Sessions for RBAC & MFA Authentication
-- PT Trukindo Logistik Prima: Internal Desk Access Hardening

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'SALES_OPERATOR', 'VIEWER')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    mfa_secret VARCHAR(255) DEFAULT NULL,
    mfa_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. User Sessions Table (Database-backed sessions with SHA-256 token hashing)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent TEXT DEFAULT NULL
);

-- 3. Indexes for fast authentication lookups and session expiration cleanup
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id);

-- 4. Initial Seed User for First-Time Setup (Default: admin@trukindo.co.id / OperatorTrukindo2026!)
-- Hash generated using scrypt with random salt. In production, change via admin dashboard.
INSERT INTO users (email, name, password_hash, role, is_active)
VALUES (
    'admin@trukindo.co.id',
    'Administrator Trukindo',
    'scrypt$b8a1c9e420f18d7a$394df3cfcb7ffca256c9d09c2a297e68fa7924d6735e58c8ecbdfb1e8a4a5843',
    'ADMIN',
    true
)
ON CONFLICT (email) DO NOTHING;

-- 5. Grant access to least-privilege runtime role (astraops_app)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'astraops_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON users TO astraops_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO astraops_app;
    END IF;
END
$$;
