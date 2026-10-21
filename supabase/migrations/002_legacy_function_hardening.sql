-- =============================================================================
-- APEXSOVEREIGN.AI - LEGACY FUNCTION HARDENING (MIGRATION 002)
-- Purpose: Protect legacy public schema RPCs from unauthorized client execution.
--
-- CONTEXT:
-- Existing Supabase projects contain legacy functions 'public.deduct_compute_units'
-- and 'public.add_user_credits'. In standard Supabase configurations, functions
-- in schema public are exposed via PostgREST RPC and default to EXECUTE granted
-- to PUBLIC, anon, and authenticated.
--
-- This migration revokes execution privileges from public/anon/authenticated
-- and locks down search_path to prevent schema spoofing and untrusted execution,
-- ensuring that ledger manipulations can ONLY be performed by backend/service_role
-- through the dedicated, audited 'apex' schema.
--
-- Note: Does NOT drop or alter any legacy table in schema public.
-- =============================================================================

-- 1. Hardening deduct_compute_units(uuid, bigint)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p 
        JOIN pg_namespace n ON n.oid = p.pronamespace 
        WHERE n.nspname = 'public' AND p.proname = 'deduct_compute_units'
    ) THEN
        REVOKE ALL ON FUNCTION public.deduct_compute_units(uuid, bigint) FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.deduct_compute_units(uuid, bigint) TO postgres, service_role;
        ALTER FUNCTION public.deduct_compute_units(uuid, bigint) SET search_path = public, pg_temp;
    END IF;
END $$;

-- 2. Hardening all overloads of add_user_credits
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT p.oid, pg_catalog.pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'add_user_credits'
    ) LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.add_user_credits(%s) FROM PUBLIC, anon, authenticated;', r.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.add_user_credits(%s) TO postgres, service_role;', r.args);
        EXECUTE format('ALTER FUNCTION public.add_user_credits(%s) SET search_path = public, pg_temp;', r.args);
    END LOOP;
END $$;
