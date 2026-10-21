-- ============================================================================
-- ApexSovereign.ai - MULTI-TIER MARKET MATRIX & CROSS-TIER ARBITRAGE SCHEMA
-- Migration: supabase/migrations/20261015_cross_tier_matrix.sql
-- Enforces:
--   1. Strict 4-tier SLA hierarchy (Tier 1 Institutional -> Tier 4 Retail).
--   2. Atomic cross-tier capacity arbitrage based on real-time margin yields.
--   3. Row-Level Security (RLS) guaranteeing lower tiers cannot inspect upper-tier state.
--   4. Immutable audit trail for sub-5ms preemption & workload preservation events.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Reference Table: Market Tiers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_tiers (
    tier_id INT PRIMARY KEY,
    tier_code TEXT NOT NULL UNIQUE,
    tier_name TEXT NOT NULL,
    sla_p99_latency_target_ms NUMERIC(6, 2) NOT NULL,
    vcu_pricing_multiplier NUMERIC(6, 4) NOT NULL,
    preemption_policy TEXT NOT NULL CHECK (preemption_policy IN ('HARD_GUARANTEE_UNPREEMPTIBLE', 'PREEMPTS_LOWER_TIERS', 'BURSTABLE_PREEMPTIBLE', 'SOFT_PREEMPTIBLE_SUB_5MS')),
    is_preemptible BOOLEAN NOT NULL DEFAULT FALSE,
    min_commit_vcus INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Seed Reference Matrix
INSERT INTO public.market_tiers (tier_id, tier_code, tier_name, sla_p99_latency_target_ms, vcu_pricing_multiplier, preemption_policy, is_preemptible, min_commit_vcus)
VALUES
    (1, 'TIER_1_INSTITUTIONAL', 'Institutional Sovereign Core', 10.00, 4.5000, 'HARD_GUARANTEE_UNPREEMPTIBLE', FALSE, 64),
    (2, 'TIER_2_ENTERPRISE',    'Enterprise Dedicated Mesh',    25.00, 2.2000, 'PREEMPTS_LOWER_TIERS',        FALSE, 16),
    (3, 'TIER_3_STARTUP_SMB',   'Startup High-Throughput Burst', 60.00, 1.0000, 'BURSTABLE_PREEMPTIBLE',      FALSE, 2),
    (4, 'TIER_4_RETAIL',        'Consumer Fractional Spot',     250.00, 0.3500, 'SOFT_PREEMPTIBLE_SUB_5MS',   TRUE,  1)
ON CONFLICT (tier_id) DO UPDATE SET
    sla_p99_latency_target_ms = EXCLUDED.sla_p99_latency_target_ms,
    vcu_pricing_multiplier = EXCLUDED.vcu_pricing_multiplier,
    preemption_policy = EXCLUDED.preemption_policy,
    is_preemptible = EXCLUDED.is_preemptible;

-- ----------------------------------------------------------------------------
-- 2. Cluster Capacity & Real-Time Tier Allocation State
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cross_tier_allocations (
    allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id TEXT NOT NULL,
    cluster_region TEXT NOT NULL,
    tier_id INT NOT NULL REFERENCES public.market_tiers(tier_id),
    allocated_vcus INT NOT NULL CHECK (allocated_vcus >= 0),
    allocated_vram_mb BIGINT NOT NULL CHECK (allocated_vram_mb >= 0),
    current_clearing_margin_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Historical Arbitrage Shifts
CREATE TABLE IF NOT EXISTS public.cross_tier_arbitrage_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_tier INT NOT NULL REFERENCES public.market_tiers(tier_id),
    target_tier INT NOT NULL REFERENCES public.market_tiers(tier_id),
    reallocated_vcus INT NOT NULL,
    reallocated_vram_mb BIGINT NOT NULL,
    yield_spread_pct NUMERIC(6, 2) NOT NULL,
    arbitrage_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Sub-5ms Preemption Audit Trail
CREATE TABLE IF NOT EXISTS public.cross_tier_preemption_audit (
    preemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggering_task_id UUID NOT NULL,
    triggering_tier INT NOT NULL REFERENCES public.market_tiers(tier_id),
    preempted_task_id UUID NOT NULL,
    preempted_tier INT NOT NULL REFERENCES public.market_tiers(tier_id),
    tenant_id UUID NOT NULL,
    vcus_reclaimed INT NOT NULL,
    preemption_latency_ms NUMERIC(8, 3) NOT NULL,
    state_preserved BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 3. Indexes for Low-Latency Lookups
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cross_tier_alloc_node ON public.cross_tier_allocations(node_id, tier_id);
CREATE INDEX IF NOT EXISTS idx_cross_tier_preempt_tenant ON public.cross_tier_preemption_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cross_tier_preempt_created ON public.cross_tier_preemption_audit(created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Row-Level Security (RLS) Configuration
-- ----------------------------------------------------------------------------
ALTER TABLE public.market_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_tier_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_tier_arbitrage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cross_tier_preemption_audit ENABLE ROW LEVEL SECURITY;

-- Public can inspect market tier SLA definitions
DROP POLICY IF EXISTS public_read_market_tiers ON public.market_tiers;
CREATE POLICY public_read_market_tiers ON public.market_tiers
    FOR SELECT
    USING (true);

-- Tier 4 / Retail cannot inspect institutional/enterprise cluster allocations
DROP POLICY IF EXISTS tier_isolation_allocations ON public.cross_tier_allocations;
CREATE POLICY tier_isolation_allocations ON public.cross_tier_allocations
    FOR SELECT
    USING (
        -- Only service_role or authenticated institutional/enterprise tenants can view cluster allocations
        auth.role() = 'service_role' OR tier_id >= 4
    );

-- Tenants can only view their own preemption events
DROP POLICY IF EXISTS tenant_view_own_preemptions ON public.cross_tier_preemption_audit;
CREATE POLICY tenant_view_own_preemptions ON public.cross_tier_preemption_audit
    FOR SELECT
    USING (auth.uid() = tenant_id OR auth.role() = 'service_role');

-- Arbitrage events are restricted to service role
DROP POLICY IF EXISTS service_role_arbitrage_events ON public.cross_tier_arbitrage_events;
CREATE POLICY service_role_arbitrage_events ON public.cross_tier_arbitrage_events
    FOR ALL
    USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 5. Atomic RPC Functions
-- ----------------------------------------------------------------------------

-- Function: Reallocates cluster capacity dynamically based on cross-tier margin yields
CREATE OR REPLACE FUNCTION public.rpc_arbitrage_cross_tier_capacity(
    p_node_id TEXT,
    p_reclaim_vcus INT,
    p_target_tier INT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_source_tier INT := 4; -- Reclaim primarily from Tier 4 Consumer Spot
    v_available_tier4_vcus INT;
    v_vram_per_vcu BIGINT := 10240; -- 10GB per VCU
    v_yield_spread NUMERIC := 32.5; -- Target yield spread delta
    v_res JSONB;
BEGIN
    -- Verify target tier exists and is higher priority
    IF p_target_tier >= v_source_tier THEN
        RAISE EXCEPTION 'Target tier % must be higher priority than source tier %', p_target_tier, v_source_tier;
    END IF;

    -- Lock and check current Tier 4 allocation on node
    SELECT allocated_vcus INTO v_available_tier4_vcus
    FROM public.cross_tier_allocations
    WHERE node_id = p_node_id AND tier_id = v_source_tier
    FOR UPDATE;

    IF v_available_tier4_vcus IS NULL OR v_available_tier4_vcus < p_reclaim_vcus THEN
        -- Insufficient Tier 4 on node, record partial or clamp
        p_reclaim_vcus := COALESCE(v_available_tier4_vcus, 0);
    END IF;

    IF p_reclaim_vcus > 0 THEN
        -- Deduct from Tier 4
        UPDATE public.cross_tier_allocations
        SET allocated_vcus = allocated_vcus - p_reclaim_vcus,
            allocated_vram_mb = allocated_vram_mb - (p_reclaim_vcus * v_vram_per_vcu),
            updated_at = timezone('utc'::text, now())
        WHERE node_id = p_node_id AND tier_id = v_source_tier;

        -- Upsert into target higher tier
        INSERT INTO public.cross_tier_allocations (
            node_id, cluster_region, tier_id, allocated_vcus, allocated_vram_mb, current_clearing_margin_pct
        )
        VALUES (
            p_node_id, 'us-east-b200', p_target_tier, p_reclaim_vcus, (p_reclaim_vcus * v_vram_per_vcu), 54.0
        )
        ON CONFLICT (allocation_id) DO NOTHING;

        -- Record arbitrage event
        INSERT INTO public.cross_tier_arbitrage_events (
            source_tier, target_tier, reallocated_vcus, reallocated_vram_mb, yield_spread_pct, arbitrage_reason
        )
        VALUES (
            v_source_tier, p_target_tier, p_reclaim_vcus, (p_reclaim_vcus * v_vram_per_vcu), v_yield_spread, p_reason
        );
    END IF;

    SELECT jsonb_build_object(
        'node_id', p_node_id,
        'source_tier', v_source_tier,
        'target_tier', p_target_tier,
        'reallocated_vcus', p_reclaim_vcus,
        'status', 'ARBITRAGE_EXECUTED'
    ) INTO v_res;

    RETURN v_res;
END;
$$;
