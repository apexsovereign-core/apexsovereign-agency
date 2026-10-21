-- ==============================================================================
-- APEXSOVEREIGN HOLDINGS: AETHELPAY ATOMIC DOUBLE-ENTRY FINANCIAL LEDGER
-- Path: supabase/migrations/20261007_aethelpay_ledger.sql
-- Conversion Peg: $1.00 USD = 100.000000 Compute Units (CU)
-- Concurrency: Pessimistic Row Locking (SELECT ... FOR UPDATE)
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Chart of Accounts Table
CREATE TABLE IF NOT EXISTS public.accounts (
    account_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    account_type VARCHAR(32) NOT NULL CHECK (account_type IN ('TENANT_OPERATIONAL', 'SOVEREIGN_RESERVE', 'AURAPHARM_ESCROW')),
    currency VARCHAR(8) NOT NULL DEFAULT 'CU',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_tenant_id ON public.accounts(tenant_id);

-- 2. Liquid Credit Balances Table (Guaranteed Zero-Floor Invariant)
CREATE TABLE IF NOT EXISTS public.credit_balances (
    account_id UUID PRIMARY KEY REFERENCES public.accounts(account_id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL,
    balance_cu NUMERIC(24, 6) NOT NULL DEFAULT 0.000000 CHECK (balance_cu >= 0.000000),
    locked_cu NUMERIC(24, 6) NOT NULL DEFAULT 0.000000 CHECK (locked_cu >= 0.000000),
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_balances_tenant ON public.credit_balances(tenant_id);

-- 3. Double-Entry Immutable Ledger Entries Table
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    entry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_id VARCHAR(128) NOT NULL UNIQUE,
    debit_account_id UUID NOT NULL REFERENCES public.accounts(account_id),
    credit_account_id UUID NOT NULL REFERENCES public.accounts(account_id),
    amount_cu NUMERIC(24, 6) NOT NULL CHECK (amount_cu > 0.000000),
    amount_usd NUMERIC(14, 4) GENERATED ALWAYS AS (amount_cu / 100.000000) STORED,
    entry_type VARCHAR(64) NOT NULL CHECK (entry_type IN ('DEPOSIT_TOPUP', 'INFERENCE_DEBIT', 'IP_SYNTHESIS_ALLOCATION', 'SLOT_RESERVE')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference ON public.ledger_entries(reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at ON public.ledger_entries(created_at);

-- 4. Atomic Stored Procedure: Settle Incoming USD Deposit ($1.00 USD = 100.000000 CU)
CREATE OR REPLACE FUNCTION public.rpc_settle_usd_deposit(
    p_tenant_id UUID,
    p_usd_amount NUMERIC(14, 4),
    p_reference_id VARCHAR(128),
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cu_to_mint NUMERIC(24, 6);
    v_tenant_acc_id UUID;
    v_reserve_acc_id UUID;
    v_new_balance NUMERIC(24, 6);
    v_entry_id UUID;
BEGIN
    IF p_usd_amount <= 0.0000 THEN
        RAISE EXCEPTION 'INVALID_DEPOSIT_AMOUNT: Deposit must exceed zero.';
    END IF;

    -- Peg: $1.00 USD = 100.000000 CU
    v_cu_to_mint := p_usd_amount * 100.000000;

    -- Ensure Operational Account exists
    SELECT account_id INTO v_tenant_acc_id
    FROM public.accounts
    WHERE tenant_id = p_tenant_id AND account_type = 'TENANT_OPERATIONAL'
    LIMIT 1;

    IF v_tenant_acc_id IS NULL THEN
        INSERT INTO public.accounts (tenant_id, account_type, currency)
        VALUES (p_tenant_id, 'TENANT_OPERATIONAL', 'CU')
        RETURNING account_id INTO v_tenant_acc_id;

        INSERT INTO public.credit_balances (account_id, tenant_id, balance_cu, locked_cu)
        VALUES (v_tenant_acc_id, p_tenant_id, 0.000000, 0.000000);
    END IF;

    -- Ensure Sovereign Reserve Account exists
    SELECT account_id INTO v_reserve_acc_id
    FROM public.accounts
    WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid AND account_type = 'SOVEREIGN_RESERVE'
    LIMIT 1;

    IF v_reserve_acc_id IS NULL THEN
        INSERT INTO public.accounts (tenant_id, account_type, currency)
        VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'SOVEREIGN_RESERVE', 'CU')
        RETURNING account_id INTO v_reserve_acc_id;

        INSERT INTO public.credit_balances (account_id, tenant_id, balance_cu, locked_cu)
        VALUES (v_reserve_acc_id, '00000000-0000-0000-0000-000000000000'::uuid, 0.000000, 0.000000);
    END IF;

    -- Pessimistic Row Lock on Tenant Balance
    SELECT balance_cu INTO v_new_balance
    FROM public.credit_balances
    WHERE account_id = v_tenant_acc_id
    FOR UPDATE;

    -- Insert Transaction Record (Reserve credits Tenant)
    INSERT INTO public.ledger_entries (
        reference_id,
        debit_account_id,
        credit_account_id,
        amount_cu,
        entry_type,
        metadata
    )
    VALUES (
        p_reference_id,
        v_reserve_acc_id,
        v_tenant_acc_id,
        v_cu_to_mint,
        'DEPOSIT_TOPUP',
        p_metadata
    )
    RETURNING entry_id INTO v_entry_id;

    -- Update Tenant Balance
    UPDATE public.credit_balances
    SET balance_cu = balance_cu + v_cu_to_mint,
        updated_at = NOW()
    WHERE account_id = v_tenant_acc_id
    RETURNING balance_cu INTO v_new_balance;

    RETURN jsonb_build_object(
        'status', 'SETTLED',
        'entry_id', v_entry_id,
        'reference_id', p_reference_id,
        'usd_settled', p_usd_amount,
        'cu_minted', v_cu_to_mint,
        'new_balance_cu', v_new_balance,
        'timestamp', NOW()
    );
END;
$$;

-- 5. Atomic Stored Procedure: Pessimistic Micro-Debit Settlement
CREATE OR REPLACE FUNCTION public.rpc_deduct_micro_cu(
    p_tenant_id UUID,
    p_cu_amount NUMERIC(24, 6),
    p_reference_id VARCHAR(128),
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_acc_id UUID;
    v_reserve_acc_id UUID;
    v_current_balance NUMERIC(24, 6);
    v_entry_id UUID;
BEGIN
    SELECT a.account_id, b.balance_cu
    INTO v_tenant_acc_id, v_current_balance
    FROM public.accounts a
    JOIN public.credit_balances b ON a.account_id = b.account_id
    WHERE a.tenant_id = p_tenant_id AND a.account_type = 'TENANT_OPERATIONAL'
    FOR UPDATE OF b;

    IF v_tenant_acc_id IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: Operational account not provisioned.';
    END IF;

    IF v_current_balance < p_cu_amount THEN
        RAISE EXCEPTION 'INSOLVENCY_PREVENTION: Insufficient Compute Units. Balance: %, Requested: %', v_current_balance, p_cu_amount;
    END IF;

    SELECT account_id INTO v_reserve_acc_id
    FROM public.accounts
    WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid AND account_type = 'SOVEREIGN_RESERVE';

    -- Double-Entry: Tenant debited, Reserve credited
    INSERT INTO public.ledger_entries (
        reference_id,
        debit_account_id,
        credit_account_id,
        amount_cu,
        entry_type,
        metadata
    )
    VALUES (
        p_reference_id,
        v_tenant_acc_id,
        v_reserve_acc_id,
        p_cu_amount,
        'INFERENCE_DEBIT',
        p_metadata
    )
    RETURNING entry_id INTO v_entry_id;

    -- Apply reduction
    UPDATE public.credit_balances
    SET balance_cu = balance_cu - p_cu_amount,
        updated_at = NOW()
    WHERE account_id = v_tenant_acc_id
    RETURNING balance_cu INTO v_current_balance;

    RETURN jsonb_build_object(
        'status', 'DEBITED',
        'entry_id', v_entry_id,
        'deducted_cu', p_cu_amount,
        'remaining_cu', v_current_balance,
        'timestamp', NOW()
    );
END;
$$;

-- 6. Enforce Strict Row Level Security Policies
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_accounts ON public.accounts
    FOR SELECT TO authenticated
    USING (tenant_id = auth.uid());

CREATE POLICY tenant_isolation_balances ON public.credit_balances
    FOR SELECT TO authenticated
    USING (tenant_id = auth.uid());

CREATE POLICY tenant_isolation_ledger ON public.ledger_entries
    FOR SELECT TO authenticated
    USING (
        debit_account_id IN (SELECT account_id FROM public.accounts WHERE tenant_id = auth.uid()) OR
        credit_account_id IN (SELECT account_id FROM public.accounts WHERE tenant_id = auth.uid())
    );

COMMIT;
