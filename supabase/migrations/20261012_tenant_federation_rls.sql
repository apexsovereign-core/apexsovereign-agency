-- ============================================================================
-- ApexSovereign.ai - MULTI-TENANT ISOLATION, QUOTAS & CRYPTOGRAPHIC RLS MIGRATION
-- Migration: 20261012_tenant_federation_rls.sql
-- Enforces: Strict cryptographic tenant isolation, zero-trust Row Level Security,
--           atomic customer wallet onboarding, and hardened SECURITY DEFINER RPCs.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TENANT SCHEMA DEFINITIONS
-- ----------------------------------------------------------------------------

-- Tenant Organizations Table
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(32) NOT NULL DEFAULT 'standard' CHECK (tier IN ('enterprise', 'professional', 'standard', 'free')),
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deprovisioned')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_tier ON public.tenants(tier);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- Tenant Cryptographic API Keys Table (Stores SHA-256 hash fingerprints only)
CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    key_prefix VARCHAR(32) NOT NULL,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    public_key_hex VARCHAR(64) NOT NULL,
    scopes JSONB NOT NULL DEFAULT '["compute:inference"]'::jsonb,
    rate_limit_tps INT NOT NULL DEFAULT 100,
    max_concurrent_vcu INT NOT NULL DEFAULT 4,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_lookup ON public.tenant_api_keys(key_hash) WHERE NOT is_revoked;
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_tenant ON public.tenant_api_keys(tenant_id);

