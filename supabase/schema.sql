-- =============================================================================
-- APEXSOVEREIGN.AI SOVEREIGN COMPUTE EXCHANGE - CORE DATABASE SCHEMA
-- Target: Supabase Postgres (Strict Double-Entry Ledger, RLS, and Immutability)
-- Currency: $1.00 = 100 CU (Compute Units). All monetary values stored as bigint CU.
-- =============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. SCHEMAS & PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CHART OF ACCOUNTS (Double-Entry Ledger)
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('user_wallet', 'user_escrow', 'platform_revenue', 'paypal_clearing', 'platform_equity')),
    currency TEXT NOT NULL DEFAULT 'CU',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed System Accounts (owner_id is NULL for platform accounts)
INSERT INTO public.accounts (code, kind, currency)
VALUES 
    ('platform_revenue', 'platform_revenue', 'CU'),
    ('paypal_clearing', 'paypal_clearing', 'CU'),
    ('platform_equity', 'platform_equity', 'CU')
ON CONFLICT (code) DO NOTHING;

-- Trigger to auto-provision user_wallet and user_escrow upon new profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user_accounts()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.accounts (owner_id, code, kind, currency)
    VALUES 
        (NEW.id, 'wallet_' || REPLACE(NEW.id::text, '-', ''), 'user_wallet', 'CU'),
        (NEW.id, 'escrow_' || REPLACE(NEW.id::text, '-', ''), 'user_escrow', 'CU')
    ON CONFLICT (code) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_accounts();

