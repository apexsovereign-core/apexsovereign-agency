-- =============================================================================
-- APEXSOVEREIGN.AI - PRODUCTION DATABASE SCHEMA (MIGRATION 001)
-- Dedicated Schema: 'apex' (Zero collision with legacy public tables)
-- Currency: $1.00 = 100 CU (Compute Units). All ledger values are integer CU.
-- Security: Strict RLS on every table, immutability triggers, SECURITY DEFINER functions.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Dedicated Schema Isolation
CREATE SCHEMA IF NOT EXISTS apex;
REVOKE ALL ON SCHEMA apex FROM anon, authenticated, public;
GRANT USAGE, CREATE ON SCHEMA apex TO postgres, service_role;

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS apex.profiles (
    id UUID PRIMARY KEY, -- Matches Supabase auth.users id
    email TEXT NOT NULL,
    organization TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ACCOUNTS (Double-Entry Core Chart of Accounts)
-- Types: user_wallet (Asset to user/Liability to platform), user_escrow,
-- platform_revenue (Equity/Revenue), paypal_clearing (Asset), platform_equity
CREATE TABLE IF NOT EXISTS apex.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES apex.profiles(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('user_wallet', 'user_escrow', 'platform_revenue', 'paypal_clearing', 'platform_equity')),
    currency TEXT NOT NULL DEFAULT 'CU',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to auto-create user_wallet and user_escrow on profile creation
CREATE OR REPLACE FUNCTION apex.trg_create_user_accounts()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO apex.accounts (owner_id, code, kind)
    VALUES 
        (NEW.id, 'user_wallet:' || NEW.id::text, 'user_wallet'),
        (NEW.id, 'user_escrow:' || NEW.id::text, 'user_escrow')
    ON CONFLICT (code) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex, pg_temp;

CREATE OR REPLACE TRIGGER on_profile_created
    AFTER INSERT ON apex.profiles
    FOR EACH ROW EXECUTE FUNCTION apex.trg_create_user_accounts();

-- Seed system accounts
INSERT INTO apex.accounts (id, owner_id, code, kind)
VALUES 
    ('00000000-0000-0000-0000-000000000001', NULL, 'paypal_clearing', 'paypal_clearing'),
    ('00000000-0000-0000-0000-000000000002', NULL, 'platform_revenue', 'platform_revenue'),
    ('00000000-0000-0000-0000-000000000003', NULL, 'platform_equity', 'platform_equity')
ON CONFLICT (code) DO NOTHING;

-- 3. TRANSACTIONS & 4. LEDGER ENTRIES (Immutable, Cryptographically Signed)
CREATE TABLE IF NOT EXISTS apex.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('TOPUP', 'PROVISION', 'RELEASE', 'REFUND', 'ADJUST', 'CHARGEBACK')),
    reference TEXT NOT NULL,
    idempotency_key TEXT UNIQUE,
    hmac TEXT NOT NULL,
    hmac_kid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apex.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES apex.transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES apex.accounts(id) ON DELETE RESTRICT,
    direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
    amount_cu BIGINT NOT NULL CHECK (amount_cu > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invariant Trigger: Strict Immutability on Transactions & Ledger Entries
CREATE OR REPLACE FUNCTION apex.trg_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Cryptographic Invariant Violation: Ledger records in schema apex are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_no_update_tx BEFORE UPDATE OR DELETE ON apex.transactions FOR EACH ROW EXECUTE FUNCTION apex.trg_prevent_mutation();
CREATE OR REPLACE TRIGGER trg_no_update_le BEFORE UPDATE OR DELETE ON apex.ledger_entries FOR EACH ROW EXECUTE FUNCTION apex.trg_prevent_mutation();

-- 5. CLUSTERS
CREATE TABLE IF NOT EXISTS apex.clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES apex.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    region TEXT NOT NULL,
    nodes INTEGER NOT NULL CHECK (nodes >= 1 AND nodes <= 64),
    term TEXT NOT NULL CHECK (term IN ('spot', '1mo', '3mo', '6mo')),
    jurisdiction TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('provisioning', 'running', 'scaling', 'stopping', 'stopped', 'failed')),
    ssh_key_id UUID,
    demo BOOLEAN NOT NULL DEFAULT TRUE,
    provider TEXT NOT NULL DEFAULT 'simulated',
    host TEXT,
    burn_cu_hr BIGINT NOT NULL,
    accrued_cu BIGINT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    last_metered_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. SSH KEYS
