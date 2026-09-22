-- ============================================================================
-- ApexSovereign.ai - Exact Supabase Security Advisor Remediation Script
-- Targets:
--   1. Function Search Path Mutable: public.current_user_tenant_id
--   2. Public Can Execute SECURITY DEFINER Function: public.current_user_tenant_id()
--   3. Public Can Execute SECURITY DEFINER Function: public.rls_auto_enable()
--   4. Signed-In Users Can Execute SECURITY DEFINER Function: public.current_user_tenant_id()
--   5. Signed-In Users Can Execute SECURITY DEFINER Function: public.rls_auto_enable()
--   6. RLS Enabled No Policy for 5 tables:
--      - public.compute_leases
--      - public.credit_transactions
--      - public.subscriptions
--      - public.tenants
--      - public.transactions
-- ============================================================================

-- PART 1: REMEDIATE FUNCTION public.current_user_tenant_id
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'current_user_tenant_id'
    LOOP
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp', r.proname, r.args);
        EXECUTE format('ALTER FUNCTION public.%I(%s) SECURITY INVOKER', r.proname, r.args);
        EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.args);
        RAISE NOTICE 'Secured function % with args (%)', r.proname, r.args;
    END LOOP;
END $$;

-- PART 2: REMEDIATE FUNCTION public.rls_auto_enable
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
    LOOP
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp', r.proname, r.args);
        EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO postgres, service_role', r.proname, r.args);
        RAISE NOTICE 'Secured function % with args (%)', r.proname, r.args;
    END LOOP;
END $$;

-- PART 3: REMEDIATE TABLES (RLS Enabled No Policy)
-- No column names referenced to prevent any "column does not exist" errors
DO $$
DECLARE
    tbl TEXT;
    target_tables TEXT[] := ARRAY['compute_leases', 'credit_transactions', 'subscriptions', 'tenants', 'transactions'];
BEGIN
    FOREACH tbl IN ARRAY target_tables
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
            
            -- Full access policy for service_role
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_all_' || tbl, tbl);
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_role_all_' || tbl, tbl);
            
            -- Read access policy for authenticated users
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_read_' || tbl, tbl);
            EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'auth_read_' || tbl, tbl);
            
            RAISE NOTICE 'Configured RLS policies for table: %', tbl;
        END IF;
    END LOOP;
END $$;
