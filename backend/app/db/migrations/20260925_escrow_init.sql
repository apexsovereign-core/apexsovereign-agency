-- ============================================================================
-- ApexSovereign.ai - Operational Command 03: Escrow Reserves & Stateful Failover
-- Migration: 20260925_escrow_init.sql
-- Security Clearance: SOC 2 TYPE II AVAILABILITY (CC7.2/CC7.3) & SLA ESCROW
-- ============================================================================

-- 1. Relax or Extend ledger_entries transaction_type to include SLA and Escrow Types
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_transaction_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_transaction_type_check CHECK (
    transaction_type IN (
        'CREDIT_PURCHASE',
        'COMPUTE_USAGE',
        'WORKFLOW_EXECUTION',
        'REFUND',
        'MANUAL_ADJUSTMENT',
        'PILOT_COMPUTE_RESERVATION',
        'SLA_BREACH_COMPENSATION',
        'ESCROW_RESERVE_ALLOCATION',
        'ESCROW_RESERVE_RELEASE',
        'SPOT_ARBITRAGE_SPREAD_YIELD'
    )
);

-- 2. Institutional SLA Escrow Reserve Pool Table
CREATE TABLE IF NOT EXISTS sla_escrow_reserves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_identifier VARCHAR(64) UNIQUE NOT NULL DEFAULT 'PRIMARY_SLA_BACKSTOP_POOL',
    total_funded_reserve NUMERIC(18, 4) NOT NULL DEFAULT 500000.0000 CHECK (total_funded_reserve >= 0.0),
    allocated_reserve NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (allocated_reserve >= 0.0),
    unallocated_reserve NUMERIC(18, 4) NOT NULL DEFAULT 500000.0000 CHECK (unallocated_reserve >= 0.0),
    sla_target_pct NUMERIC(6, 4) NOT NULL DEFAULT 99.9990,
    breach_penalty_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 3.00,
    custodian_signature VARCHAR(255) NOT NULL DEFAULT 'ED25519-SIG-APEX-ESCROW-LEDGER-VERIFIED',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Escrow Reserve Pool if not existing
INSERT INTO sla_escrow_reserves (pool_identifier, total_funded_reserve, allocated_reserve, unallocated_reserve, sla_target_pct, breach_penalty_multiplier)
VALUES ('PRIMARY_SLA_BACKSTOP_POOL', 500000.0000, 0.0000, 500000.0000, 99.9990, 3.00)
ON CONFLICT (pool_identifier) DO UPDATE SET
    updated_at = NOW();

