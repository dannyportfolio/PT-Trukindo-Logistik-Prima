-- Migration 004: Add source, phone, and inquiry_details to leads table
-- Trukindo Logistics Platform: Inbound Inquiry Pipeline Support

-- 1. Add source column with default for backward compatibility
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'MANUAL_PROSPECT';

-- 2. Add contact phone column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone VARCHAR(50) DEFAULT NULL;

-- 3. Add inquiry_details JSONB column for shipment specifications
ALTER TABLE leads ADD COLUMN IF NOT EXISTS inquiry_details JSONB DEFAULT NULL;

-- 4. Create index on source for quick commercial queue filtering
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads (source);

-- 5. Role-based privileges for application runtime role (astraops_app)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'astraops_app') THEN
        GRANT SELECT, INSERT, UPDATE ON leads TO astraops_app;
    END IF;
END
$$;
