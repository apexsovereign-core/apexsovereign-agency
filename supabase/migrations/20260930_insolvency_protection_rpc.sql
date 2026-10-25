-- supabase/migrations/20260930_insolvency_protection_rpc.sql
-- ApexSovereign Holdings: AethelPay Ledger Absolute Insolvency Protection RPC
BEGIN;

-- 1. Ensure Table Structure & Indexes Exist
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
    tenant_id UUID NOT NULL REFERENCES public.tenant_ledgers(tenant_id),
    idempotency_key UUID NOT NULL UNIQUE,
    workload_id TEXT NOT NULL,
    cu_amount NUMERIC(18, 6) NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    balance_before NUMERIC(18, 6) NOT NULL,
    balance_after NUMERIC(18, 6) NOT NULL,
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_tenant_ledgers_status ON public.tenant_ledgers(tenant_id, is_locked);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_idemp ON public.ledger_transactions(idempotency_key);

-- 2. Complete Atomic deduct_cu_balance Function
CREATE OR REPLACE FUNCTION public.deduct_cu_balance(
    p_tenant_id UUID,
    p_cu_amount NUMERIC(18, 6),
    p_idempotency_key UUID
) RETURNS NUMERIC(18, 6) AS $$
DECLARE
    v_current_balance NUMERIC(18, 6);
    v_new_balance NUMERIC(18, 6);
    v_is_locked BOOLEAN;
BEGIN
    -- Strict sanity check on amount
    IF p_cu_amount <= 0.000000 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Requested deduction % CU must be strictly positive.', p_cu_amount;
    END IF;

    -- 1. Idempotency Check (Prevent duplicate billing under network retries)
    IF EXISTS (SELECT 1 FROM public.ledger_transactions WHERE idempotency_key = p_idempotency_key) THEN
        SELECT cu_balance INTO v_current_balance 
        FROM public.tenant_ledgers 
        WHERE tenant_id = p_tenant_id;
        RETURN v_current_balance;
    END IF;

    -- 2. Acquire Exclusive Pessimistic Write Lock (SELECT ... FOR UPDATE)
    SELECT cu_balance, is_locked INTO v_current_balance, v_is_locked
    FROM public.tenant_ledgers
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND: Tenant % does not exist in tenant_ledgers.', p_tenant_id;
    END IF;

    IF v_is_locked THEN
        RAISE EXCEPTION 'TENANT_ACCOUNT_LOCKED: Account % is administratively or insolvency-locked.', p_tenant_id;
    END IF;

    -- 3. Calculate New Balance
    v_new_balance := v_current_balance - p_cu_amount;

    -- 4. Absolute Floor Enforcement (0.000000 CU)
    IF v_new_balance < 0.000000 THEN
        -- Engage immediate defensive execution lock to sever further traffic
        UPDATE public.tenant_ledgers
        SET is_locked = true,
            lock_reason = 'INSOLVENCY_PREVENTION: Requested ' || p_cu_amount || ' CU exceeds balance ' || v_current_balance,
            updated_at = timezone('utc', now())
        WHERE tenant_id = p_tenant_id;

        RAISE EXCEPTION 'INSOLVENCY_PREVENTION: Requested % CU exceeds available balance (%). Account locked.', p_cu_amount, v_current_balance;
    END IF;

    -- 5. Commit Balance Mutation
    UPDATE public.tenant_ledgers
    SET cu_balance = v_new_balance,
        updated_at = timezone('utc', now())
    WHERE tenant_id = p_tenant_id;

    -- 6. Record Immutable Audit Transaction
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
        p_tenant_id,
        p_idempotency_key,
        'COMPUTE_EXECUTION_DISPATCH',
        p_cu_amount,
        'DEBIT',
        v_current_balance,
        v_new_balance,
        'Pessimistic atomic settlement execution'
    );

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Row-Level Security Policies
ALTER TABLE public.tenant_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_self_view ON public.tenant_ledgers;
CREATE POLICY tenant_self_view ON public.tenant_ledgers
    FOR SELECT USING (tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid);

DROP POLICY IF EXISTS service_role_all ON public.tenant_ledgers;
CREATE POLICY service_role_all ON public.tenant_ledgers
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_tx ON public.ledger_transactions;
CREATE POLICY service_role_all_tx ON public.ledger_transactions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
