-- ============================================================================
-- ApexSovereign.ai - AI Automation Agency (AAA) & Institutional Clearance Engine
-- Module: Planetary Scale Strategic Schema Migration
-- Features:
--   1. Enterprise Transformation Request Ingestion & Auto-Scoping
--   2. Dynamic Smart Invoices & High-Ticket Retainer Ledger
--   3. Institutional Waitlist & Zero-Trust HMAC/PQC Clearance Gate
--   4. Row-Level Security (RLS) hardening & Index Optimization
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENTERPRISE TRANSFORMATION REQUESTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enterprise_transformation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(128) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    industry VARCHAR(64) NOT NULL DEFAULT 'FINTECH',
    company_size VARCHAR(64) NOT NULL DEFAULT '200-1000',
    current_stack JSONB NOT NULL DEFAULT '[]'::jsonb,
    automation_objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
    estimated_monthly_compute_hours NUMERIC(10, 2) NOT NULL DEFAULT 120.00,
    budget_tier VARCHAR(64) NOT NULL DEFAULT 'TIER_2_ENTERPRISE_CORE',
    urgency VARCHAR(64) NOT NULL DEFAULT 'IMMEDIATE',
    status VARCHAR(64) NOT NULL DEFAULT 'SCOPED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. AAA SCOPED PROPOSALS & VALUE CALCULATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aaa_scoped_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES enterprise_transformation_requests(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    recommended_tier VARCHAR(64) NOT NULL,
    executive_summary TEXT NOT NULL,
    architecture_milestones JSONB NOT NULL,
    estimated_roi_multiplier NUMERIC(5, 2) NOT NULL DEFAULT 3.50,
    projected_hours_saved_monthly INT NOT NULL DEFAULT 480,
    implementation_fee_usd NUMERIC(12, 2) NOT NULL,
    monthly_retainer_usd NUMERIC(12, 2) NOT NULL,
    compute_credits_included NUMERIC(12, 2) NOT NULL,
    cryptographic_quote_hash VARCHAR(64) NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. AAA SMART INVOICES & SETTLEMENT TRACKING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aaa_smart_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(64) UNIQUE NOT NULL,
    proposal_id UUID REFERENCES aaa_scoped_proposals(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    implementation_fee_usd NUMERIC(12, 2) NOT NULL,
    monthly_retainer_usd NUMERIC(12, 2) NOT NULL,
    total_due_usd NUMERIC(12, 2) NOT NULL,
    payment_status VARCHAR(64) NOT NULL DEFAULT 'PENDING_SETTLEMENT',
    paypal_order_id VARCHAR(128),
    wire_routing_ref VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. AAA HIGH-MARGIN RETAINER CONTRACTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aaa_retainer_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    proposal_id UUID REFERENCES aaa_scoped_proposals(id) ON DELETE SET NULL,
    company_name VARCHAR(255) NOT NULL,
    monthly_retainer_usd NUMERIC(12, 2) NOT NULL,
    sla_tier VARCHAR(64) NOT NULL DEFAULT 'MISSION_CRITICAL_99_99',
    corporate_webhook_url TEXT,
    active_workflows JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    next_billing_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. INSTITUTIONAL WAITLIST
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutional_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_name VARCHAR(255) NOT NULL,
    work_email VARCHAR(255) NOT NULL,
    contact_name VARCHAR(128) NOT NULL,
    requested_compute_capacity VARCHAR(128) NOT NULL DEFAULT '8x NVIDIA H100 SXM5',
    use_case TEXT NOT NULL,
    deposit_committed_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    priority_tier VARCHAR(64) NOT NULL DEFAULT 'TIER_C_STANDARD',
    queue_position INT NOT NULL,
    clearance_status VARCHAR(64) NOT NULL DEFAULT 'PENDING_VERIFICATION',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. INSTITUTIONAL CLEARANCE TOKENS (HMAC & PQC LATTICE SIGNED)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutional_clearance_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    waitlist_id UUID REFERENCES institutional_waitlist(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    hmac_clearance_token VARCHAR(255) UNIQUE NOT NULL,
    pqc_lattice_signature TEXT NOT NULL,
    allocated_credits NUMERIC(12, 2) NOT NULL DEFAULT 2500.00,
    sla_rank VARCHAR(64) NOT NULL DEFAULT 'SOVEREIGN_PRIORITY',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- ----------------------------------------------------------------------------
-- INDEXES & PERFORMANCE OPTIMIZATIONS
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trans_req_company ON enterprise_transformation_requests(company_name);
CREATE INDEX IF NOT EXISTS idx_trans_req_email ON enterprise_transformation_requests(contact_email);
CREATE INDEX IF NOT EXISTS idx_scoped_proposals_hash ON aaa_scoped_proposals(cryptographic_quote_hash);
CREATE INDEX IF NOT EXISTS idx_smart_inv_num ON aaa_smart_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_smart_inv_status ON aaa_smart_invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_retainer_tenant ON aaa_retainer_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON institutional_waitlist(work_email);
CREATE INDEX IF NOT EXISTS idx_waitlist_priority ON institutional_waitlist(priority_tier, queue_position);
CREATE INDEX IF NOT EXISTS idx_clearance_token ON institutional_clearance_tokens(hmac_clearance_token);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) HARDENING
-- ----------------------------------------------------------------------------
ALTER TABLE enterprise_transformation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE aaa_scoped_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE aaa_smart_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE aaa_retainer_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutional_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutional_clearance_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_admin_enterprise_transformation ON enterprise_transformation_requests;
CREATE POLICY rls_admin_enterprise_transformation ON enterprise_transformation_requests
    FOR ALL
    USING (auth.jwt() ->> 'role' IN ('service_role', 'admin', 'authenticated'));

DROP POLICY IF EXISTS rls_admin_scoped_proposals ON aaa_scoped_proposals;
CREATE POLICY rls_admin_scoped_proposals ON aaa_scoped_proposals
    FOR ALL
    USING (auth.jwt() ->> 'role' IN ('service_role', 'admin', 'authenticated'));

DROP POLICY IF EXISTS rls_admin_smart_invoices ON aaa_smart_invoices;
CREATE POLICY rls_admin_smart_invoices ON aaa_smart_invoices
    FOR ALL
    USING (auth.jwt() ->> 'role' IN ('service_role', 'admin', 'authenticated'));

DROP POLICY IF EXISTS rls_admin_retainer_contracts ON aaa_retainer_contracts;
CREATE POLICY rls_admin_retainer_contracts ON aaa_retainer_contracts
    FOR ALL
    USING (auth.jwt() ->> 'role' IN ('service_role', 'admin', 'authenticated'));

DROP POLICY IF EXISTS rls_admin_waitlist ON institutional_waitlist;
CREATE POLICY rls_admin_waitlist ON institutional_waitlist
    FOR ALL
    USING (auth.jwt() ->> 'role' IN ('service_role', 'admin', 'authenticated'));

DROP POLICY IF EXISTS rls_admin_clearance_tokens ON institutional_clearance_tokens;
CREATE POLICY rls_admin_clearance_tokens ON institutional_clearance_tokens
    FOR ALL
    USING (auth.jwt() ->> 'role' IN ('service_role', 'admin', 'authenticated'));
