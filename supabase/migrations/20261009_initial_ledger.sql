-- ==============================================================================
-- APEXSOVEREIGN.AI — IMMUTABLE LEDGER SCHEMA & ATOMIC RPC SETTLEMENT
-- Path: supabase/migrations/20261009_initial_ledger.sql
-- Invariants: Strict Pessimistic Row Locking (FOR UPDATE) | Zero Double-Spend
-- Idempotency: SHA-256 Request Hash Replay Guard | Append-Only Ledger
-- Security: Strict Row-Level Security (RLS) & Multi-Tenant Isolation
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. TENANT CREDIT BALANCES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_balances (
    balance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE,
    balance_cu NUMERIC(24, 6) NOT NULL DEFAULT 0.000000,
    locked_cu NUMERIC(24, 6) NOT NULL DEFAULT 0.000000,
    currency VARCHAR(16) NOT NULL DEFAULT 'CU',
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_positive_balance CHECK (balance_cu >= 0.000000),
    CONSTRAINT chk_positive_locked CHECK (locked_cu >= 0.000000)
);

CREATE INDEX IF NOT EXISTS idx_credit_balances_tenant 
    ON public.credit_balances (tenant_id);

-- ------------------------------------------------------------------------------
-- 2. IMMUTABLE FINANCIAL LEDGER ENTRIES TABLE (APPEND-ONLY)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_hash VARCHAR(64) NOT NULL UNIQUE,
    tenant_id UUID NOT NULL REFERENCES public.credit_balances(tenant_id) ON DELETE RESTRICT,
    amount_cu NUMERIC(24, 6) NOT NULL,
    entry_type VARCHAR(32) NOT NULL,
    balance_before NUMERIC(24, 6) NOT NULL,
    balance_after NUMERIC(24, 6) NOT NULL,
    reference_id VARCHAR(128) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_valid_entry_type CHECK (
        entry_type IN ('CREDIT_TOPUP', 'MICRO_DEBIT', 'ESCROW_LOCK', 'ESCROW_RELEASE', 'REFUND')
    ),
    CONSTRAINT chk_positive_amount CHECK (amount_cu > 0.000000)
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_tenant_created 
    ON public.ledger_entries (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_request_hash 
    ON public.ledger_entries (request_hash);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference 
    ON public.ledger_entries (reference_id);

-- ------------------------------------------------------------------------------
-- 3. IMMUTABILITY TRIGGER: BLOCK UPDATE & DELETE ON LEDGER ENTRIES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_prevent_ledger_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: Modifications or deletions on ledger_entries are strictly prohibited by protocol.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ledger_update ON public.ledger_entries;
CREATE TRIGGER trg_prevent_ledger_update
    BEFORE UPDATE OR DELETE ON public.ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prevent_ledger_modification();

-- ------------------------------------------------------------------------------
-- 4. ROW-LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Service Role has unrestricted bypass for settlement operations
DROP POLICY IF EXISTS "service_role_unrestricted_balances" ON public.credit_balances;
CREATE POLICY "service_role_unrestricted_balances"
    ON public.credit_balances
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_unrestricted_ledger" ON public.ledger_entries;
CREATE POLICY "service_role_unrestricted_ledger"
    ON public.ledger_entries
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Tenants can only inspect their own balances
DROP POLICY IF EXISTS "tenant_select_own_balance" ON public.credit_balances;
CREATE POLICY "tenant_select_own_balance"
    ON public.credit_balances
    FOR SELECT
    TO authenticated
    USING (auth.uid() = tenant_id);

-- Tenants can only inspect their own ledger entries
DROP POLICY IF EXISTS "tenant_select_own_ledger" ON public.ledger_entries;
CREATE POLICY "tenant_select_own_ledger"
    ON public.ledger_entries
    FOR SELECT
    TO authenticated
    USING (auth.uid() = tenant_id);

-- ------------------------------------------------------------------------------
-- 5. ATOMIC RPC SETTLEMENT STORED PROCEDURE (PESSIMISTIC ROW LOCKING)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_process_credit_transaction(
    p_tenant_id UUID,
    p_amount_cu NUMERIC(24, 6),
    p_entry_type VARCHAR(32),
    p_reference_id VARCHAR(128),
    p_request_hash VARCHAR(64),
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_balance_before NUMERIC(24, 6);
    v_balance_after NUMERIC(24, 6);
    v_locked_cu NUMERIC(24, 6);
    v_is_frozen BOOLEAN;
    v_entry_id UUID;
    v_existing_entry RECORD;
BEGIN
    -- 1. Input assertions
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_tenant_id cannot be null.';
    END IF;

    IF p_amount_cu IS NULL OR p_amount_cu <= 0.000000 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: p_amount_cu must be strictly positive.';
    END IF;

    IF p_request_hash IS NULL OR length(trim(p_request_hash)) = 0 THEN
        RAISE EXCEPTION 'INVALID_REQUEST_HASH: p_request_hash must be a valid non-empty string.';
    END IF;

    IF p_entry_type NOT IN ('CREDIT_TOPUP', 'MICRO_DEBIT', 'ESCROW_LOCK', 'ESCROW_RELEASE', 'REFUND') THEN
        RAISE EXCEPTION 'INVALID_ENTRY_TYPE: Unsupported transaction type %', p_entry_type;
    END IF;

    -- 2. Idempotency Check: Instant return if request_hash already settled
    SELECT entry_id, amount_cu, balance_before, balance_after, created_at
    INTO v_existing_entry
    FROM public.ledger_entries
    WHERE request_hash = p_request_hash
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'IDEMPOTENT_DUPLICATE',
            'entry_id', v_existing_entry.entry_id,
            'tenant_id', p_tenant_id,
            'amount_cu', v_existing_entry.amount_cu,
            'balance_before', v_existing_entry.balance_before,
            'balance_after', v_existing_entry.balance_after,
            'request_hash', p_request_hash,
            'message', 'Transaction previously settled and confirmed.',
            'created_at', v_existing_entry.created_at
        );
    END IF;

    -- 3. Ensure Tenant Record Exists
    INSERT INTO public.credit_balances (tenant_id, balance_cu, locked_cu, is_frozen)
    VALUES (p_tenant_id, 0.000000, 0.000000, FALSE)
    ON CONFLICT (tenant_id) DO NOTHING;

    -- 4. Pessimistic Row Locking on Tenant Record
    SELECT balance_cu, locked_cu, is_frozen
    INTO v_balance_before, v_locked_cu, v_is_frozen
    FROM public.credit_balances
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_is_frozen THEN
        RAISE EXCEPTION 'ACCOUNT_FROZEN: Tenant % is suspended from ledger execution.', p_tenant_id;
    END IF;

    -- 5. Atomic State Transition
    IF p_entry_type IN ('CREDIT_TOPUP', 'REFUND') THEN
        v_balance_after := v_balance_before + p_amount_cu;

        UPDATE public.credit_balances
        SET balance_cu = v_balance_after,
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id;

    ELSIF p_entry_type = 'MICRO_DEBIT' THEN
        IF v_balance_before < p_amount_cu THEN
            RAISE EXCEPTION 'INSUFFICIENT_CREDITS: Required % CU, available balance is % CU.', 
                p_amount_cu, v_balance_before;
        END IF;

        v_balance_after := v_balance_before - p_amount_cu;

        UPDATE public.credit_balances
        SET balance_cu = v_balance_after,
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id;

    ELSIF p_entry_type = 'ESCROW_LOCK' THEN
        IF v_balance_before < p_amount_cu THEN
            RAISE EXCEPTION 'INSUFFICIENT_CREDITS: Cannot lock % CU, available balance is % CU.', 
                p_amount_cu, v_balance_before;
        END IF;

        v_balance_after := v_balance_before - p_amount_cu;

        UPDATE public.credit_balances
        SET balance_cu = v_balance_after,
            locked_cu = locked_cu + p_amount_cu,
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id;

    ELSIF p_entry_type = 'ESCROW_RELEASE' THEN
        IF v_locked_cu < p_amount_cu THEN
            RAISE EXCEPTION 'INVALID_ESCROW_RELEASE: Attempting to release % CU from % locked CU.',
                p_amount_cu, v_locked_cu;
        END IF;

        v_balance_after := v_balance_before + p_amount_cu;

        UPDATE public.credit_balances
        SET balance_cu = v_balance_after,
            locked_cu = locked_cu - p_amount_cu,
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id;
    END IF;

    -- 6. Insert Append-Only Ledger Entry
    INSERT INTO public.ledger_entries (
        request_hash,
        tenant_id,
        amount_cu,
        entry_type,
        balance_before,
        balance_after,
        reference_id,
        metadata
    )
    VALUES (
        p_request_hash,
        p_tenant_id,
        p_amount_cu,
        p_entry_type,
        v_balance_before,
        v_balance_after,
        p_reference_id,
        p_metadata
    )
    RETURNING entry_id INTO v_entry_id;

    -- 7. Return Verified Settlement Record
    RETURN jsonb_build_object(
        'status', 'SETTLED',
        'entry_id', v_entry_id,
        'tenant_id', p_tenant_id,
        'entry_type', p_entry_type,
        'amount_cu', p_amount_cu,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after,
        'reference_id', p_reference_id,
        'request_hash', p_request_hash,
        'timestamp', NOW()
    );
END;
$$;

COMMIT;