CREATE TABLE IF NOT EXISTS apex.ssh_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES apex.profiles(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    public_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. API KEYS (SHA-256 Hashed, Plaintext Never Stored)
CREATE TABLE IF NOT EXISTS apex.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES apex.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    last4 TEXT NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- 8. PAYPAL ORDERS & EVENTS
CREATE TABLE IF NOT EXISTS apex.paypal_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES apex.profiles(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL UNIQUE,
    pack TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    cu_amount BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'CREATED',
    capture_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apex.paypal_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    summary TEXT,
    resource JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. SPOT MARKET & MESH TOPOLOGY
CREATE TABLE IF NOT EXISTS apex.spot_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    vram TEXT NOT NULL,
    interconnect TEXT NOT NULL,
    reference_price_cents INTEGER NOT NULL,
    spot_cu_hr BIGINT NOT NULL,
    on_demand_cu_hr BIGINT NOT NULL,
    discount_pct INTEGER NOT NULL,
    savings_range TEXT NOT NULL,
    stock_status TEXT NOT NULL,
    price_source TEXT NOT NULL DEFAULT 'reference',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apex.spot_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model TEXT NOT NULL,
    price_cu_hr BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apex.mesh_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city TEXT NOT NULL UNIQUE,
    country TEXT NOT NULL,
    region TEXT NOT NULL,
    jurisdiction TEXT NOT NULL,
    lat NUMERIC(6,3) NOT NULL,
    lng NUMERIC(6,3) NOT NULL,
    active_clusters INTEGER NOT NULL DEFAULT 0,
    healthy BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. AUDIT EVENTS & NOTIFICATIONS
CREATE TABLE IF NOT EXISTS apex.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id TEXT,
    actor_id UUID,
    event_type TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'INFO',
    details JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apex.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES apex.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'INFO',
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. WAITLIST & GOVERNANCE
CREATE TABLE IF NOT EXISTS apex.waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    consent BOOLEAN NOT NULL DEFAULT TRUE,
    ip_hash TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apex.deposit_limits (
    owner_id UUID PRIMARY KEY REFERENCES apex.profiles(id) ON DELETE CASCADE,
    max_tx_cents INTEGER NOT NULL DEFAULT 100000,
    max_day_cents INTEGER NOT NULL DEFAULT 200000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apex.deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES apex.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable & Force RLS on All Tables in Schema apex
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'apex' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE apex.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE apex.%I FORCE ROW LEVEL SECURITY;', t);
    END LOOP;
END;
$$;

-- RLS Policies (Zero access for anon, owner read for authenticated where applicable)
CREATE POLICY "Profiles self access" ON apex.profiles FOR ALL USING (id = auth.uid());
CREATE POLICY "Accounts self access" ON apex.accounts FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Clusters self access" ON apex.clusters FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "SSH keys self access" ON apex.ssh_keys FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "API keys self access" ON apex.api_keys FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "PayPal orders self access" ON apex.paypal_orders FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Notifications self access" ON apex.notifications FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Spot prices read" ON apex.spot_prices FOR SELECT USING (true);
CREATE POLICY "Mesh nodes read" ON apex.mesh_nodes FOR SELECT USING (true);

-- ATOMIC DOUBLE-ENTRY TRANSACTION POSTING FUNCTION
CREATE OR REPLACE FUNCTION apex.post_transaction(
    p_id UUID,
    p_type TEXT,
    p_reference TEXT,
    p_idempotency_key TEXT,
    p_hmac TEXT,
    p_hmac_kid TEXT,
    p_lines JSONB
)
RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_line RECORD;
    v_total_debit BIGINT := 0;
    v_total_credit BIGINT := 0;
    v_account_id UUID;
    v_direction TEXT;
    v_amount_cu BIGINT;
    v_current_bal BIGINT;
    v_account_kind TEXT;
BEGIN
    -- Idempotency Guard
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_tx_id FROM apex.transactions WHERE idempotency_key = p_idempotency_key;
        IF FOUND THEN
            RETURN v_tx_id;
        END IF;
    END IF;

    -- Mathematical Balance Verification
    FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS (account_id UUID, direction TEXT, amount_cu BIGINT)
    LOOP
        IF v_line.amount_cu <= 0 THEN
            RAISE EXCEPTION 'Invalid line amount %: must be strictly positive', v_line.amount_cu;
        END IF;
        IF v_line.direction = 'debit' THEN
            v_total_debit := v_total_debit + v_line.amount_cu;
        ELSIF v_line.direction = 'credit' THEN
            v_total_credit := v_total_credit + v_line.amount_cu;
        ELSE
            RAISE EXCEPTION 'Invalid direction %: must be debit or credit', v_line.direction;
        END IF;
    END LOOP;

    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION 'Mathematical Imbalance: Debits (%) do not equal Credits (%)', v_total_debit, v_total_credit;
    END IF;

    -- Row Lock Affected Wallet/Escrow Accounts & Overdraft Protection
    FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS (account_id UUID, direction TEXT, amount_cu BIGINT)
    LOOP
        SELECT kind INTO v_account_kind FROM apex.accounts WHERE id = v_line.account_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Account % not found', v_line.account_id;
        END IF;

        IF v_account_kind = 'user_wallet' AND v_line.direction = 'debit' THEN
            v_current_bal := apex.account_balance(v_line.account_id);
            IF v_current_bal < v_line.amount_cu THEN
                RAISE EXCEPTION 'Insufficient Funds: Wallet balance % CU is less than required % CU', v_current_bal, v_line.amount_cu;
            END IF;
        END IF;
    END LOOP;

    -- Insert Transaction
    v_tx_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO apex.transactions (id, type, reference, idempotency_key, hmac, hmac_kid)
    VALUES (v_tx_id, p_type, p_reference, p_idempotency_key, p_hmac, p_hmac_kid);

    -- Insert Lines
    FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS (account_id UUID, direction TEXT, amount_cu BIGINT)
    LOOP
        INSERT INTO apex.ledger_entries (transaction_id, account_id, direction, amount_cu)
        VALUES (v_tx_id, v_line.account_id, v_line.direction, v_line.amount_cu);
    END LOOP;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = apex, pg_temp;

-- ACCOUNT BALANCE CALCULATION FUNCTION
CREATE OR REPLACE FUNCTION apex.account_balance(p_account_id UUID)
RETURNS BIGINT AS $$
DECLARE
    v_credits BIGINT;
    v_debits BIGINT;
    v_kind TEXT;
BEGIN
    SELECT kind INTO v_kind FROM apex.accounts WHERE id = p_account_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(SUM(amount_cu), 0) INTO v_credits FROM apex.ledger_entries WHERE account_id = p_account_id AND direction = 'credit';
    SELECT COALESCE(SUM(amount_cu), 0) INTO v_debits FROM apex.ledger_entries WHERE account_id = p_account_id AND direction = 'debit';

    -- For user_wallet and user_escrow (Liability to system/Asset to user), credits increase balance, debits decrease
    IF v_kind IN ('user_wallet', 'user_escrow', 'platform_revenue', 'platform_equity') THEN
        RETURN v_credits - v_debits;
    ELSE
        -- paypal_clearing (Asset to system): debits increase, credits decrease
        RETURN v_debits - v_credits;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = apex, pg_temp;

-- RLS STATUS REPORT FUNCTION
CREATE OR REPLACE FUNCTION apex.rls_status()
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'rls_enabled', bool_and(relrowsecurity),
        'tables', jsonb_agg(jsonb_build_object('name', relname, 'rls', relrowsecurity, 'forced', relforcerowsecurity))
    )
    INTO v_result
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'apex' AND pg_class.relkind = 'r';

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = apex, pg_temp;

-- Revoke function execution from untrusted roles
REVOKE EXECUTE ON FUNCTION apex.post_transaction FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION apex.account_balance FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION apex.rls_status FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apex.post_transaction TO postgres, service_role;
GRANT EXECUTE ON FUNCTION apex.account_balance TO postgres, service_role;
GRANT EXECUTE ON FUNCTION apex.rls_status TO postgres, service_role;

-- VIEWS
CREATE OR REPLACE VIEW apex.v_user_balance AS
SELECT 
    p.id AS owner_id,
    p.email,
    COALESCE(apex.account_balance(w.id), 0) AS wallet_cu,
    COALESCE(apex.account_balance(e.id), 0) AS escrow_cu,
    ROUND(COALESCE(apex.account_balance(w.id), 0) / 100.0, 2) AS wallet_usd
FROM apex.profiles p
LEFT JOIN apex.accounts w ON w.owner_id = p.id AND w.kind = 'user_wallet'
LEFT JOIN apex.accounts e ON e.owner_id = p.id AND e.kind = 'user_escrow';

-- SEED REFERENCE DATA
INSERT INTO apex.spot_prices (model, name, vram, interconnect, reference_price_cents, spot_cu_hr, on_demand_cu_hr, discount_pct, savings_range, stock_status, price_source)
VALUES
    ('H100-SXM5-80GB', 'NVIDIA H100 SXM5', '80GB HBM3', '3.2 Tbps NVLink', 194, 194, 335, 42, '38% - 42%', 'HIGH_AVAILABILITY', 'reference'),
    ('B200-NVL72-192GB', 'NVIDIA B200 NVL72', '192GB HBM3e', '1.8 TB/s NVLink', 285, 285, 438, 35, '32% - 37%', 'ALLOCATION_ONLY', 'reference'),
    ('A100-SXM4-80GB', 'NVIDIA A100 SXM4', '80GB HBM2e', '600 GB/s NVLink', 142, 142, 222, 36, '34% - 38%', 'HIGH_AVAILABILITY', 'reference'),
    ('L40S-PCIE-48GB', 'NVIDIA L40S PCIe', '48GB GDDR6', 'PCIe Gen 4', 89, 89, 137, 35, '33% - 37%', 'HIGH_AVAILABILITY', 'reference')
ON CONFLICT (model) DO UPDATE SET
    reference_price_cents = EXCLUDED.reference_price_cents,
    spot_cu_hr = EXCLUDED.spot_cu_hr,
    on_demand_cu_hr = EXCLUDED.on_demand_cu_hr,
    discount_pct = EXCLUDED.discount_pct,
    savings_range = EXCLUDED.savings_range,
    price_source = EXCLUDED.price_source,
    updated_at = NOW();

INSERT INTO apex.mesh_nodes (city, country, region, jurisdiction, lat, lng, active_clusters, healthy)
VALUES
    ('Ashburn', 'United States', 'us-east-va', 'US-VA', 39.043, -77.487, 48, TRUE),
    ('Dallas', 'United States', 'us-central-tx', 'US-TX', 32.776, -96.797, 34, TRUE),
    ('Portland', 'United States', 'us-west-or', 'US-OR', 45.515, -122.678, 29, TRUE),
    ('São Paulo', 'Brazil', 'sa-east-br', 'BR-SP', -23.550, -46.633, 16, TRUE),
    ('Dublin', 'Ireland', 'eu-west-ie', 'EU-IE', 53.349, -6.260, 42, TRUE),
    ('Frankfurt', 'Germany', 'eu-central-de', 'EU-DE', 50.110, 8.682, 55, TRUE),
    ('Stockholm', 'Sweden', 'eu-north-se', 'EU-SE', 59.329, 18.068, 21, TRUE),
    ('Mumbai', 'India', 'ap-south-in', 'IN-MH', 19.076, 72.877, 27, TRUE),
    ('Singapore', 'Singapore', 'ap-southeast-sg', 'SG-SG', 1.352, 103.819, 63, TRUE),
    ('Tokyo', 'Japan', 'ap-northeast-jp', 'JP-TK', 35.676, 139.650, 51, TRUE),
    ('Sydney', 'Australia', 'ap-southeast-au', 'AU-NSW', -33.868, 151.209, 22, TRUE),
    ('Johannesburg', 'South Africa', 'af-south-za', 'ZA-GP', -26.204, 28.047, 12, TRUE),
    ('Dubai', 'United Arab Emirates', 'me-central-ae', 'AE-DU', 25.204, 55.270, 19, TRUE),
    ('Seoul', 'South Korea', 'ap-northeast-kr', 'KR-SE', 37.566, 126.978, 38, TRUE)
ON CONFLICT (city) DO UPDATE SET
    healthy = EXCLUDED.healthy,
    active_clusters = EXCLUDED.active_clusters;
