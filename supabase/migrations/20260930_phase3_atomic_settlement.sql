-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenant Balances Core Table
CREATE TABLE IF NOT EXISTS public.tenant_balances (
    tenant_id UUID PRIMARY KEY,
    cu_balance NUMERIC(18, 6) NOT NULL DEFAULT 0.000000,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_cu_balance_non_negative CHECK (cu_balance >= 0.000000)
);

-- Double-Entry Cryptographic Ledger
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenant_balances(tenant_id),
    amount_cu NUMERIC(18, 6) NOT NULL,
    transaction_type VARCHAR(32) NOT NULL, -- 'DEPOSIT', 'DEDUCTION', 'REFUND', 'AURAPHARM_CREDIT'
    reference_id VARCHAR(128) UNIQUE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for low-latency ledger lookup
CREATE INDEX IF NOT EXISTS idx_ledger_tenant_id ON public.ledger_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_reference_id ON public.ledger_entries(reference_id);

-- Atomic Deposit RPC Routine ($1.00 = 100 CU)
CREATE OR REPLACE FUNCTION public.process_atomic_deposit(
    p_tenant_id UUID,
    p_usd_amount NUMERIC(12, 2),
    p_reference_id VARCHAR(128),
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS NUMERIC(18, 6) LANGUAGE plpgsql AS $$
DECLARE
    v_cu_to_add NUMERIC(18, 6);
    v_new_balance NUMERIC(18, 6);
BEGIN
    IF p_usd_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_DEPOSIT_AMOUNT: Deposit must be greater than 0';
    END IF;

    -- Conversion Rule: $1.00 = 100 CU
    v_cu_to_add := p_usd_amount * 100.000000;

    -- Acquire pessimistic write lock
    PERFORM 1 FROM public.tenant_balances 
    WHERE tenant_id = p_tenant_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.tenant_balances (tenant_id, cu_balance, is_locked)
        VALUES (p_tenant_id, v_cu_to_add, FALSE);
        v_new_balance := v_cu_to_add;
    ELSE
        UPDATE public.tenant_balances
        SET cu_balance = cu_balance + v_cu_to_add,
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id
        RETURNING cu_balance INTO v_new_balance;
    END IF;

    -- Record Double-Entry Ledger Event
    INSERT INTO public.ledger_entries (
        tenant_id,
        amount_cu,
        transaction_type,
        reference_id,
        metadata
    ) VALUES (
        p_tenant_id,
        v_cu_to_add,
        'DEPOSIT',
        p_reference_id,
        p_metadata
    );

    RETURN v_new_balance;
END;
$$;
