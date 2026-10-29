-- RLS hardening for server-managed billing and audit tables.
-- These tables are written/read by the backend with service_role; no direct
-- authenticated or anonymous access is granted here.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'enterprise_audit_records',
    'enterprise_invoices',
    'execution_lease_nonces',
    'invoice_audit_ledgers',
    'user_ledgers'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all_%I ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY service_role_all_%I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      table_name,
      table_name
    );
  END LOOP;
END $$;
