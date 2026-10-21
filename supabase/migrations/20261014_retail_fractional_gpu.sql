-- ============================================================================
-- ApexSovereign.ai - TIER 4 RETAIL FRACTIONAL GPU SHARING & MICRO-BILLING SCHEMA
-- Migration: supabase/migrations/20261014_retail_fractional_gpu.sql
-- Enforces:
--   1. Zero-balance insolvency prevention (balance_micro_credits >= 0 invariant).
--   2. Strict Row-Level Security (RLS) for multi-tenant retail isolation.
--   3. Atomic RPC stored procedures with hardened SECURITY DEFINER search_path.
--   4. Audit trail logging for sub-5ms cold-kill events and micro-debits.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table Definitions
-- ----------------------------------------------------------------------------

-- Retail Tenants Registry
CREATE TABLE IF NOT EXISTS public.retail_tenants (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_handle TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'FROZEN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Pre-Paid Micro-Credit Wallets ($0.000001 USD precision)
CREATE TABLE IF NOT EXISTS public.retail_prepaid_wallets (
    tenant_id UUID PRIMARY KEY REFERENCES public.retail_tenants(tenant_id) ON DELETE CASCADE,
    balance_micro_credits BIGINT NOT NULL DEFAULT 0 CHECK (balance_micro_credits >= 0),
    total_deposited_micro BIGINT NOT NULL DEFAULT 0,
    total_consumed_micro BIGINT NOT NULL DEFAULT 0,
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Physical Hardware Registry
CREATE TABLE IF NOT EXISTS public.retail_physical_gpus (
    gpu_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    model TEXT NOT NULL,
    total_vram_mb BIGINT NOT NULL,
    total_sms INT NOT NULL,
    allocated_vram_mb BIGINT NOT NULL DEFAULT 0,
    allocated_sms INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ONLINE' CHECK (status IN ('ONLINE', 'DRAINING', 'OFFLINE')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Active & Historical Fractional GPU Slices
CREATE TABLE IF NOT EXISTS public.retail_gpu_slices (
    slice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gpu_id TEXT NOT NULL REFERENCES public.retail_physical_gpus(gpu_id),
    tenant_id UUID NOT NULL REFERENCES public.retail_tenants(tenant_id),
    profile_name TEXT NOT NULL,
    vram_mb BIGINT NOT NULL,
    allocated_sms INT NOT NULL,
    mps_thread_pct INT NOT NULL,
    cgroup_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'IDLE', 'COLD_KILLING', 'EVICTED', 'DEPROVISIONED')),
    lease_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Compute Session Leases
CREATE TABLE IF NOT EXISTS public.retail_compute_leases (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slice_id UUID NOT NULL REFERENCES public.retail_gpu_slices(slice_id),
    tenant_id UUID NOT NULL REFERENCES public.retail_tenants(tenant_id),
    tokens_processed BIGINT NOT NULL DEFAULT 0,
    duration_seconds NUMERIC(10, 4) NOT NULL DEFAULT 0.0,
    cost_micro_credits BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'COLD_KILLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    ended_at TIMESTAMPTZ
);

-- Zero-Balance Cold-Kill Audit Events
CREATE TABLE IF NOT EXISTS public.retail_cold_kill_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    slice_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.retail_tenants(tenant_id),
    eviction_latency_ms NUMERIC(8, 3) NOT NULL,
    reason TEXT NOT NULL,
    evicted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 2. Indexes for O(1) Lookups & Real-Time Monitoring
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_retail_slices_tenant ON public.retail_gpu_slices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_retail_slices_gpu ON public.retail_gpu_slices(gpu_id);
CREATE INDEX IF NOT EXISTS idx_retail_leases_slice ON public.retail_compute_leases(slice_id);
CREATE INDEX IF NOT EXISTS idx_retail_cold_kill_tenant ON public.retail_cold_kill_events(tenant_id);

-- ----------------------------------------------------------------------------
-- 3. Row-Level Security (RLS) Configuration
-- ----------------------------------------------------------------------------
ALTER TABLE public.retail_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_prepaid_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_physical_gpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_gpu_slices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_compute_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_cold_kill_events ENABLE ROW LEVEL SECURITY;

-- Tenants policy: isolate read to authenticated tenant_id
DROP POLICY IF EXISTS tenant_read_own_profile ON public.retail_tenants;
CREATE POLICY tenant_read_own_profile ON public.retail_tenants
    FOR SELECT
    USING (auth.uid() = tenant_id);

-- Wallets policy: isolate read to own wallet
DROP POLICY IF EXISTS tenant_read_own_wallet ON public.retail_prepaid_wallets;
CREATE POLICY tenant_read_own_wallet ON public.retail_prepaid_wallets
    FOR SELECT
    USING (auth.uid() = tenant_id);

-- Slices policy: isolate read to own active slices
DROP POLICY IF EXISTS tenant_read_own_slices ON public.retail_gpu_slices;
CREATE POLICY tenant_read_own_slices ON public.retail_gpu_slices
    FOR SELECT
    USING (auth.uid() = tenant_id);

-- Physical GPUs: read-only public mesh status
DROP POLICY IF EXISTS public_read_gpu_mesh ON public.retail_physical_gpus;
CREATE POLICY public_read_gpu_mesh ON public.retail_physical_gpus
    FOR SELECT
    USING (true);

-- Leases policy: isolate read to own compute leases
DROP POLICY IF EXISTS tenant_read_own_leases ON public.retail_compute_leases;
CREATE POLICY tenant_read_own_leases ON public.retail_compute_leases
    FOR SELECT
    USING (auth.uid() = tenant_id);

-- ----------------------------------------------------------------------------
-- 4. Atomic RPC Functions (SECURITY DEFINER with strict search_path)
-- ----------------------------------------------------------------------------

-- Function: Create or Onboard Retail Wallet
CREATE OR REPLACE FUNCTION public.rpc_create_retail_wallet(
    p_tenant_id UUID,
    p_email TEXT,
    p_handle TEXT,
    p_initial_deposit_usd NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_micro_credits BIGINT;
    v_res JSONB;
BEGIN
    v_micro_credits := ROUND(p_initial_deposit_usd * 1000000)::BIGINT;

    -- Upsert Tenant Profile
    INSERT INTO public.retail_tenants (tenant_id, developer_handle, email)
    VALUES (p_tenant_id, p_handle, p_email)
    ON CONFLICT (tenant_id) DO NOTHING;

    -- Upsert Pre-Paid Wallet
    INSERT INTO public.retail_prepaid_wallets (
        tenant_id,
        balance_micro_credits,
        total_deposited_micro,
        total_consumed_micro,
        is_frozen
    )
    VALUES (
        p_tenant_id,
        v_micro_credits,
        v_micro_credits,
        0,
        FALSE
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        balance_micro_credits = retail_prepaid_wallets.balance_micro_credits + v_micro_credits,
        total_deposited_micro = retail_prepaid_wallets.total_deposited_micro + v_micro_credits,
        is_frozen = FALSE,
        last_synced_at = timezone('utc'::text, now());

    SELECT jsonb_build_object(
        'tenant_id', p_tenant_id,
        'developer_handle', p_handle,
        'balance_micro_credits', v_micro_credits,
        'status', 'SUCCESS'
    ) INTO v_res;

    RETURN v_res;
END;
$$;

-- Function: Atomic Micro-Credit Deduction with Invariant Protection
CREATE OR REPLACE FUNCTION public.rpc_deduct_micro_credits(
    p_tenant_id UUID,
    p_micro_credits BIGINT,
    p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current_bal BIGINT;
    v_new_bal BIGINT;
    v_frozen BOOLEAN;
BEGIN
    -- Lock row for update
    SELECT balance_micro_credits, is_frozen
    INTO v_current_bal, v_frozen
    FROM public.retail_prepaid_wallets
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet for tenant % not found', p_tenant_id;
    END IF;

    IF v_frozen THEN
        RAISE EXCEPTION 'Wallet % is frozen due to depletion or suspension', p_tenant_id;
    END IF;

    IF v_current_bal < p_micro_credits THEN
        -- Insolvency protection: Immediately freeze wallet
        UPDATE public.retail_prepaid_wallets
        SET is_frozen = TRUE,
            last_synced_at = timezone('utc'::text, now())
        WHERE tenant_id = p_tenant_id;

        RAISE EXCEPTION 'Insufficient balance: % µC available, % µC required', v_current_bal, p_micro_credits;
    END IF;

    v_new_bal := v_current_bal - p_micro_credits;

    UPDATE public.retail_prepaid_wallets
    SET balance_micro_credits = v_new_bal,
        total_consumed_micro = total_consumed_micro + p_micro_credits,
        is_frozen = (v_new_bal <= 0),
        last_synced_at = timezone('utc'::text, now())
    WHERE tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'remaining_balance_micro', v_new_bal,
        'deducted_micro', p_micro_credits,
        'is_depleted', (v_new_bal <= 0)
    );
END;
$$;

-- Function: Immediate Sub-5ms Cold-Kill Audit Registration
CREATE OR REPLACE FUNCTION public.rpc_terminate_zero_balance_session(
    p_session_id UUID,
    p_eviction_latency_ms NUMERIC,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_slice_id UUID;
    v_tenant_id UUID;
BEGIN
    SELECT slice_id, tenant_id
    INTO v_slice_id, v_tenant_id
    FROM public.retail_compute_leases
    WHERE session_id = p_session_id;

    IF FOUND THEN
        -- Mark session terminated
        UPDATE public.retail_compute_leases
        SET status = 'COLD_KILLED',
            ended_at = timezone('utc'::text, now())
        WHERE session_id = p_session_id;

        -- Mark slice evicted
        UPDATE public.retail_gpu_slices
        SET status = 'EVICTED'
        WHERE slice_id = v_slice_id;

        -- Record cold kill event audit
        INSERT INTO public.retail_cold_kill_events (
            session_id,
            slice_id,
            tenant_id,
            eviction_latency_ms,
            reason
        )
        VALUES (
            p_session_id,
            v_slice_id,
            v_tenant_id,
            p_eviction_latency_ms,
            p_reason
        );
    END IF;

    RETURN jsonb_build_object(
        'session_id', p_session_id,
        'status', 'COLD_KILL_RECORDED',
        'eviction_latency_ms', p_eviction_latency_ms
    );
END;
$$;
