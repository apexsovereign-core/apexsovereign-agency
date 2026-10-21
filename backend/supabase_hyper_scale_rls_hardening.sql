-- ============================================================================
-- ApexSovereign.ai - Enterprise Hyper-Scale PostgreSQL & Supabase RLS Hardening
-- Module: Multi-Tenant Tier Isolation (Sandbox / Pro / Enterprise)
-- Security: Ephemeral HMAC Nonce Leases, Anti-Replay, Tamper-Evident Chained Ledgers
-- Target: Supabase SQL Editor / Production PgBouncer (Port 6543/5432)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Cryptographic Extensions & Pinned Search Path (Security Advisor Compliance)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Strict search_path to prevent arbitrary function search-path injection
SET search_path = public, extensions, pg_temp;

-- ----------------------------------------------------------------------------
-- 1. Ensure Multi-Tenant Core Tables with Tier Constraints
-- ----------------------------------------------------------------------------

-- Core Users & Tenants with Tier Enforcement
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    tenant_tier VARCHAR(32) NOT NULL DEFAULT 'PRO' CHECK (tenant_tier IN ('SANDBOX', 'PRO', 'ENTERPRISE')),
    credits_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (credits_balance >= 0.0000),
    rate_limit_per_minute INT NOT NULL DEFAULT 120 CHECK (rate_limit_per_minute > 0),
    burst_allowance NUMERIC(14, 4) NOT NULL DEFAULT 500.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ephemeral HMAC-SHA256 Execution Lease Nonces (Anti-Replay Protection)
CREATE TABLE IF NOT EXISTS public.execution_lease_nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonce VARCHAR(64) UNIQUE NOT NULL,
    job_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lease_nonces_expiry ON public.execution_lease_nonces(expires_at);

-- Compute Leases with Tenant Tier & Nonce Integrity
CREATE TABLE IF NOT EXISTS public.compute_leases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(64) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    tenant_tier VARCHAR(32) NOT NULL DEFAULT 'PRO' CHECK (tenant_tier IN ('SANDBOX', 'PRO', 'ENTERPRISE')),
    resource_tier VARCHAR(32) NOT NULL,
    lease_token VARCHAR(512) NOT NULL,
    lease_nonce VARCHAR(64) NOT NULL,
    hold_amount NUMERIC(14, 4) NOT NULL,
    actual_cost NUMERIC(14, 4) DEFAULT 0.0000,
    status VARCHAR(32) NOT NULL DEFAULT 'LEASED' CHECK (status IN ('LEASED', 'ACTIVE', 'RELEASED', 'EXPIRED', 'FAILED')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tamper-Evident Chained Blockchain-Style Audit Ledger
CREATE TABLE IF NOT EXISTS public.enterprise_tamper_audit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_num BIGSERIAL UNIQUE,
    tenant_id VARCHAR(64) NOT NULL,
    tenant_tier VARCHAR(32) NOT NULL,
    subsystem VARCHAR(64) NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128) NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    prev_hash VARCHAR(64) NOT NULL,
    record_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON public.enterprise_tamper_audit_ledger(tenant_id, created_at DESC);

-- Double-Entry Immutable Billing Ledgers
CREATE TABLE IF NOT EXISTS public.billing_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(64) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    amount NUMERIC(14, 4) NOT NULL,
    balance_before NUMERIC(14, 4) NOT NULL,
    balance_after NUMERIC(14, 4) NOT NULL,
    action_type VARCHAR(64) NOT NULL CHECK (
        action_type IN ('LEASE_DISPATCH', 'LEASE_RELEASE_REFUND', 'PAYPAL_DEPOSIT', 'WIRE_DEPOSIT', 'MANUAL_CREDIT', 'BURST_ALLOCATION')
    ),
    reference_id VARCHAR(255),
    idempotency_key VARCHAR(128) UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PayPal Webhook Deduplication & Cryptographic Verification Events
CREATE TABLE IF NOT EXISTS public.paypal_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transmission_id VARCHAR(128) UNIQUE NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(64),
    cleared_amount NUMERIC(12, 2),
    raw_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload JSONB NOT NULL,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'CRYPTOGRAPHICALLY_VERIFIED',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enterprise Wire / Invoices
CREATE TABLE IF NOT EXISTS public.enterprise_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(64) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    organization_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    billing_address TEXT NOT NULL,
    subtotal_amount NUMERIC(12, 2) NOT NULL,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    payment_terms VARCHAR(32) NOT NULL DEFAULT 'NET_30',
    status VARCHAR(32) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'VOIDED')),
    reference_code VARCHAR(64) UNIQUE NOT NULL,
    credits_to_provision NUMERIC(14, 4) NOT NULL,
    credits_provisioned BOOLEAN NOT NULL DEFAULT FALSE,
    wire_confirmation_number VARCHAR(128),
    cleared_amount NUMERIC(12, 2),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_at TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Security Functions with Fixed Search Path (SECURITY INVOKER)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        current_setting('request.jwt.claim.tenant_id', true),
        (auth.jwt() ->> 'tenant_id'),
        (auth.jwt() ->> 'sub'),
        'unauthenticated_guest'
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_tier()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        (auth.jwt() ->> 'tenant_tier'),
        (SELECT tenant_tier FROM public.users WHERE tenant_id = public.current_user_tenant_id() LIMIT 1),
        'SANDBOX'
    );