-- 4. TRANSACTIONS & LEDGER ENTRIES
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('TOPUP', 'PROVISION', 'RELEASE', 'REFUND', 'ADJUST')),
    reference TEXT,
    idempotency_key TEXT UNIQUE,
    hmac TEXT NOT NULL,
    hmac_kid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
    amount_cu BIGINT NOT NULL CHECK (amount_cu > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON public.ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON public.ledger_entries(transaction_id);

-- 5. CLUSTERS (Compute Inventory & State)
CREATE TABLE IF NOT EXISTS public.clusters (
    id TEXT PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    region TEXT NOT NULL,
    nodes INT NOT NULL CHECK (nodes >= 0 AND nodes <= 64),
    term TEXT NOT NULL,
    jurisdiction TEXT NOT NULL,
    status TEXT NOT NULL,
    demo BOOLEAN NOT NULL DEFAULT TRUE,
    provider TEXT NOT NULL,
    host TEXT NOT NULL,
    ssh_key_id UUID NULL,
    burn_cu_hr BIGINT NOT NULL,
    accrued_cu BIGINT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. SECURITY CREDENTIALS (SSH Keys & API Keys)
CREATE TABLE IF NOT EXISTS public.ssh_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    public_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.api_keys (
    id TEXT PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    last4 TEXT NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);

-- 7. PAYPAL INTEGRATION TABLES
CREATE TABLE IF NOT EXISTS public.paypal_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    order_id TEXT,
    payload JSONB NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.paypal_orders (
    order_id TEXT PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    pack TEXT NOT NULL,
    usd_cents INT NOT NULL,
    cu BIGINT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. MARKET PRICES & MESH TELEMETRY
CREATE TABLE IF NOT EXISTS public.spot_prices (
    model TEXT PRIMARY KEY,
    interconnect TEXT NOT NULL,
    spot_cu INT NOT NULL,
    on_demand_cu INT NOT NULL,
    available INT NOT NULL,
    regions INT NOT NULL,
    price_source TEXT NOT NULL DEFAULT 'reference',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.spot_prices (model, interconnect, spot_cu, on_demand_cu, available, regions, price_source)
VALUES
    ('H100 SXM5', 'NVLink 4', 194, 323, 420, 8, 'reference'),
    ('B200 NVL72', 'NVLink 5', 285, 460, 164, 4, 'reference'),
    ('A100 SXM4', 'NVLink 3', 142, 218, 312, 6, 'reference'),
    ('L40S PCIe', 'PCIe Gen4', 89, 131, 580, 12, 'reference')
ON CONFLICT (model) DO UPDATE SET
    interconnect = EXCLUDED.interconnect,
    spot_cu = EXCLUDED.spot_cu,
    on_demand_cu = EXCLUDED.on_demand_cu,
    available = EXCLUDED.available,
    regions = EXCLUDED.regions,
    price_source = EXCLUDED.price_source,
    updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.mesh_nodes (
    code TEXT PRIMARY KEY,
    city TEXT NOT NULL,
    lat FLOAT8 NOT NULL,
    lon FLOAT8 NOT NULL,
    health TEXT NOT NULL,
    free_gpus INT NOT NULL,
    rtt_ms INT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.mesh_nodes (code, city, lat, lon, health, free_gpus, rtt_ms)
VALUES
    ('us-ashburn', 'Ashburn', 39.0438, -77.4874, 'ok', 1240, 11),
    ('us-dallas', 'Dallas', 32.7767, -96.7970, 'ok', 890, 12),
    ('us-portland', 'Portland', 45.5152, -122.6784, 'ok', 620, 14),
    ('sa-saopaulo', 'São Paulo', -23.5505, -46.6333, 'ok', 210, 21),
    ('eu-dublin', 'Dublin', 53.3498, -6.2603, 'ok', 540, 15),
    ('eu-frankfurt', 'Frankfurt', 50.1109, 8.6821, 'ok', 980, 15),
    ('eu-stockholm', 'Stockholm', 59.3293, 18.0686, 'ok', 410, 16),
    ('ap-mumbai', 'Mumbai', 19.0760, 72.8777, 'ok', 310, 22),
    ('ap-singapore', 'Singapore', 1.3521, 103.8198, 'ok', 750, 12),
    ('ap-tokyo', 'Tokyo', 35.6762, 139.6503, 'ok', 820, 13),
    ('ap-sydney', 'Sydney', -33.8688, 151.2093, 'ok', 290, 24),
    ('af-johannesburg', 'Johannesburg', -26.2041, 28.0473, 'ok', 180, 28),
    ('me-dubai', 'Dubai', 25.2048, 55.2708, 'ok', 340, 18),
    ('ap-seoul', 'Seoul', 37.5665, 126.9780, 'ok', 490, 14)
ON CONFLICT (code) DO UPDATE SET
    city = EXCLUDED.city,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon,
    health = EXCLUDED.health,
    free_gpus = EXCLUDED.free_gpus,
    rtt_ms = EXCLUDED.rtt_ms,
    updated_at = NOW();

-- 9. AUDIT EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.audit_events (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level TEXT NOT NULL,
    event TEXT NOT NULL,
    detail TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    owner_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_owner ON public.audit_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_ts ON public.audit_events(ts DESC);

-- =============================================================================
-- 10. ATOMIC POSTING FUNCTION (DOUBLE-ENTRY VALIDATION + ROW-LOCK BALANCE CHECK)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.post_transaction(
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
    v_existing_id UUID;
    v_tx_id UUID;
    v_total_debits BIGINT := 0;
    v_total_credits BIGINT := 0;
    v_line JSONB;
    v_acc_id UUID;
    v_acc_code TEXT;
    v_acc_kind TEXT;
    v_dir TEXT;
    v_amount BIGINT;
    v_current_bal BIGINT;
    v_new_bal BIGINT;
BEGIN
    -- 1. Idempotency Check: return existing transaction ID if key matches
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_id 
        FROM public.transactions 
        WHERE idempotency_key = p_idempotency_key;
        
        IF v_existing_id IS NOT NULL THEN
            RETURN v_existing_id;
        END IF;
    END IF;

    -- 2. Verify JSON lines structure
    IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'Double-entry transaction requires at least two lines';
    END IF;

    -- 3. Calculate sum of debits and credits
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_dir := v_line->>'direction';
        v_amount := (v_line->>'amount_cu')::BIGINT;
        
        IF v_amount <= 0 THEN
            RAISE EXCEPTION 'Line amount_cu must be strictly positive: %', v_amount;
        END IF;

        IF v_dir = 'debit' THEN
            v_total_debits := v_total_debits + v_amount;
        ELSIF v_dir = 'credit' THEN
            v_total_credits := v_total_credits + v_amount;
        ELSE
            RAISE EXCEPTION 'Invalid direction: %, must be debit or credit', v_dir;
        END IF;
    END LOOP;

    -- 4. Invariant: Debits MUST equal Credits exactly
    IF v_total_debits <> v_total_credits THEN
        RAISE EXCEPTION 'Transaction is unbalanced: total debits (%) must equal total credits (%)', v_total_debits, v_total_credits;
    END IF;

    -- 5. Lock account rows and verify balances for user_wallet and user_escrow
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_acc_code := v_line->>'account_code';
        v_acc_id := NULL;

        IF v_acc_code IS NOT NULL THEN
            SELECT id, kind INTO v_acc_id, v_acc_kind 
            FROM public.accounts 
            WHERE code = v_acc_code 
            FOR UPDATE;
        ELSIF v_line->>'account_id' IS NOT NULL THEN
            SELECT id, kind INTO v_acc_id, v_acc_kind 
            FROM public.accounts 
            WHERE id = (v_line->>'account_id')::UUID 
            FOR UPDATE;
        END IF;

        IF v_acc_id IS NULL THEN
            RAISE EXCEPTION 'Account not found: %', COALESCE(v_acc_code, v_line->>'account_id');
        END IF;

        -- Check non-negative balance constraint on user accounts
        IF v_acc_kind IN ('user_wallet', 'user_escrow') THEN
            SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_cu ELSE -amount_cu END), 0)
            INTO v_current_bal
            FROM public.ledger_entries
            WHERE account_id = v_acc_id;

            v_dir := v_line->>'direction';
            v_amount := (v_line->>'amount_cu')::BIGINT;

            IF v_dir = 'debit' THEN
                v_new_bal := v_current_bal - v_amount;
                IF v_new_bal < 0 THEN
                    RAISE EXCEPTION 'Insufficient funds in account %: current balance % CU, requested debit % CU', v_acc_code, v_current_bal, v_amount;
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- 6. Insert Transaction
    v_tx_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO public.transactions (id, type, reference, idempotency_key, hmac, hmac_kid, created_at)
    VALUES (v_tx_id, p_type, p_reference, p_idempotency_key, p_hmac, p_hmac_kid, NOW());

    -- 7. Insert Ledger Entries
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_acc_code := v_line->>'account_code';
        IF v_acc_code IS NOT NULL THEN
            SELECT id INTO v_acc_id FROM public.accounts WHERE code = v_acc_code;
        ELSE
            v_acc_id := (v_line->>'account_id')::UUID;
        END IF;

        INSERT INTO public.ledger_entries (transaction_id, account_id, direction, amount_cu, created_at)
        VALUES (v_tx_id, v_acc_id, v_line->>'direction', (v_line->>'amount_cu')::BIGINT, NOW());
    END LOOP;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.post_transaction(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_transaction(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- =============================================================================
-- 11. VIEWS: ACCOUNT & USER BALANCES
-- =============================================================================
CREATE OR REPLACE VIEW public.account_balances AS
SELECT 
    a.id AS account_id,
    a.code AS account_code,
    a.owner_id,
    a.kind,
    COALESCE(SUM(CASE WHEN le.direction = 'credit' THEN le.amount_cu ELSE -le.amount_cu END), 0)::BIGINT AS balance_cu
FROM public.accounts a
LEFT JOIN public.ledger_entries le ON a.id = le.account_id
GROUP BY a.id, a.code, a.owner_id, a.kind;

CREATE OR REPLACE VIEW public.v_user_balance AS
SELECT 
    p.id AS owner_id,
    p.email,
    COALESCE(MAX(CASE WHEN a.kind = 'user_wallet' THEN ab.balance_cu END), 0)::BIGINT AS available_cu,
    COALESCE(MAX(CASE WHEN a.kind = 'user_escrow' THEN ab.balance_cu END), 0)::BIGINT AS reserved_cu
FROM public.profiles p
LEFT JOIN public.accounts a ON p.id = a.owner_id
LEFT JOIN public.account_balances ab ON a.id = ab.account_id
GROUP BY p.id, p.email;

-- =============================================================================
-- 12. IMMUTABILITY ENFORCEMENT ON LEDGER AND TRANSACTIONS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enforce_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Ledger entries and transactions are strictly immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_transactions ON public.transactions;
CREATE TRIGGER trg_immutable_transactions
    BEFORE UPDATE OR DELETE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_ledger_immutability();

DROP TRIGGER IF EXISTS trg_immutable_ledger_entries ON public.ledger_entries;
CREATE TRIGGER trg_immutable_ledger_entries
    BEFORE UPDATE OR DELETE ON public.ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_ledger_immutability();

-- =============================================================================
-- 13. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clusters FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ssh_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssh_keys FORCE ROW LEVEL SECURITY;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys FORCE ROW LEVEL SECURITY;

ALTER TABLE public.paypal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.paypal_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.spot_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spot_prices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.mesh_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesh_nodes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

-- User Read Policies
CREATE POLICY profiles_select_owner ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY accounts_select_owner ON public.accounts
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

CREATE POLICY clusters_select_owner ON public.clusters
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

CREATE POLICY ssh_keys_select_owner ON public.ssh_keys
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

CREATE POLICY api_keys_select_owner ON public.api_keys
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

CREATE POLICY paypal_orders_select_owner ON public.paypal_orders
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid());

-- Ledger Read Policies (accessible only if user owns the associated account)
CREATE POLICY ledger_entries_select_owner ON public.ledger_entries
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.accounts
            WHERE accounts.id = ledger_entries.account_id
              AND accounts.owner_id = auth.uid()
        )
    );

CREATE POLICY transactions_select_owner ON public.transactions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.ledger_entries le
            JOIN public.accounts acc ON le.account_id = acc.id
            WHERE le.transaction_id = transactions.id
              AND acc.owner_id = auth.uid()
        )
    );

CREATE POLICY audit_events_select_owner ON public.audit_events
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR owner_id IS NULL);

-- Public Read Policies
CREATE POLICY spot_prices_read_public ON public.spot_prices
    FOR SELECT TO public
    USING (true);

CREATE POLICY mesh_nodes_read_public ON public.mesh_nodes
    FOR SELECT TO public
    USING (true);

-- 14. RLS STATUS AUDIT FUNCTION (Executed by service_role)
CREATE OR REPLACE FUNCTION public.rls_status()
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'rls_enabled', bool_and(c.relrowsecurity),
        'tables', jsonb_agg(
            jsonb_build_object(
                'name', c.relname,
                'rls', c.relrowsecurity
            )
        )
    ) INTO v_result
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
          'profiles', 'accounts', 'transactions', 'ledger_entries',
          'clusters', 'ssh_keys', 'api_keys', 'paypal_events',
          'paypal_orders', 'spot_prices', 'mesh_nodes', 'audit_events'
      );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.rls_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_status() TO service_role;
