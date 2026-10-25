-- ============================================================================
-- ApexSovereign.ai - AUTONOMOUS COMPLIANCE & CRYPTOGRAPHIC AUDIT ENGINE
-- Migration: 20261013_audit_trail.sql
-- Enforces: Cryptographic Merkle State Roots, SOC2/ISO Attestation Receipts,
--           Strict Append-Only Immutability Triggers, and Invariance Audit RPCs.
-- ============================================================================

-- Extensions required
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. CRYPTOGRAPHIC MERKLE STATE ROOTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_merkle_roots (
    block_index BIGINT PRIMARY KEY,
    epoch_window_start TIMESTAMPTZ NOT NULL,
    epoch_window_end TIMESTAMPTZ NOT NULL,
    leaf_count BIGINT NOT NULL CHECK (leaf_count >= 0),
    root_hash VARCHAR(64) NOT NULL,
    signature_hex VARCHAR(128),
    broadcast_status VARCHAR(32) NOT NULL DEFAULT 'COMMITTED',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_audit_merkle_roots_created ON public.audit_merkle_roots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_merkle_roots_hash ON public.audit_merkle_roots(root_hash);

-- ----------------------------------------------------------------------------
-- 2. COMPLIANCE ATTESTATION RECEIPTS (SOC 2, ISO 27001, FEDRAMP, SOVEREIGN)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compliance_attestation_receipts (
    receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID NOT NULL,
    compliance_standard VARCHAR(64) NOT NULL,
    merkle_state_root VARCHAR(64) NOT NULL,
    transaction_block_index BIGINT NOT NULL,
    transaction_count BIGINT NOT NULL CHECK (transaction_count >= 0),
    total_volume_cu NUMERIC(28, 6) NOT NULL CHECK (total_volume_cu >= 0),
    invariance_preserved BOOLEAN NOT NULL,
    signer_public_key_hex VARCHAR(64) NOT NULL,
    signature_hex VARCHAR(128) NOT NULL,
    auditor_jurisdiction TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_compliance_receipts_standard ON public.compliance_attestation_receipts(compliance_standard);
CREATE INDEX IF NOT EXISTS idx_compliance_receipts_audit ON public.compliance_attestation_receipts(audit_id);
CREATE INDEX IF NOT EXISTS idx_compliance_receipts_root ON public.compliance_attestation_receipts(merkle_state_root);

-- ----------------------------------------------------------------------------
-- 3. LEDGER INVARIANCE AUDIT RUNS & CIRCUIT BREAKER LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_invariance_checks (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journals_audited_count BIGINT NOT NULL CHECK (journals_audited_count >= 0),
    entries_audited_count BIGINT NOT NULL CHECK (entries_audited_count >= 0),
    accounts_reconciled_count BIGINT NOT NULL CHECK (accounts_reconciled_count >= 0),
    total_debits_cu NUMERIC(28, 6) NOT NULL CHECK (total_debits_cu >= 0),
    total_credits_cu NUMERIC(28, 6) NOT NULL CHECK (total_credits_cu >= 0),
    net_divergence_cu NUMERIC(28, 6) NOT NULL CHECK (net_divergence_cu >= 0),
    is_invariance_preserved BOOLEAN NOT NULL,
    circuit_breaker_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    state_checksum VARCHAR(64) NOT NULL,
    anomaly_details JSONB NOT NULL DEFAULT '[]'::jsonb,
    discrepancy_details JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_invariance_checks_created ON public.ledger_invariance_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invariance_checks_preserved ON public.ledger_invariance_checks(is_invariance_preserved);

-- ----------------------------------------------------------------------------
-- 4. ABSOLUTE TAMPER-EVIDENT IMMUTABILITY TRIGGERS
-- Prohibits UPDATE and DELETE operations on all audit and compliance tables.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_audit_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'CRITICAL SECURITY VIOLATION: Audit trail records are cryptographically immutable. Operation % is strictly forbidden on table %',
        TG_OP, TG_TABLE_NAME;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_merkle_roots_immutable ON public.audit_merkle_roots;
CREATE TRIGGER trg_audit_merkle_roots_immutable
BEFORE UPDATE OR DELETE ON public.audit_merkle_roots
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_audit_immutability();

DROP TRIGGER IF EXISTS trg_compliance_receipts_immutable ON public.compliance_attestation_receipts;
CREATE TRIGGER trg_compliance_receipts_immutable
BEFORE UPDATE OR DELETE ON public.compliance_attestation_receipts
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_audit_immutability();

DROP TRIGGER IF EXISTS trg_ledger_invariance_checks_immutable ON public.ledger_invariance_checks;
CREATE TRIGGER trg_ledger_invariance_checks_immutable
BEFORE UPDATE OR DELETE ON public.ledger_invariance_checks
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_audit_immutability();

-- ----------------------------------------------------------------------------
-- 5. ATOMIC SQL INVARIANCE AUDITOR RPC
-- Allows database-side instantaneous double-entry invariant verification.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_verify_system_ledger_invariance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_debits NUMERIC(28, 6);
    v_total_credits NUMERIC(28, 6);
    v_divergence NUMERIC(28, 6);
    v_journal_count BIGINT;
    v_entry_count BIGINT;
    v_account_count BIGINT;
    v_is_preserved BOOLEAN;
    v_audit_id UUID := gen_random_uuid();
    v_checksum VARCHAR(64);
BEGIN
    -- Aggregate all debits and credits across the immutable ledger
    SELECT 
        COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0.000000),
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0.000000),
        COUNT(*)
    INTO v_total_debits, v_total_credits, v_entry_count
    FROM public.ledger_entries;

    SELECT COUNT(*) INTO v_journal_count FROM public.settlement_journals;
    SELECT COUNT(*) INTO v_account_count FROM public.accounts;

    v_divergence := ABS(v_total_debits - v_total_credits);
    v_is_preserved := (v_divergence = 0.000000);

    -- Compute deterministic SHA-256 state checksum
    v_checksum := encode(
        digest(
            format('INVARIANCE:%s:%s:%s:%s', v_total_debits, v_total_credits, v_journal_count, v_entry_count),
            'sha256'
        ),
        'hex'
    );

    -- Record execution receipt into audit table
    INSERT INTO public.ledger_invariance_checks (
        audit_id,
        journals_audited_count,
        entries_audited_count,
        accounts_reconciled_count,
        total_debits_cu,
        total_credits_cu,
        net_divergence_cu,
        is_invariance_preserved,
        circuit_breaker_triggered,
        state_checksum,
        anomaly_details,
        discrepancy_details
    ) VALUES (
        v_audit_id,
        v_journal_count,
        v_entry_count,
        v_account_count,
        v_total_debits,
        v_total_credits,
        v_divergence,
        v_is_preserved,
        NOT v_is_preserved,
        v_checksum,
        '[]'::jsonb,
        '[]'::jsonb
    );

    RETURN jsonb_build_object(
        'audit_id', v_audit_id,
        'is_invariance_preserved', v_is_preserved,
        'total_debits_cu', v_total_debits,
        'total_credits_cu', v_total_credits,
        'net_divergence_cu', v_divergence,
        'journals_count', v_journal_count,
        'entries_count', v_entry_count,
        'accounts_count', v_account_count,
        'state_checksum', v_checksum,
        'audited_at', clock_timestamp()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_merkle_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_attestation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_invariance_checks ENABLE ROW LEVEL SECURITY;

-- Allow public read of verified compliance receipts for institutional transparency
DROP POLICY IF EXISTS p_read_compliance_receipts ON public.compliance_attestation_receipts;
CREATE POLICY p_read_compliance_receipts ON public.compliance_attestation_receipts
    FOR SELECT TO authenticated, anon
    USING (true);

-- Allow authenticated read of Merkle state roots
DROP POLICY IF EXISTS p_read_merkle_roots ON public.audit_merkle_roots;
CREATE POLICY p_read_merkle_roots ON public.audit_merkle_roots
    FOR SELECT TO authenticated
    USING (true);

-- Invariance checks restricted to service_role and security auditors
DROP POLICY IF EXISTS p_admin_invariance_checks ON public.ledger_invariance_checks;
CREATE POLICY p_admin_invariance_checks ON public.ledger_invariance_checks
    FOR SELECT TO authenticated
    USING (auth.jwt() ->> 'role' = 'service_role' OR auth.jwt() ->> 'role' = 'security_auditor');

-- Grant execute permission on the audit verification RPC
REVOKE ALL ON FUNCTION public.rpc_verify_system_ledger_invariance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_verify_system_ledger_invariance() TO authenticated, service_role;
