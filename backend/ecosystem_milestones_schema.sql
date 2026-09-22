-- ============================================================================
-- ApexSovereign.ai - Advanced Ecosystem & Market Expansion Schema (Milestones 8, 9, 10)
-- Features:
--   1. Milestone 8: Autonomous Decentralized Node Marketplace, Staking & Revenue Splits
--   2. Milestone 9: Predictive Workload Autoscaling & Token Velocity Time-Series
--   3. Milestone 10: Multi-Currency Treasury (USD, EUR, USDC) & Automated VAT/GST Tax
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- MILESTONE 8: Autonomous Decentralized Node Provisioning & Staking Marketplace
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_code VARCHAR(64) UNIQUE NOT NULL, -- e.g. 'PRV-EQUINIX-VA'
    organization_name VARCHAR(255) NOT NULL,
    payout_wallet_address VARCHAR(128) NOT NULL, -- ERC-20 / Solana address for USDC or Bank IBAN
    payout_currency VARCHAR(8) NOT NULL DEFAULT 'USDC' CHECK (payout_currency IN ('USD', 'EUR', 'USDC')),
    revenue_share_percentage NUMERIC(5, 2) NOT NULL DEFAULT 85.00, -- 85% to provider, 15% platform protocol take
    collateral_staked_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000, -- Staked collateral in USD/USDC
    minimum_sla_percent NUMERIC(5, 2) NOT NULL DEFAULT 99.90,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SLASHED', 'SUSPENDED')),
    slashed_collateral_total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_gpu_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES marketplace_providers(id) ON DELETE CASCADE,
    listing_sku VARCHAR(128) UNIQUE NOT NULL,
    region_code VARCHAR(64) NOT NULL,
    gpu_architecture VARCHAR(64) NOT NULL CHECK (
        gpu_architecture IN ('NVIDIA_V100', 'NVIDIA_A100_80GB', 'NVIDIA_H100_SXM5', 'NVIDIA_L40S')
    ),
    gpu_count INT NOT NULL DEFAULT 8,
    ask_hourly_rate NUMERIC(10, 4) NOT NULL, -- Provider's minimum acceptable hourly credit
    payout_balance_unsettled NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    is_live BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_settlement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_reference VARCHAR(64) UNIQUE NOT NULL,
    provider_id UUID NOT NULL REFERENCES marketplace_providers(id) ON DELETE RESTRICT,
    gross_earnings NUMERIC(18, 4) NOT NULL,
    protocol_fee_amount NUMERIC(18, 4) NOT NULL,
    net_payout_amount NUMERIC(18, 4) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USDC',
    tx_hash VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SETTLED', 'FAILED')),
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- MILESTONE 9: Predictive Workload Autoscaling & Token Velocity Engine
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_velocity_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    model_family VARCHAR(64) NOT NULL, -- e.g. 'LLAMA_3_70B', 'DEEPSEEK_V3', 'MISTRAL_LARGE'
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    input_tokens_velocity_tps NUMERIC(12, 2) NOT NULL, -- Tokens per second
    output_tokens_velocity_tps NUMERIC(12, 2) NOT NULL,
    queue_backlog_depth INT NOT NULL DEFAULT 0,
    active_gpu_workers INT NOT NULL DEFAULT 1,
    predicted_spikes_factor NUMERIC(4, 2) NOT NULL DEFAULT 1.00, -- Predicted demand multiple (e.g. 1.8x)
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_velocity_lookup ON token_velocity_metrics(tenant_id, model_family, recorded_at DESC);

CREATE TABLE IF NOT EXISTS predictive_autoscale_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    model_family VARCHAR(64) NOT NULL,
    pre_allocated_gpu_count INT NOT NULL,
    target_region VARCHAR(64) NOT NULL,
    trigger_reason VARCHAR(128) NOT NULL, -- e.g. 'TOKEN_VELOCITY_SPIKE_95TH_PERCENTILE'
    status VARCHAR(32) NOT NULL DEFAULT 'PROVISIONED' CHECK (status IN ('PROVISIONED', 'ACTIVE_SERVING', 'RELEASED_TO_SPOT')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- MILESTONE 10: Multi-Currency Treasury (USD, EUR, USDC) & Automated Tax Engine
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_currency_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    quote_currency VARCHAR(8) NOT NULL CHECK (quote_currency IN ('USD', 'EUR', 'GBP', 'USDC')),
    exchange_rate NUMERIC(14, 6) NOT NULL, -- e.g. EUR/USD 1.085000, USDC 1.000000
    source_oracle VARCHAR(64) NOT NULL DEFAULT 'CHAINLINK_TREASURY_ORACLE',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treasury_rates ON treasury_currency_rates(quote_currency, recorded_at DESC);

CREATE TABLE IF NOT EXISTS enterprise_tax_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(2) NOT NULL, -- ISO 3166-1 alpha-2 (e.g. 'US', 'DE', 'GB', 'SG', 'FR')
    subdivision VARCHAR(64), -- State / Canton / Province e.g. 'CA', 'NY'
    tax_name VARCHAR(64) NOT NULL, -- e.g. 'EU VAT', 'UK VAT', 'State Sales Tax', 'GST'
    standard_rate_percent NUMERIC(5, 2) NOT NULL, -- e.g. 19.00% for Germany, 20.00% for UK
    b2b_reverse_charge_applicable BOOLEAN NOT NULL DEFAULT TRUE, -- If valid tax ID supplied, tax = 0%
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS multi_currency_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(64) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    settlement_currency VARCHAR(8) NOT NULL CHECK (settlement_currency IN ('USD', 'EUR', 'GBP', 'USDC')),
    gross_amount NUMERIC(14, 2) NOT NULL,
    tax_jurisdiction VARCHAR(64) NOT NULL,
    tax_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_tax_exempt_reason VARCHAR(128), -- e.g. 'REVERSE_CHARGE_ARTICLE_196_VAT'
    effective_usd_value NUMERIC(14, 2) NOT NULL,
    credits_purchased NUMERIC(18, 4) NOT NULL,
    payment_channel VARCHAR(64) NOT NULL, -- 'USDC_SMART_CONTRACT', 'SEPA_EUR_WIRE', 'STRIPE_GLOBAL'
    tax_id_validated VARCHAR(64), -- e.g. EU VAT ID 'DE123456789'
    cleared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security & Isolation Policies
ALTER TABLE marketplace_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_gpu_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_velocity_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictive_autoscale_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_currency_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_currency_transactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
    target_tables TEXT[] := ARRAY[
        'marketplace_providers',
        'provider_gpu_listings',
        'provider_settlement_batches',
        'token_velocity_metrics',
        'predictive_autoscale_allocations',
        'treasury_currency_rates',
        'enterprise_tax_rules',
        'multi_currency_transactions'
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
