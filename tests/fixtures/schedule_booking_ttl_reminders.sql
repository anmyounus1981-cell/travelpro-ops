CREATE OR REPLACE FUNCTION public.schedule_booking_ttl_reminders(p_booking_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  booking_record public.bookings%rowtype;
  inserted_count integer := 0;
begin
  select *
  into booking_record
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  update public.reminders
  set
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
  where entity_type = 'booking'
    and entity_id = p_booking_id
    and reminder_type = 'ttl'
    and status in ('scheduled', 'processing', 'failed');

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
    'PNR '
      || booking_record.pnr
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
$function$
