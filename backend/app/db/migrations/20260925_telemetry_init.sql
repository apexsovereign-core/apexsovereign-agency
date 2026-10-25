-- ============================================================================
-- ApexSovereign.ai - Enterprise Telemetry Gateway & Time-Series Ledger
-- Migration: 20260925_telemetry_init.sql
-- Security Clearance: SOC 2 TYPE II COMPLIANCE & CRYPTOGRAPHIC TIME-SERIES
-- ============================================================================

-- 1. Create Bare-Metal Node Registry Table
CREATE TABLE IF NOT EXISTS cluster_nodes (
    id VARCHAR(64) PRIMARY KEY,
    datacenter_region VARCHAR(128) NOT NULL,
    gpu_model VARCHAR(128) NOT NULL,
    gpu_count INT NOT NULL DEFAULT 8,
    memory_total_gb NUMERIC(10, 2) NOT NULL DEFAULT 640.0,
    power_limit_watts NUMERIC(10, 2) NOT NULL DEFAULT 700.0,
    interconnect_gbps INT NOT NULL DEFAULT 3200,
    attestation_status VARCHAR(64) NOT NULL DEFAULT 'SEV-SNP Hardware Attested',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Bare-Metal Node Inventory if not present
INSERT INTO cluster_nodes (id, datacenter_region, gpu_model, gpu_count, memory_total_gb, power_limit_watts, interconnect_gbps, attestation_status)
VALUES
    ('us-east-h100-cluster-01', 'us-east (Ashburn, VA)', '8x NVIDIA H100 80GB SXM5', 8, 640.0, 700.0, 3200, 'SEV-SNP Hardware Attested'),
    ('eu-central-h100-cluster-02', 'eu-central (Frankfurt, DE)', '8x NVIDIA H100 80GB SXM5', 8, 640.0, 700.0, 3200, 'SEV-SNP Hardware Attested'),
    ('nordic-hydro-b200-cluster-01', 'eu-north (Luleå, SE)', '4x NVIDIA B200 NVL72 192GB', 4, 768.0, 1000.0, 7200, 'SEV-SNP Hardware Attested'),
    ('us-west-l40s-inference-01', 'us-west (Oregon)', '8x NVIDIA L40S 48GB PCIe', 8, 384.0, 350.0, 800, 'Hardware Attested'),
    ('ap-northeast-a100-partition-03', 'ap-northeast (Tokyo, JP)', '8x NVIDIA A100 80GB SXM4', 8, 640.0, 400.0, 1600, 'SEV-SNP Hardware Attested')
ON CONFLICT (id) DO UPDATE SET
    attestation_status = EXCLUDED.attestation_status,
    updated_at = NOW();

-- 2. Time-Series Node Telemetry Metrics Table
CREATE TABLE IF NOT EXISTS node_telemetry_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(64) NOT NULL REFERENCES cluster_nodes(id) ON DELETE CASCADE,
    utilization_pct NUMERIC(5, 2) NOT NULL CHECK (utilization_pct BETWEEN 0.0 AND 100.0),
    memory_used_gb NUMERIC(10, 2) NOT NULL,
    temperature_c NUMERIC(5, 2) NOT NULL,
    power_draw_watts NUMERIC(10, 2) NOT NULL,
    health_status VARCHAR(32) NOT NULL DEFAULT 'OPTIMAL' CHECK (
        health_status IN ('OPTIMAL', 'DEGRADED', 'THROTTLED', 'OFFLINE')
    ),
    active_leases_count INT NOT NULL DEFAULT 0,
    spot_rate_per_hour NUMERIC(10, 4) NOT NULL,
    interconnect_bandwidth_gbps INT NOT NULL DEFAULT 3200,
    fan_speed_pct INT NOT NULL DEFAULT 65,
    state_hash VARCHAR(64) NOT NULL,
    prev_hash VARCHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast Range Indices for Real-Time Window Queries and Anomaly Detection
CREATE INDEX IF NOT EXISTS idx_telemetry_node_recorded ON node_telemetry_metrics(node_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_recorded_at ON node_telemetry_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_state_hash ON node_telemetry_metrics(state_hash);

-- 3. Cluster Summary Snapshot Table
CREATE TABLE IF NOT EXISTS cluster_telemetry_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total_gpus_online INT NOT NULL,
    total_gpus_active INT NOT NULL,
    average_utilization_pct NUMERIC(5, 2) NOT NULL,
    total_memory_used_gb NUMERIC(12, 2) NOT NULL,
    total_memory_capacity_gb NUMERIC(12, 2) NOT NULL,
    total_power_watts NUMERIC(12, 2) NOT NULL,
    subsystems_healthy INT NOT NULL DEFAULT 9,
    subsystems_total INT NOT NULL DEFAULT 9,
    merkle_root_hash VARCHAR(64) NOT NULL,
    snapshot_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cluster_snapshots_recorded ON cluster_telemetry_snapshots(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cluster_snapshots_merkle ON cluster_telemetry_snapshots(merkle_root_hash);

-- 4. Cryptographic Hash Chain Trigger for Time-Series Integrity (SOC 2 Type II CC6.1 / CC6.8)
CREATE OR REPLACE FUNCTION compute_telemetry_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    v_last_hash VARCHAR(64);
BEGIN
    -- Retrieve most recent cryptographic hash for this node
    SELECT state_hash INTO v_last_hash
    FROM node_telemetry_metrics
    WHERE node_id = NEW.node_id
    ORDER BY recorded_at DESC
    LIMIT 1;

    IF v_last_hash IS NOT NULL THEN
        NEW.prev_hash := v_last_hash;
    ELSE
        NEW.prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    -- Compute SHA-256 Merkle chain link
    NEW.state_hash := encode(
        digest(
            NEW.node_id || ':' ||
            NEW.utilization_pct::text || ':' ||
            NEW.temperature_c::text || ':' ||
            NEW.memory_used_gb::text || ':' ||
            NEW.power_draw_watts::text || ':' ||
            NEW.prev_hash || ':' ||
            NEW.recorded_at::text,
            'sha256'
        ),
        'hex'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_telemetry_hash_chain ON node_telemetry_metrics;
CREATE TRIGGER trg_telemetry_hash_chain
    BEFORE INSERT ON node_telemetry_metrics
    FOR EACH ROW
    EXECUTE FUNCTION compute_telemetry_hash_chain();

-- 5. Row Level Security (RLS) Policies
ALTER TABLE cluster_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_telemetry_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_telemetry_snapshots ENABLE ROW LEVEL SECURITY;

-- Read-only visibility for authenticated and anonymous users
DROP POLICY IF EXISTS read_cluster_nodes ON cluster_nodes;
CREATE POLICY read_cluster_nodes ON cluster_nodes
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS read_node_telemetry ON node_telemetry_metrics;
CREATE POLICY read_node_telemetry ON node_telemetry_metrics
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS read_cluster_snapshots ON cluster_telemetry_snapshots;
CREATE POLICY read_cluster_snapshots ON cluster_telemetry_snapshots
    FOR SELECT TO anon, authenticated
    USING (true);

-- Service role full ingestion permissions
DROP POLICY IF EXISTS service_role_all_nodes ON cluster_nodes;
CREATE POLICY service_role_all_nodes ON cluster_nodes
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_telemetry ON node_telemetry_metrics;
CREATE POLICY service_role_all_telemetry ON node_telemetry_metrics
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_snapshots ON cluster_telemetry_snapshots;
CREATE POLICY service_role_all_snapshots ON cluster_telemetry_snapshots
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

COMMENT ON TABLE node_telemetry_metrics IS 'Time-series bare-metal GPU node telemetry secured with SHA-256 Merkle hash chains.';
COMMENT ON TABLE cluster_telemetry_snapshots IS 'Cluster-wide aggregated compute telemetry snapshots for platform governance and audit logging.';
