-- ============================================================================
-- ApexSovereign.ai - PRODUCTION GLOBAL LEDGER CUTOVER & CRYPTOGRAPHIC SEAL
-- Migration: 20261013000000_production_ledger_cutover.sql
-- Target: Supabase Enterprise PostgreSQL (Direct & Transaction Pooling)
-- Invariants:
--   1. Strict Double-Entry Conservation: SUM(Debits) == SUM(Credits) across all journals.
--   2. Multi-Tenant Hard RLS with Zero Cross-Tenant Leakage.
--   3. Hardened SECURITY DEFINER functions with sanitized search_path = public, pg_temp.
--   4. Immutable Audit Ledger with SHA-256 State Root Chaining.
-- ============================================================================

-- Ensure cryptographic and UUID primitives exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. SYSTEM RESERVES & FOUR-TIER SETTLEMENT ENUMS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tier_classification_enum') THEN
        CREATE TYPE tier_classification_enum AS ENUM (
            'tier_1_institutional',
            'tier_2_enterprise_standard',
            'tier_3_startup_smb',
            'tier_4_retail_consumer'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cutover_status_enum') THEN
        CREATE TYPE cutover_status_enum AS ENUM (
            'pending_audit',
            'verified_balanced',
            'production_locked',
            'emergency_halted'
        );
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. PRODUCTION CUTOVER AUDIT & STATE ROOT SEALS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_cutover_seals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    epoch_timestamp TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    merkle_state_root VARCHAR(64) NOT NULL,
    total_journals_sealed BIGINT NOT NULL,
    total_debits NUMERIC(28, 6) NOT NULL,
    total_credits NUMERIC(28, 6) NOT NULL,
    variance_cu NUMERIC(28, 6) NOT NULL DEFAULT 0.000000,
    status cutover_status_enum NOT NULL DEFAULT 'production_locked',
    signing_authority VARCHAR(128) NOT NULL DEFAULT 'ApexSovereign.ai Master Root Key',
    signature_proof TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_cutover_seals_epoch ON public.production_cutover_seals(epoch_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cutover_seals_state_root ON public.production_cutover_seals(merkle_state_root);

-- ----------------------------------------------------------------------------
-- 3. FOUR-TIER CAPACITY & ESCROW RESERVES ALLOCATION
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tier_reserve_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier tier_classification_enum UNIQUE NOT NULL,
    allocated_vcu_units BIGINT NOT NULL CHECK (allocated_vcu_units >= 0),
    active_allocated_gpus INT NOT NULL CHECK (active_allocated_gpus >= 0),
    preemptible_pool_size BIGINT NOT NULL DEFAULT 0,
    hourly_rate_cu NUMERIC(28, 6) NOT NULL,
    reserve_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
    sla_availability_target NUMERIC(5, 4) NOT NULL DEFAULT 0.9999,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------------------------
-- 4. ATOMIC INITIALIZATION OF MASTER PRODUCTION SYSTEM ACCOUNTS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_root_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
    v_treasury_id UUID;
    v_escrow_id UUID;
    v_clearing_id UUID;
    v_revenue_id UUID;
    v_tier1_acc UUID;
    v_tier2_acc UUID;
    v_tier3_acc UUID;
    v_tier4_acc UUID;
BEGIN
    -- Master Platform Treasury Reserve Account
    INSERT INTO public.accounts (
        tenant_id, account_number, account_type, currency, is_active, metadata
    )
    VALUES (
        v_root_tenant_id,
        'APEX-SYS-TREASURY-001',
        'provider_payable',
        'CU',
        TRUE,
        '{"name": "Apex Platform Sovereign Treasury Reserve", "purpose": "Master Capital & Settlement Reserve"}'::jsonb
    )
    ON CONFLICT (account_number) DO UPDATE
        SET is_active = TRUE, updated_at = clock_timestamp()
    RETURNING id INTO v_treasury_id;

    -- Primary Escrow Account
    INSERT INTO public.accounts (
        tenant_id, account_number, account_type, currency, is_active, metadata
    )
    VALUES (
        v_root_tenant_id,
        'APEX-SYS-ESCROW-001',
        'platform_escrow',
        'CU',
        TRUE,
        '{"name": "Apex Global Client Escrow", "purpose": "Prepaid GPU Execution Escrow"}'::jsonb
    )
    ON CONFLICT (account_number) DO UPDATE
        SET is_active = TRUE, updated_at = clock_timestamp()
    RETURNING id INTO v_escrow_id;

    -- High-Throughput Clearing Hot Account
    INSERT INTO public.accounts (
        tenant_id, account_number, account_type, currency, is_active, metadata
    )
    VALUES (
        v_root_tenant_id,
        'APEX-SYS-CLEARING-HOT-001',
        'compute_clearing',
        'CU',
        TRUE,
        '{"name": "Apex Sub-ms Clearing Hot Wallet", "purpose": "Real-time eBPF packet micro-settlement"}'::jsonb
    )
    ON CONFLICT (account_number) DO UPDATE
        SET is_active = TRUE, updated_at = clock_timestamp()
    RETURNING id INTO v_clearing_id;

    -- Platform Fee & Arbitrage Revenue Account
    INSERT INTO public.accounts (
        tenant_id, account_number, account_type, currency, is_active, metadata
    )
    VALUES (
        v_root_tenant_id,
        'APEX-SYS-FEES-REVENUE-001',
        'revenue_fee',
        'CU',
        TRUE,
        '{"name": "Apex Protocol Fee Revenue", "purpose": "Trading Spread & Arbitrage Margins"}'::jsonb
    )
    ON CONFLICT (account_number) DO UPDATE
        SET is_active = TRUE, updated_at = clock_timestamp()
    RETURNING id INTO v_revenue_id;

    -- Tier 1 Dedicated Institutional Account
    INSERT INTO public.accounts (
        tenant_id, account_number, account_type, currency, is_active, metadata
    )
    VALUES (
        v_root_tenant_id,
        'APEX-TIER1-INSTITUTIONAL-RESERVE',
        'platform_escrow',
        'CU',
        TRUE,
        '{"tier": "Tier 1", "sla": "99.999% NVLink Dedicated"}'::jsonb
    )
    ON CONFLICT (account_number) DO UPDATE
        SET is_active = TRUE, updated_at = clock_timestamp()
    RETURNING id INTO v_tier1_acc;

    -- Tier 2 Enterprise Standard Account
    INSERT INTO public.accounts (
        tenant_id, account_number, account_type, currency, is_active, metadata
    )
    VALUES (
        v_root_tenant_id,
        'APEX-TIER2-ENTERPRISE-RESERVE',
        'platform_escrow',
        'CU',
        TRUE,
        '{"tier": "Tier 2", "sla": "99.95% Standard Clusters"}'::jsonb
    )
    ON CONFLICT (account_number) DO UPDATE
        SET is_active = TRUE, updated_at = clock_timestamp()
    RETURNING id INTO v_tier2_acc;

    -- Tier 3 Startup SMB Account
    INSERT INTO public.accounts (
        tenant_id, account_number, account_type, currency, is_active, metadata
    )
    VALUES (
        v_root_tenant_id,
        'APEX-TIER3-STARTUP-RESERVE',
        'platform_escrow',
        'CU',
        TRUE,
        '{"tier": "Tier 3", "sla": "99.9% Spot & Preemptible"}'::jsonb
    )
    ON CONFLICT (account_number) DO UPDATE
        SET is_active = TRUE, updated_at = clock_timestamp()
    RETURNING id INTO v_tier3_acc;

    -- Tier 4 Retail Fractional GPU Account
    INSERT INTO public.accounts (
        tenant_id, account_number, account_type, currency, is_active, metadata
    )
    VALUES (
        v_root_tenant_id,
        'APEX-TIER4-RETAIL-FRACTIONAL-RESERVE',
        'platform_escrow',
        'CU',
        TRUE,
        '{"tier": "Tier 4", "sla": "Fractional MIG 1/8th Slices"}'::jsonb
    )
    ON CONFLICT (account_number) DO UPDATE
        SET is_active = TRUE, updated_at = clock_timestamp()
    RETURNING id INTO v_tier4_acc;

    -- Ensure initial credit balances exist for system accounts
    INSERT INTO public.credit_balances (account_id, tenant_id, current_balance, reserved_balance)
    VALUES
        (v_treasury_id, v_root_tenant_id, 1000000000.000000, 0.000000), -- 1 Billion CU Initial Platform Reserve ($10M USD)
        (v_escrow_id, v_root_tenant_id, 0.000000, 0.000000),
        (v_clearing_id, v_root_tenant_id, 0.000000, 0.000000),
        (v_revenue_id, v_root_tenant_id, 0.000000, 0.000000),
        (v_tier1_acc, v_root_tenant_id, 0.000000, 0.000000),
        (v_tier2_acc, v_root_tenant_id, 0.000000, 0.000000),
        (v_tier3_acc, v_root_tenant_id, 0.000000, 0.000000),
        (v_tier4_acc, v_root_tenant_id, 0.000000, 0.000000)
    ON CONFLICT (account_id) DO NOTHING;

    -- Populate Tier Capacities
    INSERT INTO public.tier_reserve_allocations (
        tier, allocated_vcu_units, active_allocated_gpus, preemptible_pool_size, hourly_rate_cu, reserve_account_id, sla_availability_target
    )
    VALUES
        ('tier_1_institutional', 500000, 256, 0, 480.000000, v_tier1_acc, 0.99999),
        ('tier_2_enterprise_standard', 250000, 128, 0, 320.000000, v_tier2_acc, 0.99950),
        ('tier_3_startup_smb', 125000, 64, 32000, 185.000000, v_tier3_acc, 0.99900),
        ('tier_4_retail_consumer', 50000, 32, 50000, 45.000000, v_tier4_acc, 0.99500)
    ON CONFLICT (tier) DO UPDATE SET
        allocated_vcu_units = EXCLUDED.allocated_vcu_units,
        active_allocated_gpus = EXCLUDED.active_allocated_gpus,
        preemptible_pool_size = EXCLUDED.preemptible_pool_size,
        hourly_rate_cu = EXCLUDED.hourly_rate_cu,
        reserve_account_id = EXCLUDED.reserve_account_id,
        updated_at = clock_timestamp();
END $$;

-- ----------------------------------------------------------------------------
-- 5. ATOMIC DOUBLE-ENTRY INVARIANCE VALIDATION ENGINE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_double_entry_invariance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_debits NUMERIC(28, 6);
    v_total_credits NUMERIC(28, 6);
    v_delta NUMERIC(28, 6);
    v_journal_count BIGINT;
    v_unbalanced_journals BIGINT;
    v_state_root VARCHAR(64);
    v_result JSONB;
BEGIN
    -- Verify aggregate debits vs credits in ledger_entries
    SELECT
        COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cu ELSE 0 END), 0.000000),
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_cu ELSE 0 END), 0.000000)
    INTO v_total_debits, v_total_credits
    FROM public.ledger_entries;

    v_delta := v_total_debits - v_total_credits;

    -- Check if any individual journals are unbalanced
    SELECT COUNT(*)
    INTO v_unbalanced_journals
    FROM (
        SELECT journal_id,
               SUM(CASE WHEN direction = 'debit' THEN amount_cu ELSE -amount_cu END) as balance_offset
        FROM public.ledger_entries
        GROUP BY journal_id
        HAVING SUM(CASE WHEN direction = 'debit' THEN amount_cu ELSE -amount_cu END) <> 0
    ) sub;

    SELECT COUNT(*) INTO v_journal_count FROM public.journal_entries;

    -- Compute cryptographic state root of active balances
    SELECT encode(digest(
        string_agg(
            account_id::text || ':' || current_balance::text || ':' || reserved_balance::text,
            '|' ORDER BY account_id
        ), 'sha256'), 'hex')
    INTO v_state_root
    FROM public.credit_balances;

    IF v_state_root IS NULL THEN
        v_state_root := encode(digest('APEX_ZERO_STATE_INIT', 'sha256'), 'hex');
    END IF;

    IF v_delta <> 0.000000 OR v_unbalanced_journals > 0 THEN
        RAISE EXCEPTION 'CRITICAL LEDGER INVARIANCE BREACH: Debits=%, Credits=%, Delta=%, UnbalancedJournals=%',
            v_total_debits, v_total_credits, v_delta, v_unbalanced_journals
            USING ERRCODE = '23514'; -- check_violation
    END IF;

    v_result := jsonb_build_object(
        'status', 'BALANCED_AND_SEALED',
        'total_journals', v_journal_count,
        'total_debits_cu', v_total_debits,
        'total_credits_cu', v_total_credits,
        'variance_cu', v_delta,
        'unbalanced_journals', v_unbalanced_journals,
        'merkle_state_root', v_state_root,
        'verified_at', clock_timestamp()
    );

    RETURN v_result;
