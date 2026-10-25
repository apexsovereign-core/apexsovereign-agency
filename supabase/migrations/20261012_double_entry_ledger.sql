-- ============================================================================
-- ApexSovereign.ai - ATOMIC DOUBLE-ENTRY SETTLEMENT LEDGER & CONSERVATION ENGINE
-- Migration: 20261012_double_entry_ledger.sql
-- Enforces: Strict double-entry accounting (Debits == Credits), atomic row locks,
--           deterministic Compute Unit (CU) pricing, and cryptographic replay defense.
-- ============================================================================

-- Extensions required for cryptographic hashing and UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Account types enumeration
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type_enum') THEN
        CREATE TYPE account_type_enum AS ENUM (
            'customer_wallet',
            'platform_escrow',
            'compute_clearing',
            'provider_payable',
            'revenue_fee'
        );
    END IF;
END $$;

-- Ledger entry direction
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_direction_enum') THEN
        CREATE TYPE entry_direction_enum AS ENUM ('debit', 'credit');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. ACCOUNTS & BALANCES (DOUBLE-ENTRY MASTER CHART)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    account_number VARCHAR(64) UNIQUE NOT NULL,
    account_type account_type_enum NOT NULL,
    currency VARCHAR(16) NOT NULL DEFAULT 'CU', -- Compute Units: 100 CU = $1.00 USD
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON public.accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_number ON public.accounts(account_number);

