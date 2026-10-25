-- ============================================================================
-- ApexSovereign.ai - Production Supabase & PostgreSQL Security Hardening Script
-- Module: Row Level Security (RLS) Enactment & Least-Privilege Role Hardening
-- Execution Target: Supabase SQL Editor / Production PgBouncer (Port 6543/5432)
-- ============================================================================

-- Enforce Strict Transaction Block
BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Cryptographic Extensions & Search Path Verification
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Set session search path to prevent privilege escalation
SET search_path = public, extensions, pg_temp;

-- ----------------------------------------------------------------------------
-- 1. Ensure All Enterprise Tables Exist
-- ----------------------------------------------------------------------------

-- Core Tenants / Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    credits_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (credits_balance >= 0.0000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compute Leases Table
CREATE TABLE IF NOT EXISTS public.compute_leases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(64) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    tier VARCHAR(32) NOT NULL,
    lease_token VARCHAR(255) NOT NULL,
    estimated_cost NUMERIC(14, 4) NOT NULL,
    actual_cost NUMERIC(14, 4) DEFAULT 0.0000,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'RELEASED', 'FAILED')),
    lease_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable Billing Ledgers / Transactions Table
CREATE TABLE IF NOT EXISTS public.billing_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(64) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    amount NUMERIC(14, 4) NOT NULL,
    balance_before NUMERIC(14, 4) NOT NULL,
    balance_after NUMERIC(14, 4) NOT NULL,
    action_type VARCHAR(64) NOT NULL CHECK (
        action_type IN ('LEASE_DISPATCH', 'LEASE_RELEASE_REFUND', 'PAYPAL_DEPOSIT', 'WIRE_DEPOSIT', 'MANUAL_CREDIT')
    ),
    reference_id VARCHAR(255),
    idempotency_key VARCHAR(128) UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PayPal Webhook Ingestion & Deduplication Events
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

-- Enterprise Wire / ACH Invoices
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

-- Invoice Audit Ledgers
CREATE TABLE IF NOT EXISTS public.invoice_audit_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id VARCHAR(36) NOT NULL,
    action VARCHAR(64) NOT NULL,
    performed_by VARCHAR(128) NOT NULL,
    notes TEXT,
    metadata_json TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GPU Spot Nodes Inventory
CREATE TABLE IF NOT EXISTS public.gpu_spot_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(64) UNIQUE NOT NULL,
    provider VARCHAR(32) NOT NULL,
    region VARCHAR(64) NOT NULL,
    gpu_model VARCHAR(64) NOT NULL,
    catalog_tier VARCHAR(32) NOT NULL,
    gpu_count INT NOT NULL DEFAULT 1,
    vram_gb_total INT NOT NULL,
    cpu_cores INT NOT NULL,
    memory_gb INT NOT NULL,
    spot_ask_rate NUMERIC(10, 4) NOT NULL,
    catalog_retail_rate NUMERIC(10, 4) NOT NULL,
    gross_margin_pct NUMERIC(6, 2) NOT NULL,
    pcie_bandwidth_gbps REAL NOT NULL DEFAULT 64.0,
    cuda_capability VARCHAR(16) NOT NULL DEFAULT '9.0',
    thermal_status VARCHAR(32) NOT NULL DEFAULT 'OPTIMAL',
    network_latency_ms REAL NOT NULL DEFAULT 12.0,
    status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'EVICTED', 'OFFLINE')),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable Job Queue for Asynchronous Worker
CREATE TABLE IF NOT EXISTS public.immutable_job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR(64) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    organization_id VARCHAR(64),
    task_prompt TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    priority INT NOT NULL DEFAULT 1,
    result_payload JSONB,
    error_detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Token Ledger for AI & Compute Consumption
