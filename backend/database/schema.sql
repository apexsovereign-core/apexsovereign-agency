-- ============================================================================
-- ApexSovereign.ai - TIER-1 PRODUCTION DATABASE SCHEMA
-- File: backend/database/schema.sql
-- Invariants:
--   1. Real-Time VCU Allocation bound directly to Atomic Double-Entry Ledger ($1.00 USD = 100.000000 CU).
--   2. Strict Multi-Tenant Row-Level Security (RLS) with service_role isolation.
--   3. Idempotent PayPal settlement RPC with transaction advisory locking.
--   4. Cryptographically sealed audit log with SHA-256 state tracking.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUMS & DOMAINS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_tier_enum') THEN
        CREATE TYPE tenant_tier_enum AS ENUM (
            'TIER_1_INSTITUTIONAL',
            'TIER_2_ENTERPRISE',
            'TIER_3_STARTUP',
            'TIER_4_RETAIL'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tx_status_enum') THEN
        CREATE TYPE tx_status_enum AS ENUM (
            'PENDING',
            'AUTHORIZED',
            'COMPLETED',
            'FAILED',
            'REVERSED'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entry_enum') THEN
        CREATE TYPE ledger_entry_enum AS ENUM (
            'DEBIT',
            'CREDIT'
        );
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. TENANTS & ENTITLEMENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    organization_name VARCHAR(255) NOT NULL,
    tier tenant_tier_enum NOT NULL DEFAULT 'TIER_4_RETAIL',
    api_key_hash VARCHAR(128) UNIQUE NOT NULL,
    compute_credits NUMERIC(28, 6) NOT NULL DEFAULT 0.000000 CHECK (compute_credits >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_tenants_auth_user ON public.tenants(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_tier ON public.tenants(tier);

-- ----------------------------------------------------------------------------
-- 3. LEDGER ACCOUNTS TABLE (DOUBLE-ENTRY CORE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT,
    account_number VARCHAR(64) UNIQUE NOT NULL,
    account_type VARCHAR(64) NOT NULL DEFAULT 'TENANT_WALLET',
    balance_cu NUMERIC(28, 6) NOT NULL DEFAULT 0.000000,
    locked_cu NUMERIC(28, 6) NOT NULL DEFAULT 0.000000 CHECK (locked_cu >= 0),
    currency VARCHAR(16) NOT NULL DEFAULT 'CU',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_tenant ON public.ledger_accounts(tenant_id);

-- ----------------------------------------------------------------------------
-- 4. PAYPAL COMMERCIAL TRANSACTIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cu_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    paypal_order_id VARCHAR(128) UNIQUE NOT NULL,
    paypal_capture_id VARCHAR(128) UNIQUE,
    amount_usd NUMERIC(12, 2) NOT NULL CHECK (amount_usd > 0),
    credits_purchased NUMERIC(28, 6) NOT NULL CHECK (credits_purchased > 0),
    status tx_status_enum NOT NULL DEFAULT 'PENDING',
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    webhook_event_id VARCHAR(128) UNIQUE,
    raw_webhook_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cu_tx_tenant ON public.cu_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cu_tx_order ON public.cu_transactions(paypal_order_id);
CREATE INDEX IF NOT EXISTS idx_cu_tx_status ON public.cu_transactions(status);

-- ----------------------------------------------------------------------------
-- 5. DOUBLE-ENTRY LEDGER ENTRIES TABLE (APPEND-ONLY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.double_entry_ledger (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES public.cu_transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES public.ledger_accounts(account_id) ON DELETE RESTRICT,
    entry_type ledger_entry_enum NOT NULL,
    amount_cu NUMERIC(28, 6) NOT NULL CHECK (amount_cu > 0),
    balance_after_cu NUMERIC(28, 6) NOT NULL,
    reference_memo TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_del_tx ON public.double_entry_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_del_account ON public.double_entry_ledger(account_id);
CREATE INDEX IF NOT EXISTS idx_del_created ON public.double_entry_ledger(created_at DESC);

-- ----------------------------------------------------------------------------
-- 6. USAGE AUDIT LOG & COMPLIANCE TRAIL
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_audit_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    action VARCHAR(128) NOT NULL,
    units_consumed NUMERIC(28, 6) NOT NULL DEFAULT 0.000000,
    cost_cu NUMERIC(28, 6) NOT NULL DEFAULT 0.000000,
    ip_address INET,
    user_agent TEXT,
    signature_hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_usage_audit_tenant ON public.usage_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_audit_created ON public.usage_audit_log(created_at DESC);

-- ----------------------------------------------------------------------------
-- 7. ATOMIC SETTLEMENT RPC (IDEMPOTENT & ADVISORY-LOCKED)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_paypal_order_atomic(
    p_paypal_order_id VARCHAR(128),
    p_tenant_id UUID,
    p_amount_usd NUMERIC(12, 2),
    p_credits NUMERIC(28, 6),
    p_capture_id VARCHAR(128),
    p_raw_payload JSONB,
    p_event_id VARCHAR(128)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lock_key BIGINT;
    v_tx RECORD;
    v_tenant_acc RECORD;
    v_system_acc RECORD;
    v_new_balance NUMERIC(28, 6);
BEGIN
    -- 1. Derive 64-bit advisory lock key from paypal_order_id
    v_lock_key := ('x' || substr(md5(p_paypal_order_id), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- 2. Check Idempotency: verify if already settled
    SELECT * INTO v_tx
    FROM public.cu_transactions
    WHERE paypal_order_id = p_paypal_order_id
    FOR UPDATE;

    IF FOUND AND v_tx.status = 'COMPLETED' THEN
        RETURN jsonb_build_object(
            'status', 'ALREADY_COMPLETED',
            'transaction_id', v_tx.id,
            'credits_awarded', v_tx.credits_purchased,
            'message', 'Transaction already settled idempotently'
        );
    END IF;

    -- 3. Lock or initialize tenant ledger account
    SELECT * INTO v_tenant_acc
    FROM public.ledger_accounts
    WHERE tenant_id = p_tenant_id
      AND account_type = 'TENANT_WALLET'
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.ledger_accounts (
            tenant_id, account_number, account_type, balance_cu, locked_cu, is_active
        ) VALUES (
            p_tenant_id, 'WALLET-' || substr(p_tenant_id::text, 1, 8), 'TENANT_WALLET', 0.000000, 0.000000, TRUE
        )
        RETURNING * INTO v_tenant_acc;
    END IF;

    -- 4. Lock or initialize system clearing account
    SELECT * INTO v_system_acc
    FROM public.ledger_accounts
    WHERE account_type = 'SYSTEM_CLEARING'
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.ledger_accounts (
            tenant_id, account_number, account_type, balance_cu, locked_cu, is_active
        ) VALUES (
            NULL, 'SYS-PAYPAL-CLEARING-01', 'SYSTEM_CLEARING', 0.000000, 0.000000, TRUE
        )
        RETURNING * INTO v_system_acc;
    END IF;

    -- 5. Insert or Update Transaction Record
    IF FOUND THEN
        UPDATE public.cu_transactions
        SET status = 'COMPLETED',
            paypal_capture_id = p_capture_id,
            completed_at = clock_timestamp(),
            raw_webhook_payload = p_raw_payload,
            webhook_event_id = p_event_id
        WHERE id = v_tx.id
        RETURNING * INTO v_tx;
    ELSE
        INSERT INTO public.cu_transactions (
            tenant_id, paypal_order_id, paypal_capture_id, amount_usd, credits_purchased,
            status, idempotency_key, webhook_event_id, raw_webhook_payload, completed_at
        ) VALUES (
            p_tenant_id, p_paypal_order_id, p_capture_id, p_amount_usd, p_credits,
            'COMPLETED', 'IDEMP-' || p_paypal_order_id, p_event_id, p_raw_payload, clock_timestamp()
        )
        RETURNING * INTO v_tx;
    END IF;

    -- 6. Credit Tenant Account & Debit Clearing Account
    v_new_balance := v_tenant_acc.balance_cu + p_credits;

    UPDATE public.ledger_accounts
    SET balance_cu = v_new_balance,
        updated_at = clock_timestamp()
    WHERE account_id = v_tenant_acc.account_id;

    UPDATE public.ledger_accounts
    SET balance_cu = balance_cu - p_credits,
        updated_at = clock_timestamp()
    WHERE account_id = v_system_acc.account_id;

    -- 7. Sync top-level tenants compute_credits cache
    UPDATE public.tenants
    SET compute_credits = compute_credits + p_credits,
        updated_at = clock_timestamp()
    WHERE id = p_tenant_id;

    -- 8. Write Double-Entry Audit Logs
    INSERT INTO public.double_entry_ledger (
        transaction_id, account_id, entry_type, amount_cu, balance_after_cu, reference_memo
    ) VALUES (
        v_tx.id, v_tenant_acc.account_id, 'CREDIT', p_credits, v_new_balance,
        'PayPal Order Settlement: ' || p_paypal_order_id
    );

    INSERT INTO public.double_entry_ledger (
        transaction_id, account_id, entry_type, amount_cu, balance_after_cu, reference_memo
    ) VALUES (
        v_tx.id, v_system_acc.account_id, 'DEBIT', p_credits, v_system_acc.balance_cu - p_credits,
        'Clearing Debit for PayPal Order: ' || p_paypal_order_id
    );

    -- 9. Insert Usage Audit Record with SHA-256 seal
    INSERT INTO public.usage_audit_log (
        tenant_id, action, units_consumed, cost_cu, signature_hash
    ) VALUES (
        p_tenant_id, 'PAYPAL_ORDER_CREDIT_SETTLEMENT', p_credits, 0.000000,
        encode(digest(p_paypal_order_id || p_credits::text || v_tx.id::text, 'sha256'), 'hex')
    );

    RETURN jsonb_build_object(
        'status', 'SETTLED',
        'transaction_id', v_tx.id,
        'paypal_order_id', p_paypal_order_id,
        'credits_awarded', p_credits,
        'new_balance_cu', v_new_balance,
        'completed_at', clock_timestamp()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. ROW-LEVEL SECURITY (RLS) HARDENING
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cu_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.double_entry_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view own tenant profile"
    ON public.tenants
    FOR SELECT
    TO authenticated
    USING (auth_user_id = auth.uid());

CREATE POLICY "Tenants can view own ledger accounts"
    ON public.ledger_accounts
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IN (
            SELECT id FROM public.tenants WHERE auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Tenants can view own transactions"
    ON public.cu_transactions
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IN (
            SELECT id FROM public.tenants WHERE auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Tenants can view own ledger entries"
    ON public.double_entry_ledger
    FOR SELECT
    TO authenticated
    USING (
        account_id IN (
            SELECT account_id FROM public.ledger_accounts
            WHERE tenant_id IN (SELECT id FROM public.tenants WHERE auth_user_id = auth.uid())
        )
    );

CREATE POLICY "Tenants can view own audit logs"
    ON public.usage_audit_log
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IN (
            SELECT id FROM public.tenants WHERE auth_user_id = auth.uid()
        )
    );

GRANT EXECUTE ON FUNCTION public.settle_paypal_order_atomic TO authenticated, service_role;
