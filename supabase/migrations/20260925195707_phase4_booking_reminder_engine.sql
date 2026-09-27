-- Phase 4: booking TTL reminder engine foundation

alter table public.reminders
  drop constraint if exists reminders_status_check;

alter table public.reminders
  add constraint reminders_status_check
  check (
    status in (
      'scheduled',
      'processing',
      'sent',
      'delivered',
      'failed',
      'cancelled',
      'acknowledged',
      'dismissed'
    )
  );

alter table public.reminders
  add column if not exists rule_id uuid,
  add column if not exists channel text not null default 'in_app',
  add column if not exists audience text not null default 'owner',
  add column if not exists recipient text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists dedupe_key text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.reminders
  drop constraint if exists reminders_channel_check;

alter table public.reminders
  add constraint reminders_channel_check
  check (channel in ('in_app', 'email', 'whatsapp'));

alter table public.reminders
  drop constraint if exists reminders_audience_check;

alter table public.reminders
  add constraint reminders_audience_check
  check (audience in ('owner', 'client', 'both'));

alter table public.reminders
  drop constraint if exists reminders_attempt_count_check;

alter table public.reminders
  add constraint reminders_attempt_count_check
  check (attempt_count >= 0);

alter table public.reminders
  drop constraint if exists reminders_max_attempts_check;

alter table public.reminders
  add constraint reminders_max_attempts_check
  check (max_attempts > 0);

update public.reminders
set dedupe_key = 'legacy:' || id::text
where dedupe_key is null;

alter table public.reminders
  alter column dedupe_key set not null;

alter table public.reminders
  drop constraint if exists reminders_dedupe_key_key;

alter table public.reminders
  add constraint reminders_dedupe_key_key unique (dedupe_key);

create table if not exists public.reminder_rules (
  id uuid primary key default gen_random_uuid(),
  reminder_type text not null
    check (
      reminder_type in (
        'ttl',
        'payment',
        'missing_docs',
        'client_response'
      )
    ),
  threshold_minutes integer not null
    check (threshold_minutes >= 0),
  channel text not null default 'in_app'
    check (channel in ('in_app', 'email', 'whatsapp')),
  audience text not null default 'owner'
    check (audience in ('owner', 'client', 'both')),
  enabled boolean not null default true,
  max_attempts integer not null default 3
    check (max_attempts > 0),
  retry_delay_minutes integer not null default 15
    check (retry_delay_minutes > 0),
  message_template text not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    reminder_type,
    threshold_minutes,
    channel,
    audience
  )
);

create table if not exists public.reminder_attempts (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null
    references public.reminders(id)
    on delete cascade,
  attempt_number integer not null
    check (attempt_number > 0),
  channel text not null
    check (channel in ('in_app', 'email', 'whatsapp')),
  recipient text,
  status text not null
    check (
      status in (
        'processing',
        'sent',
        'delivered',
        'failed'
      )
    ),
  provider_reference text,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  user_id uuid,
  unique (reminder_id, attempt_number, channel)
);

create table if not exists public.owner_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null
    check (
      alert_type in (
        'ttl_risk',
        'ttl_overdue',
        'payment_evidence',
        'delivery_failure',
        'booking_expired',
        'manual_action'
      )
    ),
  severity text not null default 'info'
    check (
      severity in (
        'info',
        'attention',
        'urgent',
        'critical'
      )
    ),
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  message text not null,
  status text not null default 'unread'
    check (
      status in (
        'unread',
        'read',
        'acknowledged',
        'dismissed'
      )
    ),
  due_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  dedupe_key text not null unique,
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reminders
  drop constraint if exists reminders_rule_id_fkey;

alter table public.reminders
  add constraint reminders_rule_id_fkey
  foreign key (rule_id)
  references public.reminder_rules(id)
  on delete set null;

create index if not exists reminders_due_dispatch_idx
  on public.reminders (
    status,
    coalesce(next_attempt_at, due_at)
  );

