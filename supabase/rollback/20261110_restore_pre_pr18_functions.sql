-- Captured from production zhqdssbysdebgeijscvm, read-only, 2026-11-10.
-- NOT APPLIED TO PRODUCTION. Separate authorization required.
-- One-step function/grant rollback only; this does not undo reminder data changes.
-- Restores the old scheduler behavior and grants, including its known defects.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $rollback$ BEGIN
 IF (select array_agg(a::text order by a::text) from pg_proc p, unnest(p.proacl) a where p.oid='public.dispatch_due_ttl_reminders(integer)'::regprocedure) IS DISTINCT FROM (select array_agg(a::text order by a::text) from unnest('{postgres=X/postgres,service_role=X/postgres}'::aclitem[]) a) THEN RAISE EXCEPTION 'Rollback refused: grant drift dispatch_due_ttl_reminders(integer)'; END IF;
 IF md5(pg_get_functiondef('public.dispatch_due_ttl_reminders(integer)'::regprocedure)) <> 'bd7bfa086ec2b60b47cdc399fe28393a' THEN RAISE EXCEPTION 'Rollback refused: function drift dispatch_due_ttl_reminders(integer)'; END IF;
 IF (select array_agg(a::text order by a::text) from pg_proc p, unnest(p.proacl) a where p.oid='public.prevent_audit_change()'::regprocedure) IS DISTINCT FROM (select array_agg(a::text order by a::text) from unnest('{postgres=X/postgres,service_role=X/postgres}'::aclitem[]) a) THEN RAISE EXCEPTION 'Rollback refused: grant drift prevent_audit_change()'; END IF;
 IF md5(pg_get_functiondef('public.prevent_audit_change()'::regprocedure)) <> '59de331092c277c439a85e01d59c0185' THEN RAISE EXCEPTION 'Rollback refused: function drift prevent_audit_change()'; END IF;
 IF (select array_agg(a::text order by a::text) from pg_proc p, unnest(p.proacl) a where p.oid='public.prevent_proposal_snapshot_change()'::regprocedure) IS DISTINCT FROM (select array_agg(a::text order by a::text) from unnest('{postgres=X/postgres,service_role=X/postgres}'::aclitem[]) a) THEN RAISE EXCEPTION 'Rollback refused: grant drift prevent_proposal_snapshot_change()'; END IF;
 IF md5(pg_get_functiondef('public.prevent_proposal_snapshot_change()'::regprocedure)) <> '71a57c66ba61083b1b49c3b4c2e9a2a2' THEN RAISE EXCEPTION 'Rollback refused: function drift prevent_proposal_snapshot_change()'; END IF;
 IF (select array_agg(a::text order by a::text) from pg_proc p, unnest(p.proacl) a where p.oid='public.schedule_booking_ttl_reminders(uuid)'::regprocedure) IS DISTINCT FROM (select array_agg(a::text order by a::text) from unnest('{postgres=X/postgres,authenticated=X/postgres}'::aclitem[]) a) THEN RAISE EXCEPTION 'Rollback refused: grant drift schedule_booking_ttl_reminders(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.schedule_booking_ttl_reminders(uuid)'::regprocedure)) <> 'cfb74b01277f9a8f1299228e6fa7e975' THEN RAISE EXCEPTION 'Rollback refused: function drift schedule_booking_ttl_reminders(uuid)'; END IF;
