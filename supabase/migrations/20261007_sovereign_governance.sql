-- ==============================================================================
-- APEXSOVEREIGN HOLDINGS — SOVEREIGN GOVERNANCE & EMERGENCY CIRCUIT BREAKERS
-- Path: supabase/migrations/20261007_sovereign_governance.sql
-- Strategy: State Machine, 3-of-5 ED25519 Multi-Sig, Replication Lag Circuit Breakers
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Governance Operational State Machine Table
CREATE TABLE IF NOT EXISTS public.governance_state (
    state_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    current_state VARCHAR(32) NOT NULL DEFAULT 'NOMINAL' CHECK (current_state IN ('NOMINAL', 'GRID_STRESS', 'NETWORK_PARTITION', 'SOVEREIGN_LOCKDOWN')),
    previous_state VARCHAR(32) NOT NULL DEFAULT 'NOMINAL',
    replication_lag_ms NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    lockdown_reason TEXT,
    activated_by_multisig_proposal_id UUID,
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial single-row governance state
INSERT INTO public.governance_state (current_state, previous_state, replication_lag_ms)
SELECT 'NOMINAL', 'NOMINAL', 1.25
WHERE NOT EXISTS (SELECT 1 FROM public.governance_state);

-- 2. Multi-Sig Administrative Proposal & Authorization Table (3-of-5 Threshold)
CREATE TABLE IF NOT EXISTS public.multisig_proposals (
    proposal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_type VARCHAR(64) NOT NULL CHECK (action_type IN ('STATE_TRANSITION', 'RESERVE_TRANSFER', 'PARAMETER_UPDATE')),
    target_state VARCHAR(32),
    transfer_amount_cu NUMERIC(24, 6),
    destination_account_id UUID REFERENCES public.accounts(account_id),
    signatures_required INT NOT NULL DEFAULT 3,
    signatures_collected INT NOT NULL DEFAULT 0,
    is_executed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

-- 3. Individual Cryptographic Signatures (ED25519 Attestations)
CREATE TABLE IF NOT EXISTS public.multisig_signatures (
    signature_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proposal_id UUID NOT NULL REFERENCES public.multisig_proposals(proposal_id) ON DELETE CASCADE,
    signer_public_key_b64 VARCHAR(128) NOT NULL,
    ed25519_signature_b64 VARCHAR(256) NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_signer_per_proposal UNIQUE(proposal_id, signer_public_key_b64)
);

-- 4. Circuit Breaker Event Audit Log
CREATE TABLE IF NOT EXISTS public.circuit_breaker_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_source VARCHAR(64) NOT NULL,
    detected_metric_value NUMERIC(14, 4) NOT NULL,
    threshold_limit NUMERIC(14, 4) NOT NULL,
    resulting_state VARCHAR(32) NOT NULL,
    event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Stored Procedure: Automated Replication Lag & Insolvency Circuit Breaker
CREATE OR REPLACE FUNCTION public.rpc_evaluate_circuit_breaker(
    p_reported_lag_ms NUMERIC(10, 2),
    p_uncollateralized_debit_detected BOOLEAN,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_state VARCHAR(32);
    v_reason TEXT := NULL;
    v_event_id UUID;
BEGIN
    -- Check Thresholds: Lag > 500ms or uncollateralized debit
    IF p_uncollateralized_debit_detected THEN
        v_new_state := 'SOVEREIGN_LOCKDOWN';
        v_reason := 'CRITICAL: Un-collateralized Compute Unit debit attempt identified.';
    ELSIF p_reported_lag_ms > 500.0 THEN
        v_new_state := 'NETWORK_PARTITION';
        v_reason := 'REPLICATION_BREACH: Database replication lag exceeded 500ms safety threshold.';
    ELSE
        -- Nominal operations
        RETURN jsonb_build_object(
            'status', 'HEALTHY',
            'governance_state', 'NOMINAL',
            'lag_ms', p_reported_lag_ms
        );
    END IF;

    -- Record circuit breaker trigger
    INSERT INTO public.circuit_breaker_events (
        trigger_source,
        detected_metric_value,
        threshold_limit,
        resulting_state,
        event_metadata
    )
    VALUES (
        CASE WHEN p_uncollateralized_debit_detected THEN 'UNCOLLATERALIZED_DEBIT' ELSE 'REPLICATION_LAG' END,
        p_reported_lag_ms,
        500.0,
        v_new_state,
        p_metadata
    )
    RETURNING event_id INTO v_event_id;

    -- Transition governance state
    UPDATE public.governance_state
    SET previous_state = current_state,
        current_state = v_new_state,
        replication_lag_ms = p_reported_lag_ms,
        lockdown_reason = v_reason,
        transitioned_at = NOW();

    -- In Sovereign Lockdown: Freeze all operational tenant balances
    IF v_new_state = 'SOVEREIGN_LOCKDOWN' THEN
        UPDATE public.credit_balances
        SET is_frozen = TRUE,
            updated_at = NOW()
        WHERE account_id IN (
            SELECT account_id FROM public.accounts WHERE account_type = 'TENANT_OPERATIONAL'
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'CIRCUIT_BREAKER_TRIPPED',
        'event_id', v_event_id,
        'new_governance_state', v_new_state,
        'reason', v_reason,
        'timestamp', NOW()
    );
END;
$$;

-- 6. Stored Procedure: Submit 3-of-5 Multi-Sig Attestation
CREATE OR REPLACE FUNCTION public.rpc_submit_multisig_signature(
    p_proposal_id UUID,
    p_signer_pubkey VARCHAR(128),
    p_signature_b64 VARCHAR(256)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_collected INT;
    v_required INT;
    v_is_executed BOOLEAN;
    v_target_state VARCHAR(32);
BEGIN
    SELECT signatures_required, signatures_collected, is_executed, target_state
    INTO v_required, v_collected, v_is_executed, v_target_state
    FROM public.multisig_proposals
    WHERE proposal_id = p_proposal_id
    FOR UPDATE;

    IF v_is_executed THEN
        RAISE EXCEPTION 'PROPOSAL_ALREADY_EXECUTED: Proposal has already closed and executed.';
    END IF;

    -- Insert cryptographic signature
    INSERT INTO public.multisig_signatures (
        proposal_id,
        signer_public_key_b64,
        ed25519_signature_b64
    )
    VALUES (
        p_proposal_id,
        p_signer_pubkey,
        p_signature_b64
    );

    v_collected := v_collected + 1;

    -- Check if 3-of-5 threshold is reached
    IF v_collected >= v_required THEN
        UPDATE public.multisig_proposals
        SET signatures_collected = v_collected,
            is_executed = TRUE,
            executed_at = NOW()
        WHERE proposal_id = p_proposal_id;

        -- Apply state transition
        IF v_target_state IS NOT NULL THEN
            UPDATE public.governance_state
            SET previous_state = current_state,
                current_state = v_target_state,
                activated_by_multisig_proposal_id = p_proposal_id,
                transitioned_at = NOW();

            -- If returning to NOMINAL, unfreeze accounts
            IF v_target_state = 'NOMINAL' THEN
                UPDATE public.credit_balances
                SET is_frozen = FALSE,
                    updated_at = NOW();
            END IF;
        END IF;

        RETURN jsonb_build_object(
            'status', 'PROPOSAL_EXECUTED',
            'proposal_id', p_proposal_id,
            'signatures_collected', v_collected,
            'new_state', v_target_state
        );
    ELSE
        UPDATE public.multisig_proposals
        SET signatures_collected = v_collected
        WHERE proposal_id = p_proposal_id;

        RETURN jsonb_build_object(
            'status', 'SIGNATURE_ACCEPTED',
            'proposal_id', p_proposal_id,
            'signatures_collected', v_collected,
            'signatures_required', v_required
        );
    END IF;
END;
$$;

COMMIT;