create index if not exists reminders_entity_idx
  on public.reminders (entity_type, entity_id);

create index if not exists reminder_attempts_reminder_idx
  on public.reminder_attempts (reminder_id, attempted_at desc);

create index if not exists owner_alerts_queue_idx
  on public.owner_alerts (status, severity, due_at, created_at desc);

insert into public.reminder_rules (
  reminder_type,
  threshold_minutes,
  channel,
  audience,
  enabled,
  max_attempts,
  retry_delay_minutes,
  message_template
)
values
  (
    'ttl',
    1440,
    'in_app',
    'owner',
    true,
    3,
    15,
    'Booking TTL is due within 24 hours.'
  ),
  (
    'ttl',
    720,
    'in_app',
    'owner',
    true,
    3,
    15,
    'Booking TTL is due within 12 hours.'
  ),
  (
    'ttl',
    120,
    'in_app',
    'owner',
    true,
    3,
    10,
    'Booking TTL is due within 2 hours.'
  ),
  (
    'ttl',
    60,
    'in_app',
    'owner',
    true,
    3,
    10,
    'Booking TTL is due within 1 hour.'
  )
on conflict (
  reminder_type,
  threshold_minutes,
  channel,
  audience
)
do update set
  enabled = excluded.enabled,
  max_attempts = excluded.max_attempts,
  retry_delay_minutes = excluded.retry_delay_minutes,
  message_template = excluded.message_template,
  updated_at = now();

create or replace function public.schedule_booking_ttl_reminders(
  p_booking_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
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
$$;

revoke all on function public.schedule_booking_ttl_reminders(uuid)
from public;

grant execute
on function public.schedule_booking_ttl_reminders(uuid)
to authenticated;

create or replace function public.prevent_reminder_attempt_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Reminder attempts are append-only';
end;
$$;

drop trigger if exists reminder_attempts_immutable
on public.reminder_attempts;

create trigger reminder_attempts_immutable
before update or delete
on public.reminder_attempts
for each row
execute function public.prevent_reminder_attempt_change();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'reminder_rules',
    'reminder_attempts',
    'owner_alerts'
  ]
  loop
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );

    execute format(
      'drop policy if exists phase4_owner_all on public.%I',
      table_name
    );

    execute format(
      $policy$
        create policy phase4_owner_all
          on public.%I
          for all
          to authenticated
          using (
            exists (
              select 1
              from public.app_users
              where app_users.auth_user_id = (select auth.uid())
                and app_users.role = 'owner'
            )
          )
          with check (
            exists (
              select 1
              from public.app_users
              where app_users.auth_user_id = (select auth.uid())
                and app_users.role = 'owner'
            )
          )
      $policy$,
      table_name
    );

    execute format(
      'revoke all privileges on table public.%I from anon',
      table_name
    );

    execute format(
      'revoke all privileges on table public.%I from authenticated',
      table_name
    );

    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      table_name
    );
  end loop;
end
$$;

-- Delivery attempts remain append-only for authenticated application users.
revoke update, delete
on table public.reminder_attempts
from authenticated;

-- Cancel obsolete TTL reminders for bookings that no longer need ticketing.
update public.reminders as reminder
set
  status = 'cancelled',
  cancelled_at = now(),
  updated_at = now()
where reminder.entity_type = 'booking'
  and reminder.reminder_type = 'ttl'
  and reminder.status in ('scheduled', 'processing', 'failed')
  and exists (
    select 1
    from public.bookings as booking
    where booking.id = reminder.entity_id
      and booking.status in ('ticketed', 'cancelled', 'expired')
  );

-- Backfill reminder schedules only for active unticketed bookings.
do $$
declare
  booking_record record;
begin
  for booking_record in
    select id
    from public.bookings
    where status = 'unticketed'
  loop
    perform public.schedule_booking_ttl_reminders(
      booking_record.id
    );
  end loop;
end
$$;