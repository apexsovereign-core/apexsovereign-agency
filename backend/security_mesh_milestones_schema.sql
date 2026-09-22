-- ============================================================================
-- ApexSovereign.ai - Advanced Confidential Computing, Fleet Security & Mesh Schema
-- Features:
--   1. Milestone 11: Hardware Enclave Attestation & Confidential Computing Sessions
--   2. Milestone 12: Fleet Intrusion Detection & Node Quarantine Audit Ledger
--   3. Milestone 13: Global Anycast Mesh Ingress Gateways & Multi-Cloud POPs
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- MILESTONE 11: Zero-Trust Secure Enclave & Confidential Computing Gateway
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS confidential_enclave_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(64) UNIQUE NOT NULL, -- e.g. 'ENC-SESS-9821A'
    tenant_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,
    enclave_technology VARCHAR(32) NOT NULL CHECK (
        enclave_technology IN ('NVIDIA_H100_CC', 'AMD_SEV_SNP', 'INTEL_TDX', 'AWS_NITRO_ENCLAVE')
    ),
    attestation_measurement_hash VARCHAR(128) NOT NULL, -- SHA-384 / SHA-256 measurement digest
    hardware_signer_public_key TEXT NOT NULL, -- Platform root of trust / VCEK / RIM certificate
    encryption_key_fingerprint VARCHAR(64) NOT NULL,
    attestation_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED' CHECK (
        attestation_status IN ('PENDING_ATTESTATION', 'VERIFIED', 'FAILED', 'REVOKED')
    ),
    enclave_memory_size_gb INT NOT NULL DEFAULT 80,
    sealed_payload_reference TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enclave_tenant ON confidential_enclave_sessions(tenant_id, attestation_status);
CREATE INDEX IF NOT EXISTS idx_enclave_node ON confidential_enclave_sessions(node_id);

-- ----------------------------------------------------------------------------
-- MILESTONE 12: Autonomous Self-Healing Fleet Security & Intrusion Detection
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fleet_security_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id VARCHAR(64) UNIQUE NOT NULL,
    node_name VARCHAR(128) NOT NULL,
    provider_id UUID,
    severity VARCHAR(32) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    threat_vector VARCHAR(64) NOT NULL CHECK (
        threat_vector IN (
            'UNAUTHORIZED_DMA_PROBE',
            'UNVERIFIED_KERNEL_MODULE',
            'ECC_MEMORY_CORRUPTION_BURST',
            'UNEXPECTED_EGRESS_TUNNEL',
            'PCI_CONFIGURATION_TAMPER'
        )
    ),
    threat_description TEXT NOT NULL,
    raw_anomaly_telemetry JSONB DEFAULT '{}'::jsonb,
    mitigation_action VARCHAR(64) NOT NULL DEFAULT 'NODE_QUARANTINED' CHECK (
        mitigation_action IN ('NODE_QUARANTINED', 'LEASE_EVACUATED', 'COLLATERAL_SLASHED', 'ALERT_LOGGED')
    ),
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_node ON fleet_security_alerts(node_name, is_resolved);
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON fleet_security_alerts(severity, detected_at DESC);

CREATE TABLE IF NOT EXISTS node_quarantine_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_name VARCHAR(128) NOT NULL,
    quarantine_reason VARCHAR(128) NOT NULL,
    quarantined_by VARCHAR(64) NOT NULL DEFAULT 'AUTONOMOUS_SECURITY_DAEMON',
    leases_evacuated_count INT NOT NULL DEFAULT 0,
    provider_slashed_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- MILESTONE 13: Global Multi-Cloud Mesh & Anycast Routing Controller
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anycast_edge_gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_code VARCHAR(64) UNIQUE NOT NULL, -- e.g. 'GW-US-EAST', 'GW-EU-WEST'
    city VARCHAR(64) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    cloud_provider VARCHAR(64) NOT NULL CHECK (
        cloud_provider IN ('EQUINIX_METAL', 'AWS_GLOBAL_ACCELERATOR', 'CLOUDFLARE_WARP', 'GCP_EXTERNAL')
    ),
    ipv4_vip VARCHAR(45) NOT NULL,
    bgp_asn INT NOT NULL DEFAULT 13335,
    health_status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY' CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'DRAINING', 'OFFLINE')),
    current_connections INT NOT NULL DEFAULT 0,
    average_rtt_ms NUMERIC(6, 2) NOT NULL DEFAULT 12.50,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anycast_gw_status ON anycast_edge_gateways(health_status, is_active);

-- Enable Row Level Security & Policies
ALTER TABLE confidential_enclave_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_quarantine_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE anycast_edge_gateways ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
    target_tables TEXT[] := ARRAY[
        'confidential_enclave_sessions',
        'fleet_security_alerts',
        'node_quarantine_records',
        'anycast_edge_gateways'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_all_' || tbl, tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_role_all_' || tbl, tbl);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_read_' || tbl, tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'auth_read_' || tbl, tbl);
    END LOOP;
END $$;
