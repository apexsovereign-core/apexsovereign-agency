-- ============================================================================
-- ApexSovereign.ai - Operational Command 06: Database Security & RLS Audit
-- File: scripts/audit_database_security.sql
-- Classification: SOC 2 Type II Security & Multi-Tenant Isolation Audit
-- ============================================================================

\echo '========================================================================'
\echo 'APEXSOVEREIGN.AI - DATABASE SECURITY, INDEXING & RLS AUDIT SCRIPT'
\echo '========================================================================'

-- 1. Verify Row Level Security (RLS) is Enabled on All Core Tables
\echo '1. Verifying Row Level Security (RLS) Status on Public Tables...'
SELECT 
    schemaname,
    tablename,
    rowsecurity AS rls_enabled,
    CASE 
        WHEN rowsecurity THEN 'PASS (RLS Active)'
        ELSE 'CRITICAL FAIL (RLS Disabled)'
    END AS security_verdict
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
      'tenants',
      'compute_jobs',
      'pilot_applications',
      'node_telemetry_stream',
      'failover_incidents',
      'sla_escrow_reserves',
      'corporate_invoices',
      'wire_settlements',
      'ledger_entries'
  )
ORDER BY tablename ASC;

-- 2. Audit Existing RLS Policies Across Critical Tables
\echo '2. Auditing Active RLS Policies for Tenant Isolation (CC6.3)...'
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd AS command,
    qual AS using_expression
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Audit Primary Keys, Foreign Keys, and Unique Constraints
\echo '3. Auditing Key Constraints & Relational Integrity...'
SELECT
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
      'corporate_invoices', 
      'wire_settlements', 
      'ledger_entries', 
      'failover_incidents',
      'sla_escrow_reserves'
  )
ORDER BY tc.table_name, tc.constraint_type;

-- 4. Audit Critical Performance & Partition Indexes
\echo '4. Auditing High-Throughput Performance Indexes...'
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
      'corporate_invoices',
      'wire_settlements',
      'ledger_entries',
      'failover_incidents',
      'node_telemetry_stream'
  )
ORDER BY tablename, indexname;

-- 5. Audit Reporting Views
\echo '5. Auditing Read-Only Financial Reporting Views...'
SELECT 
    table_name AS view_name,
    view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('tenant_credit_limits', 'invoice_statement_reports');

-- 6. Audit Database Functions and Security Definer Context
\echo '6. Auditing Stored Procedures and Search Paths...'
SELECT 
    routine_name,
    routine_type,
    security_type,
    external_language
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
      'check_tenant_credit_standing',
      'trg_evaluate_compute_credit_line',
      'trigger_sla_breach_escrow_compensation'
  );

\echo '========================================================================'
\echo 'DATABASE AUDIT COMPLETE: All RLS Policies and Constraints Inspected'
\echo '========================================================================'
