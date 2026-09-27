-- Phase 4: deliver due TTL reminders as in-app owner alerts.
-- Cron scheduling will be added after this function is reviewed.

create or replace function public.dispatch_due_ttl_reminders(
  batch_size integer default 100
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item record;
  processed integer := 0;
  v_now timestamptz := now();
begin
  if batch_size < 1 or batch_size > 100 then
    raise exception 'batch_size must be between 1 and 100';
  end if;

  for item in
    select
      r.id,
      r.entity_id,
      r.message,
      r.due_at,
      r.attempt_count,
      r.user_id,
      b.pnr,
      b.ttl,
      b.status as booking_status
    from public.reminders as r
    left join public.bookings as b
      on b.id = r.entity_id
    where r.entity_type = 'booking'
      and r.reminder_type = 'ttl'
      and r.channel = 'in_app'
      and r.audience = 'owner'
      and r.status = 'scheduled'
            and r.attempt_count < r.max_attempts
      and r.due_at <= v_now
      and coalesce(r.next_attempt_at, r.due_at) <= v_now
    order by r.due_at, r.id
    limit batch_size
    for update of r skip locked
  loop
    if item.booking_status is distinct from 'unticketed' then
      update public.reminders
      set status = 'cancelled',
          cancelled_at = v_now,
          updated_at = v_now
      where id = item.id;

      continue;
    end if;

    insert into public.owner_alerts (
      alert_type,
      severity,
      entity_type,
      entity_id,
      title,
      message,
      status,
      due_at,
      dedupe_key,
      user_id
    )
    values (
      case
        when item.ttl <= v_now then 'ttl_overdue'
        else 'ttl_risk'
      end,
      case
        when item.ttl <= v_now then 'critical'
        else 'urgent'
      end,
      'booking',
      item.entity_id,
      'PNR ' || item.pnr || ' ticketing deadline',
      item.message,
      'unread',
      item.ttl,
      'ttl-reminder:' || item.id::text,
      item.user_id
    )
    on conflict (dedupe_key) do nothing;

    insert into public.reminder_attempts (
      reminder_id,
      attempt_number,
      channel,
      status,
      attempted_at,
      completed_at,
      user_id
    )
    values (
      item.id,
      item.attempt_count + 1,
      'in_app',
      'delivered',
      v_now,
      v_now,
      item.user_id
    );

    update public.reminders
    set status = 'delivered',
        attempt_count = item.attempt_count + 1,
        last_attempt_at = v_now,
        sent_at = v_now,
        delivered_at = v_now,
        updated_at = v_now
    where id = item.id;

    processed := processed + 1;
  end loop;

  return processed;
end;
$$;

revoke all on function public.dispatch_due_ttl_reminders(integer)
  from public, anon, authenticated;
-- Run the in-app TTL alert dispatcher every five minutes.
create extension if not exists pg_cron;

select cron.schedule(
  'travelpro-ttl-owner-alerts',
  '*/5 * * * *',
  'SELECT public.dispatch_due_ttl_reminders(100);'
);