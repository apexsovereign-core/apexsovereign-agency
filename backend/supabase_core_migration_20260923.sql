-- ApexSovereign Hyper-Scale Schema Migration
-- Target: Supabase PostgreSQL Engine

-- 1. Ingestion Logs Ledger
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
    payload JSONB NOT NULL,
    event_hash TEXT NOT NULL UNIQUE,
    previous_hash TEXT NOT NULL,
    signature TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. GPU Spot Nodes Inventory
CREATE TABLE IF NOT EXISTS public.gpu_spot_nodes (
    node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gpu_model TEXT NOT NULL,
    provider TEXT NOT NULL,
    cost_per_hour NUMERIC(10, 4) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('available', 'allocated', 'offline')),
    last_ping TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Compute Units Billing Ledger
CREATE TABLE IF NOT EXISTS public.billing_ledger (
    ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    paypal_order_id TEXT UNIQUE,
    compute_units_allocated NUMERIC(12, 4) NOT NULL,
    amount_paid_usd NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row-Level Security
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpu_spot_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_ledger ENABLE ROW LEVEL SECURITY;

-- Zero-Trust Read Policies (Service Role Access)
CREATE POLICY "Service Role Access System Logs" ON public.system_logs
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service Role Access GPU Spot Nodes" ON public.gpu_spot_nodes
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service Role Access Billing Ledger" ON public.billing_ledger
    FOR ALL USING (auth.role() = 'service_role');

-- Atomic Compute Unit Allocation Procedure
CREATE OR REPLACE FUNCTION public.allocate_compute_units(
    p_tenant_id TEXT,
    p_paypal_order_id TEXT,
    p_units NUMERIC,
    p_amount NUMERIC
) RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO public.billing_ledger (tenant_id, paypal_order_id, compute_units_allocated, amount_paid_usd, status)
    VALUES (p_tenant_id, p_paypal_order_id, p_units, p_amount, 'COMPLETED')
    ON CONFLICT (paypal_order_id) DO NOTHING;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
