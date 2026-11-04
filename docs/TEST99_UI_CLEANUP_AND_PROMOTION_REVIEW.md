# TEST99 UI verification, cleanup draft and promotion gates

Target: zkrpbcxukbtbsakcepxv only.
Branch: review/environment-isolation-20261103.
Reviewed application source: 5d65941b1a8c9172b0a3a09a982a0bf2e81bed04.
Status: UI SIGN-OFF INCOMPLETE. CLEANUP NOT EXECUTED.

## Current verification

HTTP requests to /login, /bookings, /reminders, /payments and /tickets without an
application session ended at the Owner sign-in page, HTTP 200, with the simulation
banner. This is an authentication-boundary check, not authenticated rendering.
The cloud browser has no open tabs or reusable Owner session. No password or
session cookie was collected.

Exact source inspection found remaining UI gaps:
- Dedicated /payments and /tickets pages still render forms. Server actions
  reject non-production writes and staging table grants deny writes, but UI
  concealment is incomplete. The dashboard workflow hides these forms, which
  does not protect the dedicated pages' presentation.
- /reminders selects the nullable real PNR rather than simulation_reference.
  Its booking selector can show a blank reference.
- Reminder messages include SIMULATION TEST99, and dates use Asia/Dhaka.
  Channel/audience are not displayed, so verify them from DB, not visually.
- No browser E2E PASS or promotion approval is claimed.

Staging readback:
- Four scheduled reminders, all in_app/owner.
- Due Asia/Dhaka: 6 Nov 21:37:57; 7 Nov 09:37:57, 19:37:57, 20:37:57.
- Practice TTL: 7 Nov 2026 21:37:57 Asia/Dhaka.
- Zero reminder attempts, zero related owner alerts, zero active cron jobs.
- The unmapped Auth user still has zero application mappings.

Owner visual checks, read-only, do not submit forms:
1. /bookings: permanent SIMULATION warning; SIMULATION TEST99;
   SIM-TEST99-20261104; BDT 117,000 and the practice TTL.
2. /reminders: four SIMULATION TEST99 messages with the due times above.
3. Record any blank booking reference and any financial/ticket forms still shown.
Do not claim reminders have been dispatched. Scheduled rows are not delivery.

## Cleanup policy and prerequisites

Do not execute until UI verification is complete and UI gaps are resolved.
Preserving audit evidence is preferable to removing it. Requested full synthetic
purge requires explicit review of the audit exception below. Export the scoped
fixture/audit evidence securely before purge and record its hash outside this
transaction. Never disable all triggers or set session_replication_role.

This SQL is a DRAFT, not a migration. It is deliberately gated and ends in
ROLLBACK. It has not been executed or database-tested. Review again against the
current schema and data before changing the gate or final statement.

The execution connector must independently be pinned to project
zkrpbcxukbtbsakcepxv. A supplied SQL setting or database name is not proof of
project identity. Verify migration baseline and exact simulation run as below.
Run during a quiet staging window, no dispatcher. The draft takes short-lived
exclusive locks on public tables to prevent dependency races. Lock failure aborts.
Never run against production.

## Draft SQL: scoped operational and audit purge

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
-- Leave blocked until UI and the audit-purge exception are signed off.
SET LOCAL travelpro.cleanup_approval = 'BLOCKED';

DO $guard$
BEGIN
  IF current_setting('travelpro.cleanup_approval', true)
      IS DISTINCT FROM 'UI_VERIFIED_TEST99_AUDIT_PURGE_APPROVED' THEN
    RAISE EXCEPTION 'Cleanup blocked pending UI and audit-purge approval';
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

  IF EXISTS (SELECT 1 FROM public.reminders r
    WHERE r.entity_id IN (SELECT id FROM cleanup_ids WHERE table_name IN
      ('clients','cases','quotations','bookings'))
    AND NOT EXISTS (SELECT 1 FROM cleanup_ids c WHERE c.table_name='reminders' AND c.id=r.id))
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

-- Exact staging audit exception only; never disable ALL triggers.
ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_immutable;
DELETE FROM public.audit_logs WHERE id IN
  (SELECT id FROM cleanup_ids WHERE table_name='audit_logs');
ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_immutable;
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
  FOR r IN SELECT DISTINCT table_name FROM cleanup_ids LOOP
    EXECUTE format('SELECT count(*) FROM public.%I t JOIN cleanup_ids c
      ON c.table_name=%L AND c.id=t.id',r.table_name,r.table_name) INTO n;
    IF n<>0 THEN RAISE EXCEPTION 'Cleanup incomplete: %',r.table_name; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE
    tgrelid='public.audit_logs'::regclass AND tgname='audit_logs_immutable'
    AND tgenabled='O') THEN RAISE EXCEPTION 'Audit guard not restored'; END IF;
END $verify$;

ROLLBACK; -- Deliberate draft default. COMMIT requires reviewed execution approval.
```

## Separate Auth cleanup, never direct DELETE FROM auth.users

After the operational transaction is actually committed and verified:
1. Pin the authenticated Supabase administrative client/dashboard to staging.
2. Read user 1047ef30-2a00-4040-948c-90212f4b5ced and confirm exact email
   anmyounus81+unmapped@gmail.com. Recheck zero public.app_users mappings,
   no operational ownership and no Storage ownership. Abort on mismatch.
3. Revoke the test sessions using the supported Auth administrative mechanism;
   do not request or collect the user's password/access token.
4. Delete this exact user through Auth Admin deleteUser (or dashboard), not SQL.
   This is separate from the database transaction and cannot be made atomic with it.
5. Verify the user is absent and the mapped owner remains unchanged.
   Previously issued JWTs can remain valid until expiry; deletion alone does not
   prove instant token invalidation. Keep unmapped-user RLS denial enforced.
6. Record cleanup results and residual token-expiry boundary. No Auth deletion
   has been performed during preparation.

## Promotion checklist, not approved

- Resolve dedicated payment/ticket UI exposure and simulation reminder labels.
- Complete authenticated browser readback and access-control regression checks.
- Keep exact RPC hardening review separate from staging-only simulation overlay.
- Do not merge/apply the staging-only migration unchanged to production: it
  requires an empty bookings table, forces simulation-only constraints and
  revokes operational writes. Prepare a production-compatible migration strategy.
- Verify production function definitions/privileges before adapting hardening.
- Resolve scheduler repeated-call behavior: existing scheduler cancels reminders
  then inserts ON CONFLICT DO NOTHING; independent re-scheduling needs a targeted
  test/fix before relying on it. Create-booking retry alone does not prove this.
- Full quotation/case/audit transaction atomicity remains pending.
- Review all public API/RPC authorization, affected grants, external integrations,
  environment variables, credential separation and protected preview behavior.
- Complete production recovery/export readiness and rollback procedure.
- Review the complete PR diff, CI tests and exact intended deployment SHA.
- Human approval remains mandatory for financial and GDS ticketing decisions.
- Keep scheduler inactive until a separately authorized dispatch verification.
