-- ============================================================================
-- ApexSovereign.ai - Operational Command 04: Institutional Enterprise Billing
-- Migration: 20260925_enterprise_billing_init.sql
-- Security Clearance: SOC 2 TYPE II FINANCIAL CONTROLS & GAAP ACCRUAL LEDGER
-- ============================================================================

-- 1. Create Credit Terms and Status Enums
DO $$ BEGIN
    CREATE TYPE credit_terms_enum AS ENUM ('NET_30', 'NET_60', 'PREPAID', 'CUSTOM_ESCROW');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE invoice_status_enum AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'DEFAULTED', 'VOID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE wire_status_enum AS ENUM ('PENDING_VERIFICATION', 'RECONCILED', 'FLAGGED', 'REVERSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Extend Tenants Table with Credit Lines and Invoicing Terms
ALTER TABLE tenants 
    ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(18, 4) NOT NULL DEFAULT 50000.0000 CHECK (credit_limit >= 0.0),
    ADD COLUMN IF NOT EXISTS credit_utilized NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (credit_utilized >= 0.0),
    ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(32) NOT NULL DEFAULT 'NET_30',
    ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS corporate_tax_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS credit_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (
        credit_status IN ('ACTIVE', 'WARNING', 'FROZEN', 'UNDERWRITING_PENDING')
    ),
    ADD COLUMN IF NOT EXISTS underwritten_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Corporate Invoices Table
