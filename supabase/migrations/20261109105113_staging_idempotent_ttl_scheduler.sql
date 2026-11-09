-- Staging-only scheduler correction; no fixture data changes.
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
   WHERE name='staging_reviewed_main_baseline') THEN
   RAISE EXCEPTION 'Staging baseline required';
 END IF;
END $guard$;
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
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.app_users as u
    where u.auth_user_id = auth.uid() and u.role = 'owner'
  ) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  select *
  into booking_record
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if booking_record.execution_mode <> 'simulation' or booking_record.pnr is not null then
    raise exception 'Simulation booking required';
  end if;

  -- Never race a dispatcher that has already claimed this booking's reminder.
  if exists (select 1 from public.reminders where entity_type='booking'
    and entity_id=p_booking_id and reminder_type='ttl' and status='processing') then
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
        and rule.channel='in_app' and rule.audience='owner'
        and public.reminders.rule_id=rule.id
        and public.reminders.due_at = booking_record.ttl - rule.threshold_minutes * interval '1 minute'
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
    'SIMULATION '
      || booking_record.simulation_reference
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
    and rule.channel = 'in_app'
    and rule.audience = 'owner'
    and booking_record.ttl
      - (rule.threshold_minutes * interval '1 minute') > now()
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;

  return inserted_count;
end;
$function$;
