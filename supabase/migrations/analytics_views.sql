-- ==============================================================================
-- APEXSOVEREIGN.AI — FINANCIAL & COMMERCIAL ANALYTICS VIEWS
-- Path: supabase/migrations/analytics_views.sql
-- Target: Real-time GMV, Burn Rates, Margin Capture, and Ledger Liabilities
-- ==============================================================================

BEGIN;

-- 1. Real-time Aggregate Ledger Liabilities & Total Minted CU
CREATE OR REPLACE VIEW public.v_commercial_ledger_liabilities AS
SELECT
    COUNT(DISTINCT tenant_id) AS total_tenants,
    COUNT(DISTINCT CASE WHEN cu_balance > 0 THEN tenant_id END) AS active_funded_tenants,
    ROUND(SUM(cu_balance), 4) AS aggregate_outstanding_cu_liabilities,
    ROUND(SUM(cu_balance) / 100.0, 2) AS aggregate_usd_equivalent_liability,
    ROUND(AVG(cu_balance), 4) AS average_tenant_cu_balance,
    NOW() AS evaluated_at
FROM public.tenant_ledgers;

-- 2. Daily Active Compute Tenants & Micro-Debit Volume (Last 30 Days)
CREATE OR REPLACE VIEW public.v_commercial_daily_velocity AS
SELECT
    DATE_TRUNC('day', created_at)::DATE AS metric_date,
    COUNT(DISTINCT tenant_id) AS active_compute_tenants,
    COUNT(*) AS total_micro_transactions,
    ROUND(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount_cu ELSE 0 END), 4) AS total_cu_burned,
    ROUND(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount_cu ELSE 0 END) / 100.0, 2) AS total_usd_consumed,
    ROUND(SUM(CASE WHEN transaction_type IN ('PAYPAL_TOPUP', 'CREDIT', 'AURAPHARM_CREDIT') THEN amount_cu ELSE 0 END) / 100.0, 2) AS total_gross_merchandise_value_usd
FROM public.ledger_entries
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY metric_date DESC;

-- 3. GPU Margin Capture & Wholesale Arbitrage Analytics
CREATE OR REPLACE VIEW public.v_commercial_gpu_arbitrage_margins AS
SELECT
    DATE_TRUNC('hour', created_at) AS time_window,
    COUNT(*) AS routing_events,
    ROUND(AVG((metadata->>'spot_price_usd_hr')::numeric), 4) AS avg_spot_cost_usd_hr,
    ROUND(AVG((metadata->>'savings_percentage')::numeric), 2) AS avg_client_savings_pct,
    -- Hyperscaler benchmark: $3.85/GPU-hr for H100 SXM5
    ROUND(AVG(3.85 - (metadata->>'spot_price_usd_hr')::numeric), 4) AS gross_margin_usd_per_hr,
    ROUND(AVG((3.85 - (metadata->>'spot_price_usd_hr')::numeric) / 3.85 * 100.0), 2) AS gross_margin_capture_pct
FROM public.ledger_entries
WHERE metadata ? 'spot_price_usd_hr'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY time_window DESC;

-- 4. Commercial Executive Summary (KPI Snapshot)
CREATE OR REPLACE FUNCTION public.get_commercial_kpi_snapshot()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_gmv NUMERIC;
    v_mrr_run_rate NUMERIC;
    v_cu_burn_24h NUMERIC;
    v_active_tenants INT;
    v_result JSONB;
BEGIN
    -- Aggregate Gross Merchandise Value (All-time customer cash top-ups)
    SELECT COALESCE(SUM(amount_cu) / 100.0, 0)
    INTO v_total_gmv
    FROM public.ledger_entries
    WHERE transaction_type IN ('PAYPAL_TOPUP', 'CREDIT');

    -- Compute Units consumed in the last 24 hours
    SELECT COALESCE(SUM(amount_cu), 0)
    INTO v_cu_burn_24h
    FROM public.ledger_entries
    WHERE transaction_type = 'DEBIT'
      AND created_at >= NOW() - INTERVAL '24 hours';

    -- Monthly Recurring Revenue estimate based on 30-day burn extrapolation
    v_mrr_run_rate := ROUND((v_cu_burn_24h / 100.0) * 30.0, 2);

    -- Active tenant count (tenants with transactions in last 7 days)
    SELECT COUNT(DISTINCT tenant_id)
    INTO v_active_tenants
    FROM public.ledger_entries
    WHERE created_at >= NOW() - INTERVAL '7 days';

    v_result := jsonb_build_object(
        'timestamp', NOW(),
        'all_time_gmv_usd', v_total_gmv,
        'estimated_mrr_run_rate_usd', v_mrr_run_rate,
        'arr_run_rate_usd', ROUND(v_mrr_run_rate * 12.0, 2),
        'cu_burn_last_24h', v_cu_burn_24h,
        'usd_burn_last_24h', ROUND(v_cu_burn_24h / 100.0, 2),
        'active_tenants_7d', v_active_tenants,
        'milestone_arr_progress_pct', ROUND((v_mrr_run_rate * 12.0 / 1000000.0) * 100.0, 2)
    );

    RETURN v_result;
END;
$$;

COMMIT;
