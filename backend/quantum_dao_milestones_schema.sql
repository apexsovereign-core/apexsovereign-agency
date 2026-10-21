-- ============================================================================
-- ApexSovereign.ai - Quantum Cryptography, Neural Arbitrage & DAO Treasury (Milestones 14, 15, 16)
-- Features:
--   1. Milestone 14: Post-Quantum Lattice Key Exchanges, Dilithium Signatures & PQC Keys
--   2. Milestone 15: Neural Spot Price Volatility Forecasts & Automated Hedging Locks
--   3. Milestone 16: Multi-Sig DAO Treasury Escrows, Smart Contract Payouts & Proofs
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- MILESTONE 14: Post-Quantum Lattice Cryptography & PQC Handshake Registry
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pqc_lattice_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id VARCHAR(64) UNIQUE NOT NULL, -- e.g. 'PQC-KYBER-768-VA19'
    entity_id VARCHAR(128) NOT NULL, -- Node ID, Tenant ID, or Treasury Contract
    algorithm VARCHAR(64) NOT NULL CHECK (
        algorithm IN ('ML_KEM_768_KYBER', 'ML_DSA_65_DILITHIUM', 'FALCON_512', 'SPHINCS_PLUS')
    ),
    public_key_pem TEXT NOT NULL,
    key_fingerprint VARCHAR(128) UNIQUE NOT NULL,
    quantum_security_level INT NOT NULL DEFAULT 3 CHECK (quantum_security_level IN (1, 3, 5)),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pqc_handshake_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(64) UNIQUE NOT NULL,
    initiator_id VARCHAR(128) NOT NULL,
    responder_id VARCHAR(128) NOT NULL,
    kex_algorithm VARCHAR(64) NOT NULL DEFAULT 'ML_KEM_768_KYBER',
    shared_secret_hash VARCHAR(128) NOT NULL,
    encapsulated_ciphertext_hash VARCHAR(128) NOT NULL,
    quantum_proof_signature TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ESTABLISHED' CHECK (status IN ('ESTABLISHED', 'ROTATED', 'TERMINATED')),
    established_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pqc_entity ON pqc_lattice_keys(entity_id, algorithm);
CREATE INDEX IF NOT EXISTS idx_pqc_sessions ON pqc_handshake_sessions(initiator_id, responder_id);

-- ----------------------------------------------------------------------------
-- MILESTONE 15: Neural Spot Arbitrage, Volatility Forecasts & Hedging Locks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS neural_arbitrage_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id VARCHAR(64) UNIQUE NOT NULL,
    region_code VARCHAR(64) NOT NULL,
    gpu_architecture VARCHAR(64) NOT NULL,
    current_spot_rate NUMERIC(10, 4) NOT NULL,
    predicted_spot_rate_1h NUMERIC(10, 4) NOT NULL,
    predicted_spot_rate_6h NUMERIC(10, 4) NOT NULL,
    volatility_index NUMERIC(5, 2) NOT NULL DEFAULT 12.50, -- e.g. 15.8% annualized hourly volatility
    confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.9420,
    arbitrage_action VARCHAR(64) NOT NULL DEFAULT 'HOLD' CHECK (
        arbitrage_action IN ('HEDGE_LOCK_CAPACITY', 'RELEASE_SPECULATIVE', 'HOLD', 'MIGRATE_REGIONAL_BURST')
    ),
    forecast_model_version VARCHAR(32) NOT NULL DEFAULT 'NEURAL-TRANSFORMER-V4.2',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arbitrage_forecasts ON neural_arbitrage_forecasts(region_code, gpu_architecture, created_at DESC);

CREATE TABLE IF NOT EXISTS bare_metal_hedging_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hedge_contract_id VARCHAR(64) UNIQUE NOT NULL,
    region_code VARCHAR(64) NOT NULL,
    gpu_architecture VARCHAR(64) NOT NULL,
    locked_nodes_count INT NOT NULL DEFAULT 8,
    locked_hourly_rate NUMERIC(10, 4) NOT NULL,
    projected_savings_usd NUMERIC(14, 2) NOT NULL,
    hedging_status VARCHAR(32) NOT NULL DEFAULT 'LOCKED' CHECK (
        hedging_status IN ('LOCKED', 'EXECUTING_LEASE', 'SETTLED_PROFIT', 'RELEASED')
    ),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- MILESTONE 16: Autonomous Multi-Sig DAO Treasury & Smart Contract Escrows
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dao_treasury_escrows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_id VARCHAR(64) UNIQUE NOT NULL,
    lease_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    provider_id UUID NOT NULL,
    token_symbol VARCHAR(16) NOT NULL DEFAULT 'USDC' CHECK (token_symbol IN ('USDC', 'USDT', 'DAI', 'ETH')),
    escrow_amount NUMERIC(18, 4) NOT NULL,
    smart_contract_escrow_address VARCHAR(128) NOT NULL,
    settlement_status VARCHAR(32) NOT NULL DEFAULT 'LOCKED_IN_ESCROW' CHECK (
        settlement_status IN ('LOCKED_IN_ESCROW', 'DISBURSED_TO_PROVIDER', 'REFUNDED_TENANT', 'ARBITRATED_SPLIT')
    ),
    multi_sig_threshold INT NOT NULL DEFAULT 3,
    required_signers_count INT NOT NULL DEFAULT 5,
    signatures_collected JSONB DEFAULT '[]'::jsonb,
    onchain_tx_hash VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_escrow_tenant ON dao_treasury_escrows(tenant_id, settlement_status);
CREATE INDEX IF NOT EXISTS idx_escrow_provider ON dao_treasury_escrows(provider_id);

CREATE TABLE IF NOT EXISTS dao_multi_sig_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id VARCHAR(64) UNIQUE NOT NULL,
    action_type VARCHAR(64) NOT NULL CHECK (
        action_type IN ('DISBURSE_ESCROW', 'SLASH_PROVIDER_COLLATERAL', 'UPDATE_PROTOCOL_FEE', 'EMERGENCY_CIRCUIT_BREAKER')
    ),
    target_escrow_or_provider_id VARCHAR(128) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL,
    token_symbol VARCHAR(16) NOT NULL DEFAULT 'USDC',
    signers_approved TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_executed BOOLEAN NOT NULL DEFAULT FALSE,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security & Policies
ALTER TABLE pqc_lattice_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE pqc_handshake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE neural_arbitrage_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bare_metal_hedging_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE dao_treasury_escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE dao_multi_sig_proposals ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
    final_tier_tables TEXT[] := ARRAY[
        'pqc_lattice_keys',
        'pqc_handshake_sessions',
        'neural_arbitrage_forecasts',
        'bare_metal_hedging_locks',
        'dao_treasury_escrows',
        'dao_multi_sig_proposals'
    ];
BEGIN
    FOREACH tbl IN ARRAY final_tier_tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_all_' || tbl, tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_role_all_' || tbl, tbl);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_read_' || tbl, tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'auth_read_' || tbl, tbl);
    END LOOP;
END $$;
