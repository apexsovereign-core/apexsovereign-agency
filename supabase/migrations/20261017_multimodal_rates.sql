-- ============================================================================
-- ApexSovereign.ai - MULTI-MODAL INTELLIGENCE RATES & ATOMIC BILLING LEDGER
-- Migration: 20261017_multimodal_rates.sql
-- Invariants:
--   1. Real-Time VCU Allocation bound directly to Atomic Ledger ($1.00 USD = 100 CU).
--   2. Strict Row-Level Security (RLS): Multi-modal outputs tenant-isolated.
--   3. Hardened SECURITY DEFINER billing functions with search_path = public, pg_temp.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. MULTI-MODAL SERVICE CAPABILITY ENUM
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'multimodal_service_type_enum') THEN
        CREATE TYPE multimodal_service_type_enum AS ENUM (
            'TRANSCRIPTION',        -- Live Audio Stream Speech-to-Text ($0.00005/sec = 0.005 CU/sec)
            'VOICE_STREAM',         -- Low-Latency Bidirectional Audio/Live API ($0.00010/sec = 0.010 CU/sec)
            'MOLECULAR_SIM',        -- Bioinformatics & Molecular Docking ($0.25/run = 25.0 CU/run)
            'MUSIC_SYNTH',          -- Latent Audio Music Synthesis ($0.0015/sec = 0.150 CU/sec)
            'VIDEO_GEN',            -- Temporal Image-to-Video ($0.025/sec = 2.500 CU/sec)
            'IMAGE_CREATION',       -- High-Speed Latent Diffusion ($0.008/image = 0.800 CU/image)
            'SEARCH_GROUNDING',     -- Real-Time Web Fact Checking ($0.0005/query = 0.050 CU/query)
            'SPATIAL_MAPS',         -- Global Spatial Routing & Telemetry ($0.0008/route = 0.080 CU/route)
            'RAG_CHATBOT',          -- Sovereign Context-Aware Chatbot ($0.0002/turn = 0.020 CU/turn)
            'DATABASE_AUTH_SYNC'    -- Sovereign Ledger Sync & State Auth ($0.0001/tx = 0.010 CU/tx)
        );
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. RATE SCHEDULE MASTER CHART
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.multimodal_rate_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type multimodal_service_type_enum UNIQUE NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    unit_description VARCHAR(64) NOT NULL,
    rate_cu_per_unit NUMERIC(28, 6) NOT NULL CHECK (rate_cu_per_unit > 0),
    min_charge_cu NUMERIC(28, 6) NOT NULL DEFAULT 0.000000,
    required_vcu_tier VARCHAR(64) NOT NULL DEFAULT 'TIER_4_FRACTIONAL',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Seed default pricing rates
INSERT INTO public.multimodal_rate_schedules (
    service_type, display_name, unit_description, rate_cu_per_unit, min_charge_cu, required_vcu_tier
)
VALUES
    ('TRANSCRIPTION', 'Live Speech-to-Text Transcription', 'second_audio', 0.005000, 0.001000, 'TIER_4_MIG_AUDIO'),
    ('VOICE_STREAM', 'Low-Latency Bidirectional Voice Stream', 'second_stream', 0.010000, 0.002000, 'TIER_3_COMPUTE_STREAM'),
    ('MOLECULAR_SIM', 'Bioinformatics & Molecular Docking', 'simulation_job', 25.000000, 25.000000, 'TIER_1_H100_NVLINK'),
    ('MUSIC_SYNTH', 'Custom Latent Music Synthesis', 'second_audio', 0.150000, 0.750000, 'TIER_2_L40S_DIFFUSION'),
    ('VIDEO_GEN', 'Temporal Image-to-Video Studio', 'second_video', 2.500000, 5.000000, 'TIER_1_B200_CLUSTER'),
    ('IMAGE_CREATION', 'High-Speed Diffusion Image Studio', 'rendered_image', 0.800000, 0.800000, 'TIER_3_STANDARD_GPU'),
    ('SEARCH_GROUNDING', 'Real-Time Web Search Grounding', 'grounded_query', 0.050000, 0.050000, 'TIER_4_ANYCAST_INGRESS'),
    ('SPATIAL_MAPS', 'Spatial & Route Telemetry Agent', 'spatial_route', 0.080000, 0.080000, 'TIER_4_ANYCAST_INGRESS'),
    ('RAG_CHATBOT', 'Context-Aware Sovereign Chatbot', 'dialogue_turn', 0.020000, 0.020000, 'TIER_3_LLM_HOSTED'),
    ('DATABASE_AUTH_SYNC', 'Native Ledger & Auth Federation', 'atomic_transaction', 0.010000, 0.010000, 'TIER_1_SECURITY_CORE')
