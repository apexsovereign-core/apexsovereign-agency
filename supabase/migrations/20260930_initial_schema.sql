-- =============================================================================
-- APEXSOVEREIGN.AI — CORE SETTLEMENT SCHEMA & ATOMIC PL/pgSQL RPC ENGINE
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS & PROFILES
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    organization_name TEXT NOT NULL,
    api_key_hash TEXT NOT NULL,
    tier VARCHAR(32) NOT NULL DEFAULT 'ENTERPRISE_PILOT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. DUAL-ENTRY LEDGER ACCOUNTS ($1.00 USD = 100 Compute Units)
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
    account_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    cu_balance NUMERIC(18, 6) NOT NULL DEFAULT 0.000000,
    locked_balance NUMERIC(18, 6) NOT NULL DEFAULT 0.000000,
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cu_balance_positive CHECK (cu_balance >= 0.000000),
    CONSTRAINT chk_locked_balance_positive CHECK (locked_balance >= 0.000000)
);

-- 3. AUDITABLE FINANCIAL TRANSACTIONS
CREATE TYPE transaction_type_enum AS ENUM (
    'DEPOSIT_USD',
    'RESERVATION_HOLD',
    'RESERVATION_SETTLE',
    'RESERVATION_REFUND',
    'ARBITRAGE_REBATE'
);