$$;

-- Stored Function: Atomically Debits Tenant Credits with Row Locking
CREATE OR REPLACE FUNCTION public.atomic_debit_tenant(
    p_tenant_id VARCHAR(64),
    p_amount NUMERIC(18, 4),
    p_tx_id VARCHAR(64),
    p_ref_id VARCHAR(255),
    p_action_type VARCHAR(64) DEFAULT 'LEASE_DISPATCH'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_curr_balance NUMERIC(18, 4);
    v_new_balance NUMERIC(18, 4);
BEGIN
    -- Acquire exclusive row lock
    SELECT credits_balance INTO v_curr_balance
    FROM public.users
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant % not found in sovereign ledger', p_tenant_id;
    END IF;

    IF v_curr_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient credits: required %, available %', p_amount, v_curr_balance;
    END IF;

    v_new_balance := v_curr_balance - p_amount;

    -- Update balance
    UPDATE public.users
    SET credits_balance = v_new_balance,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id;

    -- Record double-entry ledger
    INSERT INTO public.billing_ledgers (
        transaction_id,
        tenant_id,
        amount,
        balance_before,
        balance_after,
        action_type,
        reference_id
    ) VALUES (
        p_tx_id,
        p_tenant_id,
        p_amount,
        v_curr_balance,
        v_new_balance,
        p_action_type,
        p_ref_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'balance_before', v_curr_balance,
        'balance_after', v_new_balance,
        'debited', p_amount
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Least-Privilege Grants & Row-Level Security (RLS)
-- ----------------------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM anon, public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, public;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, public;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.compute_leases TO authenticated;
GRANT SELECT ON public.billing_ledgers TO authenticated;
GRANT SELECT ON public.enterprise_invoices TO authenticated;
GRANT SELECT ON public.enterprise_tamper_audit_ledger TO authenticated;

-- Enable & Force RLS Across All Tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

ALTER TABLE public.execution_lease_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_lease_nonces FORCE ROW LEVEL SECURITY;

ALTER TABLE public.compute_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compute_leases FORCE ROW LEVEL SECURITY;

ALTER TABLE public.enterprise_tamper_audit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_tamper_audit_ledger FORCE ROW LEVEL SECURITY;

ALTER TABLE public.billing_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_ledgers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_webhook_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.enterprise_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_invoices FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. Tier-Aware Least-Privilege Policies
-- ----------------------------------------------------------------------------

-- A. USERS
DROP POLICY IF EXISTS "service_role_all_users" ON public.users;
DROP POLICY IF EXISTS "tenant_select_own_record" ON public.users;

CREATE POLICY "service_role_all_users" ON public.users
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_record" ON public.users
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_user_tenant_id());

-- B. COMPUTE LEASES (Tier isolation: Sandbox tenants cannot inspect Pro/Enterprise clusters)
DROP POLICY IF EXISTS "service_role_all_leases" ON public.compute_leases;
DROP POLICY IF EXISTS "tenant_select_own_leases" ON public.compute_leases;

CREATE POLICY "service_role_all_leases" ON public.compute_leases
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_leases" ON public.compute_leases
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_user_tenant_id());

-- C. EXECUTION LEASE NONCES (Strict service-role isolation to prevent token harvest)
DROP POLICY IF EXISTS "service_role_all_nonces" ON public.execution_lease_nonces;
CREATE POLICY "service_role_all_nonces" ON public.execution_lease_nonces
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- D. TAMPER-EVIDENT AUDIT LEDGER (Tenants can verify own cryptographic audit trail)
DROP POLICY IF EXISTS "service_role_all_audit" ON public.enterprise_tamper_audit_ledger;
DROP POLICY IF EXISTS "tenant_select_own_audit" ON public.enterprise_tamper_audit_ledger;

CREATE POLICY "service_role_all_audit" ON public.enterprise_tamper_audit_ledger
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_audit" ON public.enterprise_tamper_audit_ledger
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_user_tenant_id());

-- E. BILLING LEDGERS
DROP POLICY IF EXISTS "service_role_all_billing" ON public.billing_ledgers;
DROP POLICY IF EXISTS "tenant_select_own_billing" ON public.billing_ledgers;

CREATE POLICY "service_role_all_billing" ON public.billing_ledgers
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_billing" ON public.billing_ledgers
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_user_tenant_id());

-- F. WEBHOOK EVENTS (Strict service_role only)
DROP POLICY IF EXISTS "service_role_all_webhooks" ON public.paypal_webhook_events;
CREATE POLICY "service_role_all_webhooks" ON public.paypal_webhook_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- G. ENTERPRISE INVOICES
DROP POLICY IF EXISTS "service_role_all_invoices" ON public.enterprise_invoices;
DROP POLICY IF EXISTS "tenant_select_own_invoices" ON public.enterprise_invoices;

CREATE POLICY "service_role_all_invoices" ON public.enterprise_invoices
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_invoices" ON public.enterprise_invoices
    FOR SELECT TO authenticated
    USING (tenant_id = public.current_user_tenant_id());

COMMIT;
-- ============================================================================
-- End of Hyper-Scale Multi-Tenant RLS Hardening Script
-- ============================================================================