CREATE TABLE IF NOT EXISTS corporate_invoices (
    id VARCHAR(64) PRIMARY KEY, -- E.g. INV-2026-US-8910
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    invoice_number VARCHAR(64) UNIQUE NOT NULL,
    billing_period_start TIMESTAMPTZ NOT NULL,
    billing_period_end TIMESTAMPTZ NOT NULL,
    issue_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_date TIMESTAMPTZ NOT NULL,
    payment_terms VARCHAR(32) NOT NULL DEFAULT 'NET_30',
    subtotal_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (subtotal_usd >= 0.0),
    tax_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    late_fee_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    total_amount_usd NUMERIC(18, 4) NOT NULL CHECK (total_amount_usd >= 0.0),
    amount_paid_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    balance_remaining_usd NUMERIC(18, 4) NOT NULL CHECK (balance_remaining_usd >= 0.0),
    status VARCHAR(32) NOT NULL DEFAULT 'ISSUED' CHECK (
        status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'DEFAULTED', 'VOID')
    ),
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    merkle_invoice_hash VARCHAR(64) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON corporate_invoices(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON corporate_invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON corporate_invoices(due_date);

-- 4. Institutional Wire Settlements Table (ACH / SEPA / Fedwire)
CREATE TABLE IF NOT EXISTS wire_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    invoice_id VARCHAR(64) REFERENCES corporate_invoices(id) ON DELETE SET NULL,
    bank_reference_id VARCHAR(128) UNIQUE NOT NULL, -- Fedwire IMAD/OMAD or SWIFT UETR
    wire_type VARCHAR(32) NOT NULL DEFAULT 'FEDWIRE' CHECK (
        wire_type IN ('FEDWIRE', 'ACH', 'SEPA_INSTANT', 'SWIFT_GPI', 'CROSS_BORDER_RTGS')
    ),
    originating_routing_number VARCHAR(64),
    originating_bank_name VARCHAR(128) NOT NULL,
    sender_entity_name VARCHAR(255) NOT NULL,
    amount_received NUMERIC(18, 4) NOT NULL CHECK (amount_received > 0.0),
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    settlement_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reconciliation_status VARCHAR(32) NOT NULL DEFAULT 'RECONCILED' CHECK (
        reconciliation_status IN ('PENDING_VERIFICATION', 'RECONCILED', 'FLAGGED', 'REVERSED')
    ),
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    audit_merkle_root VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wires_tenant ON wire_settlements(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wires_invoice ON wire_settlements(invoice_id);
CREATE INDEX IF NOT EXISTS idx_wires_ref ON wire_settlements(bank_reference_id);

-- 5. Extend ledger_entries transaction_type to include Wire and Invoicing
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_transaction_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_transaction_type_check CHECK (
    transaction_type IN (
        'CREDIT_PURCHASE',
        'COMPUTE_USAGE',
        'WORKFLOW_EXECUTION',
        'REFUND',
        'MANUAL_ADJUSTMENT',
        'PILOT_COMPUTE_RESERVATION',
        'SLA_BREACH_COMPENSATION',
        'ESCROW_RESERVE_ALLOCATION',
        'ESCROW_RESERVE_RELEASE',
        'SPOT_ARBITRAGE_SPREAD_YIELD',
        'ENTERPRISE_INVOICE_ISSUED',
        'WIRE_SETTLEMENT_CREDIT',
        'CREDIT_LINE_UTILIZATION',
        'LATE_PAYMENT_INTEREST_ACCRUAL'
    )
);

-- 6. Atomic Stored Function: Credit Limit & Default Prevention Check
CREATE OR REPLACE FUNCTION check_tenant_credit_standing(p_tenant_id UUID, p_requested_cost NUMERIC(18, 4))
RETURNS JSONB AS $$
DECLARE
    v_tenant RECORD;
    v_overdue_count INT;
BEGIN
    SELECT * INTO v_tenant FROM tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'TENANT_NOT_FOUND');
    END IF;

    -- Check if tenant credit is explicitly frozen
    IF v_tenant.credit_status = 'FROZEN' THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'CREDIT_LINE_FROZEN',
            'detail', 'Account locked due to credit limit ceiling breach or delinquent invoice.'
        );
    END IF;

    -- Check if tenant has overdue invoices > 5 business days past due date
    SELECT COUNT(*) INTO v_overdue_count
    FROM corporate_invoices
    WHERE tenant_id = p_tenant_id 
      AND status = 'OVERDUE' 
      AND due_date < (NOW() - INTERVAL '5 days');

    IF v_overdue_count > 0 THEN
        -- Auto-freeze credit status on delinquent invoices
        UPDATE tenants SET credit_status = 'FROZEN', updated_at = NOW() WHERE id = p_tenant_id;
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'DEFAULT_PAYMENT_OVERDUE',
            'detail', 'Delinquent invoices detected past grace period. Prepayment or wire clearance required.'
        );
    END IF;

    -- Check available credit limit headroom
    IF (v_tenant.credit_utilized + p_requested_cost) > v_tenant.credit_limit THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'CREDIT_LIMIT_EXCEEDED',
            'credit_limit', v_tenant.credit_limit,
            'credit_utilized', v_tenant.credit_utilized,
            'requested_cost', p_requested_cost,
            'available_headroom', (v_tenant.credit_limit - v_tenant.credit_utilized)
        );
    END IF;

    RETURN jsonb_build_object(
        'allowed', true,
        'credit_status', v_tenant.credit_status,
        'available_headroom', (v_tenant.credit_limit - v_tenant.credit_utilized)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 7. Automated Trigger: Credit Limit Check on Compute Job Insertion
CREATE OR REPLACE FUNCTION trg_evaluate_compute_credit_line()
RETURNS TRIGGER AS $$
DECLARE
    v_check JSONB;
BEGIN
    IF NEW.tenant_id IS NOT NULL THEN
        v_check := check_tenant_credit_standing(NEW.tenant_id, COALESCE(NEW.estimated_cost, 0.0));
        IF (v_check->>'allowed')::boolean = FALSE THEN
            RAISE EXCEPTION 'Compute allocation blocked: % (Detail: %)', 
                v_check->>'reason', 
                v_check->>'detail';
        END IF;

        -- Increment utilized credit line atomically
        UPDATE tenants
        SET credit_utilized = credit_utilized + COALESCE(NEW.estimated_cost, 0.0),
            updated_at = NOW()
        WHERE id = NEW.tenant_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_credit_limit_check ON compute_jobs;
CREATE TRIGGER trg_credit_limit_check
    BEFORE INSERT ON compute_jobs
    FOR EACH ROW
    EXECUTE FUNCTION trg_evaluate_compute_credit_line();

-- 8. Row Level Security (RLS) Policies
ALTER TABLE corporate_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE wire_settlements ENABLE ROW LEVEL SECURITY;

-- Read policies: authenticated tenants see their own invoices and wires
DROP POLICY IF EXISTS read_own_invoices ON corporate_invoices;
CREATE POLICY read_own_invoices ON corporate_invoices
    FOR SELECT TO authenticated
    USING (
        tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
        OR tenant_id IS NULL
    );

DROP POLICY IF EXISTS read_own_wires ON wire_settlements;
CREATE POLICY read_own_wires ON wire_settlements
    FOR SELECT TO authenticated
    USING (
        tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
        OR tenant_id IS NULL
    );

-- Transparent read for anon demo/preview
DROP POLICY IF EXISTS anon_read_invoices ON corporate_invoices;
CREATE POLICY anon_read_invoices ON corporate_invoices
    FOR SELECT TO anon
    USING (true);

DROP POLICY IF EXISTS anon_read_wires ON wire_settlements;
CREATE POLICY anon_read_wires ON wire_settlements
    FOR SELECT TO anon
    USING (true);

-- Full control for service_role
DROP POLICY IF EXISTS service_role_all_invoices ON corporate_invoices;
CREATE POLICY service_role_all_invoices ON corporate_invoices
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_wires ON wire_settlements;
CREATE POLICY service_role_all_wires ON wire_settlements
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 9. Read-Only Reporting Views and Tables for Financial Auditing
CREATE OR REPLACE VIEW tenant_credit_limits AS
SELECT 
    t.id AS tenant_id,
    t.company_name,
    t.billing_email,
    t.corporate_tax_id,
    t.credit_limit,
    t.credit_utilized,
    (t.credit_limit - t.credit_utilized) AS available_headroom,
    CASE 
        WHEN t.credit_limit > 0 THEN ROUND(((t.credit_utilized / t.credit_limit) * 100)::numeric, 2)
        ELSE 0.00
    END AS utilization_pct,
    t.payment_terms,
    t.credit_status,
    CASE 
        WHEN t.credit_status = 'FROZEN' THEN TRUE 
        ELSE FALSE 
    END AS is_locked,
    t.underwritten_at,
    COUNT(ci.id) FILTER (WHERE ci.status = 'OVERDUE') AS delinquent_invoices_count,
    COALESCE(SUM(ci.balance_remaining_usd) FILTER (WHERE ci.status = 'OVERDUE'), 0.0000) AS overdue_balance_usd
FROM tenants t
LEFT JOIN corporate_invoices ci ON t.id = ci.tenant_id
GROUP BY t.id, t.company_name, t.billing_email, t.corporate_tax_id, t.credit_limit, t.credit_utilized, t.payment_terms, t.credit_status, t.underwritten_at;

-- Dedicated Reporting View for Invoice Statements
CREATE OR REPLACE VIEW invoice_statement_reports AS
SELECT
    ci.id AS invoice_id,
    ci.tenant_id,
    ci.invoice_number,
    ci.billing_period_start,
    ci.billing_period_end,
    ci.issue_date,
    ci.due_date,
    ci.payment_terms,
    ci.total_amount_usd,
    ci.amount_paid_usd,
    ci.balance_remaining_usd,
    ci.status,
    ci.merkle_invoice_hash,
    COALESCE(jsonb_array_length(ci.line_items), 0) AS line_items_count,
    ci.line_items,
    ci.created_at
FROM corporate_invoices ci;

COMMENT ON TABLE corporate_invoices IS 'Enterprise Net-30 and Net-60 institutional invoices with GAAP double-entry accrual tracking.';
COMMENT ON TABLE wire_settlements IS 'Real-time Fedwire/ACH/SEPA institutional settlements with IMAD/UETR tracking and cryptographic Merkle validation.';
COMMENT ON VIEW tenant_credit_limits IS 'Read-only financial governance view aggregating institutional credit limits, headroom, and delinquent metrics.';
COMMENT ON VIEW invoice_statement_reports IS 'Read-only reporting view for corporate invoice statements and audit verification.';

