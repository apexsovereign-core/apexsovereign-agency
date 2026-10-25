-- migrations/20260928_institutional_futures.sql
-- Production Supabase / PostgreSQL Migration: Capacity Futures & Collateral Escrow
BEGIN;

CREATE TABLE IF NOT EXISTS public.tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    compute_units_balance NUMERIC(16, 6) NOT NULL DEFAULT 0.000000,
    available_credit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    bonded_escrow NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    execution_lock BOOLEAN NOT NULL DEFAULT false,
    lock_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
    workload_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    cu_deducted NUMERIC(16, 6) NOT NULL,
    previous_balance NUMERIC(16, 6) NOT NULL,
    new_balance NUMERIC(16, 6) NOT NULL,
    status TEXT NOT NULL DEFAULT 'CONFIRMED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.capacity_futures_contracts (
    contract_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(id),
    accelerator_type TEXT NOT NULL CHECK (accelerator_type IN ('H100_SXM5', 'B200_NVL72', 'A100_SXM4')),
    node_count INT NOT NULL CHECK (node_count > 0),
    duration_days INT NOT NULL CHECK (duration_days IN (30, 60, 90)),
    locked_cu_per_hr NUMERIC(10, 4) NOT NULL CHECK (locked_cu_per_hr > 0),
    collateral_escrow_usd NUMERIC(14, 2) NOT NULL CHECK (collateral_escrow_usd >= 0),
    maintenance_margin_pct NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
    settlement_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (settlement_status IN ('ACTIVE', 'EXERCISED', 'DEFAULTED', 'LIQUIDATED')),
    delivery_start_at TIMESTAMPTZ NOT NULL,
    delivery_end_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ledger_tenant_id ON public.ledger_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_futures_tenant_status ON public.capacity_futures_contracts(tenant_id, settlement_status);

CREATE OR REPLACE FUNCTION public.execute_capacity_futures_lock(
    p_tenant_id TEXT,
    p_accelerator TEXT,
    p_nodes INT,
    p_duration INT,
    p_strike_cu NUMERIC,
    p_collateral_usd NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_available_credit NUMERIC;
    v_contract_id UUID;
BEGIN
    IF p_nodes <= 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: node_count must be > 0';
    END IF;

    IF p_duration NOT IN (30, 60, 90) THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: duration must be 30, 60, or 90 days';
    END IF;

    SELECT available_credit INTO v_available_credit
    FROM public.tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF v_available_credit IS NULL THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND: Tenant % does not exist', p_tenant_id;
    END IF;

    IF v_available_credit < p_collateral_usd THEN
        RAISE EXCEPTION 'INSUFFICIENT_COLLATERAL: Tenant % has % USD available, required: % USD',
            p_tenant_id, v_available_credit, p_collateral_usd;
    END IF;

    UPDATE public.tenants
    SET available_credit = available_credit - p_collateral_usd,
        bonded_escrow = bonded_escrow + p_collateral_usd,
        updated_at = timezone('utc', now())
    WHERE id = p_tenant_id;

    INSERT INTO public.capacity_futures_contracts (
        tenant_id,
        accelerator_type,
        node_count,
        duration_days,
        locked_cu_per_hr,
        collateral_escrow_usd,
        delivery_start_at,
        delivery_end_at
    ) VALUES (
        p_tenant_id,
        p_accelerator,
        p_nodes,
        p_duration,
        p_strike_cu,
        p_collateral_usd,
        timezone('utc', now()),
        timezone('utc', now()) + (p_duration || ' days')::INTERVAL
    ) RETURNING contract_id INTO v_contract_id;

    RETURN jsonb_build_object(
        'status', 'FUTURES_BONDED_CONFIRMED',
        'contract_id', v_contract_id,
        'tenant_id', p_tenant_id,
        'escrow_allocated_usd', p_collateral_usd,
        'duration_days', p_duration,
        'locked_cu_per_hr', p_strike_cu
    );
END;
$$;

COMMIT;
