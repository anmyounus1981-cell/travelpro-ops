-- Deliver non-TTL case and booking follow-ups as in-app owner alerts.

create or replace function public.dispatch_due_owner_followups(
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
      r.entity_type,
      r.entity_id,
      r.reminder_type,
      r.message,
      r.due_at,
      r.attempt_count,
      r.user_id,
      c.case_number,
      c.status as case_status,
      b.pnr,
      b.status as booking_status
    from public.reminders as r
    left join public.cases as c
      on r.entity_type = 'case' and c.id = r.entity_id
    left join public.bookings as b
      on r.entity_type = 'booking' and b.id = r.entity_id
    where r.entity_type in ('case', 'booking')
      and r.reminder_type in ('payment', 'missing_docs', 'client_response')
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
    if
      (item.entity_type = 'case'
        and item.case_status is distinct from 'new'
        and item.case_status is distinct from 'in_progress'
        and item.case_status is distinct from 'quoted'
        and item.case_status is distinct from 'confirmed'
        and item.case_status is distinct from 'booked'
        and item.case_status is distinct from 'ticketed')
      or
      (item.entity_type = 'booking'
        and item.booking_status is distinct from 'unticketed')
    then
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
      'manual_action',
      case
        when item.due_at < v_now - interval '1 hour' then 'urgent'
        else 'attention'
      end,
      item.entity_type,
      item.entity_id,
      case
        when item.entity_type = 'case'
          then 'Follow up case ' || item.case_number
        else 'Follow up PNR ' || item.pnr
      end,
      item.message,
      'unread',
      item.due_at,
      'followup-reminder:' || item.id::text,
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

revoke all on function public.dispatch_due_owner_followups(integer)
  from public, anon, authenticated;

select cron.schedule(
  'travelpro-owner-followups',
  '*/5 * * * *',
  'SELECT public.dispatch_due_owner_followups(100);'
);