CREATE TABLE IF NOT EXISTS public.token_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR(64),
    tenant_id VARCHAR(64) NOT NULL,
    job_id VARCHAR(64) NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    cost_usd NUMERIC(10, 6) NOT NULL,
    billed_usd NUMERIC(10, 6) NOT NULL,
    margin_percentage NUMERIC(6, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- System Audit Logs
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subsystem VARCHAR(64) NOT NULL,
    log_level VARCHAR(16) NOT NULL DEFAULT 'INFO',
    event_name VARCHAR(128) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Revoke Unauthenticated & Public Schema Permissions (Least-Privilege)
-- ----------------------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM anon, public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Revoke all table operations from public and anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, public;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, public;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, public;

-- Grant standard permissions to backend service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- Grant restricted SELECT to authenticated frontend clients
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.compute_leases TO authenticated;
GRANT SELECT ON public.billing_ledgers TO authenticated;
GRANT SELECT ON public.enterprise_invoices TO authenticated;
GRANT SELECT ON public.gpu_spot_nodes TO authenticated;
GRANT SELECT ON public.token_ledger TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Enable and Force Row Level Security (RLS) Across All Critical Tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

ALTER TABLE public.compute_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compute_leases FORCE ROW LEVEL SECURITY;

ALTER TABLE public.billing_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_ledgers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_webhook_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.enterprise_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_audit_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_audit_ledgers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.gpu_spot_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpu_spot_nodes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.immutable_job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.immutable_job_queue FORCE ROW LEVEL SECURITY;

ALTER TABLE public.token_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_ledger FORCE ROW LEVEL SECURITY;

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. Define Deterministic Least-Privilege RLS Policies
-- ----------------------------------------------------------------------------

-- Drop any existing conflicting policies
DROP POLICY IF EXISTS "service_role_unrestricted_users" ON public.users;
DROP POLICY IF EXISTS "tenant_select_own_user" ON public.users;

DROP POLICY IF EXISTS "service_role_unrestricted_leases" ON public.compute_leases;
DROP POLICY IF EXISTS "tenant_select_own_leases" ON public.compute_leases;

DROP POLICY IF EXISTS "service_role_unrestricted_ledgers" ON public.billing_ledgers;
DROP POLICY IF EXISTS "tenant_select_own_ledgers" ON public.billing_ledgers;

DROP POLICY IF EXISTS "service_role_unrestricted_webhooks" ON public.paypal_webhook_events;

DROP POLICY IF EXISTS "service_role_unrestricted_invoices" ON public.enterprise_invoices;
DROP POLICY IF EXISTS "tenant_select_own_invoices" ON public.enterprise_invoices;

DROP POLICY IF EXISTS "service_role_unrestricted_audit" ON public.invoice_audit_ledgers;

DROP POLICY IF EXISTS "service_role_unrestricted_spot" ON public.gpu_spot_nodes;
DROP POLICY IF EXISTS "authenticated_select_spot_nodes" ON public.gpu_spot_nodes;

DROP POLICY IF EXISTS "service_role_unrestricted_jobs" ON public.immutable_job_queue;
DROP POLICY IF EXISTS "tenant_select_own_jobs" ON public.immutable_job_queue;

DROP POLICY IF EXISTS "service_role_unrestricted_tokens" ON public.token_ledger;
DROP POLICY IF EXISTS "tenant_select_own_tokens" ON public.token_ledger;

DROP POLICY IF EXISTS "service_role_unrestricted_logs" ON public.system_logs;

-- A. USERS POLICIES
CREATE POLICY "service_role_unrestricted_users" ON public.users
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_user" ON public.users
    FOR SELECT TO authenticated
    USING (
        tenant_id = (auth.jwt() ->> 'tenant_id')
        OR tenant_id = (auth.jwt() ->> 'sub')
    );

-- B. COMPUTE LEASES POLICIES
CREATE POLICY "service_role_unrestricted_leases" ON public.compute_leases
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_leases" ON public.compute_leases
    FOR SELECT TO authenticated
    USING (
        tenant_id = (auth.jwt() ->> 'tenant_id')
        OR tenant_id = (auth.jwt() ->> 'sub')
    );

-- C. BILLING LEDGERS POLICIES (Immutable: strictly read-only for tenants)
CREATE POLICY "service_role_unrestricted_ledgers" ON public.billing_ledgers
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_ledgers" ON public.billing_ledgers
    FOR SELECT TO authenticated
    USING (
        tenant_id = (auth.jwt() ->> 'tenant_id')
        OR tenant_id = (auth.jwt() ->> 'sub')
    );

-- D. PAYPAL WEBHOOK EVENTS (Zero tenant access: service_role only)
CREATE POLICY "service_role_unrestricted_webhooks" ON public.paypal_webhook_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- E. ENTERPRISE INVOICES
CREATE POLICY "service_role_unrestricted_invoices" ON public.enterprise_invoices
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_invoices" ON public.enterprise_invoices
    FOR SELECT TO authenticated
    USING (
        tenant_id = (auth.jwt() ->> 'tenant_id')
        OR tenant_id = (auth.jwt() ->> 'sub')
    );

-- F. INVOICE AUDIT LEDGERS (Internal financial compliance: service_role only)
CREATE POLICY "service_role_unrestricted_audit" ON public.invoice_audit_ledgers
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- G. GPU SPOT NODES (Catalog is readable by authenticated users; managed only by service_role)
CREATE POLICY "service_role_unrestricted_spot" ON public.gpu_spot_nodes
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_spot_nodes" ON public.gpu_spot_nodes
    FOR SELECT TO authenticated
    USING (status = 'AVAILABLE');

-- H. IMMUTABLE JOB QUEUE
CREATE POLICY "service_role_unrestricted_jobs" ON public.immutable_job_queue
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_jobs" ON public.immutable_job_queue
    FOR SELECT TO authenticated
    USING (
        tenant_id = (auth.jwt() ->> 'tenant_id')
        OR tenant_id = (auth.jwt() ->> 'sub')
    );

-- I. TOKEN LEDGER
CREATE POLICY "service_role_unrestricted_tokens" ON public.token_ledger
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tenant_select_own_tokens" ON public.token_ledger
    FOR SELECT TO authenticated
    USING (
        tenant_id = (auth.jwt() ->> 'tenant_id')
        OR tenant_id = (auth.jwt() ->> 'sub')
    );

-- J. SYSTEM LOGS (Internal platform telemetry: service_role only)
CREATE POLICY "service_role_unrestricted_logs" ON public.system_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5. Mutable Search Path Hardening for Stored Functions
-- ----------------------------------------------------------------------------

-- Atomic Tenant Balance Debit with Row Locking (Prevents concurrency race & negative balances)
CREATE OR REPLACE FUNCTION public.atomic_debit_tenant(
    p_tenant_id VARCHAR(64),
    p_amount NUMERIC(14, 4),
    p_transaction_id VARCHAR(64),
    p_reference_id VARCHAR(255),
    p_action_type VARCHAR(64),
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_balance NUMERIC(14, 4);
    v_new_balance NUMERIC(14, 4);
    v_existing_id UUID;
BEGIN
    -- Idempotency check
    SELECT id INTO v_existing_id
    FROM public.billing_ledgers
    WHERE transaction_id = p_transaction_id;

    IF v_existing_id IS NOT NULL THEN
        SELECT credits_balance INTO v_current_balance FROM public.users WHERE tenant_id = p_tenant_id;
        RETURN jsonb_build_object(
            'status', 'ALREADY_PROCESSED',
            'transaction_id', p_transaction_id,
            'current_balance', v_current_balance
        );
    END IF;

    -- Row-level exclusive lock on user record
    SELECT credits_balance INTO v_current_balance
    FROM public.users
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant % does not exist', p_tenant_id;
    END IF;

    IF v_current_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient compute credits. Current: %, Requested: %', v_current_balance, p_amount;
    END IF;

    v_new_balance := v_current_balance - p_amount;

    -- Update User Record
    UPDATE public.users
    SET credits_balance = v_new_balance,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id;

    -- Record Immutable Ledger
    INSERT INTO public.billing_ledgers (
        transaction_id,
        tenant_id,
        amount,
        balance_before,
        balance_after,
        action_type,
        reference_id,
        metadata
    ) VALUES (
        p_transaction_id,
        p_tenant_id,
        -p_amount,
        v_current_balance,
        v_new_balance,
        p_action_type,
        p_reference_id,
        p_metadata
    );

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'tenant_id', p_tenant_id,
        'balance_before', v_current_balance,
        'balance_after', v_new_balance,
        'debited', p_amount
    );
END;
$$;

-- Atomic Tenant Balance Credit with Row Locking
CREATE OR REPLACE FUNCTION public.atomic_credit_tenant(
    p_tenant_id VARCHAR(64),
    p_amount NUMERIC(14, 4),
    p_transaction_id VARCHAR(64),
    p_reference_id VARCHAR(255),
    p_action_type VARCHAR(64),
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_balance NUMERIC(14, 4);
    v_new_balance NUMERIC(14, 4);
    v_existing_id UUID;
BEGIN
    -- Idempotency check
    SELECT id INTO v_existing_id
    FROM public.billing_ledgers
    WHERE transaction_id = p_transaction_id;

    IF v_existing_id IS NOT NULL THEN
        SELECT credits_balance INTO v_current_balance FROM public.users WHERE tenant_id = p_tenant_id;
        RETURN jsonb_build_object(
            'status', 'ALREADY_PROCESSED',
            'transaction_id', p_transaction_id,
            'current_balance', v_current_balance
        );
    END IF;

    -- Row-level exclusive lock on user record
    SELECT credits_balance INTO v_current_balance
    FROM public.users
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Auto-provision user if first deposit
        INSERT INTO public.users (tenant_id, email, credits_balance)
        VALUES (p_tenant_id, p_tenant_id || '@apexsovereign.tenant', 0.0000)
        RETURNING credits_balance INTO v_current_balance;
    END IF;

    v_new_balance := v_current_balance + p_amount;

    UPDATE public.users
    SET credits_balance = v_new_balance,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id;

    INSERT INTO public.billing_ledgers (
        transaction_id,
        tenant_id,
        amount,
        balance_before,
        balance_after,
        action_type,
        reference_id,
        metadata
    ) VALUES (
        p_transaction_id,
        p_tenant_id,
        p_amount,
        v_current_balance,
        v_new_balance,
        p_action_type,
        p_reference_id,
        p_metadata
    );

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'tenant_id', p_tenant_id,
        'balance_before', v_current_balance,
        'balance_after', v_new_balance,
        'credited', p_amount
    );
END;
$$;

-- Secure execution permissions on functions
REVOKE EXECUTE ON FUNCTION public.atomic_debit_tenant FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.atomic_credit_tenant FROM anon, public;

GRANT EXECUTE ON FUNCTION public.atomic_debit_tenant TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_credit_tenant TO service_role;

COMMIT;
-- ============================================================================
-- End of Supabase Security & RLS Hardening Script
-- ============================================================================