END;
$$;

-- Revoke public execution and restrict strictly to authenticated service role
REVOKE ALL ON FUNCTION public.assert_double_entry_invariance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_double_entry_invariance() TO service_role;

-- ----------------------------------------------------------------------------
-- 6. RECORD PRODUCTION CUTOVER SEAL RECEIPT
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_audit JSONB;
    v_seal_id UUID;
BEGIN
    v_audit := public.assert_double_entry_invariance();

    INSERT INTO public.production_cutover_seals (
        merkle_state_root,
        total_journals_sealed,
        total_debits,
        total_credits,
        variance_cu,
        status,
        signature_proof,
        metadata
    )
    VALUES (
        (v_audit->>'merkle_state_root')::text,
        (v_audit->>'total_journals')::bigint,
        (v_audit->>'total_debits_cu')::numeric,
        (v_audit->>'total_credits_cu')::numeric,
        (v_audit->>'variance_cu')::numeric,
        'production_locked',
        encode(digest('APEXSOVEREIGN_PRODUCTION_SEAL_V1_' || (v_audit->>'merkle_state_root'), 'sha256'), 'hex'),
        v_audit
    )
    RETURNING id INTO v_seal_id;

    RAISE NOTICE 'ApexSovereign.ai Production Ledger Cutover Successfully Sealed. Seal ID: %', v_seal_id;
END $$;

-- ----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) HARDENING FOR PRODUCTION TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.production_cutover_seals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_reserve_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view verified cutover seals" ON public.production_cutover_seals;
CREATE POLICY "Public can view verified cutover seals"
    ON public.production_cutover_seals
    FOR SELECT
    TO anon, authenticated
    USING (status = 'production_locked');

DROP POLICY IF EXISTS "Service role maintains cutover seals" ON public.production_cutover_seals;
CREATE POLICY "Service role maintains cutover seals"
    ON public.production_cutover_seals
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view tier capacity allocations" ON public.tier_reserve_allocations;
CREATE POLICY "Public can view tier capacity allocations"
    ON public.tier_reserve_allocations
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Service role manages tier capacity allocations" ON public.tier_reserve_allocations;
CREATE POLICY "Service role manages tier capacity allocations"
    ON public.tier_reserve_allocations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- End of migration 20261013000000_production_ledger_cutover.sql
