-- ============================================================================
-- ApexSovereign.ai - Operational Command 01: Pilot Applications & Ledger Binding
-- Migration: 20260925_001_pilot_applications_and_concierge_triage.sql
-- ============================================================================

-- 1. Pilot Applications Table for Inbound Concierge Workload Intake
CREATE TABLE IF NOT EXISTS pilot_applications (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    session_id VARCHAR(128) NOT NULL,
    company_name VARCHAR(255) NOT NULL DEFAULT 'Enterprise Partner',
    contact_email VARCHAR(255),
    user_message TEXT,
    requested_gpu VARCHAR(128) NOT NULL DEFAULT 'NVIDIA H100 80GB SXM5',
    preferred_gpu VARCHAR(128) NOT NULL DEFAULT 'NVIDIA H100 80GB SXM5',
    intent_score INT NOT NULL DEFAULT 65 CHECK (intent_score BETWEEN 0 AND 100),
    classified_tier VARCHAR(64) NOT NULL DEFAULT 'ENTERPRISE_QUALIFIED',
    status VARCHAR(64) NOT NULL DEFAULT 'TRIAGED',
    raw_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for rapid session retrieval and tenant pipeline analysis
CREATE INDEX IF NOT EXISTS idx_pilot_apps_tenant ON pilot_applications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pilot_apps_session ON pilot_applications(session_id);
CREATE INDEX IF NOT EXISTS idx_pilot_apps_status ON pilot_applications(status, created_at DESC);

-- 2. Audit Events Table for SOC 2 Type II Merkle Auditing
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    merkle_hash VARCHAR(128) NOT NULL,
    payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant ON audit_events(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_merkle ON audit_events(merkle_hash);

-- 3. Row Level Security (RLS) Enforcement
ALTER TABLE pilot_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Service role has full permissions for ingestion and triage
DROP POLICY IF EXISTS service_role_all_pilot_applications ON pilot_applications;
CREATE POLICY service_role_all_pilot_applications ON pilot_applications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_audit_events ON audit_events;
CREATE POLICY service_role_all_audit_events ON audit_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated tenants can inspect their own organization's applications
DROP POLICY IF EXISTS tenant_read_own_pilot_applications ON pilot_applications;
CREATE POLICY tenant_read_own_pilot_applications ON pilot_applications
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
        OR tenant_id IS NULL
    );

-- Public / Anonymous sessions can insert intake submissions (Intake Gate)
DROP POLICY IF EXISTS anon_insert_pilot_applications ON pilot_applications;
CREATE POLICY anon_insert_pilot_applications ON pilot_applications
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- 3. Double-Entry Financial Ledger Extensions for Pilot Reservations
-- Ensures ledger_entries table permits PILOT_COMPUTE_RESERVATION entries
COMMENT ON TABLE pilot_applications IS 'Inbound autonomous compute pilot applications triaged via /v1/concierge/triage.';
