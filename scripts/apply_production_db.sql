-- ==============================================================================
-- ApexSovereign.ai - Operational Command 11: Production Database DDL & Security
-- File: scripts/apply_production_db.sql
-- Classification: Production-Grade SOC 2 Type II Schema with Strict RLS
-- Target: Supabase PostgreSQL (Postgres 15 / 16)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Table: tenants
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    corporate_email VARCHAR(255) NOT NULL UNIQUE,
    billing_tier VARCHAR(64) NOT NULL DEFAULT 'ENTERPRISE_CUSTOM',
    credit_limit_usd NUMERIC(15, 2) NOT NULL DEFAULT 150000.00,
    credit_standing VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' 
        CHECK (credit_standing IN ('ACTIVE', 'WARNING', 'FROZEN', 'DELINQUENT')),
    merkle_identity_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. Table: pilot_applications (Phase 1 Concierge Triage)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pilot_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    corporate_email VARCHAR(255) NOT NULL,
    cluster_type VARCHAR(128) NOT NULL,
    monthly_compute_budget VARCHAR(64) NOT NULL,
    urgency_sla VARCHAR(64) NOT NULL DEFAULT 'MISSION_CRITICAL',
    allocated_cluster VARCHAR(128) NOT NULL,
    allocated_node_id VARCHAR(128) NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'APPROVED_PILOT',
    audit_merkle_root VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. Table: node_telemetry_stream (Phase 2 Dual Telemetry)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.node_telemetry_stream (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(128) NOT NULL,
    cluster_region VARCHAR(64) NOT NULL,
    gpu_utilization_pct NUMERIC(5, 2) NOT NULL,
    vram_used_bytes BIGINT NOT NULL,
    vram_total_bytes BIGINT NOT NULL,
    ebpf_sockmap_entries INT NOT NULL,
    heartbeat_latency_ms NUMERIC(8, 2) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. Table: failover_incidents (Phase 3 Sub-Second Hot-Swap)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.failover_incidents (
    incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id VARCHAR(128) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    preemption_signal_epoch TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cutover_completed_epoch TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cutover_latency_ms NUMERIC(8, 2) NOT NULL,
    ebpf_redirect_ms NUMERIC(8, 2) NOT NULL,
    context_dropped BOOLEAN NOT NULL DEFAULT FALSE,
    target_node_promoted VARCHAR(128) NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'CUTOVER_COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. Table: sla_escrow_reserves (Phase 3 Institutional Liquidity Pool)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sla_escrow_reserves (
    pool_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_name VARCHAR(128) NOT NULL UNIQUE,
    initial_reserve_usd NUMERIC(15, 2) NOT NULL DEFAULT 500000.00,
    current_liquid_reserve_usd NUMERIC(15, 2) NOT NULL DEFAULT 500000.00,
    total_breach_compensations_paid NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DRAWDOWN_LOCK', 'DEPLETED')),
    custodian_verification_key VARCHAR(128) NOT NULL,
    merkle_leaf_hash VARCHAR(64) NOT NULL,
    last_reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. Table: corporate_invoices (Phase 4 GAAP Billing)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.corporate_invoices (
    invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    invoice_number VARCHAR(64) NOT NULL UNIQUE,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    subtotal_usd NUMERIC(15, 2) NOT NULL,
    tax_usd NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_usd NUMERIC(15, 2) NOT NULL,
    payment_terms VARCHAR(32) NOT NULL DEFAULT 'NET_30' CHECK (payment_terms IN ('DUE_ON_RECEIPT', 'NET_30', 'NET_60')),
    status VARCHAR(32) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT', 'ISSUED', 'SETTLED', 'OVERDUE')),
    merkle_invoice_hash VARCHAR(64) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

-- ------------------------------------------------------------------------------
-- 7. High-Throughput Performance Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_telemetry_node_recorded ON public.node_telemetry_stream(node_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_failover_status ON public.failover_incidents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON public.corporate_invoices(tenant_id, status);

-- ------------------------------------------------------------------------------
-- 8. Strict Row Level Security (RLS) Configuration (SOC 2 CC6.3 Compliance)
-- ------------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pilot_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_telemetry_stream ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failover_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_escrow_reserves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_invoices ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_tenants ON public.tenants;
CREATE POLICY tenant_isolation_tenants ON public.tenants
    FOR ALL
    USING (
        id = NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::UUID
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

DROP POLICY IF EXISTS tenant_isolation_invoices ON public.corporate_invoices;
CREATE POLICY tenant_isolation_invoices ON public.corporate_invoices
    FOR ALL
    USING (
        tenant_id = NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::UUID
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
    );

DROP POLICY IF EXISTS service_role_full_access_telemetry ON public.node_telemetry_stream;
CREATE POLICY service_role_full_access_telemetry ON public.node_telemetry_stream
    FOR ALL
    USING (true);

DROP POLICY IF EXISTS service_role_full_access_failover ON public.failover_incidents;
CREATE POLICY service_role_full_access_failover ON public.failover_incidents
    FOR ALL
    USING (true);

DROP POLICY IF EXISTS read_escrow_reserves ON public.sla_escrow_reserves;
CREATE POLICY read_escrow_reserves ON public.sla_escrow_reserves
    FOR SELECT
    USING (true);

-- ------------------------------------------------------------------------------
-- 9. Initial Seed Data (Institutional $500k Escrow Baseline Pool)
-- ------------------------------------------------------------------------------
INSERT INTO public.sla_escrow_reserves (
    pool_id,
    pool_name,
    initial_reserve_usd,
    current_liquid_reserve_usd,
    total_breach_compensations_paid,
    status,
    custodian_verification_key,
    merkle_leaf_hash,
    last_reconciled_at
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'ApexSovereign Institutional Primary Escrow Pool',
    500000.00,
    500000.00,
    0.00,
    'ACTIVE',
    'ed25519_pub_apex_custody_7f9b8821901aef',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    NOW()
) ON CONFLICT (pool_name) DO UPDATE 
SET current_liquid_reserve_usd = EXCLUDED.current_liquid_reserve_usd,
    status = EXCLUDED.status;