CREATE TABLE IF NOT EXISTS public.transactions (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    txn_type transaction_type_enum NOT NULL,
    amount_usd NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    amount_cu NUMERIC(18, 6) NOT NULL,
    previous_cu_balance NUMERIC(18, 6) NOT NULL,
    new_cu_balance NUMERIC(18, 6) NOT NULL,
    external_reference_id TEXT NOT NULL UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. HETEROGENEOUS GPU INVENTORY POOL
CREATE TYPE gpu_architecture_enum AS ENUM ('H100_SXM5', 'B200_NVL72', 'A100_SXM4');

CREATE TABLE IF NOT EXISTS public.gpu_inventories (
    inventory_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_id TEXT UNIQUE NOT NULL,
    datacenter_region TEXT NOT NULL,
    provider_source TEXT NOT NULL,
    architecture gpu_architecture_enum NOT NULL,
    total_gpus INT NOT NULL CHECK (total_gpus > 0),
    available_gpus INT NOT NULL CHECK (available_gpus >= 0),
    vram_per_gpu_gb INT NOT NULL,
    raw_provider_cost_usd_hr NUMERIC(10, 4) NOT NULL,
    arbitrage_rate_usd_hr NUMERIC(10, 4) NOT NULL,
    is_operational BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. COMPUTE RESERVATIONS
CREATE TYPE reservation_status_enum AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'TERMINATED', 'FAILED');

CREATE TABLE IF NOT EXISTS public.compute_reservations (
    reservation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    inventory_id UUID NOT NULL REFERENCES public.gpu_inventories(inventory_id),
    allocated_gpus INT NOT NULL CHECK (allocated_gpus > 0),
    duration_hours NUMERIC(8, 2) NOT NULL CHECK (duration_hours > 0),
    total_cu_locked NUMERIC(18, 6) NOT NULL,
    status reservation_status_enum NOT NULL DEFAULT 'PENDING',
    dispatch_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. WEBHOOK AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.webhook_audit_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gateway_source VARCHAR(64) NOT NULL,
    external_event_id TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    processed_status VARCHAR(32) NOT NULL,
    execution_time_ms NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_inventories_arch_avail ON public.gpu_inventories(architecture, available_gpus);
CREATE INDEX IF NOT EXISTS idx_audit_event_id ON public.webhook_audit_logs(external_event_id);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compute_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpu_inventories ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self_view ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY ledger_self_view ON public.ledger_accounts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY transactions_self_view ON public.transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY reservations_self_view ON public.compute_reservations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY public_inventory_read ON public.gpu_inventories
    FOR SELECT USING (is_operational = TRUE);

-- =============================================================================
-- ATOMIC RPC FUNCTION: CREDIT USER ACCOUNT ($1.00 USD = 100 CU)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.credit_user_account_atomic(
    p_user_id UUID,
    p_amount_usd NUMERIC(14, 4),
    p_txn_reference TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cu_conversion_factor CONSTANT NUMERIC := 100.000000;
    v_cu_to_credit NUMERIC(18, 6);
    v_current_cu NUMERIC(18, 6);
    v_new_cu NUMERIC(18, 6);
    v_transaction_id UUID;
BEGIN
    IF p_amount_usd <= 0.0000 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Credit amount must be strictly positive.';
    END IF;

    -- Calculate Compute Units: $1.00 = 100 CU
    v_cu_to_credit := ROUND(p_amount_usd * v_cu_conversion_factor, 6);

    -- Check for duplicate transaction processing (Idempotency)
    IF EXISTS (SELECT 1 FROM public.transactions WHERE external_reference_id = p_txn_reference) THEN
        RETURN jsonb_build_object(
            'status', 'ALREADY_PROCESSED',
            'user_id', p_user_id,
            'external_reference_id', p_txn_reference
        );
    END IF;

    -- Pessimistic Lock on user's ledger account
    SELECT cu_balance INTO v_current_cu
    FROM public.ledger_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_current_cu IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: Ledger account does not exist for User %', p_user_id;
    END IF;

    v_new_cu := v_current_cu + v_cu_to_credit;

    -- Update balance
    UPDATE public.ledger_accounts
    SET cu_balance = v_new_cu,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Write Immutable Transaction Record
    INSERT INTO public.transactions (
        user_id,
        txn_type,
        amount_usd,
        amount_cu,
        previous_cu_balance,
        new_cu_balance,
        external_reference_id,
        metadata
    ) VALUES (
        p_user_id,
        'DEPOSIT_USD',
        p_amount_usd,
        v_cu_to_credit,
        v_current_cu,
        v_new_cu,
        p_txn_reference,
        p_metadata
    ) RETURNING transaction_id INTO v_transaction_id;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'transaction_id', v_transaction_id,
        'user_id', p_user_id,
        'cu_credited', v_cu_to_credit,
        'balance_cu', v_new_cu
    );
END;
$$;

-- =============================================================================
-- ATOMIC RPC FUNCTION: DEDUCT COMPUTE UNITS ATOMICALLY
-- =============================================================================
CREATE OR REPLACE FUNCTION public.deduct_compute_units_atomic(
    p_user_id UUID,
    p_cu_amount NUMERIC(18, 6),
    p_reservation_id UUID,
    p_reference_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_cu NUMERIC(18, 6);
    v_new_cu NUMERIC(18, 6);
    v_is_frozen BOOLEAN;
    v_transaction_id UUID;
BEGIN
    IF p_cu_amount <= 0.000000 THEN
        RAISE EXCEPTION 'INVALID_DEDUCTION: Amount must be strictly positive.';
    END IF;

    -- Acquire write lock on user account
    SELECT cu_balance, is_frozen INTO v_current_cu, v_is_frozen
    FROM public.ledger_accounts
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_current_cu IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: User % has no registered ledger.', p_user_id;
    END IF;

    IF v_is_frozen THEN
        RAISE EXCEPTION 'ACCOUNT_FROZEN: Account % is frozen for compliance verification.', p_user_id;
    END IF;

    IF v_current_cu < p_cu_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Available balance (% CU) less than requested (% CU).', 
            v_current_cu, p_cu_amount;
    END IF;

    v_new_cu := v_current_cu - p_cu_amount;

    UPDATE public.ledger_accounts
    SET cu_balance = v_new_cu,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO public.transactions (
        user_id,
        txn_type,
        amount_usd,
        amount_cu,
        previous_cu_balance,
        new_cu_balance,
        external_reference_id,
        metadata
    ) VALUES (
        p_user_id,
        'RESERVATION_SETTLE',
        ROUND(p_cu_amount / 100.0, 4),
        p_cu_amount,
        v_current_cu,
        v_new_cu,
        p_reference_id,
        jsonb_build_object('reservation_id', p_reservation_id)
    ) RETURNING transaction_id INTO v_transaction_id;

    RETURN jsonb_build_object(
        'status', 'SETTLED',
        'transaction_id', v_transaction_id,
        'deducted_cu', p_cu_amount,
        'remaining_cu', v_new_cu
    );
END;
$$;
