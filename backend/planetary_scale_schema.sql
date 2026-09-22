-- ============================================================================
-- ApexSovereign.ai - Planetary-Scale Technical Expansions (Milestones 17, 18, 19)
-- Features:
--   1. Milestone 17: Zero-Knowledge Proof (zk-SNARK/Halo2) Neural Model Verification
--   2. Milestone 18: Decentralized Peer-to-Peer (libp2p) Gossip Leases & Mesh Peers
--   3. Milestone 19: Sovereign LEO Satellite & Space-Laser Orbital Optical Ingress
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- MILESTONE 17: Zero-Knowledge Proof (ZKP) Neural Model Verification
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zkp_neural_proof_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_id VARCHAR(64) UNIQUE NOT NULL, -- e.g. 'ZKP-HALO2-8821B'
    tenant_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,
    model_family VARCHAR(64) NOT NULL, -- e.g. 'LLAMA_3_70B_QUANT', 'DEEPSEEK_V3'
    circuit_type VARCHAR(64) NOT NULL CHECK (
        circuit_type IN ('HALO2_KZG_COMMITMENT', 'GROTH16_BN254', 'STARK_FRI_POLYNOMIAL')
    ),
    public_inputs_hash VARCHAR(128) NOT NULL, -- Commitments of dataset batch & output activations
    proof_bytes_b64 TEXT NOT NULL, -- zk-SNARK cryptographic proof
    verification_key_fingerprint VARCHAR(128) NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    verification_time_ms NUMERIC(8, 2) NOT NULL DEFAULT 42.50,
    proof_metadata JSONB DEFAULT '{}'::jsonb,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zkp_tenant ON zkp_neural_proof_verifications(tenant_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_zkp_node ON zkp_neural_proof_verifications(node_id);

-- ----------------------------------------------------------------------------
-- MILESTONE 18: Autonomous P2P Gossip Protocol & Decentralized Leases
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_mesh_peers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peer_id VARCHAR(128) UNIQUE NOT NULL, -- e.g. '12D3KooW...' multiaddr peer
    multiaddr_endpoint VARCHAR(255) NOT NULL, -- e.g. '/ip4/198.51.100.22/tcp/4001/p2p/...'
    node_name VARCHAR(128) NOT NULL,
    region_code VARCHAR(64) NOT NULL,
    supported_protocols TEXT[] DEFAULT ARRAY['/apex/gossip/1.0.0', '/apex/lease-negotiation/1.0.0']::TEXT[],
    reputation_score NUMERIC(5, 2) NOT NULL DEFAULT 98.50,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(32) NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'DEGRADED', 'DISCONNECTED'))
);

CREATE INDEX IF NOT EXISTS idx_p2p_peers_status ON p2p_mesh_peers(status, last_heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS p2p_negotiated_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_reference VARCHAR(64) UNIQUE NOT NULL,
    initiator_peer_id VARCHAR(128) NOT NULL,
    provider_peer_id VARCHAR(128) NOT NULL,
    gpu_architecture VARCHAR(64) NOT NULL,
    gpu_count INT NOT NULL DEFAULT 8,
    cleared_rate_per_hour NUMERIC(10, 4) NOT NULL,
    p2p_signature_initiator TEXT NOT NULL,
    p2p_signature_provider TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'DISPUTED')),
    established_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- MILESTONE 19: Sovereign LEO Satellite & Space-Laser Orbital Backhaul
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leo_satellite_constellation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    satellite_norad_id VARCHAR(32) UNIQUE NOT NULL, -- e.g. 'APEX-LEO-SAT-01'
    constellation_name VARCHAR(64) NOT NULL DEFAULT 'SOVEREIGN_ORBITAL_MESH',
    orbital_altitude_km NUMERIC(7, 2) NOT NULL DEFAULT 550.00,
    orbital_inclination_deg NUMERIC(5, 2) NOT NULL DEFAULT 53.20,
    laser_crosslink_status VARCHAR(32) NOT NULL DEFAULT 'LOCKED' CHECK (
        laser_crosslink_status IN ('LOCKED', 'ACQUIRING', 'DEGRADED', 'ECLIPSED')
    ),
    active_optical_peers INT NOT NULL DEFAULT 4, -- Inter-satellite optical laser links (ISLs)
    uplink_ground_station VARCHAR(64) NOT NULL, -- e.g. 'SVALBARD_POLAR_STATION'
    downlink_throughput_gbps NUMERIC(6, 2) NOT NULL DEFAULT 100.00,
    round_trip_latency_ms NUMERIC(6, 2) NOT NULL DEFAULT 18.20,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orbital_telemetry_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id VARCHAR(64) UNIQUE NOT NULL,
    source_ground_station VARCHAR(64) NOT NULL,
    destination_region VARCHAR(64) NOT NULL,
    satellite_hops TEXT[] NOT NULL,
    optical_laser_frequency_thz NUMERIC(8, 2) NOT NULL DEFAULT 193.40, -- 1550nm optical C-band
    packet_loss_percent NUMERIC(5, 4) NOT NULL DEFAULT 0.0001,
    is_active_failover BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security & Isolation Policies
ALTER TABLE zkp_neural_proof_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_mesh_peers ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_negotiated_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_satellite_constellation ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbital_telemetry_routes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
    planetary_tables TEXT[] := ARRAY[
        'zkp_neural_proof_verifications',
        'p2p_mesh_peers',
        'p2p_negotiated_contracts',
        'leo_satellite_constellation',
        'orbital_telemetry_routes'
    ];
BEGIN
    FOREACH tbl IN ARRAY planetary_tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_all_' || tbl, tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_role_all_' || tbl, tbl);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_read_' || tbl, tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'auth_read_' || tbl, tbl);
    END LOOP;
END $$;
