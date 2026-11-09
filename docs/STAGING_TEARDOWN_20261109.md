# Staging teardown, 9 November 2026

Project zkrpbcxukbtbsakcepxv only. Owner-reported UI verification at f5dc3cc passed.

Operational cleanup committed in one guarded transaction: four reminders, one booking, one quotation, one case and one synthetic client. Exact fixture IDs, dependencies and audit fingerprint checked. No audit trigger was disabled or altered; five immutable audit entries retained unchanged. Two initial draft syntax/variable failures occurred before deletion; corrected transaction succeeded.

Temporary unmapped Auth user deletion is pending Admin dashboard authentication. Owner mapping retained. No production changes. The earlier audit-purge draft is superseded: audit deletion is NOT authorized.

## Promotion separation

None of these mixed commits is approved for blind production cherry-pick.
- 7cd2ba7: owner/auth checks, empty search_path and EXECUTE revocations are candidates. Compare production pg_get_functiondef, all called functions/tables and dispatcher role before adapting; SECURITY INVOKER can affect scheduler/service callers.
- f5dc3cc scheduler: port only idempotency/locking logic into the production definition. Exclude staging baseline guard, simulation-only checks/messages and staging-only channel restrictions. Test live TTL changes, retry, cancellation, dispatch concurrency and grants.
- booking-reference fallback: reusable UI helper, but production selects must not require absent simulation columns.
- environment isolation and non-production payment/ticket UI guards: candidates only after production mode/ref/key/app URL verification and production read/write regression tests. Do not copy staging grants.
- 20261104153714 simulation overlay: STAGING ONLY. Exclude forced simulation mode, NULL real PNR, practice-only source constraints and revoked financial/operational write grants from production.
- Separate clean release branch based on main; apply selected hunks with a dedicated production migration, recovery plan, review and human release approval. Keep PR17 draft until separation is reviewed.

## Exact executed operational SQL

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
-- Leave blocked until UI and the audit-purge exception are signed off.
SET LOCAL travelpro.cleanup_approval = 'UI_VERIFIED_TEST99_KEEP_AUDIT_APPROVED';

DO $guard$
BEGIN
  IF current_setting('travelpro.cleanup_approval', true)
      IS DISTINCT FROM 'UI_VERIFIED_TEST99_KEEP_AUDIT_APPROVED' THEN
    RAISE EXCEPTION 'Cleanup blocked pending UI approval';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE name = 'staging_reviewed_main_baseline'
  ) THEN RAISE EXCEPTION 'Staging baseline missing'; END IF;
END $guard$;

-- Lock the reviewed public schema before checking dependencies.
DO $locks$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables
           WHERE schemaname='public' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',
                   r.schemaname,r.tablename);
  END LOOP;
END $locks$;

CREATE TEMP TABLE cleanup_ids(table_name text, id uuid, PRIMARY KEY(table_name,id))
ON COMMIT DROP;
INSERT INTO cleanup_ids VALUES
('clients','c60a6e96-35e0-4a0c-b376-2af91af4381d'),
('cases','cf38b3d3-448f-47d6-955d-6710e5a4e697'),
('quotations','ea6a898c-b9ea-44ae-859f-241ce7fc5e4c'),
('bookings','39f0c159-1ed1-4dfb-8bd7-3cfa2617ed7a'),
('reminders','dde9f3ee-03b5-46af-8ec5-38c94afbd89e'),
('reminders','c4688835-8e22-452a-9859-691e4be6d6ca'),
('reminders','107d2f58-22aa-4d76-9f7a-c38d31bc46f2'),
('reminders','ff6b3bb9-a755-495a-b370-3f017620b518'),
('audit_logs','20558d3b-1824-4709-9b54-f62210de2a3c'),
('audit_logs','1db3ef45-3291-4703-b2e1-4cc23d7d93c9'),
('audit_logs','5195cdf2-705b-42af-a7f2-221388804767'),
('audit_logs','ec4c4048-a485-4b5a-92e5-5401f80119c3'),
('audit_logs','c68b280e-d649-4ca1-bedb-ac3c1d12978f');

