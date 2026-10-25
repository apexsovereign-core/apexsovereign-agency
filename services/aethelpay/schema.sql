-- =============================================================================
-- APEXSOVEREIGN.AI — AETHELPAY ATOMIC FINANCIAL LEDGER (Supabase / PL/pgSQL)
-- $1.00 USD = 100 Compute Units (CU) ($0.01 USD = 1 CU)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS & CREDIT BALANCES
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    organization_name TEXT NOT NULL,
    cu_balance NUMERIC(18, 6) NOT NULL DEFAULT 0.000000,
    is_throttled BOOLEAN NOT NULL DEFAULT FALSE,
    throttle_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT chk_cu_balance_non_negative CHECK (cu_balance >= 0.000000)
);

CREATE INDEX IF NOT EXISTS idx_users_cu_balance ON public.users(cu_balance);

-- 2. DOUBLE-ENTRY FINANCIAL LEDGER
CREATE TYPE ledger_entry_type AS ENUM (
    'DEPOSIT_USD',
    'COMPUTE_DEDUCTION',
    'AURAPHARM_ALLOCATION',
    'REFUND_REVERSAL'
);

CREATE TABLE IF NOT EXISTS public.ledger_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    entry_type ledger_entry_type NOT NULL,
    amount_usd NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    amount_cu NUMERIC(18, 6) NOT NULL,
    balance_before_cu NUMERIC(18, 6) NOT NULL,
    balance_after_cu NUMERIC(18, 6) NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_user ON public.ledger_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_idemp ON public.ledger_transactions(idempotency_key);

-- 3. ATOMIC DEDUCTION RPC WITH EXCLUSIVE ROW-LEVEL LOCKING
CREATE OR REPLACE FUNCTION public.process_atomic_deduction(
    p_user_id UUID,
    p_cu_amount NUMERIC(18, 6),
    p_idempotency_key TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_balance NUMERIC(18, 6);
    v_new_balance NUMERIC(18, 6);
    v_is_throttled BOOLEAN;
    v_tx_id UUID;
BEGIN
    IF p_cu_amount <= 0.000000 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Deduction amount must be strictly positive, received: %', p_cu_amount;
    END IF;

    -- Check Idempotency Barrier
    SELECT id, balance_after_cu INTO v_tx_id, v_new_balance
    FROM public.ledger_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF v_tx_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'IDEMPOTENT_REPLAY',
            'transaction_id', v_tx_id,
            'user_id', p_user_id,
            'cu_deducted', p_cu_amount,
            'current_balance_cu', v_new_balance
        );
    END IF;

    -- Pessimistic Lock on User Record (SELECT ... FOR UPDATE)
    SELECT cu_balance, is_throttled 
    INTO v_current_balance, v_is_throttled
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: User % does not exist.', p_user_id;
    END IF;

    IF v_is_throttled THEN
        RAISE EXCEPTION 'ACCOUNT_THROTTLED: Execution halted due to governance throttle flag.';
    END IF;

    IF v_current_balance < p_cu_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Available balance (% CU) cannot fulfill requested deduction (% CU).', 
            v_current_balance, p_cu_amount;
    END IF;

    v_new_balance := v_current_balance - p_cu_amount;

    -- Atomically mutate user balance
    UPDATE public.users
    SET cu_balance = v_new_balance,
        updated_at = timezone('utc', now())
    WHERE id = p_user_id;

    -- Append Double-Entry Transaction Audit Record
    INSERT INTO public.ledger_transactions (
        user_id,
        entry_type,
        amount_usd,
        amount_cu,
        balance_before_cu,
        balance_after_cu,
        idempotency_key,
        metadata
    ) VALUES (
        p_user_id,
        'COMPUTE_DEDUCTION',
        ROUND(p_cu_amount / 100.000000, 4),
        p_cu_amount,
        v_current_balance,
        v_new_balance,
        p_idempotency_key,
        p_metadata
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'status', 'DEDUCTION_SETTLED',
        'transaction_id', v_tx_id,
        'user_id', p_user_id,
        'cu_deducted', p_cu_amount,
        'balance_before_cu', v_current_balance,
        'balance_after_cu', v_new_balance
    );
END;
$$;

-- 4. ATOMIC DEPOSIT RPC ROUTINE ($1.00 USD = 100 Compute Units)
CREATE OR REPLACE FUNCTION public.process_atomic_deposit(
    p_user_id UUID,
    p_usd_amount NUMERIC(14, 4),
    p_idempotency_key TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cu_to_mint NUMERIC(18, 6);
    v_current_balance NUMERIC(18, 6);
    v_new_balance NUMERIC(18, 6);
    v_tx_id UUID;
BEGIN
    IF p_usd_amount <= 0.0000 THEN
        RAISE EXCEPTION 'INVALID_DEPOSIT: Amount must be strictly positive, received: %', p_usd_amount;
    END IF;

    -- Rate conversion: $1.00 USD = 100.000000 CU
    v_cu_to_mint := ROUND(p_usd_amount * 100.000000, 6);

    -- Idempotency check
    SELECT id, balance_after_cu INTO v_tx_id, v_new_balance
    FROM public.ledger_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF v_tx_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'IDEMPOTENT_REPLAY',
            'transaction_id', v_tx_id,
            'user_id', p_user_id,
            'cu_credited', v_cu_to_mint,
            'current_balance_cu', v_new_balance
        );
    END IF;

    -- Acquire pessimistic lock on User Account
    SELECT cu_balance INTO v_current_balance
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: User % does not exist.', p_user_id;
    END IF;

    v_new_balance := v_current_balance + v_cu_to_mint;

    -- Update balance and automatically unfreeze throttling if balance replenished
    UPDATE public.users
    SET cu_balance = v_new_balance,
        is_throttled = false,
        throttle_reason = NULL,
        updated_at = timezone('utc', now())
    WHERE id = p_user_id;

    -- Double-Entry Record
    INSERT INTO public.ledger_transactions (
        user_id,
        entry_type,
        amount_usd,
        amount_cu,
        balance_before_cu,
        balance_after_cu,
        idempotency_key,
        metadata
    ) VALUES (
        p_user_id,
        'DEPOSIT_USD',
        p_usd_amount,
        v_cu_to_mint,
        v_current_balance,
        v_new_balance,
        p_idempotency_key,
        p_metadata
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'status', 'DEPOSIT_CONFIRMED',
        'transaction_id', v_tx_id,
        'user_id', p_user_id,
        'usd_amount', p_usd_amount,
        'cu_credited', v_cu_to_mint,
        'balance_before_cu', v_current_balance,
        'balance_after_cu', v_new_balance
    );
END;
$$;
