-- ============================================================================
-- ApexSovereign.ai - Advanced Enterprise Expansion Schema Migration (Milestones 5, 6, 7)
-- Features:
--   1. Milestone 5: Multi-Region Global GPU Arbitrage, Spot Pricing & Latency Matrix
--   2. Milestone 6: Enterprise Procurement & Automated ACH/Wire Invoicing Engine
--   3. Milestone 7: Immutable SOC 2 Append-Only WORM Audit Log & Cryptographic Ledger
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- MILESTONE 5: Multi-Region Global GPU Arbitrage & Edge Load Balancing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cluster_regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_code VARCHAR(64) UNIQUE NOT NULL, -- e.g. 'us-east-va', 'us-west-or', 'eu-central-fra', 'ap-southeast-sin'
    region_name VARCHAR(128) NOT NULL,
    datacenter_provider VARCHAR(64) NOT NULL DEFAULT 'EQUINIX_BARE_METAL',
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    spot_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00, -- Dynamic spot discount (e.g. 15.5%)
    power_pue_index NUMERIC(4, 2) NOT NULL DEFAULT 1.15,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regional_spot_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_code VARCHAR(64) NOT NULL REFERENCES cluster_regions(region_code) ON DELETE CASCADE,
    gpu_architecture VARCHAR(64) NOT NULL CHECK (
        gpu_architecture IN ('NVIDIA_V100', 'NVIDIA_A100_80GB', 'NVIDIA_H100_SXM5', 'NVIDIA_L40S')
    ),
    base_hourly_credits NUMERIC(10, 4) NOT NULL,
    spot_hourly_credits NUMERIC(10, 4) NOT NULL,
    spot_savings_ratio NUMERIC(5, 4) GENERATED ALWAYS AS (
        ROUND((base_hourly_credits - spot_hourly_credits) / NULLIF(base_hourly_credits, 0), 4)
    ) STORED,
    available_nodes_count INT NOT NULL DEFAULT 0,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spot_prices_lookup ON regional_spot_prices(region_code, gpu_architecture, recorded_at DESC);

CREATE TABLE IF NOT EXISTS edge_latency_probes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_ip_hash VARCHAR(64) NOT NULL,
    target_region VARCHAR(64) NOT NULL REFERENCES cluster_regions(region_code) ON DELETE CASCADE,
    latency_ms NUMERIC(8, 2) NOT NULL,
    jitter_ms NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_latency_probes_lookup ON edge_latency_probes(client_ip_hash, target_region, recorded_at DESC);

-- ----------------------------------------------------------------------------
-- MILESTONE 6: Enterprise Procurement & Automated ACH/Wire Invoicing Engine
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS corporate_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(64) UNIQUE NOT NULL, -- e.g. 'INV-2026-APEX-8921'
    tenant_id VARCHAR(64) NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    billing_address TEXT NOT NULL,
    subtotal_amount NUMERIC(12, 2) NOT NULL,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    payment_terms VARCHAR(32) NOT NULL DEFAULT 'NET_30' CHECK (
        payment_terms IN ('NET_15', 'NET_30', 'DUE_ON_RECEIPT')
    ),
    status VARCHAR(32) NOT NULL DEFAULT 'ISSUED' CHECK (
        status IN ('DRAFT', 'ISSUED', 'SETTLED', 'OVERDUE', 'VOIDED')
    ),
    wire_reference_code VARCHAR(64) UNIQUE NOT NULL,
    bank_beneficiary VARCHAR(128) NOT NULL DEFAULT 'ApexSovereign Treasury Holdings LLC',
    bank_name VARCHAR(128) NOT NULL DEFAULT 'JPMorgan Chase Bank, N.A.',
    wire_routing_aba VARCHAR(64) NOT NULL DEFAULT '021000021',
    wire_account_last4 VARCHAR(8) NOT NULL DEFAULT '8824',
    swift_bic VARCHAR(32) NOT NULL DEFAULT 'CHASUS33',
    credits_allocated NUMERIC(18, 4) NOT NULL,
    credits_provisioned BOOLEAN NOT NULL DEFAULT FALSE,
    pdf_s3_url TEXT,
    cleared_at TIMESTAMPTZ,
    due_date TIMESTAMPTZ NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON corporate_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_wire_ref ON corporate_invoices(wire_reference_code);

-- ----------------------------------------------------------------------------
-- MILESTONE 7: Immutable SOC 2 Append-Only WORM Audit Log & Cryptographic Ledger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(64) UNIQUE NOT NULL,
    tenant_id VARCHAR(64),
    principal_id VARCHAR(128) NOT NULL, -- User ID, API Key prefix, or service_role
    principal_role VARCHAR(64) NOT NULL DEFAULT 'TENANT_DEVELOPER',
    event_category VARCHAR(64) NOT NULL CHECK (
        event_category IN ('AUTH_EVENT', 'COMPUTE_DISPATCH', 'BILLING_MUTATION', 'SECURITY_POLICY', 'ADMIN_ACTION')
    ),
    action VARCHAR(128) NOT NULL, -- e.g. 'api_key.created', 'lease.allocated', 'wire.settled'
    resource_type VARCHAR(64) NOT NULL, -- e.g. 'compute_lease', 'api_key', 'tenant'
    resource_id VARCHAR(128) NOT NULL,
    ip_address VARCHAR(64) NOT NULL DEFAULT '0.0.0.0',
    user_agent TEXT,
    request_payload JSONB DEFAULT '{}'::jsonb,
    outcome VARCHAR(32) NOT NULL DEFAULT 'SUCCESS' CHECK (outcome IN ('SUCCESS', 'DENIED', 'ERROR')),
    error_details TEXT,
    -- Cryptographic Tamper-Evidence (Merkle / Hash Chain)
    prev_record_hash VARCHAR(128) NOT NULL,
    record_hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(event_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_hash ON audit_logs(record_hash);

-- Enforce Strict WORM (Write Once, Read Many): Block all UPDATE and DELETE via Trigger
CREATE OR REPLACE FUNCTION enforce_audit_log_worm()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SOC 2 COMPLIANCE VIOLATION: audit_logs is an immutable append-only WORM table. UPDATE and DELETE operations are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_worm_prevent_mutation ON audit_logs;
CREATE TRIGGER trg_audit_logs_worm_prevent_mutation
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION enforce_audit_log_worm();

-- Enable Supabase Row Level Security & Access Policies
ALTER TABLE cluster_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regional_spot_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_latency_probes ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
    expansion_tables TEXT[] := ARRAY[
        'cluster_regions',
        'regional_spot_prices',
        'edge_latency_probes',
        'corporate_invoices',
        'audit_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY expansion_tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_all_' || tbl, tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_role_all_' || tbl, tbl);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_read_' || tbl, tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'auth_read_' || tbl, tbl);
    END LOOP;
END $$;