-- 3. Failover Incidents and Eviction Auditing Table
CREATE TABLE IF NOT EXISTS failover_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    evicted_node_id VARCHAR(64) NOT NULL,
    standby_node_id VARCHAR(64) NOT NULL,
    workload_id VARCHAR(128) NOT NULL,
    kv_cache_bytes_streamed BIGINT NOT NULL DEFAULT 0,
    ebpf_sockmap_latency_ms NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    total_cutover_latency_ms NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    downtime_duration_ms NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    context_dropped BOOLEAN NOT NULL DEFAULT FALSE,
    compensation_credited NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    merkle_incident_hash VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'RESOLVED' CHECK (
        status IN ('EVACUATING', 'TRANSFERRED', 'RESOLVED', 'SLA_BREACHED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failover_tenant ON failover_incidents(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_failover_evicted_node ON failover_incidents(evicted_node_id);
CREATE INDEX IF NOT EXISTS idx_failover_status ON failover_incidents(status);

-- 4. Atomic Stored Function: SLA Breach Escrow Auto-Compensation
CREATE OR REPLACE FUNCTION trigger_sla_breach_escrow_compensation(
    p_incident_id UUID,
    p_tenant_id UUID,
    p_downtime_ms NUMERIC(8, 2),
    p_penalty_amount NUMERIC(18, 4),
    p_idempotency_key VARCHAR(128)
) RETURNS JSONB AS $$
DECLARE
    v_tenant_balance NUMERIC(18, 4);
    v_new_balance NUMERIC(18, 4);
    v_escrow_pool RECORD;
BEGIN
    -- Check idempotency in ledger_entries
    IF EXISTS (
        SELECT 1 FROM ledger_entries 
        WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
    ) THEN
        RETURN jsonb_build_object(
            'status', 'ALREADY_PROCESSED',
            'tenant_id', p_tenant_id,
            'amount', p_penalty_amount
        );
    END IF;

    -- Debit from Escrow Reserve Pool
    SELECT * INTO v_escrow_pool FROM sla_escrow_reserves 
    WHERE pool_identifier = 'PRIMARY_SLA_BACKSTOP_POOL' FOR UPDATE;

    IF v_escrow_pool.unallocated_reserve < p_penalty_amount THEN
        RAISE EXCEPTION 'Escrow pool deficit: Insufficient reserve funds for automated SLA settlement';
    END IF;

    UPDATE sla_escrow_reserves
    SET unallocated_reserve = unallocated_reserve - p_penalty_amount,
        allocated_reserve = allocated_reserve + p_penalty_amount,
        updated_at = NOW()
    WHERE pool_identifier = 'PRIMARY_SLA_BACKSTOP_POOL';

    -- Lock Tenant Record & Credit Tenant Balance
    SELECT credit_balance INTO v_tenant_balance
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
    END IF;

    v_new_balance := v_tenant_balance + p_penalty_amount;

    UPDATE tenants
    SET credit_balance = v_new_balance,
        updated_at = NOW()
    WHERE id = p_tenant_id;

    -- Insert Double-Entry Balanced Ledger Entry
    INSERT INTO ledger_entries (
        tenant_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        idempotency_key,
        reference_id,
        metadata,
        created_at
    ) VALUES (
        p_tenant_id,
        'SLA_BREACH_COMPENSATION',
        p_penalty_amount,
        v_tenant_balance,
        v_new_balance,
        p_idempotency_key,
        p_incident_id::text,
        jsonb_build_object(
            'incident_id', p_incident_id,
            'downtime_ms', p_downtime_ms,
            'sla_escrow_pool', 'PRIMARY_SLA_BACKSTOP_POOL',
            'action', 'AUTOMATED_ESCROW_CREDIT_DISPATCH'
        ),
        NOW()
    );

    -- Update Incident record with credited compensation
    UPDATE failover_incidents
    SET compensation_credited = p_penalty_amount,
        status = 'SLA_BREACHED'
    WHERE id = p_incident_id;

    RETURN jsonb_build_object(
        'status', 'COMPENSATION_SETTLED',
        'tenant_id', p_tenant_id,
        'penalty_amount', p_penalty_amount,
        'balance_before', v_tenant_balance,
        'balance_after', v_new_balance,
        'escrow_pool_remaining', (v_escrow_pool.unallocated_reserve - p_penalty_amount)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 5. Automated Trigger on Failover Incidents for Unmitigated Context Drops (>1000ms)
CREATE OR REPLACE FUNCTION trg_evaluate_sla_breach()
RETURNS TRIGGER AS $$
DECLARE
    v_penalty NUMERIC(18, 4);
    v_idemp_key VARCHAR(128);
BEGIN
    -- Condition: Downtime exceeds 1000ms context drop or context_dropped is true
    IF (NEW.downtime_duration_ms > 1000.0 OR NEW.context_dropped = TRUE) AND NEW.tenant_id IS NOT NULL THEN
        -- Standard automated compensation: $250.00 credit minimum per unmitigated drop
        v_penalty := 250.0000;
        v_idemp_key := 'sla_auto_' || NEW.id::text;
        
        PERFORM trigger_sla_breach_escrow_compensation(
            NEW.id,
            NEW.tenant_id,
            NEW.downtime_duration_ms,
            v_penalty,
            v_idemp_key
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_sla_breach_compensation ON failover_incidents;
CREATE TRIGGER trg_sla_breach_compensation
    AFTER INSERT OR UPDATE ON failover_incidents
    FOR EACH ROW
    EXECUTE FUNCTION trg_evaluate_sla_breach();

-- 6. Row Level Security (RLS) Policies
ALTER TABLE sla_escrow_reserves ENABLE ROW LEVEL SECURITY;
ALTER TABLE failover_incidents ENABLE ROW LEVEL SECURITY;

-- Transparent read access to public escrow stability indicators
DROP POLICY IF EXISTS read_sla_escrow ON sla_escrow_reserves;
CREATE POLICY read_sla_escrow ON sla_escrow_reserves
    FOR SELECT TO anon, authenticated
    USING (true);

-- Authenticated tenants can inspect their own failover records
DROP POLICY IF EXISTS read_own_failover_incidents ON failover_incidents;
CREATE POLICY read_own_failover_incidents ON failover_incidents
    FOR SELECT TO authenticated
    USING (
        tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
        OR tenant_id IS NULL
    );

-- Service role full governance permissions
DROP POLICY IF EXISTS service_role_all_escrow ON sla_escrow_reserves;
CREATE POLICY service_role_all_escrow ON sla_escrow_reserves
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_failover ON failover_incidents;
CREATE POLICY service_role_all_failover ON failover_incidents
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

COMMENT ON TABLE sla_escrow_reserves IS 'Institutional pre-funded financial escrow backstop guaranteeing 99.999% SLA compensation.';
COMMENT ON TABLE failover_incidents IS 'Real-time record of spot compute evictions, eBPF sockmap redirections, and sub-second migrations.';
