-- Row-level security: the second tenant guard behind the API's own company filter.
--
-- Each query runs in a transaction that first sets:
--   app.rls        'tenant' (a signed-in request) or 'system' (jobs, sign-in lookups, report links, seed)
--   app.company_id the request's company
--   role           site_app, a role without BYPASSRLS, so the policies apply even when the
--                  connection user is a superuser (local Docker, CI)
-- With nothing set, a query sees no rows: the safe default.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_app') THEN
    BEGIN
      CREATE ROLE site_app NOLOGIN NOBYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'site_app role not created (no CREATEROLE); policies still apply to non-superuser owners via FORCE';
    END;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_app') THEN
    GRANT USAGE ON SCHEMA public TO site_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO site_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO site_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO site_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO site_app;
    EXECUTE format('GRANT site_app TO %I', current_user);
  END IF;
END $$;

CREATE FUNCTION "app_sees_company"(cid uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.rls', true) = 'system'
      OR (current_setting('app.rls', true) = 'tenant' AND cid = nullif(current_setting('app.company_id', true), '')::uuid)
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'user_sites', 'projects', 'structure_nodes', 'work_item_templates', 'work_items', 'contractors', 'skills',
    'contractor_rates', 'workers', 'attendance_entries', 'advances', 'wage_settlements', 'materials', 'site_material_settings',
    'suppliers', 'indents', 'indent_lines', 'purchase_orders', 'po_lines', 'grns', 'grn_lines', 'material_issues',
    'stock_transfers', 'stock_ledger', 'site_days', 'daily_progress', 'issues', 'photos', 'approvals', 'reports',
    'audit_log', 'sessions', 'notifications', 'supplier_payments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I USING (app_sees_company(company_id)) WITH CHECK (app_sees_company(company_id))', t);
  END LOOP;
END $$;

ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "companies" USING (app_sees_company(id)) WITH CHECK (app_sees_company(id));
