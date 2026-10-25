-- ============================================================================
-- ApexSovereign.ai - Enterprise Milestones Database Schema Migration
-- Milestones:
--   1. Bare-metal GPU Nodes & Health Probing
--   2. Realtime Credit Debits & Enterprise Webhook Dispatcher
--   3. Scoped Enterprise API Keys (as_live_...) & Rate Limiting
--   4. PayPal Disputes, Chargeback Reversals & Atomic Lease Freezing
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- MILESTONE 1: Bare-Metal GPU Nodes, Heartbeats & Failover Clusters
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gpu_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_name VARCHAR(128) UNIQUE NOT NULL,
    cluster_region VARCHAR(64) NOT NULL DEFAULT 'us-east-va',
    gpu_architecture VARCHAR(64) NOT NULL CHECK (
        gpu_architecture IN ('NVIDIA_V100', 'NVIDIA_A100_80GB', 'NVIDIA_H100_SXM5', 'NVIDIA_L40S')
    ),
    gpu_count INT NOT NULL DEFAULT 8,
    ip_address VARCHAR(64) NOT NULL,
    daemon_port INT NOT NULL DEFAULT 9835,
    health_status VARCHAR(32) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'DRAINING', 'OFFLINE')
    ),
    is_standby BOOLEAN NOT NULL DEFAULT FALSE,
    consecutive_failures INT NOT NULL DEFAULT 0,
    current_latency_ms NUMERIC(8, 2) DEFAULT 0.00,
    allocated_leases_count INT NOT NULL DEFAULT 0,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gpu_nodes_status ON gpu_nodes(health_status, is_standby, gpu_architecture);

-- Add node assignment & billing pause tracking to compute_leases
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'compute_leases' AND column_name = 'assigned_node_id'
    ) THEN
        ALTER TABLE compute_leases ADD COLUMN assigned_node_id UUID REFERENCES gpu_nodes(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'compute_leases' AND column_name = 'billing_paused'
    ) THEN
        ALTER TABLE compute_leases ADD COLUMN billing_paused BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'compute_leases' AND column_name = 'failover_count'
    ) THEN
        ALTER TABLE compute_leases ADD COLUMN failover_count INT NOT NULL DEFAULT 0;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- MILESTONE 2: Realtime Second-by-Second Credit Telemetry & Outbound Webhooks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_telemetry_ticks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    lease_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64),
    debit_amount NUMERIC(18, 6) NOT NULL,
    balance_after NUMERIC(18, 4) NOT NULL,
    tick_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_time ON credit_telemetry_ticks(tenant_id, tick_timestamp DESC);

-- Webhook Endpoints & Outbound Event Delivery Queue
CREATE TABLE IF NOT EXISTS tenant_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    url TEXT NOT NULL,
    secret_key VARCHAR(128) NOT NULL, -- Used for HMAC-SHA256 signing
    subscribed_events TEXT[] NOT NULL DEFAULT ARRAY['compute.leased', 'credits.low_threshold', 'lease.terminated', 'payment.disputed'],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_webhooks_tenant ON tenant_webhooks(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID REFERENCES tenant_webhooks(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    event_id VARCHAR(128) UNIQUE NOT NULL,
    payload JSONB NOT NULL,
    response_code INT,
    response_body TEXT,
    attempts INT NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'DELIVERED', 'FAILED', 'DEAD_LETTER')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_status ON webhook_delivery_attempts(status, created_at);

-- ----------------------------------------------------------------------------
-- MILESTONE 3: Scoped Enterprise API Keys (as_live_...) & Access Control
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL, -- e.g. "as_live_abc12"
    key_hash VARCHAR(128) UNIQUE NOT NULL, -- Argon2 / SHA-256 hashed secret
    name VARCHAR(128) NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT ARRAY['compute:read', 'compute:write'],
    rate_limit_rpm INT NOT NULL DEFAULT 120, -- Requests per minute
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_lookup ON api_keys(key_hash, is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);

-- ----------------------------------------------------------------------------
-- MILESTONE 4: PayPal Disputes, Reversals & Atomic Fraud Freeze Ledger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    dispute_id VARCHAR(128) UNIQUE NOT NULL, -- PayPal Dispute ID
    provider_capture_id VARCHAR(128),
    dispute_amount NUMERIC(12, 2) NOT NULL,
    dispute_currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    dispute_reason VARCHAR(128),
    dispute_status VARCHAR(64) NOT NULL, -- E.g. UNDER_REVIEW, RESOLVED, REVERSED
    credits_rolled_back NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    leases_cancelled_count INT NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_disputes_tenant ON payment_disputes(tenant_id, dispute_status);

-- Enable RLS and add Service Role policies for all newly added tables
ALTER TABLE gpu_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_telemetry_ticks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_disputes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
    target_tables TEXT[] := ARRAY[
        'gpu_nodes', 
        'credit_telemetry_ticks', 
        'tenant_webhooks', 
        'webhook_delivery_attempts', 
        'api_keys', 
        'payment_disputes'
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
