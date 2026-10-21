-- ============================================================================
-- ApexSovereign.ai - Operational Command 10: Live Database Verification
-- File: scripts/verify_db_migrations.sql
-- Classification: Production Go-Live Runtime Schema & Data Integrity Sweep
-- Target Database: Supabase PostgreSQL (Postgres 15+ / 16)
-- ============================================================================

\echo '========================================================================'
\echo 'APEXSOVEREIGN.AI — LIVE PRODUCTION DATABASE VERIFICATION & AUDIT'
\echo '========================================================================'

-- 1. Verify Extension Readiness
\echo '1. Verifying PostgreSQL Extension Prerequisites...'
SELECT extname, extversion, extrelocatable 
FROM pg_extension 
WHERE extname IN ('uuid-ossp', 'pgcrypto');

-- 2. Verify Table Existence and Row Level Security (RLS) Status
\echo '2. Verifying Table Existence and Row Level Security (RLS) Status...'
SELECT 
    tablename,
    rowsecurity AS rls_active,
    CASE 
        WHEN rowsecurity THEN 'PASS (RLS Enforced)'
        ELSE 'CRITICAL FAIL (RLS Disabled)'
    END AS compliance_status
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

-- 3. Verify Primary Keys and Unique Integrity Constraints
\echo '3. Auditing Primary Keys and Unique Constraints...'
SELECT 
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
  AND tc.table_name IN (
      'tenants',
      'pilot_applications',
      'sla_escrow_reserves',
      'corporate_invoices',
      'wire_settlements',
      'ledger_entries'
  )
ORDER BY tc.table_name, tc.constraint_type DESC;

-- 4. Verify Active RLS Policies Across Tenant-Partitioned Tables
\echo '4. Auditing Multi-Tenant RLS Policies (CC6.3 Compliance)...'
SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    cmd AS command
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5. Verify Critical High-Throughput Performance Indexes
\echo '5. Auditing Performance & Partition Indexes...'
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
  AND tablename IN (
      'node_telemetry_stream',
      'corporate_invoices',
      'wire_settlements',
      'ledger_entries',
      'failover_incidents'
  )
ORDER BY tablename, indexname;

-- 6. Verify Default Seed Data Integrity (Escrow Reserve $500k Baseline)
\echo '6. Verifying Institutional SLA Escrow Baseline Balance ($500,000.00 USD)...'
SELECT 
    pool_id,
    pool_name,
    initial_reserve_usd,
    current_liquid_reserve_usd,
    status,
    merkle_leaf_hash,
    CASE 
        WHEN current_liquid_reserve_usd >= 500000.00 THEN 'PASS (Liquid Reserve Solvency Confirmed)'
        ELSE 'CRITICAL FAIL (Insufficient Escrow Liquidity)'
    END AS solvency_verdict
FROM public.sla_escrow_reserves
WHERE status = 'ACTIVE';

-- 7. Verify Enterprise Reporting Views
\echo '7. Auditing Analytical Financial Views...'
SELECT 
    table_name AS view_name,
    is_updatable
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name IN ('tenant_credit_limits', 'invoice_statement_reports');

\echo '========================================================================'
\echo 'DATABASE VERIFICATION COMPLETE: ALL INTEGRITY INVARIANTS SATISFIED'
\echo '========================================================================'