END $rollback$;
DO $restore$ BEGIN EXECUTE E'CREATE OR REPLACE FUNCTION public.prevent_audit_change()\n RETURNS trigger\n LANGUAGE plpgsql\n SET search_path TO ''''\nAS $function$ begin raise exception ''audit logs are append-only''; end $function$\n'; END $restore$;
REVOKE EXECUTE ON FUNCTION public.prevent_audit_change() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_audit_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_audit_change() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_audit_change() TO anon;
GRANT EXECUTE ON FUNCTION public.prevent_audit_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_audit_change() TO service_role;
DO $restore$ BEGIN EXECUTE E'CREATE OR REPLACE FUNCTION public.prevent_proposal_snapshot_change()\n RETURNS trigger\n LANGUAGE plpgsql\n SET search_path TO ''''\nAS $function$\r\nbegin\r\n  if old.quotation_id is distinct from new.quotation_id\r\n    or old.proposal_number is distinct from new.proposal_number\r\n    or old.version_number is distinct from new.version_number\r\n    or old.snapshot is distinct from new.snapshot\r\n  then\r\n    raise exception ''Proposal version snapshots are immutable'';\r\n  end if;\r\n\r\n  return new;\r\nend;\r\n$function$\n'; END $restore$;
REVOKE EXECUTE ON FUNCTION public.prevent_proposal_snapshot_change() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_proposal_snapshot_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_proposal_snapshot_change() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_proposal_snapshot_change() TO anon;
GRANT EXECUTE ON FUNCTION public.prevent_proposal_snapshot_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_proposal_snapshot_change() TO service_role;
DO $restore$ BEGIN EXECUTE E'CREATE OR REPLACE FUNCTION public.schedule_booking_ttl_reminders(p_booking_id uuid)\n RETURNS integer\n LANGUAGE plpgsql\n SET search_path TO ''pg_catalog'', ''public''\nAS $function$\r\ndeclare\r\n  booking_record public.bookings%rowtype;\r\n  inserted_count integer := 0;\r\nbegin\r\n  select *\r\n  into booking_record\r\n  from public.bookings\r\n  where id = p_booking_id;\r\n\r\n  if not found then\r\n    raise exception ''Booking not found'';\r\n  end if;\r\n\r\n  update public.reminders\r\n  set\r\n    status = ''cancelled'',\r\n    cancelled_at = now(),\r\n    updated_at = now()\r\n  where entity_type = ''booking''\r\n    and entity_id = p_booking_id\r\n    and reminder_type = ''ttl''\r\n    and status in (''scheduled'', ''processing'', ''failed'');\r\n\r\n  if booking_record.status <> ''unticketed'' then\r\n    return 0;\r\n  end if;\r\n\r\n  insert into public.reminders (\r\n    rule_id,\r\n    entity_type,\r\n    entity_id,\r\n    reminder_type,\r\n    due_at,\r\n    status,\r\n    message,\r\n    channel,\r\n    audience,\r\n    attempt_count,\r\n    max_attempts,\r\n    next_attempt_at,\r\n    dedupe_key,\r\n    user_id\r\n  )\r\n  select\r\n    rule.id,\r\n    ''booking'',\r\n    booking_record.id,\r\n    ''ttl'',\r\n    booking_record.ttl\r\n      - (rule.threshold_minutes * interval ''1 minute''),\r\n    ''scheduled'',\r\n    ''PNR ''\r\n      || booking_record.pnr\r\n      || '' reaches TTL within ''\r\n      || rule.threshold_minutes::text\r\n      || '' minutes'',\r\n    rule.channel,\r\n    rule.audience,\r\n    0,\r\n    rule.max_attempts,\r\n    booking_record.ttl\r\n      - (rule.threshold_minutes * interval ''1 minute''),\r\n    ''ttl:''\r\n      || booking_record.id::text\r\n      || '':''\r\n      || rule.threshold_minutes::text\r\n      || '':''\r\n      || rule.channel\r\n      || '':''\r\n      || rule.audience\r\n      || '':''\r\n      || extract(epoch from booking_record.ttl)::bigint::text,\r\n    booking_record.user_id\r\n  from public.reminder_rules as rule\r\n  where rule.reminder_type = ''ttl''\r\n    and rule.enabled = true\r\n    and booking_record.ttl\r\n      - (rule.threshold_minutes * interval ''1 minute'') > now()\r\n  on conflict (dedupe_key) do nothing;\r\n\r\n  get diagnostics inserted_count = row_count;\r\n\r\n  return inserted_count;\r\nend;\r\n$function$\n'; END $restore$;
REVOKE EXECUTE ON FUNCTION public.schedule_booking_ttl_reminders(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_booking_ttl_reminders(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.schedule_booking_ttl_reminders(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.schedule_booking_ttl_reminders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_booking_ttl_reminders(uuid) TO service_role;
COMMIT;