DO $checks$
DECLARE r record; n bigint; unexpected boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE active) THEN
    RAISE EXCEPTION 'Active scheduler exists';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id='39f0c159-1ed1-4dfb-8bd7-3cfa2617ed7a'
      AND simulation_run_id='81cfcc93-f09e-45e9-8277-fdd36a8ebdd0'
      AND simulation_reference='TEST99' AND execution_mode='simulation'
      AND pnr IS NULL AND quoted_amount=117000
      AND case_id='cf38b3d3-448f-47d6-955d-6710e5a4e697'
      AND quotation_id='ea6a898c-b9ea-44ae-859f-241ce7fc5e4c'
      AND user_id='751ff8ad-6b94-4234-a316-26777beb3ceb'
  ) THEN RAISE EXCEPTION 'Simulation identity mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cases
    WHERE id='cf38b3d3-448f-47d6-955d-6710e5a4e697'
      AND case_number='SIM-TEST99-20261104'
      AND client_id='c60a6e96-35e0-4a0c-b376-2af91af4381d')
  THEN RAISE EXCEPTION 'Case linkage mismatch'; END IF;

  FOR r IN SELECT table_name,count(*) expected FROM cleanup_ids GROUP BY table_name LOOP
    EXECUTE format('SELECT count(*) FROM public.%I t JOIN cleanup_ids c
                    ON c.table_name=%L AND c.id=t.id',r.table_name,r.table_name) INTO n;
    IF n<>r.expected THEN RAISE EXCEPTION 'Fixture changed: %',r.table_name; END IF;
  END LOOP;

  -- Reject ANY unlisted FK child, including ON DELETE CASCADE/SET NULL children.
  -- Composite/new unsupported FK structures abort instead of being ignored.
  FOR r IN
    SELECT c.*, ns.nspname child_schema, cl.relname child_table,
           parent.relname parent_table,
           a.attname child_column, p.attname parent_column
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid=c.conrelid
    JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    JOIN pg_class parent ON parent.oid=c.confrelid
    LEFT JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
    LEFT JOIN pg_attribute p ON p.attrelid=c.confrelid AND p.attnum=c.confkey[1]
    WHERE c.contype='f' AND c.confrelid IN
      (SELECT to_regclass('public.'||table_name) FROM cleanup_ids)
  LOOP
    IF cardinality(r.conkey)<>1 OR r.parent_column<>'id' THEN
      RAISE EXCEPTION 'Unreviewed FK: %',r.conname;
    END IF;
    EXECUTE format(
      'SELECT EXISTS(SELECT 1 FROM %I.%I t
       JOIN cleanup_ids p ON p.table_name=%L AND t.%I=p.id
       WHERE NOT EXISTS(SELECT 1 FROM cleanup_ids c
         WHERE c.table_name=%L AND c.id::text=to_jsonb(t)->>''id''))',
      r.child_schema,r.child_table,r.parent_table,r.child_column,
      CASE WHEN r.child_schema='public' THEN r.child_table ELSE '' END)
      INTO unexpected;
    IF unexpected THEN RAISE EXCEPTION 'Unlisted dependent rows: %',r.conname; END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.reminders AS rem
    WHERE rem.entity_id IN (SELECT id FROM cleanup_ids WHERE table_name IN
      ('clients','cases','quotations','bookings'))
    AND NOT EXISTS (SELECT 1 FROM cleanup_ids c WHERE c.table_name='reminders' AND c.id=rem.id))
  OR EXISTS (SELECT 1 FROM public.owner_alerts
    WHERE entity_id IN (SELECT id FROM cleanup_ids))
  OR EXISTS (SELECT 1 FROM public.audit_logs a
    WHERE a.entity_id IN (SELECT id FROM cleanup_ids)
    AND NOT EXISTS (SELECT 1 FROM cleanup_ids c WHERE c.table_name='audit_logs' AND c.id=a.id))
  THEN RAISE EXCEPTION 'Additional polymorphic dependencies exist'; END IF;
  IF EXISTS (SELECT 1 FROM public.reminders
    WHERE id IN (SELECT id FROM cleanup_ids WHERE table_name='reminders')
      AND (channel IS DISTINCT FROM 'in_app' OR audience IS DISTINCT FROM 'owner'
           OR status IS DISTINCT FROM 'scheduled'))
  THEN RAISE EXCEPTION 'Reminder state changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.audit_logs'::regclass AND tgname='audit_logs_immutable'
      AND tgenabled='O' AND tgfoid='public.prevent_audit_change()'::regprocedure)
  THEN RAISE EXCEPTION 'Audit trigger differs from reviewed state'; END IF;
END $checks$;

-- Preserve audit entries and all audit triggers unchanged.
DELETE FROM public.reminders WHERE id IN
  (SELECT id FROM cleanup_ids WHERE table_name='reminders');
DELETE FROM public.bookings WHERE id IN
  (SELECT id FROM cleanup_ids WHERE table_name='bookings');
DELETE FROM public.quotations WHERE id IN
  (SELECT id FROM cleanup_ids WHERE table_name='quotations');
DELETE FROM public.cases WHERE id IN
  (SELECT id FROM cleanup_ids WHERE table_name='cases');
DELETE FROM public.clients WHERE id IN
  (SELECT id FROM cleanup_ids WHERE table_name='clients');

DO $verify$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT DISTINCT table_name FROM cleanup_ids WHERE table_name <> 'audit_logs' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I t JOIN cleanup_ids c
      ON c.table_name=%L AND c.id=t.id',r.table_name,r.table_name) INTO n;
    IF n<>0 THEN RAISE EXCEPTION 'Cleanup incomplete: %',r.table_name; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE
    tgrelid='public.audit_logs'::regclass AND tgname='audit_logs_immutable'
    AND tgenabled='O') THEN RAISE EXCEPTION 'Audit guard not restored'; END IF;
END $verify$;

DO $audit$ BEGIN
 IF (SELECT count(*) FROM public.audit_logs)<>5 OR
 (SELECT md5(coalesce(string_agg(to_jsonb(a)::text,'' order by id),'')) FROM public.audit_logs a)<>'8e42efda81fa1d7c5841fc8d2a9b835e'
 THEN RAISE EXCEPTION 'Audit content changed'; END IF;
END $audit$;
COMMIT;

```