-- Denormalized real-time balance cache backed by strict row locks
CREATE TABLE IF NOT EXISTS public.credit_balances (
    account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL,
    current_balance NUMERIC(28, 6) NOT NULL DEFAULT 0.000000,
    reserved_balance NUMERIC(28, 6) NOT NULL DEFAULT 0.000000,
    available_balance NUMERIC(28, 6) GENERATED ALWAYS AS (current_balance - reserved_balance) STORED,
    last_journal_id UUID,
    last_seq_num BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_positive_available CHECK (
        -- Only customer_wallet must remain non-negative; clearing & payable can fluctuate during double-entry balancing
        (account_id NOT IN (SELECT id FROM public.accounts WHERE account_type = 'customer_wallet')) OR (current_balance - reserved_balance >= 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_credit_balances_tenant ON public.credit_balances(tenant_id);

-- ----------------------------------------------------------------------------
-- 2. IMMUTABLE JOURNAL BATCHES & ATOMIC DOUBLE-ENTRY TRANSACTIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    idempotency_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 (tenant_id + session_id + seq + provider + hardware)
    session_id VARCHAR(128) NOT NULL,
    hardware_tier VARCHAR(64) NOT NULL, -- 'B200', 'H100_SXM5', 'H200', 'L40S'
    provider_id VARCHAR(64) NOT NULL,   -- 'aws', 'gcp', 'lambda', 'runpod', 'on_prem'
    cu_amount NUMERIC(28, 6) NOT NULL,
    usd_value NUMERIC(18, 4) NOT NULL,
    description TEXT NOT NULL,
    nonce BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_settlement_journals_session ON public.settlement_journals(session_id);
CREATE INDEX IF NOT EXISTS idx_settlement_journals_tenant ON public.settlement_journals(tenant_id);

-- Immutable individual double-entry ledger rows
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id UUID NOT NULL REFERENCES public.settlement_journals(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL,
    direction entry_direction_enum NOT NULL,
    amount NUMERIC(28, 6) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(28, 6) NOT NULL,
    entry_seq INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON public.ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_journal ON public.ledger_entries(journal_id);

-- ----------------------------------------------------------------------------
-- 3. HARDWARE PRICING MATRIX (CU RATE PER SECOND)
-- 100 CU = $1.00 USD. Rates normalized to Compute Units per second:
-- NVIDIA B200 (192GB): $4.80/hr = 480 CU/hr = 0.133333 CU/sec
-- NVIDIA H100 SXM5:   $3.20/hr = 320 CU/hr = 0.088889 CU/sec
-- NVIDIA H200 (141GB): $3.80/hr = 380 CU/hr = 0.105556 CU/sec
-- NVIDIA L40S:         $1.20/hr = 120 CU/hr = 0.033333 CU/sec
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hardware_pricing_rates (
    hardware_tier VARCHAR(64) PRIMARY KEY,
    cu_per_second NUMERIC(18, 8) NOT NULL,
    usd_per_hour NUMERIC(10, 4) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.hardware_pricing_rates (hardware_tier, cu_per_second, usd_per_hour)
VALUES 
    ('B200',      0.13333333, 4.8000),
    ('H100_SXM5', 0.08888889, 3.2000),
    ('H200',      0.10555556, 3.8000),
    ('L40S',      0.03333333, 1.2000)
ON CONFLICT (hardware_tier) DO UPDATE
SET cu_per_second = EXCLUDED.cu_per_second,
    usd_per_hour = EXCLUDED.usd_per_hour,
    updated_at = clock_timestamp();

-- ----------------------------------------------------------------------------
-- 4. SYSTEM INITIALIZATION: SYSTEM CLEARING & REVENUE ACCOUNTS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    sys_tenant UUID := '00000000-0000-0000-0000-000000000000'::uuid;
    clearing_acc_id UUID;
    revenue_acc_id UUID;
BEGIN
    -- Ensure system accounts exist
    INSERT INTO public.accounts (id, tenant_id, account_number, account_type, currency)
    VALUES 
        ('00000000-0000-0000-0000-000000000001'::uuid, sys_tenant, 'SYS-COMPUTE-CLEARING', 'compute_clearing', 'CU'),
        ('00000000-0000-0000-0000-000000000002'::uuid, sys_tenant, 'SYS-PLATFORM-REVENUE', 'revenue_fee', 'CU')
    ON CONFLICT (account_number) DO NOTHING;

    INSERT INTO public.credit_balances (account_id, tenant_id, current_balance, reserved_balance)
    VALUES 
        ('00000000-0000-0000-0000-000000000001'::uuid, sys_tenant, 0.0, 0.0),
        ('00000000-0000-0000-0000-000000000002'::uuid, sys_tenant, 0.0, 0.0)
    ON CONFLICT (account_id) DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- 5. ATOMIC RPC FUNCTION: rpc_process_compute_settlement
-- Pessimistic row locking with SELECT ... FOR UPDATE
-- Idempotency validation via cryptographic payload hash
-- Absolute debit/credit conservation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_process_compute_settlement(
    p_tenant_id UUID,
    p_session_id VARCHAR(128),
    p_hardware_tier VARCHAR(64),
    p_provider_id VARCHAR(64),
    p_duration_seconds NUMERIC,
    p_nonce BIGINT,
    p_payload_hash VARCHAR(64)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rate_record RECORD;
    v_cu_amount NUMERIC(28, 6);
    v_usd_value NUMERIC(18, 4);
    v_customer_acc RECORD;
    v_customer_bal RECORD;
    v_clearing_acc RECORD;
    v_clearing_bal RECORD;
    v_existing_journal_id UUID;
    v_journal_id UUID;
    v_customer_new_bal NUMERIC(28, 6);
    v_clearing_new_bal NUMERIC(28, 6);
BEGIN
    -- 1. Idempotency Check (Fast Bailout if duplicate hash or replay attack)
    SELECT id INTO v_existing_journal_id
    FROM public.settlement_journals
    WHERE idempotency_hash = p_payload_hash;

    IF v_existing_journal_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'DUPLICATE_IDEMPOTENT',
            'journal_id', v_existing_journal_id,
            'message', 'Settlement payload already atomically processed'
        );
    END IF;

    -- 2. Verify Hardware Rate
    SELECT cu_per_second, usd_per_hour INTO v_rate_record
    FROM public.hardware_pricing_rates
    WHERE hardware_tier = p_hardware_tier AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNKNOWN_OR_INACTIVE_HARDWARE_TIER: %', p_hardware_tier;
    END IF;

    -- Calculate Compute Unit Charge ($1.00 USD = 100 CU)
    v_cu_amount := ROUND((p_duration_seconds * v_rate_record.cu_per_second)::numeric, 6);
    v_usd_value := ROUND((v_cu_amount / 100.0)::numeric, 4);

    IF v_cu_amount <= 0 THEN
        v_cu_amount := 0.000001; -- Minimum non-zero settlement atom
    END IF;

    -- 3. Acquire Pessimistic Exclusive Row Locks
    -- Lock customer wallet account
    SELECT a.id, a.account_number INTO v_customer_acc
    FROM public.accounts a
    WHERE a.tenant_id = p_tenant_id AND a.account_type = 'customer_wallet' AND a.is_active = TRUE
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CUSTOMER_WALLET_NOT_FOUND for tenant: %', p_tenant_id;
    END IF;

    -- Atomic Lock on Customer Balance
    SELECT b.account_id, b.current_balance, b.reserved_balance, b.available_balance
    INTO v_customer_bal
    FROM public.credit_balances b
    WHERE b.account_id = v_customer_acc.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CUSTOMER_BALANCE_RECORD_LOCKED_OR_MISSING for account: %', v_customer_acc.id;
    END IF;

    -- Enforce balance sufficiency
    IF v_customer_bal.available_balance < v_cu_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_CREDIT_BALANCE: Available % CU, Required % CU', 
            v_customer_bal.available_balance, v_cu_amount;
    END IF;

    -- Lock System Compute Clearing Account
    SELECT a.id, a.account_number INTO v_clearing_acc
    FROM public.accounts a
    WHERE a.account_number = 'SYS-COMPUTE-CLEARING'
    LIMIT 1;

    SELECT b.account_id, b.current_balance
    INTO v_clearing_bal
    FROM public.credit_balances b
    WHERE b.account_id = v_clearing_acc.id
    FOR UPDATE;

    -- 4. Create Journal Batch
    INSERT INTO public.settlement_journals (
        tenant_id,
        idempotency_hash,
        session_id,
        hardware_tier,
        provider_id,
        cu_amount,
        usd_value,
        description,
        nonce
    ) VALUES (
        p_tenant_id,
        p_payload_hash,
        p_session_id,
        p_hardware_tier,
        p_provider_id,
        v_cu_amount,
        v_usd_value,
        format('Usage %ss on %s (%s)', p_duration_seconds, p_hardware_tier, p_provider_id),
        p_nonce
    ) RETURNING id INTO v_journal_id;

    -- 5. Calculate New Balances & Enforce Strict Double-Entry Conservation
    -- Customer Wallet: DEBIT (reduction of asset)
    v_customer_new_bal := v_customer_bal.current_balance - v_cu_amount;
    -- Clearing Account: CREDIT (increase in system clearing credit)
    v_clearing_new_bal := v_clearing_bal.current_balance + v_cu_amount;

    -- Insert Entry 1: Customer Debit
    INSERT INTO public.ledger_entries (
        journal_id,
        account_id,
        tenant_id,
        direction,
        amount,
        balance_after,
        entry_seq
    ) VALUES (
        v_journal_id,
        v_customer_acc.id,
        p_tenant_id,
        'debit',
        v_cu_amount,
        v_customer_new_bal,
        1
    );

    -- Insert Entry 2: Clearing Credit
    INSERT INTO public.ledger_entries (
        journal_id,
        account_id,
        tenant_id,
        direction,
        amount,
        balance_after,
        entry_seq
    ) VALUES (
        v_journal_id,
        v_clearing_acc.id,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'credit',
        v_cu_amount,
        v_clearing_new_bal,
        2
    );

    -- Update Customer Balance
    UPDATE public.credit_balances
    SET current_balance = v_customer_new_bal,
        last_journal_id = v_journal_id,
        last_seq_num = last_seq_num + 1,
        updated_at = clock_timestamp()
    WHERE account_id = v_customer_acc.id;

    -- Update Clearing Balance
    UPDATE public.credit_balances
    SET current_balance = v_clearing_new_bal,
        last_journal_id = v_journal_id,
        last_seq_num = last_seq_num + 1,
        updated_at = clock_timestamp()
    WHERE account_id = v_clearing_acc.id;

    -- Return Settlement Receipt
    RETURN jsonb_build_object(
        'status', 'SETTLED',
        'journal_id', v_journal_id,
        'tenant_id', p_tenant_id,
        'session_id', p_session_id,
        'hardware_tier', p_hardware_tier,
        'cu_deducted', v_cu_amount,
        'usd_equivalent', v_usd_value,
        'remaining_available_cu', (v_customer_new_bal - v_customer_bal.reserved_balance),
        'timestamp', clock_timestamp()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_pricing_rates ENABLE ROW LEVEL SECURITY;

-- Tenants may only read their own accounts and balances
DROP POLICY IF EXISTS p_accounts_tenant_read ON public.accounts;
CREATE POLICY p_accounts_tenant_read ON public.accounts
    FOR SELECT TO authenticated
    USING (tenant_id = auth.uid() OR tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);

DROP POLICY IF EXISTS p_balances_tenant_read ON public.credit_balances;
CREATE POLICY p_balances_tenant_read ON public.credit_balances
    FOR SELECT TO authenticated
    USING (tenant_id = auth.uid() OR tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);

DROP POLICY IF EXISTS p_journals_tenant_read ON public.settlement_journals;
CREATE POLICY p_journals_tenant_read ON public.settlement_journals
    FOR SELECT TO authenticated
    USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS p_entries_tenant_read ON public.ledger_entries;
CREATE POLICY p_entries_tenant_read ON public.ledger_entries
    FOR SELECT TO authenticated
    USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS p_rates_read_all ON public.hardware_pricing_rates;
CREATE POLICY p_rates_read_all ON public.hardware_pricing_rates
    FOR SELECT TO authenticated
    USING (is_active = TRUE);

-- Grants
REVOKE ALL ON FUNCTION public.rpc_process_compute_settlement FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_process_compute_settlement TO authenticated, service_role;