ON CONFLICT (service_type) DO UPDATE SET
    rate_cu_per_unit = EXCLUDED.rate_cu_per_unit,
    min_charge_cu = EXCLUDED.min_charge_cu,
    updated_at = clock_timestamp();

-- ----------------------------------------------------------------------------
-- 3. MULTI-MODAL EXECUTION & CONSUMPTION LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.multimodal_execution_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    service_type multimodal_service_type_enum NOT NULL,
    units_consumed NUMERIC(28, 6) NOT NULL CHECK (units_consumed >= 0),
    total_cu_debited NUMERIC(28, 6) NOT NULL CHECK (total_cu_debited >= 0),
    vcu_allocation_id VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    latency_ms NUMERIC(10, 3) NOT NULL DEFAULT 0.000,
    payload_hash VARCHAR(64) NOT NULL,
    output_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    journal_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_multimodal_records_tenant ON public.multimodal_execution_records(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_multimodal_records_service ON public.multimodal_execution_records(service_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_multimodal_records_user ON public.multimodal_execution_records(user_id);

-- ----------------------------------------------------------------------------
-- 4. ATOMIC MULTI-MODAL BILLING DEDUCTION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_execute_multimodal_billing(
    p_tenant_id UUID,
    p_user_id UUID,
    p_service_type multimodal_service_type_enum,
    p_units NUMERIC(28, 6),
    p_vcu_allocation_id VARCHAR(128),
    p_latency_ms NUMERIC(10, 3),
    p_payload_hash VARCHAR(64),
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rate_rec RECORD;
    v_calculated_cu NUMERIC(28, 6);
    v_account_id UUID;
    v_clearing_id UUID;
    v_current_bal NUMERIC(28, 6);
    v_new_bal NUMERIC(28, 6);
    v_journal_id UUID;
    v_record_id UUID;
BEGIN
    -- 1. Fetch rate schedule
    SELECT * INTO v_rate_rec
    FROM public.multimodal_rate_schedules
    WHERE service_type = p_service_type AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service type % is not active or configured.', p_service_type
            USING ERRCODE = 'P0002';
    END IF;

    -- 2. Calculate exact CU deduction
    v_calculated_cu := GREATEST(p_units * v_rate_rec.rate_cu_per_unit, v_rate_rec.min_charge_cu);

    -- 3. Locate customer primary wallet account
    SELECT a.id INTO v_account_id
    FROM public.accounts a
    WHERE a.tenant_id = p_tenant_id AND a.account_type = 'customer_wallet' AND a.is_active = TRUE
    ORDER BY a.created_at ASC
    LIMIT 1;

    IF v_account_id IS NULL THEN
        -- Fallback to default user wallet
        SELECT a.id INTO v_account_id
        FROM public.accounts a
        WHERE a.tenant_id = p_tenant_id AND a.is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'No active wallet found for tenant %', p_tenant_id
            USING ERRCODE = 'P0003';
    END IF;

    -- 4. Locate clearing hot account for revenue/clearing transfer
    SELECT id INTO v_clearing_id
    FROM public.accounts
    WHERE account_number = 'APEX-SYS-CLEARING-HOT-001'
    LIMIT 1;

    -- 5. Lock and verify balance
    SELECT current_balance INTO v_current_bal
    FROM public.credit_balances
    WHERE account_id = v_account_id
    FOR UPDATE;

    IF v_current_bal IS NULL OR v_current_bal < v_calculated_cu THEN
        RAISE EXCEPTION 'INSUFFICIENT_COMPUTE_UNITS: Available=% CU, Required=% CU',
            COALESCE(v_current_bal, 0.0), v_calculated_cu
            USING ERRCODE = '23514';
    END IF;

    -- 6. Perform balance debit
    UPDATE public.credit_balances
    SET current_balance = current_balance - v_calculated_cu,
        last_seq_num = last_seq_num + 1
    WHERE account_id = v_account_id
    RETURNING current_balance INTO v_new_bal;

    -- If clearing account exists, credit it for conservation
    IF v_clearing_id IS NOT NULL THEN
        UPDATE public.credit_balances
        SET current_balance = current_balance + v_calculated_cu,
            last_seq_num = last_seq_num + 1
        WHERE account_id = v_clearing_id;
    END IF;

    -- 7. Record atomic double-entry journal
    INSERT INTO public.journal_entries (
        tenant_id, entry_ref, total_amount_cu, description
    )
    VALUES (
        p_tenant_id,
        'MM-' || encode(gen_random_bytes(6), 'hex'),
        v_calculated_cu,
        'Multi-modal invocation: ' || p_service_type::text
    )
    RETURNING id INTO v_journal_id;

    -- Debit customer
    INSERT INTO public.ledger_entries (
        journal_id, account_id, tenant_id, amount_cu, direction, description
    )
    VALUES (
        v_journal_id, v_account_id, p_tenant_id, v_calculated_cu, 'debit',
        'Consumption: ' || p_service_type::text || ' (' || p_units || ' ' || v_rate_rec.unit_description || ')'
    );

    -- Credit clearing
    IF v_clearing_id IS NOT NULL THEN
        INSERT INTO public.ledger_entries (
            journal_id, account_id, tenant_id, amount_cu, direction, description
        )
        VALUES (
            v_journal_id, v_clearing_id, p_tenant_id, v_calculated_cu, 'credit',
            'Clearing settlement: ' || p_service_type::text
        );
    END IF;

    -- 8. Record execution telemetry record
    INSERT INTO public.multimodal_execution_records (
        tenant_id,
        user_id,
        service_type,
        units_consumed,
        total_cu_debited,
        vcu_allocation_id,
        status,
        latency_ms,
        payload_hash,
        output_metadata,
        journal_id
    )
    VALUES (
        p_tenant_id,
        p_user_id,
        p_service_type,
        p_units,
        v_calculated_cu,
        p_vcu_allocation_id,
        'COMPLETED',
        p_latency_ms,
        p_payload_hash,
        p_metadata,
        v_journal_id
    )
    RETURNING id INTO v_record_id;

    RETURN jsonb_build_object(
        'status', 'SETTLED',
        'record_id', v_record_id,
        'service_type', p_service_type,
        'units_consumed', p_units,
        'cu_debited', v_calculated_cu,
        'remaining_balance_cu', v_new_bal,
        'journal_id', v_journal_id,
        'settled_at', clock_timestamp()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_execute_multimodal_billing(UUID, UUID, multimodal_service_type_enum, NUMERIC, VARCHAR, NUMERIC, VARCHAR, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_execute_multimodal_billing(UUID, UUID, multimodal_service_type_enum, NUMERIC, VARCHAR, NUMERIC, VARCHAR, JSONB) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.multimodal_rate_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multimodal_execution_records ENABLE ROW LEVEL SECURITY;

-- Rate schedules: viewable by all authenticated & anonymous storefront users
DROP POLICY IF EXISTS "Public view for multimodal rates" ON public.multimodal_rate_schedules;
CREATE POLICY "Public view for multimodal rates"
    ON public.multimodal_rate_schedules
    FOR SELECT
    TO anon, authenticated
    USING (is_active = TRUE);

-- Execution records: strictly tenant-isolated
DROP POLICY IF EXISTS "Tenants can only view their own multimodal executions" ON public.multimodal_execution_records;
CREATE POLICY "Tenants can only view their own multimodal executions"
    ON public.multimodal_execution_records
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = (SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
        OR
        user_id = auth.uid()
    );

DROP POLICY IF EXISTS "Service role maintains multimodal records" ON public.multimodal_execution_records;
CREATE POLICY "Service role maintains multimodal records"
    ON public.multimodal_execution_records
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
