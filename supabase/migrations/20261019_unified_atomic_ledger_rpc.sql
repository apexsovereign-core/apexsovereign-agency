-- supabase/migrations/20261019_unified_atomic_ledger_rpc.sql
-- ApexSovereign Holdings: Unified Atomic RPC Credit Settlement & Insolvency Locking
-- Prevents schema type mismatches and transaction rollbacks across TEXT & UUID tenant IDs.

BEGIN;

-- 1. Ensure tenant_ledgers has necessary fields and indexing
CREATE TABLE IF NOT EXISTS public.tenant_ledgers (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_code TEXT NOT NULL DEFAULT 'COMPUTE' CHECK (entity_code IN ('HOLDINGS', 'COMPUTE', 'BIOPHARM', 'GRID', 'PAY')),
    cu_balance NUMERIC(18, 6) NOT NULL DEFAULT 0.000000 CHECK (cu_balance >= 0.000000),
    credit_limit_usd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_locked BOOLEAN NOT NULL DEFAULT false,
    lock_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    workload_id TEXT NOT NULL,
    cu_amount NUMERIC(18, 6) NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    balance_before NUMERIC(18, 6) NOT NULL,
    balance_after NUMERIC(18, 6) NOT NULL,
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_tenant_ledgers_status ON public.tenant_ledgers(tenant_id, is_locked);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_idemp_text ON public.ledger_transactions(idempotency_key);

-- Helper to safely cast or generate deterministic UUID from string tenant identifiers
CREATE OR REPLACE FUNCTION public.resolve_tenant_uuid(p_raw_id TEXT)
RETURNS UUID AS $$
BEGIN
    RETURN p_raw_id::UUID;
EXCEPTION WHEN OTHERS THEN
    -- Deterministic UUID v5 generated from MD5 hash if tenant ID is an alphanumeric slug
    RETURN md5('apex_tenant_namespace:' || p_raw_id)::UUID;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Atomic add_credit Routine (Supports TEXT tenant IDs and string/numeric parameters)
-- Enforces $1.00 USD = 100 CU conversion rule
CREATE OR REPLACE FUNCTION public.add_credit(
    p_tenant_id TEXT,
    p_amount NUMERIC,
    p_reference_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
    v_tenant_uuid UUID;
    v_cu_to_add NUMERIC(18, 6);
    v_current_balance NUMERIC(18, 6) := 0.000000;
    v_new_balance NUMERIC(18, 6);
    v_ref TEXT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Credit amount % must be strictly positive.', p_amount;
    END IF;

    v_tenant_uuid := public.resolve_tenant_uuid(p_tenant_id);
    v_ref := COALESCE(p_reference_id, 'CR-' || gen_random_uuid()::TEXT);

    -- $1.00 USD = 100 Compute Units
    v_cu_to_add := p_amount * 100.000000;

    -- Check idempotency
    IF EXISTS (SELECT 1 FROM public.ledger_transactions WHERE idempotency_key = v_ref) THEN
        SELECT cu_balance INTO v_current_balance FROM public.tenant_ledgers WHERE tenant_id = v_tenant_uuid;
        RETURN jsonb_build_object(
            'status', 'IDEMPOTENT_ALREADY_PROCESSED',
            'tenant_id', p_tenant_id,
            'cu_balance', v_current_balance,
            'reference_id', v_ref
        );
    END IF;

    -- Upsert tenant ledger row with write lock
    INSERT INTO public.tenant_ledgers (tenant_id, entity_code, cu_balance, is_locked, updated_at)
    VALUES (v_tenant_uuid, 'COMPUTE', 0.000000, FALSE, timezone('utc', now()))
    ON CONFLICT (tenant_id) DO NOTHING;

    SELECT cu_balance INTO v_current_balance
    FROM public.tenant_ledgers
    WHERE tenant_id = v_tenant_uuid
    FOR UPDATE;

    v_new_balance := v_current_balance + v_cu_to_add;

    -- Commit balance and clear insolvency lock if account was locked
    UPDATE public.tenant_ledgers
    SET cu_balance = v_new_balance,
        is_locked = FALSE,
        lock_reason = NULL,
        updated_at = timezone('utc', now())
    WHERE tenant_id = v_tenant_uuid;

    -- Record immutable audit log
    INSERT INTO public.ledger_transactions (
        tenant_id,
        idempotency_key,
        workload_id,
        cu_amount,
        direction,
        balance_before,
        balance_after,
        memo
    ) VALUES (
        v_tenant_uuid,
        v_ref,
        'PAYPAL_OR_CREDIT_TOPUP',
        v_cu_to_add,
        'CREDIT',
        v_current_balance,
        v_new_balance,
        'Atomic credit top-up: $' || p_amount || ' USD converted to ' || v_cu_to_add || ' CU'
    );

    RETURN jsonb_build_object(
        'status', 'CREDIT_SETTLED',
        'tenant_id', p_tenant_id,
        'tenant_uuid', v_tenant_uuid,
        'cu_added', v_cu_to_add,
        'balance_before', v_current_balance,
        'balance_after', v_new_balance,
        'reference_id', v_ref,
        'settled_at', timezone('utc', now())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Atomic allocate_compute_units Routine (Targeted by FastAPI main.py webhooks)
CREATE OR REPLACE FUNCTION public.allocate_compute_units(
    p_tenant_id TEXT,
    p_paypal_order_id TEXT,
    p_units NUMERIC,
    p_amount NUMERIC
) RETURNS JSONB AS $$
DECLARE
    v_tenant_uuid UUID;
    v_current_balance NUMERIC(18, 6) := 0.000000;
    v_new_balance NUMERIC(18, 6);
    v_units_num NUMERIC(18, 6);
BEGIN
    v_tenant_uuid := public.resolve_tenant_uuid(p_tenant_id);
    v_units_num := COALESCE(p_units, p_amount * 100.000000);

    -- Idempotency check on paypal order
    IF EXISTS (SELECT 1 FROM public.ledger_transactions WHERE idempotency_key = p_paypal_order_id) THEN
        SELECT cu_balance INTO v_current_balance FROM public.tenant_ledgers WHERE tenant_id = v_tenant_uuid;
        RETURN jsonb_build_object(
            'status', 'ALREADY_SETTLED',
            'tenant_id', p_tenant_id,
            'cu_balance', v_current_balance,
            'paypal_order_id', p_paypal_order_id
        );
    END IF;

    INSERT INTO public.tenant_ledgers (tenant_id, entity_code, cu_balance, is_locked, updated_at)
    VALUES (v_tenant_uuid, 'COMPUTE', 0.000000, FALSE, timezone('utc', now()))
    ON CONFLICT (tenant_id) DO NOTHING;

    SELECT cu_balance INTO v_current_balance
    FROM public.tenant_ledgers
    WHERE tenant_id = v_tenant_uuid
    FOR UPDATE;

    v_new_balance := v_current_balance + v_units_num;

    UPDATE public.tenant_ledgers
    SET cu_balance = v_new_balance,
        is_locked = FALSE,
        lock_reason = NULL,
        updated_at = timezone('utc', now())
    WHERE tenant_id = v_tenant_uuid;

    INSERT INTO public.ledger_transactions (
        tenant_id,
        idempotency_key,
        workload_id,
        cu_amount,
        direction,
        balance_before,
        balance_after,
        memo
    ) VALUES (
        v_tenant_uuid,
        p_paypal_order_id,
        'PAYPAL_WEBHOOK_INGEST',
        v_units_num,
        'CREDIT',
        v_current_balance,
        v_new_balance,
        'PayPal settlement order ' || p_paypal_order_id
    );

    RETURN jsonb_build_object(
        'status', 'ALLOCATED',
        'tenant_id', p_tenant_id,
        'units_allocated', v_units_num,
        'new_balance', v_new_balance,
        'paypal_order_id', p_paypal_order_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMIT;
