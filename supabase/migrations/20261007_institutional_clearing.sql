-- ==============================================================================
-- APEXSOVEREIGN HOLDINGS: INSTITUTIONAL MULTI-RAIL SETTLEMENT RPC
-- Path: supabase/migrations/20261007_institutional_clearing.sql
-- Fixed Conversion Peg: $1.00 USD = 100.000000 Compute Units (CU)
-- Rails: ACH Programmatic, SEPA Wire, Corporate Credit, PayPal Enterprise
-- Concurrency Control: Pessimistic Row Locking (FOR UPDATE)
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_credit_institutional_cu(
    p_tenant_id UUID,
    p_cu_amount NUMERIC(24, 6),
    p_reference_id VARCHAR(128),
    p_currency VARCHAR(16),
    p_fiat_amount NUMERIC(18, 4),
    p_rail_type VARCHAR(64),
    p_audit_signature TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_acc_id UUID;
    v_reserve_acc_id UUID;
    v_new_balance NUMERIC(24, 6);
    v_entry_id UUID;
    v_usd_equivalent NUMERIC(18, 4);
BEGIN
    -- Input Assertions
    IF p_cu_amount <= 0.000000 THEN
        RAISE EXCEPTION 'INVALID_CU_AMOUNT: Minted amount must be strictly positive.';
    END IF;

    IF p_reference_id IS NULL OR length(trim(p_reference_id)) = 0 THEN
        RAISE EXCEPTION 'INVALID_REFERENCE_ID: Reference identifier cannot be null or empty.';
    END IF;

    -- Calculate USD equivalent from CU (Fixed Peg: 100 CU = 1.00 USD)
    v_usd_equivalent := p_cu_amount / 100.000000;

    -- Idempotency check: Replay attack guard
    IF EXISTS (SELECT 1 FROM public.ledger_entries WHERE reference_id = p_reference_id) THEN
        RAISE EXCEPTION 'DUPLICATE_REFERENCE: Institutional transaction % has already been settled.', p_reference_id;
    END IF;

    -- Ensure Tenant Operational Account
    SELECT account_id INTO v_tenant_acc_id
    FROM public.accounts
    WHERE tenant_id = p_tenant_id AND account_type = 'TENANT_OPERATIONAL'
    LIMIT 1;

    IF v_tenant_acc_id IS NULL THEN
        INSERT INTO public.accounts (tenant_id, account_type, currency)
        VALUES (p_tenant_id, 'TENANT_OPERATIONAL', 'CU')
        RETURNING account_id INTO v_tenant_acc_id;

        INSERT INTO public.credit_balances (account_id, tenant_id, balance_cu, locked_cu)
        VALUES (v_tenant_acc_id, p_tenant_id, 0.000000, 0.000000);
    END IF;

    -- Ensure Sovereign Reserve Account
    SELECT account_id INTO v_reserve_acc_id
    FROM public.accounts
    WHERE tenant_id = '00000000-0000-0000-0000-000000000000'::uuid AND account_type = 'SOVEREIGN_RESERVE'
    LIMIT 1;

    IF v_reserve_acc_id IS NULL THEN
        INSERT INTO public.accounts (tenant_id, account_type, currency)
        VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'SOVEREIGN_RESERVE', 'CU')
        RETURNING account_id INTO v_reserve_acc_id;

        INSERT INTO public.credit_balances (account_id, tenant_id, balance_cu, locked_cu)
        VALUES (v_reserve_acc_id, '00000000-0000-0000-0000-000000000000'::uuid, 0.000000, 0.000000);
    END IF;

    -- Pessimistic Row Lock on Tenant Operational Balance
    SELECT balance_cu INTO v_new_balance
    FROM public.credit_balances
    WHERE account_id = v_tenant_acc_id
    FOR UPDATE;

    -- Double-Entry Ledger Entry: Sovereign Reserve credits Tenant Operational Account
    INSERT INTO public.ledger_entries (
        reference_id,
        debit_account_id,
        credit_account_id,
        amount_cu,
        entry_type,
        metadata
    )
    VALUES (
        p_reference_id,
        v_reserve_acc_id,
        v_tenant_acc_id,
        p_cu_amount,
        'DEPOSIT_TOPUP',
        jsonb_build_object(
            'clearing_rail', p_rail_type,
            'original_currency', p_currency,
            'original_fiat_amount', p_fiat_amount,
            'usd_equivalent', v_usd_equivalent,
            'ed25519_signature', p_audit_signature,
            'custom_metadata', p_metadata
        )
    )
    RETURNING entry_id INTO v_entry_id;

    -- Atomically update credit balance
    UPDATE public.credit_balances
    SET balance_cu = balance_cu + p_cu_amount,
        updated_at = NOW()
    WHERE account_id = v_tenant_acc_id
    RETURNING balance_cu INTO v_new_balance;

    RETURN jsonb_build_object(
        'status', 'SETTLED',
        'entry_id', v_entry_id,
        'tenant_id', p_tenant_id,
        'reference_id', p_reference_id,
        'rail_type', p_rail_type,
        'fiat_amount', p_fiat_amount,
        'currency', p_currency,
        'cu_minted', p_cu_amount,
        'new_balance_cu', v_new_balance,
        'audit_signature', p_audit_signature,
        'timestamp', NOW()
    );
END;
$$;

COMMIT;
