-- ============================================================================
-- ApexSovereign.ai - Enterprise Work OS & Autonomous Compute Broker
-- PostgreSQL / Supabase Production Database Schema
-- Idempotent Ledgers, Multi-Tenancy & Transactional Audits
-- ============================================================================

-- Enable UUID extension for cryptographically strong IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Tenants (Organizations / Workspaces)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(128) NOT NULL,
    credit_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (credit_balance >= 0.0000),
    tier VARCHAR(32) NOT NULL DEFAULT 'ENTERPRISE',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_api_key_hash ON tenants(api_key_hash);

-- ----------------------------------------------------------------------------
-- 2. Idempotency Keys (Distributed Lock & Replay Protection)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('PENDING', 'COMMITTED', 'REVERTED')),
    response_code INT,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 minutes'),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    CONSTRAINT uq_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON idempotency_keys(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_keys(expires_at);

-- ----------------------------------------------------------------------------
-- 3. Double-Entry Immutable Ledger Entries
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(64) NOT NULL CHECK (
        transaction_type IN ('CREDIT_PURCHASE', 'COMPUTE_USAGE', 'WORKFLOW_EXECUTION', 'REFUND', 'MANUAL_ADJUSTMENT')
    ),
    amount NUMERIC(18, 4) NOT NULL, -- Positive for credits, negative for debits
    balance_before NUMERIC(18, 4) NOT NULL,
    balance_after NUMERIC(18, 4) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    reference_id VARCHAR(255), -- E.g. PayPal Order ID or Compute Job ID
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_idempotency_ledger UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ledger_tenant ON ledger_entries(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON ledger_entries(reference_id);

-- ----------------------------------------------------------------------------
-- 4. Payment Transactions (PayPal Gateway Ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    provider VARCHAR(32) NOT NULL DEFAULT 'PAYPAL',
    provider_order_id VARCHAR(128) UNIQUE NOT NULL,
    provider_capture_id VARCHAR(128) UNIQUE,
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    credits_allocated NUMERIC(18, 4) NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (
        status IN ('CREATED', 'APPROVED', 'COMPLETED', 'FAILED', 'REFUNDED')
    ),
    webhook_event_id VARCHAR(128) UNIQUE,
    idempotency_key VARCHAR(128),
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders ON payment_transactions(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_event ON payment_transactions(webhook_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_tenant ON payment_transactions(tenant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. Autonomous Compute Jobs (Compute Broker Engine)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compute_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    job_type VARCHAR(64) NOT NULL,
    resource_tier VARCHAR(32) NOT NULL CHECK (
        resource_tier IN ('STANDARD_CPU', 'HIGH_CPU', 'GPU_T4', 'GPU_A100', 'GPU_H100')
    ),
    cpu_cores INT NOT NULL,
    memory_mb INT NOT NULL,
    gpu_count INT NOT NULL DEFAULT 0,
    estimated_cost NUMERIC(18, 4) NOT NULL,
    actual_cost NUMERIC(18, 4) DEFAULT 0.0000,
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED' CHECK (
        status IN ('QUEUED', 'LEASED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')
    ),
    lease_token VARCHAR(255),
    lease_expires_at TIMESTAMPTZ,
    idempotency_key VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    results JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_tenant_compute_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_compute_status ON compute_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_compute_tenant ON compute_jobs(tenant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 6. Work OS Tasks & Orchestration
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    workflow_name VARCHAR(128) NOT NULL,
    assigned_agent VARCHAR(128) NOT NULL DEFAULT 'autonomous_broker',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'BLOCKED')
    ),
    priority INT NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    output JSONB,
    compute_job_id UUID REFERENCES compute_jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_tenant ON workflow_tasks(tenant_id, status);

-- ----------------------------------------------------------------------------
-- 7. High-Performance Atomic Stored Function: Idempotent Balance Credit
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION idempotent_credit_tenant(
    p_tenant_id UUID,
    p_amount NUMERIC(18, 4),
    p_idempotency_key VARCHAR(128),
    p_reference_id VARCHAR(255),
    p_transaction_type VARCHAR(64),
    p_metadata JSONB
) RETURNS JSONB AS $$
DECLARE
    v_current_balance NUMERIC(18, 4);
    v_new_balance NUMERIC(18, 4);
    v_existing_ledger_id UUID;
BEGIN
    -- Check if this idempotency key was already committed
    SELECT id INTO v_existing_ledger_id
    FROM ledger_entries
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;

    IF v_existing_ledger_id IS NOT NULL THEN
        -- Return idempotent existing state without double crediting
        SELECT credit_balance INTO v_current_balance FROM tenants WHERE id = p_tenant_id;
        RETURN jsonb_build_object(
            'status', 'ALREADY_PROCESSED',
            'ledger_id', v_existing_ledger_id,
            'current_balance', v_current_balance
        );
    END IF;

    -- Strict Row-Level Lock on Tenant record to serialize concurrent writes
    SELECT credit_balance INTO v_current_balance
    FROM tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant % does not exist', p_tenant_id;
    END IF;

    v_new_balance := v_current_balance + p_amount;

    -- Update Tenant Balance
    UPDATE tenants
    SET credit_balance = v_new_balance,
        updated_at = NOW()
    WHERE id = p_tenant_id;

    -- Insert Immutable Ledger Entry
    INSERT INTO ledger_entries (
        tenant_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        idempotency_key,
        reference_id,
        metadata
    ) VALUES (
        p_tenant_id,
        p_transaction_type,
        p_amount,
        v_current_balance,
        v_new_balance,
        p_idempotency_key,
        p_reference_id,
        p_metadata
    ) RETURNING id INTO v_existing_ledger_id;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'ledger_id', v_existing_ledger_id,
        'balance_before', v_current_balance,
        'balance_after', v_new_balance
    );
END;
$$ LANGUAGE plpgsql;