-- Dynamic Tenant Quotas & Compute Allocation Table
CREATE TABLE IF NOT EXISTS public.tenant_quotas (
    tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    tier VARCHAR(32) NOT NULL DEFAULT 'standard',
    max_concurrent_vcu INT NOT NULL DEFAULT 4,
    current_active_vcu INT NOT NULL DEFAULT 0 CHECK (current_active_vcu >= 0),
    rate_limit_tps INT NOT NULL DEFAULT 100,
    burst_tokens_ceiling BIGINT NOT NULL DEFAULT 1000,
    monthly_spend_limit_cu NUMERIC(28, 6) NOT NULL DEFAULT 10000.000000,
    current_monthly_spend_cu NUMERIC(28, 6) NOT NULL DEFAULT 0.000000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_tenant_quotas_tier ON public.tenant_quotas(tier);

-- Immutable Tenant Audit Logs
CREATE TABLE IF NOT EXISTS public.tenant_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    actor_id VARCHAR(128) NOT NULL DEFAULT 'system',
    action VARCHAR(64) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_tenant_time ON public.tenant_audit_logs(tenant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. STRICT ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to extract current authenticated tenant ID
CREATE OR REPLACE FUNCTION public.fn_current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('app.current_tenant_id', true), '')::UUID,
        NULLIF(
            (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id'),
            ''
        )::UUID
    );
$$;

-- RLS: Tenants Isolation
DROP POLICY IF EXISTS p_tenants_isolation ON public.tenants;
CREATE POLICY p_tenants_isolation ON public.tenants
    FOR ALL
    USING (
        current_user = 'service_role' OR
        id = public.fn_current_tenant_id()
    );

-- RLS: API Keys Isolation
DROP POLICY IF EXISTS p_tenant_api_keys_isolation ON public.tenant_api_keys;
CREATE POLICY p_tenant_api_keys_isolation ON public.tenant_api_keys
    FOR ALL
    USING (
        current_user = 'service_role' OR
        tenant_id = public.fn_current_tenant_id()
    );

-- RLS: Quotas Isolation
DROP POLICY IF EXISTS p_tenant_quotas_isolation ON public.tenant_quotas;
CREATE POLICY p_tenant_quotas_isolation ON public.tenant_quotas
    FOR ALL
    USING (
        current_user = 'service_role' OR
        tenant_id = public.fn_current_tenant_id()
    );

-- RLS: Audit Logs Isolation
DROP POLICY IF EXISTS p_tenant_audit_logs_isolation ON public.tenant_audit_logs;
CREATE POLICY p_tenant_audit_logs_isolation ON public.tenant_audit_logs
    FOR SELECT
    USING (
        current_user = 'service_role' OR
        tenant_id = public.fn_current_tenant_id()
    );

-- ----------------------------------------------------------------------------
-- 3. HARDENED SECURITY DEFINER RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- RPC: Atomic Tenant Onboarding & Ledger Account Provisioning
CREATE OR REPLACE FUNCTION public.rpc_onboard_tenant(
    p_tenant_id UUID,
    p_name TEXT,
    p_slug TEXT,
    p_tier TEXT,
    p_initial_balance_cu NUMERIC,
    p_rate_limit_tps INT,
    p_max_concurrent_vcu INT,
    p_key_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_account_id UUID;
    v_account_number VARCHAR(64);
    v_now TIMESTAMPTZ := clock_timestamp();
    v_burst_ceiling BIGINT;
    v_result JSONB;
BEGIN
    -- Input sanitization
    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'Tenant name cannot be empty';
    END IF;

    -- Calculate burst ceiling based on tier
    v_burst_ceiling := CASE lower(p_tier)
        WHEN 'enterprise' THEN 25000
        WHEN 'professional' THEN 5000
        WHEN 'standard' THEN 1000
        ELSE 200
    END;

    -- 1. Atomically insert tenant record
    INSERT INTO public.tenants (id, slug, name, tier, status, created_at, updated_at)
    VALUES (p_tenant_id, p_slug, p_name, lower(p_tier), 'active', v_now, v_now)
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        updated_at = v_now;

    -- 2. Atomically insert tenant quota record
    INSERT INTO public.tenant_quotas (
        tenant_id, tier, max_concurrent_vcu, current_active_vcu,
        rate_limit_tps, burst_tokens_ceiling, monthly_spend_limit_cu,
        current_monthly_spend_cu, updated_at
    )
    VALUES (
        p_tenant_id, lower(p_tier), p_max_concurrent_vcu, 0,
        p_rate_limit_tps, v_burst_ceiling, 50000.000000,
        0.000000, v_now
    )
    ON CONFLICT (tenant_id) DO UPDATE
    SET max_concurrent_vcu = EXCLUDED.max_concurrent_vcu,
        rate_limit_tps = EXCLUDED.rate_limit_tps,
        updated_at = v_now;

    -- 3. Provision double-entry customer wallet in public.accounts if accounts table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts') THEN
        v_account_id := gen_random_uuid();
        v_account_number := 'ACC-CW-' || upper(substring(p_slug from 1 for 8)) || '-' || upper(substring(p_tenant_id::text from 1 for 8));

        INSERT INTO public.accounts (id, tenant_id, account_number, account_type, currency, is_active, created_at, updated_at)
        VALUES (v_account_id, p_tenant_id, v_account_number, 'customer_wallet'::account_type_enum, 'CU', TRUE, v_now, v_now)
        ON CONFLICT (account_number) DO UPDATE
        SET is_active = TRUE, updated_at = v_now
        RETURNING id INTO v_account_id;

        -- Initialize balance in public.credit_balances
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'credit_balances') THEN
            INSERT INTO public.credit_balances (account_id, tenant_id, current_balance, reserved_balance, last_seq_num)
            VALUES (v_account_id, p_tenant_id, p_initial_balance_cu, 0.000000, 1)
            ON CONFLICT (account_id) DO UPDATE
            SET current_balance = EXCLUDED.current_balance;
        END IF;
    END IF;

    -- 4. Record master API key fingerprint
    INSERT INTO public.tenant_api_keys (
        tenant_id, key_prefix, key_hash, public_key_hex,
        scopes, rate_limit_tps, max_concurrent_vcu, created_at
    )
    VALUES (
        p_tenant_id,
        'sk_live_' || substring(p_key_fingerprint from 1 for 8),
        p_key_fingerprint,
        'ed25519_master',
        '["compute:inference", "model:finetune", "cluster:arbitrage", "ledger:read", "tenant:admin"]'::jsonb,
        p_rate_limit_tps,
        p_max_concurrent_vcu,
        v_now
    )
    ON CONFLICT (key_hash) DO NOTHING;

    -- 5. Write audit log
    INSERT INTO public.tenant_audit_logs (tenant_id, actor_id, action, details, created_at)
    VALUES (
        p_tenant_id,
        'autonomous_onboarding_engine',
        'tenant.onboarded',
        jsonb_build_object(
            'tier', lower(p_tier),
            'initial_cu', p_initial_balance_cu,
            'max_vcu', p_max_concurrent_vcu,
            'rate_limit_tps', p_rate_limit_tps
        ),
        v_now
    );

    v_result := jsonb_build_object(
        'status', 'success',
        'tenant_id', p_tenant_id,
        'slug', p_slug,
        'tier', lower(p_tier),
        'initial_cu', p_initial_balance_cu,
        'wallet_account_id', v_account_id
    );

    RETURN v_result;
END;
$$;

-- RPC: Record Rotated or Secondary API Key
CREATE OR REPLACE FUNCTION public.rpc_record_api_key(
    p_tenant_id UUID,
    p_key_prefix TEXT,
    p_key_hash TEXT,
    p_public_key_hex TEXT,
    p_scopes JSONB,
    p_rate_limit_tps INT,
    p_max_concurrent_vcu INT,
    p_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_key_id UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    INSERT INTO public.tenant_api_keys (
        id, tenant_id, key_prefix, key_hash, public_key_hex,
        scopes, rate_limit_tps, max_concurrent_vcu, expires_at, created_at
    )
    VALUES (
        v_key_id, p_tenant_id, p_key_prefix, p_key_hash, p_public_key_hex,
        p_scopes, p_rate_limit_tps, p_max_concurrent_vcu, p_expires_at, v_now
    );

    INSERT INTO public.tenant_audit_logs (tenant_id, actor_id, action, details, created_at)
    VALUES (
        p_tenant_id,
        'key_federation_daemon',
        'api_key.issued',
        jsonb_build_object('key_id', v_key_id, 'prefix', p_key_prefix, 'scopes', p_scopes),
        v_now
    );

    RETURN jsonb_build_object('key_id', v_key_id, 'status', 'active');
END;
$$;

-- RPC: Revoke API Key
CREATE OR REPLACE FUNCTION public.rpc_revoke_api_key(
    p_tenant_id UUID,
    p_key_id UUID,
    p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    UPDATE public.tenant_api_keys
    SET is_revoked = TRUE,
        revoked_at = v_now,
        revocation_reason = p_reason
    WHERE id = p_key_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.tenant_audit_logs (tenant_id, actor_id, action, details, created_at)
    VALUES (
        p_tenant_id,
        'admin_security_controller',
        'api_key.revoked',
        jsonb_build_object('key_id', p_key_id, 'reason', p_reason),
        v_now
    );

    RETURN TRUE;
END;
$$;

-- RPC: Atomic Quota Check & Reservation
CREATE OR REPLACE FUNCTION public.rpc_check_and_increment_quota(
    p_tenant_id UUID,
    p_requested_vcu INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quota RECORD;
    v_allowed BOOLEAN := FALSE;
    v_reason TEXT := NULL;
    v_new_active INT;
BEGIN
    -- Strict row lock on the tenant quota row
    SELECT * INTO v_quota
    FROM public.tenant_quotas
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', FALSE, 'reason', 'Tenant quota record not found');
    END IF;

    v_new_active := v_quota.current_active_vcu + p_requested_vcu;

    IF v_new_active <= v_quota.max_concurrent_vcu THEN
        UPDATE public.tenant_quotas
        SET current_active_vcu = v_new_active,
            updated_at = clock_timestamp()
        WHERE tenant_id = p_tenant_id;

        v_allowed := TRUE;
    ELSE
        v_allowed := FALSE;
        v_reason := format('Requested VCU %s exceeds available capacity (%s max, %s active)',
                           p_requested_vcu, v_quota.max_concurrent_vcu, v_quota.current_active_vcu);
    END IF;

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'reason', v_reason,
        'current_active_vcu', CASE WHEN v_allowed THEN v_new_active ELSE v_quota.current_active_vcu END,
        'max_concurrent_vcu', v_quota.max_concurrent_vcu,
        'rate_limit_tps', v_quota.rate_limit_tps
    );
END;
$$;
