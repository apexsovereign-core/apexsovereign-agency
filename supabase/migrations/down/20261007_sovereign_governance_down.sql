-- ==============================================================================
-- APEXSOVEREIGN HOLDINGS — EMERGENCY DOWN-MIGRATION (GOVERNANCE ROLLBACK)
-- Path: supabase/migrations/down/20261007_sovereign_governance_down.sql
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.rpc_submit_multisig_signature(UUID, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.rpc_evaluate_circuit_breaker(NUMERIC, BOOLEAN, JSONB);

DROP TABLE IF EXISTS public.circuit_breaker_events CASCADE;
DROP TABLE IF EXISTS public.multisig_signatures CASCADE;
DROP TABLE IF EXISTS public.multisig_proposals CASCADE;
DROP TABLE IF EXISTS public.governance_state CASCADE;

COMMIT;
