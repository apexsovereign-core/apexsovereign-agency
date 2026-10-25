-- migrations/20260929_allocate_gpu_credits.sql
-- Production Supabase / PostgreSQL 16 Migration: Atomic Credit Provisioning & RLS Hardening
BEGIN;

-- 1. Ensure settlement audit log table exists for Redis Stream reconciliation
CREATE TABLE IF NOT EXISTS public.settlement_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_msg_id TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
    workload_id TEXT NOT NULL,
    cu_deducted NUMERIC(16, 6) NOT NULL,
    idempotency_key TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON public.settlement_audit_log(tenant_id);

-- 2. Atomic Credit Allocation Function: $1.00 USD = 100.000000 Compute Units (CU)
CREATE OR REPLACE FUNCTION public.allocate_gpu_credits(
    p_tenant_id TEXT,
    p_usd_amount NUMERIC,
    p_reference_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cu_to_allocate NUMERIC;
    v_prev_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    IF p_usd_amount <= 0.00 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: USD amount must be greater than zero, received: %', p_usd_amount;
    END IF;

    -- Calculate CU: $1.00 = 100.000000 CU ($0.01 = 1 CU) with 6-decimal precision
    v_cu_to_allocate := ROUND(p_usd_amount * 100.000000, 6);

    -- Row-Level Pessimistic Lock on Tenant
    SELECT compute_units_balance INTO v_prev_balance
    FROM public.tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF v_prev_balance IS NULL THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND: Tenant % does not exist', p_tenant_id;
    END IF;

    v_new_balance := v_prev_balance + v_cu_to_allocate;

    -- Update Tenant Balance and automatically release any zero-balance execution lock
    UPDATE public.tenants
    SET compute_units_balance = v_new_balance,
        execution_lock = false,
        lock_reason = NULL,
        updated_at = timezone('utc', now())
    WHERE id = p_tenant_id;

    -- Double-Entry Ledger Append (Negative deduction denotes credit allocation deposit)
    INSERT INTO public.ledger_entries (
        tenant_id,
        workload_id,
        idempotency_key,
        cu_deducted,
        previous_balance,
        new_balance,
        status
    ) VALUES (
        p_tenant_id,
        'SYSTEM_PAYMENT_PROVISION',
        'credit_alloc_' || p_reference_id,
        -v_cu_to_allocate,
        v_prev_balance,
        v_new_balance,
        'CREDIT_ALLOCATED'
    );

    RETURN jsonb_build_object(
        'status', 'CREDITS_ALLOCATED_SUCCESS',
        'tenant_id', p_tenant_id,
        'usd_amount', p_usd_amount,
        'cu_allocated', v_cu_to_allocate,
        'previous_balance', v_prev_balance,
        'new_balance', v_new_balance,
        'reference_id', p_reference_id,
        'timestamp', timezone('utc', now())
    );
END;
$$;

-- 3. Row-Level Security (RLS) Hardening Across All Tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_futures_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_audit_log ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_policy ON public.tenants;
CREATE POLICY tenant_isolation_policy ON public.tenants
    FOR ALL
    USING (id = current_setting('request.jwt.claims', true)::json->>'tenant_id')
    WITH CHECK (id = current_setting('request.jwt.claims', true)::json->>'tenant_id');

DROP POLICY IF EXISTS ledger_isolation_policy ON public.ledger_entries;
CREATE POLICY ledger_isolation_policy ON public.ledger_entries
    FOR SELECT
    USING (tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id');

DROP POLICY IF EXISTS futures_isolation_policy ON public.capacity_futures_contracts;
CREATE POLICY futures_isolation_policy ON public.capacity_futures_contracts
    FOR SELECT
    USING (tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id');

DROP POLICY IF EXISTS audit_isolation_policy ON public.settlement_audit_log;
CREATE POLICY audit_isolation_policy ON public.settlement_audit_log
    FOR SELECT
    USING (tenant_id = current_setting('request.jwt.claims', true)::json->>'tenant_id');

-- Service Role Full Administrative Access
DROP POLICY IF EXISTS service_role_all_tenants ON public.tenants;
CREATE POLICY service_role_all_tenants ON public.tenants
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_ledger ON public.ledger_entries;
CREATE POLICY service_role_all_ledger ON public.ledger_entries
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_futures ON public.capacity_futures_contracts;
CREATE POLICY service_role_all_futures ON public.capacity_futures_contracts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_audit ON public.settlement_audit_log;
CREATE POLICY service_role_all_audit ON public.settlement_audit_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMIT;
