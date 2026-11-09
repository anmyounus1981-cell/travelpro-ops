BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Candidate only: no production application authorized.
-- Existing live schema only. No simulation columns, seed data, or cron changes.
-- Transaction aborts if the reviewed function definitions have drifted.
DO $preflight$ BEGIN
 IF md5(pg_get_functiondef('public.schedule_booking_ttl_reminders(uuid)'::regprocedure)) <> 'af9f23daea72161f2450bbe787c245a0' THEN RAISE EXCEPTION 'Reviewed function drift: schedule_booking_ttl_reminders(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.prevent_audit_change()'::regprocedure)) <> '59de331092c277c439a85e01d59c0185' THEN RAISE EXCEPTION 'Reviewed function drift: prevent_audit_change()'; END IF;
 IF md5(pg_get_functiondef('public.prevent_proposal_snapshot_change()'::regprocedure)) <> '71a57c66ba61083b1b49c3b4c2e9a2a2' THEN RAISE EXCEPTION 'Reviewed function drift: prevent_proposal_snapshot_change()'; END IF;
 IF md5(pg_get_functiondef('public.dispatch_due_ttl_reminders(integer)'::regprocedure)) <> 'bd7bfa086ec2b60b47cdc399fe28393a' THEN RAISE EXCEPTION 'Reviewed function drift: dispatch_due_ttl_reminders(integer)'; END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.schedule_booking_ttl_reminders(p_booking_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  booking_record public.bookings%rowtype;
  inserted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if not exists (select 1 from public.app_users u
    where u.auth_user_id=auth.uid() and u.role='owner') then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  select *
  into booking_record
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  -- Serialize with existing dispatcher row locks before inspecting status.
  -- All scheduler calls lock the booking first, then reminder IDs in order.
  perform r.id from public.reminders r
  where r.entity_type='booking' and r.entity_id=p_booking_id and r.reminder_type='ttl'
  order by r.id for update;
  if exists (select 1 from public.reminders r where r.entity_type='booking'
    and r.entity_id=p_booking_id and r.reminder_type='ttl' and r.status='processing') then
    raise exception 'Reminder processing in progress; retry after completion' using errcode='55000';
  end if;

  update public.reminders
  set
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
  where entity_type = 'booking'
    and entity_id = p_booking_id
    and reminder_type = 'ttl'
    and status in ('scheduled', 'failed')
    and (booking_record.status <> 'unticketed' or not exists (
      select 1 from public.reminder_rules rule
      where rule.reminder_type='ttl' and rule.enabled
        and public.reminders.rule_id=rule.id
        and public.reminders.due_at=booking_record.ttl-rule.threshold_minutes*interval '1 minute'
        and public.reminders.channel=rule.channel
        and public.reminders.audience=rule.audience
    ));

  if booking_record.status <> 'unticketed' then
    return 0;
  end if;

  insert into public.reminders (
    rule_id,
    entity_type,
    entity_id,
    reminder_type,
    due_at,
    status,
    message,
    channel,
    audience,
    attempt_count,
    max_attempts,
    next_attempt_at,
    dedupe_key,
    user_id
  )
  select
    rule.id,
    'booking',
    booking_record.id,
    'ttl',
    booking_record.ttl
      - (rule.threshold_minutes * interval '1 minute'),
    'scheduled',
    coalesce('PNR ' || nullif(btrim(booking_record.pnr), ''), 'Booking reference unavailable')
      || ' reaches TTL within '
      || rule.threshold_minutes::text
      || ' minutes',
    rule.channel,
    rule.audience,
    0,
    rule.max_attempts,
    booking_record.ttl
      - (rule.threshold_minutes * interval '1 minute'),
    'ttl:'
      || booking_record.id::text
      || ':'
      || rule.threshold_minutes::text
      || ':'
      || rule.channel
      || ':'
      || rule.audience
      || ':'
      || extract(epoch from booking_record.ttl)::bigint::text,
    booking_record.user_id
  from public.reminder_rules as rule
  where rule.reminder_type = 'ttl'
    and rule.enabled = true
    and booking_record.ttl
      - (rule.threshold_minutes * interval '1 minute') > now()
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;

  return inserted_count;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.prevent_audit_change(), public.prevent_proposal_snapshot_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_booking_ttl_reminders(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_booking_ttl_reminders(uuid) TO authenticated;
-- Dispatcher permissions and cron remain unchanged. No owner guard is added to dispatcher.

COMMIT;
