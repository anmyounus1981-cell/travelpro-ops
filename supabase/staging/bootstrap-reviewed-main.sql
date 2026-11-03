-- SOURCE: supabase/migrations/20260917192641_travelpro_core_schema.sql
create extension if not exists pgcrypto;

create table if not exists app_users (id uuid primary key default gen_random_uuid(), name text not null, email text unique not null, role text not null check (role in ('owner','consultant')), user_id uuid, created_at timestamptz default now());
create table if not exists clients (id uuid primary key default gen_random_uuid(), company_name text not null, contact_name text not null, contact_email text, contact_phone text, user_id uuid, created_at timestamptz default now());
create table if not exists travellers (id uuid primary key default gen_random_uuid(), client_id uuid not null references clients on delete cascade, full_name text not null, passport_number text, passport_number_confidence numeric, passport_number_source text, dob date, dob_confidence numeric, dob_source text, expiry_date date, expiry_date_confidence numeric, expiry_date_source text, nationality text, nationality_confidence numeric, nationality_source text, mrz_data text, mrz_confidence numeric, mrz_source text, verification_status text not null default 'unreviewed' check (verification_status in ('unreviewed','client_confirmed','verified','rejected')), review_status text not null default 'unreviewed', user_id uuid, created_at timestamptz default now());
create table if not exists cases (id uuid primary key default gen_random_uuid(), case_number text unique not null, client_id uuid not null references clients, assigned_to uuid references app_users, origin text not null, destination text not null, departure_date date not null, return_date date, trip_type text not null check (trip_type in ('oneway','roundtrip','multicity')), passenger_count int not null check (passenger_count > 0), cabin_class text not null, notes text, status text not null default 'new' check (status in ('new','in_progress','quoted','confirmed','booked','ticketed','closed')), intake_source text not null default 'manual' check (intake_source in ('web','email','whatsapp','manual')), escalation_flag boolean default false, escalation_reason text, next_action text, next_action_deadline timestamptz, user_id uuid, created_at timestamptz default now());
create table if not exists quotations (id uuid primary key default gen_random_uuid(), case_id uuid not null references cases on delete cascade, itinerary_text text, parsed_segments jsonb default '[]', parsed_segments_confidence numeric, parsed_segments_source text, parsed_segments_review_status text default 'unreviewed', base_fare numeric not null default 0, taxes numeric not null default 0, service_fee numeric not null default 0, total_amount numeric generated always as (base_fare + taxes + service_fee) stored, baggage_info text, fare_conditions text, expiry_date timestamptz, status text not null default 'draft' check (status in ('draft','approved','sent','accepted','rejected')), approved_by uuid references app_users, user_id uuid, created_at timestamptz default now());
create table if not exists bookings (id uuid primary key default gen_random_uuid(), case_id uuid not null references cases on delete cascade, quotation_id uuid references quotations, pnr text unique not null, pnr_source text not null check (pnr_source in ('gds','airline','supplier')), itinerary jsonb default '[]', quoted_amount numeric not null, ttl timestamptz not null, ttl_source text not null, status text not null default 'unticketed' check (status in ('unticketed','ticketed','cancelled','expired')), user_id uuid, created_at timestamptz default now());
create table if not exists payments (id uuid primary key default gen_random_uuid(), booking_id uuid not null references bookings on delete cascade, amount numeric not null, evidence_file_path text not null, status text not null default 'pending_verification' check (status in ('pending_verification','verified','rejected')), verified_by uuid references app_users, verification_note text, user_id uuid, created_at timestamptz default now());
create table if not exists tickets (id uuid primary key default gen_random_uuid(), booking_id uuid not null references bookings on delete cascade, payment_id uuid references payments, ticket_number text unique not null, issue_date date not null, final_amount numeric not null, e_ticket_path text, status text not null default 'issued' check (status in ('issued','voided','exchanged')), issued_by uuid references app_users, user_id uuid, created_at timestamptz default now());
create table if not exists service_cases (id uuid primary key default gen_random_uuid(), booking_id uuid references bookings, ticket_id uuid references tickets, case_id uuid references cases, type text not null check (type in ('reissuance','refund','cancellation','void','waiver')), request_details text not null, status text not null default 'requested' check (status in ('requested','in_review','accepted','completed','rejected')), result_summary text, user_id uuid, created_at timestamptz default now());
create table if not exists documents (id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid not null, file_path text not null, file_type text not null, user_id uuid, created_at timestamptz default now());
create table if not exists reminders (id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid not null, reminder_type text not null check (reminder_type in ('ttl','payment','missing_docs','client_response')), due_at timestamptz not null, status text not null default 'scheduled' check (status in ('scheduled','sent','dismissed')), message text not null, user_id uuid, created_at timestamptz default now());
create table if not exists audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references app_users, action text not null, entity_type text not null, entity_id uuid not null, details jsonb default '{}', user_id uuid, created_at timestamptz default now());

do $$ declare t text; begin foreach t in array array['app_users','clients','travellers','cases','quotations','bookings','payments','tickets','service_cases','documents','reminders','audit_logs'] loop execute format('alter table %I enable row level security', t); execute format('drop policy if exists demo_all on %I', t); execute format('create policy demo_all on %I for all using (true) with check (true)', t); end loop; end $$;

create or replace function prevent_audit_change() returns trigger language plpgsql as $$ begin raise exception 'audit logs are append-only'; end $$;
drop trigger if exists audit_logs_immutable on audit_logs; create trigger audit_logs_immutable before update or delete on audit_logs for each row execute function prevent_audit_change();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
('passports','passports',false,5242880,array['image/jpeg','image/png','image/webp']),
('payment-evidence','payment-evidence',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']),
('e-tickets','e-tickets',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
drop policy if exists demo_storage_read on storage.objects; drop policy if exists demo_storage_insert on storage.objects;
create policy demo_storage_read on storage.objects for select using (bucket_id in ('passports','payment-evidence','e-tickets'));
create policy demo_storage_insert on storage.objects for insert with check (bucket_id in ('passports','payment-evidence','e-tickets'));


-- SOURCE: supabase/migrations/20260917192901_secure_audit_function_and_api_grants.sql
alter function public.prevent_audit_change() set search_path = '';

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table
  public.app_users,
  public.clients,
  public.travellers,
  public.cases,
  public.quotations,
  public.bookings,
  public.payments,
  public.tickets,
  public.service_cases,
  public.documents,
  public.reminders
to anon, authenticated;

grant select, insert on table public.audit_logs to anon, authenticated;


-- SOURCE: supabase/migrations/20260922183902_phase1_inquiries.sql
create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('web','email','whatsapp')),
  source_message_id text,
  client_type text not null default 'personal' check (client_type in ('corporate','personal')),
  corporate_client_name text,
  matched_client_id uuid references clients on delete set null,
  contact_name text,
  contact_email text,
  contact_phone text,
  raw_message text not null,
  parsed_fields jsonb not null default '{}'::jsonb,
  parsing_status text not null default 'pending' check (parsing_status in ('pending','parsed','needs_review','failed')),
  parser_source text,
  parser_confidence numeric check (parser_confidence between 0 and 1),
  channel_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','converted','dismissed')),
  converted_case_id uuid references cases on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists inquiries_source_message_id_unique on inquiries(source, source_message_id) where source_message_id is not null;
create index if not exists inquiries_status_created_at_idx on inquiries(status, created_at desc);
alter table inquiries enable row level security;
drop policy if exists demo_all on inquiries;
create policy demo_all on inquiries for all using (true) with check (true);
grant select, insert, update on inquiries to anon, authenticated;
comment on table inquiries is 'Raw multichannel intake. A human must confirm an inquiry before it becomes an operational case.';;


-- SOURCE: supabase/migrations/20260924163450_phase3_quote_proposals.sql
-- Phase 3: Automated Quote and Proposal Generation
-- Adds passenger classification, passenger-type pricing,
-- proposal versioning, delivery tracking, and private PDF storage.

-- ---------------------------------------------------------------------------
-- 1. Connect application users to Supabase Auth
-- ---------------------------------------------------------------------------

alter table public.app_users
  add column if not exists auth_user_id uuid
  references auth.users(id) on delete set null;

create unique index if not exists app_users_auth_user_id_key
  on public.app_users(auth_user_id)
  where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Traveller passenger-type support
-- ---------------------------------------------------------------------------

alter table public.travellers
  add column if not exists default_passenger_type text,
  add column if not exists passenger_type_source text,
  add column if not exists passenger_type_verified_at timestamptz;

alter table public.travellers
  drop constraint if exists travellers_default_passenger_type_check;

alter table public.travellers
  add constraint travellers_default_passenger_type_check
  check (
    default_passenger_type is null
    or default_passenger_type in ('ADT', 'CHD', 'INF')
  );

-- ---------------------------------------------------------------------------
-- 3. Passenger counts on cases
-- Existing case passenger counts are treated as adults during migration only.
-- Operators can correct the breakdown later.
-- ---------------------------------------------------------------------------

alter table public.cases
  add column if not exists adult_count integer,
  add column if not exists child_count integer not null default 0,
  add column if not exists infant_count integer not null default 0;

update public.cases
set adult_count = passenger_count
where adult_count is null;

alter table public.cases
  alter column adult_count set default 1,
  alter column adult_count set not null;

alter table public.cases
  drop constraint if exists cases_passenger_type_counts_check;

alter table public.cases
  add constraint cases_passenger_type_counts_check
  check (
    adult_count >= 0
    and child_count >= 0
    and infant_count >= 0
    and passenger_count = adult_count + child_count + infant_count
    and infant_count <= adult_count
  );

-- ---------------------------------------------------------------------------
-- 4. Case-specific traveller classification
-- Passenger type is authoritative for the specific travel case.
-- ---------------------------------------------------------------------------

create table if not exists public.case_travellers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null
    references public.cases(id) on delete cascade,
  traveller_id uuid not null
    references public.travellers(id) on delete cascade,
  passenger_type text not null
    check (passenger_type in ('ADT', 'CHD', 'INF')),
  gds_passenger_type_code text,
  age_at_departure smallint
    check (
      age_at_departure is null
      or age_at_departure between 0 and 130
    ),
  accompanying_adult_id uuid
    references public.case_travellers(id) on delete set null,
  classification_source text not null default 'manual'
    check (
      classification_source in (
        'dob_calculated',
        'gds',
        'manual',
        'operator_override'
      )
    ),
  classification_override_note text,
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, traveller_id),
  check (
    passenger_type = 'INF'
    or accompanying_adult_id is null
  ),
  check (
    classification_source <> 'operator_override'
    or nullif(trim(classification_override_note), '') is not null
  )
);

create index if not exists case_travellers_case_id_idx
  on public.case_travellers(case_id);

create index if not exists case_travellers_traveller_id_idx
  on public.case_travellers(traveller_id);

-- ---------------------------------------------------------------------------
-- 5. Multiple itinerary and commercial options per quotation
-- ---------------------------------------------------------------------------

create table if not exists public.quotation_options (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null
    references public.quotations(id) on delete cascade,
  option_number integer not null check (option_number > 0),
  option_title text not null,
  itinerary_text text,
  parsed_segments jsonb not null default '[]'::jsonb,
  parsing_confidence numeric
    check (
      parsing_confidence is null
      or parsing_confidence between 0 and 1
    ),
  parsing_source text,
  review_status text not null default 'unreviewed'
    check (
      review_status in (
        'unreviewed',
        'review_required',
        'verified',
        'rejected'
      )
    ),
  baggage_info text,
  fare_conditions text,
  expiry_date timestamptz,
  currency text not null default 'BDT'
    check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'review_required',
        'approved',
        'rejected',
        'expired'
      )
    ),
  sort_order integer not null default 0,
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quotation_id, option_number)
);

create index if not exists quotation_options_quotation_id_idx
  on public.quotation_options(quotation_id);

create index if not exists quotation_options_status_idx
  on public.quotation_options(status);

-- ---------------------------------------------------------------------------
-- 6. ADT, CHD and INF pricing lines
-- All totals are deterministic generated columns.
-- ---------------------------------------------------------------------------

create table if not exists public.quotation_price_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_option_id uuid not null
    references public.quotation_options(id) on delete cascade,
  passenger_type text not null
    check (passenger_type in ('ADT', 'CHD', 'INF')),
  gds_passenger_type_code text not null,
  passenger_count integer not null
    check (passenger_count > 0),
  base_fare_per_passenger numeric(14,2) not null default 0
    check (base_fare_per_passenger >= 0),
  taxes_per_passenger numeric(14,2) not null default 0
    check (taxes_per_passenger >= 0),
  service_fee_per_passenger numeric(14,2) not null default 0
    check (service_fee_per_passenger >= 0),
  other_charges_per_passenger numeric(14,2) not null default 0
    check (other_charges_per_passenger >= 0),
  discount_per_passenger numeric(14,2) not null default 0
    check (discount_per_passenger >= 0),
  total_per_passenger numeric(14,2)
    generated always as (
      base_fare_per_passenger
      + taxes_per_passenger
      + service_fee_per_passenger
      + other_charges_per_passenger
      - discount_per_passenger
    ) stored,
  line_total numeric(16,2)
    generated always as (
      (
        base_fare_per_passenger
        + taxes_per_passenger
        + service_fee_per_passenger
        + other_charges_per_passenger
        - discount_per_passenger
      ) * passenger_count
    ) stored,
  currency text not null default 'BDT'
    check (currency ~ '^[A-Z]{3}$'),
  fare_verified boolean not null default false,
  verified_by uuid references public.app_users(id),
  verified_at timestamptz,
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    quotation_option_id,
    passenger_type,
    gds_passenger_type_code
  ),
  check (
    discount_per_passenger <=
      base_fare_per_passenger
      + taxes_per_passenger
      + service_fee_per_passenger
      + other_charges_per_passenger
  ),
  check (
    fare_verified = false
    or (verified_by is not null and verified_at is not null)
  )
);

create index if not exists quotation_price_lines_option_id_idx
  on public.quotation_price_lines(quotation_option_id);

-- ---------------------------------------------------------------------------
-- 7. Immutable proposal-version snapshots
-- ---------------------------------------------------------------------------

create table if not exists public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null
    references public.quotations(id) on delete cascade,
  proposal_number text not null,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'review_required',
        'approved',
        'generated',
        'sent',
        'accepted',
        'rejected',
        'revision_requested',
        'expired'
      )
    ),
  snapshot jsonb not null,
  change_summary text,
  approved_by uuid references public.app_users(id),
  approved_at timestamptz,
  pdf_storage_path text,
  client_response_note text,
  client_responded_at timestamptz,
  user_id uuid,
  created_at timestamptz not null default now(),
  unique (proposal_number),
  unique (quotation_id, version_number),
  check (
    status not in (
      'approved',
      'generated',
      'sent',
      'accepted',
      'rejected',
      'revision_requested'
    )
    or (approved_by is not null and approved_at is not null)
  )
);

create index if not exists proposal_versions_quotation_id_idx
  on public.proposal_versions(quotation_id);

create index if not exists proposal_versions_status_idx
  on public.proposal_versions(status);

create or replace function public.prevent_proposal_snapshot_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.quotation_id is distinct from new.quotation_id
    or old.proposal_number is distinct from new.proposal_number
    or old.version_number is distinct from new.version_number
    or old.snapshot is distinct from new.snapshot
  then
    raise exception 'Proposal version snapshots are immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists proposal_snapshot_immutable
  on public.proposal_versions;

create trigger proposal_snapshot_immutable
before update on public.proposal_versions
for each row
execute function public.prevent_proposal_snapshot_change();

-- ---------------------------------------------------------------------------
-- 8. Proposal delivery history
-- ---------------------------------------------------------------------------

create table if not exists public.proposal_deliveries (
  id uuid primary key default gen_random_uuid(),
  proposal_version_id uuid not null
    references public.proposal_versions(id) on delete cascade,
  channel text not null
    check (
      channel in ('email', 'whatsapp', 'download', 'manual')
    ),
  recipient text,
  status text not null default 'prepared'
    check (
      status in (
        'prepared',
        'sent',
        'delivered',
        'failed',
        'recorded'
      )
    ),
  sent_by uuid references public.app_users(id),
  sent_at timestamptz,
  external_reference text,
  operator_note text,
  user_id uuid,
  created_at timestamptz not null default now(),
  check (
    status not in ('sent', 'delivered')
    or (sent_by is not null and sent_at is not null)
  )
);

create index if not exists proposal_deliveries_version_id_idx
  on public.proposal_deliveries(proposal_version_id);

-- ---------------------------------------------------------------------------
-- 9. RLS for new Phase 3 tables
-- Initial Phase 3 access is owner-only.
-- Existing Phase 2 demo policies are not changed in this migration.
-- ---------------------------------------------------------------------------

alter table public.case_travellers enable row level security;
alter table public.quotation_options enable row level security;
alter table public.quotation_price_lines enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposal_deliveries enable row level security;

drop policy if exists phase3_owner_all
  on public.case_travellers;
create policy phase3_owner_all
  on public.case_travellers
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
  );

drop policy if exists phase3_owner_all
  on public.quotation_options;
create policy phase3_owner_all
  on public.quotation_options
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
  );

drop policy if exists phase3_owner_all
  on public.quotation_price_lines;
create policy phase3_owner_all
  on public.quotation_price_lines
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
  );

drop policy if exists phase3_owner_all
  on public.proposal_versions;
create policy phase3_owner_all
  on public.proposal_versions
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
  );

drop policy if exists phase3_owner_all
  on public.proposal_deliveries;
create policy phase3_owner_all
  on public.proposal_deliveries
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
  );

revoke all on table public.case_travellers from anon;
revoke all on table public.quotation_options from anon;
revoke all on table public.quotation_price_lines from anon;
revoke all on table public.proposal_versions from anon;
revoke all on table public.proposal_deliveries from anon;

grant select, insert, update, delete
  on table public.case_travellers to authenticated;
grant select, insert, update, delete
  on table public.quotation_options to authenticated;
grant select, insert, update, delete
  on table public.quotation_price_lines to authenticated;
grant select, insert, update, delete
  on table public.proposal_versions to authenticated;
grant select, insert, update, delete
  on table public.proposal_deliveries to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Private proposal PDF bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'proposal-documents',
  'proposal-documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists proposal_documents_owner_select
  on storage.objects;
create policy proposal_documents_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'proposal-documents'
    and exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

drop policy if exists proposal_documents_owner_insert
  on storage.objects;
create policy proposal_documents_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'proposal-documents'
    and exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

drop policy if exists proposal_documents_owner_update
  on storage.objects;
create policy proposal_documents_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'proposal-documents'
    and exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  )
  with check (
    bucket_id = 'proposal-documents'
    and exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

drop policy if exists proposal_documents_owner_delete
  on storage.objects;
create policy proposal_documents_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'proposal-documents'
    and exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

-- SOURCE: supabase/migrations/20260925111606_owner_rls_security_cutover.sql
-- Replace Phase 1 and Phase 2 demo policies with owner-only access.
-- Keep public inquiry intake insert-only.
-- Restrict private operational storage to authenticated owners.

-- ---------------------------------------------------------------------------
-- 1. Owner profile
-- ---------------------------------------------------------------------------

alter table public.app_users enable row level security;

drop policy if exists demo_all on public.app_users;
drop policy if exists owner_self_all on public.app_users;

create policy owner_self_all
  on public.app_users
  for all
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    and role = 'owner'
  )
  with check (
    auth_user_id = (select auth.uid())
    and role = 'owner'
  );

revoke all privileges on table public.app_users from anon;
revoke all privileges on table public.app_users from authenticated;
grant select, insert, update, delete
  on table public.app_users
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Owner-only operational tables
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clients',
    'travellers',
    'cases',
    'quotations',
    'bookings',
    'payments',
    'tickets',
    'service_cases',
    'documents',
    'reminders'
  ]
  loop
    execute format(
      'alter table public.%I enable row level security',
      table_name
    );

    execute format(
      'drop policy if exists demo_all on public.%I',
      table_name
    );

    execute format(
      'drop policy if exists owner_all on public.%I',
      table_name
    );

    execute format(
      $policy$
        create policy owner_all
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

-- ---------------------------------------------------------------------------
-- 3. Append-only audit log
-- ---------------------------------------------------------------------------

alter table public.audit_logs enable row level security;

drop policy if exists demo_all on public.audit_logs;
drop policy if exists owner_audit_select on public.audit_logs;
drop policy if exists owner_audit_insert on public.audit_logs;

create policy owner_audit_select
  on public.audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

create policy owner_audit_insert
  on public.audit_logs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

revoke all privileges on table public.audit_logs from anon;
revoke all privileges on table public.audit_logs from authenticated;
grant select, insert
  on table public.audit_logs
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Public inquiry intake
-- Anonymous users may submit only new, unreviewed inquiries.
-- Only owners may read, update, convert, or delete inquiries.
-- ---------------------------------------------------------------------------

alter table public.inquiries enable row level security;

drop policy if exists demo_all on public.inquiries;
drop policy if exists public_inquiry_insert on public.inquiries;
drop policy if exists owner_inquiry_all on public.inquiries;

create policy public_inquiry_insert
  on public.inquiries
  for insert
  to anon
  with check (
    status = 'new'
    and matched_client_id is null
    and converted_case_id is null
    and reviewed_at is null
    and length(trim(raw_message)) between 1 and 10000
  );

create policy owner_inquiry_all
  on public.inquiries
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
  );

revoke all privileges on table public.inquiries from anon;
revoke all privileges on table public.inquiries from authenticated;

grant insert (
  id,
  source,
  source_message_id,
  client_type,
  corporate_client_name,
  contact_name,
  contact_email,
  contact_phone,
  raw_message,
  parsed_fields,
  parsing_status,
  parser_source,
  parser_confidence,
  channel_metadata,
  status,
  created_at
)
on table public.inquiries
to anon;

grant select, insert, update, delete
  on table public.inquiries
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Owner-only legacy private storage
-- ---------------------------------------------------------------------------

drop policy if exists demo_storage_read
  on storage.objects;

drop policy if exists demo_storage_insert
  on storage.objects;

drop policy if exists operational_documents_owner_select
  on storage.objects;

drop policy if exists operational_documents_owner_insert
  on storage.objects;

drop policy if exists operational_documents_owner_update
  on storage.objects;

drop policy if exists operational_documents_owner_delete
  on storage.objects;

create policy operational_documents_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id in (
      'passports',
      'payment-evidence',
      'e-tickets'
    )
    and exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

create policy operational_documents_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in (
      'passports',
      'payment-evidence',
      'e-tickets'
    )
    and exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

create policy operational_documents_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in (
      'passports',
      'payment-evidence',
      'e-tickets'
    )
    and exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  )
  with check (
    bucket_id in (
      'passports',
      'payment-evidence',
      'e-tickets'
    )
    and exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

create policy operational_documents_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in (
      'passports',
      'payment-evidence',
      'e-tickets'
    )
    and exists (
      select 1
      from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

-- SOURCE: supabase/migrations/20260925195707_phase4_booking_reminder_engine.sql
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

-- SOURCE: supabase/migrations/20260927193900_phase4_reminder_dispatcher.sql
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

-- Staging bootstrap: automatic scheduling intentionally omitted.

-- SOURCE: supabase/migrations/20260928094545_phase4_case_followup_alerts.sql
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

-- Staging bootstrap: automatic scheduling intentionally omitted.

-- SOURCE: supabase/migrations/20260928191702_passport_extraction_drafts.sql
-- Passport OCR results remain unverified until an owner reviews every field.

create table public.passport_extraction_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  image_path text not null unique,
  status text not null default 'uploaded'
    check (status in (
      'uploaded',
      'awaiting_review',
      'extraction_failed',
      'confirmed',
      'rejected'
    )),
  provider_name text,
  extracted_fields jsonb not null default '{}'::jsonb
    check (jsonb_typeof(extracted_fields) = 'object'),
  confidence_by_field jsonb not null default '{}'::jsonb
    check (jsonb_typeof(confidence_by_field) = 'object'),
  evidence_by_field jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_by_field) = 'object'),
  reviewed_fields jsonb,
  extraction_error_code text,
  confirmed_traveller_id uuid
    references public.travellers(id) on delete restrict,
  created_by uuid not null references public.app_users(id),
  reviewed_by uuid references public.app_users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint passport_draft_confirmed_traveller_check
    check (
      status <> 'confirmed'
      or (
        confirmed_traveller_id is not null
        and reviewed_by is not null
        and reviewed_at is not null
        and reviewed_fields is not null
      )
    )
);

create index passport_drafts_review_queue_idx
  on public.passport_extraction_drafts (status, created_at desc);

alter table public.passport_extraction_drafts
  enable row level security;

create policy passport_drafts_owner_select
  on public.passport_extraction_drafts
  for select to authenticated
  using (
    exists (
      select 1 from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

create policy passport_drafts_owner_insert
  on public.passport_extraction_drafts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

create policy passport_drafts_owner_update
  on public.passport_extraction_drafts
  for update to authenticated
  using (
    exists (
      select 1 from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.app_users
      where app_users.auth_user_id = (select auth.uid())
        and app_users.role = 'owner'
    )
  );

revoke all on table public.passport_extraction_drafts
  from anon, authenticated;

grant select, insert, update
  on table public.passport_extraction_drafts
  to authenticated;

-- SOURCE: supabase/migrations/20261001114520_confirm_passport_draft.sql
-- Owner-reviewed passport confirmation.
-- All writes succeed together or roll back together.

create or replace function public.confirm_passport_draft(
  p_draft_id uuid,
  p_full_name text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_draft public.passport_extraction_drafts%rowtype;
  v_traveller_id uuid;
  v_full_name text := upper(btrim(p_full_name));
  v_passport_number text := upper(btrim(p_passport_number));
  v_nationality text := upper(btrim(p_nationality));
  v_now timestamptz := now();
  v_reviewed_fields jsonb;
begin
  select u.id
  into v_owner_id
  from public.app_users u
  where u.auth_user_id = (select auth.uid())
    and u.role = 'owner';

  if v_owner_id is null then
    raise exception 'Owner access required';
  end if;

  if jsonb_typeof(p_field_checks) is distinct from 'object'
    or (p_field_checks -> 'full_name') is distinct from 'true'::jsonb
    or (p_field_checks -> 'passport_number') is distinct from 'true'::jsonb
    or (p_field_checks -> 'dob') is distinct from 'true'::jsonb
    or (p_field_checks -> 'expiry_date') is distinct from 'true'::jsonb
    or (p_field_checks -> 'nationality') is distinct from 'true'::jsonb
  then
    raise exception 'Review and confirm all five passport fields';
  end if;

  if coalesce(v_full_name, '') = ''
    or char_length(v_full_name) > 200
  then
    raise exception 'Full name is required and must be at most 200 characters';
  end if;

  if coalesce(v_passport_number, '') = ''
    or char_length(v_passport_number) > 30
  then
    raise exception 'Passport number is required and must be at most 30 characters';
  end if;

  if coalesce(v_nationality, '') = ''
    or char_length(v_nationality) > 100
  then
    raise exception 'Nationality is required and must be at most 100 characters';
  end if;

  if p_dob is null
    or p_dob > (v_now at time zone 'Asia/Dhaka')::date
  then
    raise exception 'Date of birth must be a valid date that is not in the future';
  end if;

  if p_expiry_date is null or p_expiry_date <= p_dob then
    raise exception 'Passport expiry date must be after date of birth';
  end if;

  select d.*
  into v_draft
  from public.passport_extraction_drafts d
  where d.id = p_draft_id
  for update;

  if not found then
    raise exception 'Passport draft not found';
  end if;

  if v_draft.status = 'confirmed' then
    raise exception 'Passport draft is already confirmed';
  end if;

  if v_draft.status not in (
    'uploaded',
    'awaiting_review',
    'extraction_failed'
  ) then
    raise exception 'Passport draft is not available for review';
  end if;

  v_reviewed_fields := jsonb_build_object(
    'full_name', v_full_name,
    'passport_number', v_passport_number,
    'dob', p_dob,
    'expiry_date', p_expiry_date,
    'nationality', v_nationality,
    'field_checks', p_field_checks
  );

  insert into public.travellers (
    client_id,
    full_name,
    passport_number,
    passport_number_source,
    dob,
    dob_source,
    expiry_date,
    expiry_date_source,
    nationality,
    nationality_source,
    verification_status,
    review_status,
    user_id
  )
  values (
    v_draft.client_id,
    v_full_name,
    v_passport_number,
    'owner_review',
    p_dob,
    'owner_review',
    p_expiry_date,
    'owner_review',
    v_nationality,
    'owner_review',
    'verified',
    'confirmed',
    v_owner_id
  )
  returning id into v_traveller_id;

  insert into public.documents (
    entity_type,
    entity_id,
    file_path,
    file_type,
    user_id
  )
  values (
    'traveller',
    v_traveller_id,
    v_draft.image_path,
    'passport',
    v_owner_id
  );

  update public.passport_extraction_drafts
  set
    status = 'confirmed',
    reviewed_fields = v_reviewed_fields,
    confirmed_traveller_id = v_traveller_id,
    reviewed_by = v_owner_id,
    reviewed_at = v_now,
    updated_at = v_now
  where id = p_draft_id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    details,
    user_id
  )
  values (
    v_owner_id,
    'passport_draft.confirmed',
    'passport_draft',
    p_draft_id,
    jsonb_build_object(
      'traveller_id', v_traveller_id,
      'reviewed_fields',
      jsonb_build_array(
        'full_name',
        'passport_number',
        'dob',
        'expiry_date',
        'nationality'
      )
    ),
    v_owner_id
  );

  return v_traveller_id;
end;
$$;

revoke all on function public.confirm_passport_draft(
  uuid, text, text, date, date, text, jsonb
) from public, anon, authenticated;

grant execute on function public.confirm_passport_draft(
  uuid, text, text, date, date, text, jsonb
) to authenticated;

-- SOURCE: supabase/migrations/20261002204708_traveller_passport_duplicate_guard.sql
-- Prevent duplicate non-empty passport numbers within one client.
-- Existing records are preserved.
-- Different clients may hold records for the same passport.

create unique index travellers_client_passport_unique
on public.travellers (
  client_id,
  upper(btrim(passport_number))
)
where nullif(btrim(passport_number), '') is not null;

-- SOURCE: supabase/migrations/20261004101858_correct_traveller_details.sql
-- Owner-reviewed corrections and audit succeed together.

create or replace function public.correct_traveller_details(
  p_traveller_id uuid,
  p_expected_fields jsonb,
  p_full_name text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller public.travellers%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_changed jsonb;
  v_name text := upper(btrim(p_full_name));
  v_passport text := upper(btrim(p_passport_number));
  v_nationality text := upper(btrim(p_nationality));
  v_reason text := btrim(p_reason);
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if jsonb_typeof(p_field_checks) is distinct from 'object'
    or (p_field_checks -> 'full_name') is distinct from 'true'::jsonb
    or (p_field_checks -> 'passport_number') is distinct from 'true'::jsonb
    or (p_field_checks -> 'dob') is distinct from 'true'::jsonb
    or (p_field_checks -> 'expiry_date') is distinct from 'true'::jsonb
    or (p_field_checks -> 'nationality') is distinct from 'true'::jsonb
  then
    raise exception 'Review and confirm all five passport fields';
  end if;

  if coalesce(v_name, '') = '' or char_length(v_name) > 200 then
    raise exception 'Full name must contain 1 to 200 characters';
  end if;

  if coalesce(v_passport, '') = ''
    or char_length(v_passport) > 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  if coalesce(v_nationality, '') = ''
    or char_length(v_nationality) > 100 then
    raise exception 'Nationality must contain 1 to 100 characters';
  end if;

  if p_dob is null
    or p_dob > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Date of birth must not be in the future';
  end if;

  if p_expiry_date is null or p_expiry_date <= p_dob then
    raise exception 'Passport expiry date must be after date of birth';
  end if;

  if coalesce(v_reason, '') = ''
    or char_length(v_reason) > 500 then
    raise exception 'Correction reason must contain 1 to 500 characters';
  end if;

  select * into v_traveller
  from public.travellers
  where id = p_traveller_id
  for update;

  if not found then
    raise exception 'Traveller not found';
  end if;

  v_before := jsonb_build_object(
    'full_name', v_traveller.full_name,
    'passport_number', v_traveller.passport_number,
    'dob', v_traveller.dob,
    'expiry_date', v_traveller.expiry_date,
    'nationality', v_traveller.nationality,
    'verification_status', v_traveller.verification_status
  );

  if p_expected_fields is distinct from v_before then
    raise exception 'Traveller changed. Refresh before saving';
  end if;

  v_after := jsonb_build_object(
    'full_name', v_name,
    'passport_number', v_passport,
    'dob', p_dob,
    'expiry_date', p_expiry_date,
    'nationality', v_nationality,
    'verification_status', 'verified'
  );

  select coalesce(jsonb_agg(e.key order by e.key), '[]'::jsonb)
  into v_changed
  from jsonb_each(v_after) as e
  where e.value is distinct from (v_before -> e.key);

  if v_changed = '[]'::jsonb then
    raise exception 'No changes to save';
  end if;

  update public.travellers
  set full_name = v_name,
      passport_number = v_passport,
      dob = p_dob,
      expiry_date = p_expiry_date,
      nationality = v_nationality,
      passport_number_confidence = null,
      dob_confidence = null,
      expiry_date_confidence = null,
      nationality_confidence = null,
      passport_number_source = 'owner_review',
      dob_source = 'owner_review',
      expiry_date_source = 'owner_review',
      nationality_source = 'owner_review',
      verification_status = 'verified',
      review_status = 'confirmed'
  where id = p_traveller_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'traveller.details_corrected',
    'traveller',
    p_traveller_id,
    jsonb_build_object(
      'changed_fields', v_changed,
      'reason', v_reason,
      'field_checks', p_field_checks
    ),
    v_owner
  );

  return p_traveller_id;
end;
$$;

revoke all on function public.correct_traveller_details(
  uuid, jsonb, text, text, date, date, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.correct_traveller_details(
  uuid, jsonb, text, text, date, date, text, jsonb, text
) to authenticated;

-- SOURCE: supabase/migrations/20261004182030_create_traveller_atomic.sql
-- Manual traveller creation, document link and audit are atomic.
-- Storage upload remains a separate operation.

create or replace function public.create_traveller_atomic(
  p_client_id uuid,
  p_full_name text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_image_path text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller uuid;
  v_name text := upper(btrim(p_full_name));
  v_passport text := upper(btrim(p_passport_number));
  v_nationality text := upper(btrim(p_nationality));
  v_image_path text := nullif(btrim(p_image_path), '');
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if p_client_id is null or not exists (
    select 1 from public.clients
    where id = p_client_id
  ) then
    raise exception 'Client not found';
  end if;

  if coalesce(v_name, '') = ''
    or char_length(v_name) > 200 then
    raise exception 'Full name must contain 1 to 200 characters';
  end if;

  if coalesce(v_passport, '') = ''
    or char_length(v_passport) > 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  if coalesce(v_nationality, '') = ''
    or char_length(v_nationality) > 100 then
    raise exception 'Nationality must contain 1 to 100 characters';
  end if;

  if p_dob is null
    or p_dob > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Date of birth must not be in the future';
  end if;

  if p_expiry_date is null or p_expiry_date <= p_dob then
    raise exception 'Passport expiry date must be after date of birth';
  end if;

  if v_image_path is not null then
    if char_length(v_image_path) > 1024 or not exists (
      select 1 from storage.objects
      where bucket_id = 'passports'
        and name = v_image_path
    ) then
      raise exception 'Passport image not found or inaccessible';
    end if;
  end if;

  insert into public.travellers (
    client_id,
    full_name,
    passport_number,
    passport_number_confidence,
    passport_number_source,
    dob,
    dob_confidence,
    dob_source,
    expiry_date,
    expiry_date_confidence,
    expiry_date_source,
    nationality,
    nationality_confidence,
    nationality_source,
    verification_status,
    review_status,
    user_id
  )
  values (
    p_client_id,
    v_name,
    v_passport,
    null,
    case when v_image_path is null
      then 'manual' else 'manual_after_upload' end,
    p_dob,
    null,
    'manual',
    p_expiry_date,
    null,
    'manual',
    v_nationality,
    null,
    'manual',
    'client_confirmed',
    'unreviewed',
    v_owner
  )
  returning id into v_traveller;

  if v_image_path is not null then
    insert into public.documents (
      entity_type,
      entity_id,
      file_path,
      file_type,
      user_id
    )
    values (
      'traveller',
      v_traveller,
      v_image_path,
      'passport',
      v_owner
    );
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    details,
    user_id
  )
  values (
    v_owner,
    'traveller.client_confirmed',
    'traveller',
    v_traveller,
    jsonb_build_object(
      'passport_uploaded', v_image_path is not null
    ),
    v_owner
  );

  return v_traveller;
end;
$$;

revoke all on function public.create_traveller_atomic(
  uuid, text, text, date, date, text, text
) from public, anon, authenticated;

grant execute on function public.create_traveller_atomic(
  uuid, text, text, date, date, text, text
) to authenticated;

-- SOURCE: supabase/migrations/20261005090142_passport_name_fields.sql
-- Separate passport name fields.
-- Existing full_name values are preserved without guessing name boundaries.
-- Legacy rows and newly uploaded drafts may have both fields unset.

alter table public.travellers
  add column given_name text,
  add column surname text;

alter table public.passport_extraction_drafts
  add column given_name text,
  add column surname text;

alter table public.travellers
  add constraint travellers_given_name_check
    check (
      given_name is null
      or char_length(btrim(given_name)) between 1 and 100
    ),
  add constraint travellers_surname_check
    check (
      surname is null
      or char_length(btrim(surname)) between 1 and 100
    ),
  add constraint travellers_combined_name_length_check
    check (
      char_length(
        concat_ws(' ', btrim(given_name), btrim(surname))
      ) <= 200
    );

alter table public.passport_extraction_drafts
  add constraint passport_drafts_given_name_check
    check (
      given_name is null
      or char_length(btrim(given_name)) between 1 and 100
    ),
  add constraint passport_drafts_surname_check
    check (
      surname is null
      or char_length(btrim(surname)) between 1 and 100
    ),
  add constraint passport_drafts_combined_name_length_check
    check (
      char_length(
        concat_ws(' ', btrim(given_name), btrim(surname))
      ) <= 200
    );

comment on column public.travellers.given_name is
  'Given names exactly as reviewed from the passport; no automatic splitting of legacy full_name.';

comment on column public.travellers.surname is
  'Surname exactly as reviewed from the passport; may be absent on a single-name passport.';

comment on column public.passport_extraction_drafts.given_name is
  'Draft given names; confirmation requires explicit owner review.';

comment on column public.passport_extraction_drafts.surname is
  'Draft surname; confirmation requires explicit owner review.';
-- New overload for separate passport name fields.
-- The existing seven-parameter function remains for deployment compatibility.

create or replace function public.create_traveller_atomic(
  p_client_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_image_path text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_given_name text := nullif(upper(btrim(p_given_name)), '');
  v_surname text := nullif(upper(btrim(p_surname)), '');
  v_full_name text;
  v_traveller_id uuid;
begin
  if v_given_name is null and v_surname is null then
    raise exception 'Enter the passport given name or surname';
  end if;

  if char_length(v_given_name) > 100
    or char_length(v_surname) > 100 then
    raise exception 'Each name field must be at most 100 characters';
  end if;

  v_full_name := concat_ws(' ', v_given_name, v_surname);

  if char_length(v_full_name) > 200 then
    raise exception 'Combined name must be at most 200 characters';
  end if;

  -- Existing function validates owner access, client, DOB, expiry,
  -- passport uniqueness and storage access.
  -- Traveller, document and audit writes remain in this transaction.
  v_traveller_id := public.create_traveller_atomic(
    p_client_id,
    v_full_name,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    p_image_path
  );

  update public.travellers
  set
    given_name = v_given_name,
    surname = v_surname
  where id = v_traveller_id;

  if not found then
    raise exception 'Unable to save separate traveller names';
  end if;

  return v_traveller_id;
end;
$$;

revoke all on function public.create_traveller_atomic(
  uuid, text, text, text, date, date, text, text
) from public, anon, authenticated;

grant execute on function public.create_traveller_atomic(
  uuid, text, text, text, date, date, text, text
) to authenticated;
-- Separate-name draft confirmation.
-- Preserve the original overload during deployment.

create or replace function public.confirm_passport_draft(
  p_draft_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_draft public.passport_extraction_drafts%rowtype;
  v_traveller_id uuid;
  v_given_name text := nullif(upper(btrim(p_given_name)), '');
  v_surname text := nullif(upper(btrim(p_surname)), '');
  v_full_name text;
  v_passport_number text := upper(btrim(p_passport_number));
  v_nationality text := upper(btrim(p_nationality));
  v_now timestamptz := now();
begin
  select u.id into v_owner_id
  from public.app_users u
  where u.auth_user_id = (select auth.uid())
    and u.role = 'owner';

  if v_owner_id is null then
    raise exception 'Owner access required';
  end if;

  if jsonb_typeof(p_field_checks) is distinct from 'object'
    or (p_field_checks -> 'given_name') is distinct from 'true'::jsonb
    or (p_field_checks -> 'surname') is distinct from 'true'::jsonb
    or (p_field_checks -> 'passport_number') is distinct from 'true'::jsonb
    or (p_field_checks -> 'dob') is distinct from 'true'::jsonb
    or (p_field_checks -> 'expiry_date') is distinct from 'true'::jsonb
    or (p_field_checks -> 'nationality') is distinct from 'true'::jsonb
  then
    raise exception 'Review and confirm all six passport fields';
  end if;

  if v_given_name is null and v_surname is null then
    raise exception 'Enter the passport given name or surname';
  end if;

  if char_length(v_given_name) > 100
    or char_length(v_surname) > 100 then
    raise exception 'Each name field must be at most 100 characters';
  end if;

  v_full_name := concat_ws(' ', v_given_name, v_surname);

  if char_length(v_full_name) > 200 then
    raise exception 'Combined name must be at most 200 characters';
  end if;

  if coalesce(v_passport_number, '') = ''
    or char_length(v_passport_number) > 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  if coalesce(v_nationality, '') = ''
    or char_length(v_nationality) > 100 then
    raise exception 'Nationality must contain 1 to 100 characters';
  end if;

  if p_dob is null
    or p_dob > (v_now at time zone 'Asia/Dhaka')::date then
    raise exception 'Date of birth must not be in the future';
  end if;

  if p_expiry_date is null or p_expiry_date <= p_dob then
    raise exception 'Passport expiry date must be after date of birth';
  end if;

  select d.* into v_draft
  from public.passport_extraction_drafts d
  where d.id = p_draft_id
  for update;

  if not found then
    raise exception 'Passport draft not found';
  end if;

  if v_draft.status = 'confirmed' then
    raise exception 'Passport draft is already confirmed';
  end if;

  if v_draft.status not in (
    'uploaded', 'awaiting_review', 'extraction_failed'
  ) then
    raise exception 'Passport draft is not available for review';
  end if;

  insert into public.travellers (
    client_id, given_name, surname, full_name,
    passport_number, passport_number_confidence, passport_number_source,
    dob, dob_confidence, dob_source,
    expiry_date, expiry_date_confidence, expiry_date_source,
    nationality, nationality_confidence, nationality_source,
    verification_status, review_status, user_id
  )
  values (
    v_draft.client_id, v_given_name, v_surname, v_full_name,
    v_passport_number, null, 'owner_review',
    p_dob, null, 'owner_review',
    p_expiry_date, null, 'owner_review',
    v_nationality, null, 'owner_review',
    'verified', 'confirmed', v_owner_id
  )
  returning id into v_traveller_id;

  insert into public.documents (
    entity_type, entity_id, file_path, file_type, user_id
  )
  values (
    'traveller', v_traveller_id,
    v_draft.image_path, 'passport', v_owner_id
  );

  update public.passport_extraction_drafts
  set
    given_name = v_given_name,
    surname = v_surname,
    status = 'confirmed',
    reviewed_fields = jsonb_build_object(
      'given_name', v_given_name,
      'surname', v_surname,
      'passport_number', v_passport_number,
      'dob', p_dob,
      'expiry_date', p_expiry_date,
      'nationality', v_nationality,
      'field_checks', p_field_checks
    ),
    confirmed_traveller_id = v_traveller_id,
    reviewed_by = v_owner_id,
    reviewed_at = v_now,
    updated_at = v_now
  where id = p_draft_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner_id,
    'passport_draft.confirmed',
    'passport_draft',
    p_draft_id,
    jsonb_build_object(
      'traveller_id', v_traveller_id,
      'reviewed_fields', jsonb_build_array(
        'given_name', 'surname', 'passport_number',
        'dob', 'expiry_date', 'nationality'
      )
    ),
    v_owner_id
  );

  return v_traveller_id;
end;
$$;

revoke all on function public.confirm_passport_draft(
  uuid, text, text, text, date, date, text, jsonb
) from public, anon, authenticated;

grant execute on function public.confirm_passport_draft(
  uuid, text, text, text, date, date, text, jsonb
) to authenticated;
-- Separate-name correction with atomic audit and stale-form protection.

create or replace function public.correct_traveller_details(
  p_traveller_id uuid,
  p_expected_fields jsonb,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller public.travellers%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_changed jsonb;
  v_given_name text := nullif(upper(btrim(p_given_name)), '');
  v_surname text := nullif(upper(btrim(p_surname)), '');
  v_name text;
  v_passport text := upper(btrim(p_passport_number));
  v_nationality text := upper(btrim(p_nationality));
  v_reason text := btrim(p_reason);
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if jsonb_typeof(p_field_checks) is distinct from 'object'
    or (p_field_checks -> 'given_name') is distinct from 'true'::jsonb
    or (p_field_checks -> 'surname') is distinct from 'true'::jsonb
    or (p_field_checks -> 'passport_number') is distinct from 'true'::jsonb
    or (p_field_checks -> 'dob') is distinct from 'true'::jsonb
    or (p_field_checks -> 'expiry_date') is distinct from 'true'::jsonb
    or (p_field_checks -> 'nationality') is distinct from 'true'::jsonb
  then
    raise exception 'Review and confirm all six passport fields';
  end if;

  if v_given_name is null and v_surname is null then
    raise exception 'Enter the passport given name or surname';
  end if;

  if char_length(v_given_name) > 100
    or char_length(v_surname) > 100 then
    raise exception 'Each name field must be at most 100 characters';
  end if;

  v_name := concat_ws(' ', v_given_name, v_surname);

  if char_length(v_name) > 200 then
    raise exception 'Combined name must be at most 200 characters';
  end if;

  if coalesce(v_passport, '') = ''
    or char_length(v_passport) > 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  if coalesce(v_nationality, '') = ''
    or char_length(v_nationality) > 100 then
    raise exception 'Nationality must contain 1 to 100 characters';
  end if;

  if p_dob is null
    or p_dob > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Date of birth must not be in the future';
  end if;

  if p_expiry_date is null or p_expiry_date <= p_dob then
    raise exception 'Passport expiry date must be after date of birth';
  end if;

  if coalesce(v_reason, '') = ''
    or char_length(v_reason) > 500 then
    raise exception 'Correction reason must contain 1 to 500 characters';
  end if;

  select * into v_traveller
  from public.travellers
  where id = p_traveller_id
  for update;

  if not found then
    raise exception 'Traveller not found';
  end if;

  v_before := jsonb_build_object(
    'given_name', v_traveller.given_name,
    'surname', v_traveller.surname,
    'full_name', v_traveller.full_name,
    'passport_number', v_traveller.passport_number,
    'dob', v_traveller.dob,
    'expiry_date', v_traveller.expiry_date,
    'nationality', v_traveller.nationality,
    'verification_status', v_traveller.verification_status
  );

  if p_expected_fields is distinct from v_before then
    raise exception 'Traveller changed. Refresh before saving';
  end if;

  v_after := jsonb_build_object(
    'given_name', v_given_name,
    'surname', v_surname,
    'full_name', v_name,
    'passport_number', v_passport,
    'dob', p_dob,
    'expiry_date', p_expiry_date,
    'nationality', v_nationality,
    'verification_status', 'verified'
  );

  select coalesce(jsonb_agg(e.key order by e.key), '[]'::jsonb)
  into v_changed
  from jsonb_each(v_after) as e
  where e.value is distinct from (v_before -> e.key);

  if v_changed = '[]'::jsonb then
    raise exception 'No changes to save';
  end if;

  update public.travellers
  set
    given_name = v_given_name,
    surname = v_surname,
    full_name = v_name,
    passport_number = v_passport,
    dob = p_dob,
    expiry_date = p_expiry_date,
    nationality = v_nationality,
    passport_number_confidence = null,
    dob_confidence = null,
    expiry_date_confidence = null,
    nationality_confidence = null,
    passport_number_source = 'owner_review',
    dob_source = 'owner_review',
    expiry_date_source = 'owner_review',
    nationality_source = 'owner_review',
    verification_status = 'verified',
    review_status = 'confirmed'
  where id = p_traveller_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'traveller.details_corrected',
    'traveller',
    p_traveller_id,
    jsonb_build_object(
      'changed_fields', v_changed,
      'reason', v_reason,
      'field_checks', p_field_checks
    ),
    v_owner
  );

  return p_traveller_id;
end;
$$;

revoke all on function public.correct_traveller_details(
  uuid, jsonb, text, text, text, date, date, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.correct_traveller_details(
  uuid, jsonb, text, text, text, date, date, text, jsonb, text
) to authenticated;
-- Keep the compatibility full_name consistent with separate names.
-- Legacy records with both name fields unset retain their original name.

alter table public.travellers
  add constraint travellers_full_name_matches_parts_check
  check (
    (given_name is null and surname is null)
    or full_name = concat_ws(
      ' ',
      btrim(given_name),
      btrim(surname)
    )
  );

-- SOURCE: supabase/migrations/20261005173208_case_passenger_classification.sql
-- Passenger classification is calculated for a specific travel date.
-- Profile defaults are not authoritative for a journey.

create or replace function public.passenger_age_on(
  p_dob date,
  p_travel_date date
)
returns integer
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_age integer;
begin
  if p_dob is null
    or p_travel_date is null
    or not isfinite(p_dob)
    or not isfinite(p_travel_date)
    or p_dob < date '0001-01-01'
    or p_travel_date < p_dob then
    raise exception 'Valid DOB and travel date are required';
  end if;

  v_age :=
    extract(year from p_travel_date)::integer
    - extract(year from p_dob)::integer;

  if (
    extract(month from p_travel_date),
    extract(day from p_travel_date)
  ) < (
    extract(month from p_dob),
    extract(day from p_dob)
  ) then
    v_age := v_age - 1;
  end if;

  if v_age > 130 then
    raise exception 'Age at departure must not exceed 130 years';
  end if;

  return v_age;
end;
$$;

create or replace function public.passenger_type_on(
  p_dob date,
  p_travel_date date
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_age integer;
begin
  v_age := public.passenger_age_on(p_dob, p_travel_date);

  return case
    when v_age < 2 then 'INF'
    when v_age < 12 then 'CHD'
    else 'ADT'
  end;
end;
$$;

revoke all on function public.passenger_age_on(date, date)
  from public, anon, authenticated;

revoke all on function public.passenger_type_on(date, date)
  from public, anon, authenticated;

grant execute on function public.passenger_age_on(date, date)
  to authenticated;

grant execute on function public.passenger_type_on(date, date)
  to authenticated;
  -- Add a traveller to a case with server-calculated classification.
-- Case counts represent the planned passenger breakdown.

create or replace function public.assign_case_traveller(
  p_case_id uuid,
  p_traveller_id uuid,
  p_expected_dob date,
  p_accompanying_adult_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_case public.cases%rowtype;
  v_traveller public.travellers%rowtype;
  v_adult public.case_travellers%rowtype;
  v_adult_dob date;
  v_age integer;
  v_type text;
  v_limit integer;
  v_count integer;
  v_id uuid;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  -- Serialize assignments for this case.
  select * into v_case
  from public.cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Case not found';
  end if;

  if v_case.status in ('booked', 'ticketed', 'closed') then
    raise exception 'Booked, ticketed or closed cases require a separate passenger change review';
  end if;

  if v_case.return_date is not null
    and v_case.return_date < v_case.departure_date then
    raise exception 'Return date must not precede departure date';
  end if;

  select * into v_traveller
  from public.travellers
  where id = p_traveller_id
  for update;

  if not found then
    raise exception 'Traveller not found';
  end if;

  if v_traveller.client_id is distinct from v_case.client_id then
    raise exception 'Traveller and case must belong to the same client';
  end if;

  if v_traveller.dob is distinct from p_expected_dob then
    raise exception 'Traveller DOB changed. Refresh before assigning';
  end if;

  if v_traveller.verification_status is distinct from 'verified' then
    raise exception 'Complete owner passport review before assigning';
  end if;

  v_age := public.passenger_age_on(
    v_traveller.dob, v_case.departure_date
  );

  v_type := public.passenger_type_on(
    v_traveller.dob, v_case.departure_date
  );

  -- A category change during the journey needs carrier-specific review.
  if v_case.return_date is not null
    and public.passenger_type_on(
      v_traveller.dob, v_case.return_date
    ) <> v_type then
    raise exception 'Passenger type changes during the journey. Airline review required';
  end if;

  if exists (
    select 1 from public.case_travellers
    where case_id = p_case_id
      and traveller_id = p_traveller_id
  ) then
    raise exception 'Traveller is already assigned to this case';
  end if;

  v_limit := case v_type
    when 'ADT' then v_case.adult_count
    when 'CHD' then v_case.child_count
    else v_case.infant_count
  end;

  select count(*) into v_count
  from public.case_travellers
  where case_id = p_case_id
    and passenger_type = v_type;

  if v_count >= v_limit then
    raise exception 'Assignment exceeds the planned passenger count for this type';
  end if;

  if v_type = 'INF' then
    if p_accompanying_adult_id is null then
      raise exception 'Select an accompanying adult for the infant';
    end if;

    select * into v_adult
    from public.case_travellers
    where id = p_accompanying_adult_id
      and case_id = p_case_id
    for update;

    if not found or v_adult.passenger_type <> 'ADT' then
      raise exception 'Accompanying adult must be an ADT assigned to the same case';
    end if;

    select dob into v_adult_dob
    from public.travellers
    where id = v_adult.traveller_id
      and client_id = v_case.client_id
      and verification_status = 'verified'
    for share;

    if not found then
      raise exception 'Accompanying adult requires verified traveller details';
    end if;

    if public.passenger_age_on(
      v_adult_dob, v_case.departure_date
    ) < 18 then
      raise exception 'Accompanying adult must be at least 18 at departure';
    end if;

    if exists (
      select 1 from public.case_travellers
      where case_id = p_case_id
        and accompanying_adult_id = p_accompanying_adult_id
        and passenger_type = 'INF'
    ) then
      raise exception 'This adult already accompanies an infant';
    end if;
  elsif p_accompanying_adult_id is not null then
    raise exception 'Adult association is only available for infant passengers';
  end if;

  insert into public.case_travellers (
    case_id,
    traveller_id,
    passenger_type,
    age_at_departure,
    accompanying_adult_id,
    classification_source,
    user_id
  )
  values (
    p_case_id,
    p_traveller_id,
    v_type,
    v_age,
    p_accompanying_adult_id,
    'dob_calculated',
    v_owner
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.assign_case_traveller(
  uuid, uuid, date, uuid
) from public, anon, authenticated;

grant execute on function public.assign_case_traveller(
  uuid, uuid, date, uuid
) to authenticated;
-- Prevent silent changes to the basis of an existing classification.
-- Reclassification requires a separate, audited workflow.

create or replace function public.guard_assigned_traveller_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.dob is distinct from old.dob
    or new.client_id is distinct from old.client_id
    or new.verification_status is distinct from old.verification_status
  ) and exists (
    select 1
    from public.case_travellers
    where traveller_id = old.id
  ) then
    raise exception
      'Traveller has case assignments. Review passenger assignments before changing DOB, client or verification status';
  end if;

  return new;
end;
$$;

create trigger guard_assigned_traveller_changes
before update of dob, client_id, verification_status
on public.travellers
for each row
execute function public.guard_assigned_traveller_changes();


create or replace function public.guard_case_passenger_basis_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.client_id is distinct from old.client_id
    or new.departure_date is distinct from old.departure_date
    or new.return_date is distinct from old.return_date
    or new.passenger_count is distinct from old.passenger_count
    or new.adult_count is distinct from old.adult_count
    or new.child_count is distinct from old.child_count
    or new.infant_count is distinct from old.infant_count
  ) and exists (
    select 1
    from public.case_travellers
    where case_id = old.id
  ) then
    raise exception
      'Case has passenger assignments. Review assignments before changing client, travel dates or passenger counts';
  end if;

  return new;
end;
$$;

create trigger guard_case_passenger_basis_changes
before update of
  client_id, departure_date, return_date,
  passenger_count, adult_count, child_count, infant_count
on public.cases
for each row
execute function public.guard_case_passenger_basis_changes();

revoke all on function public.guard_assigned_traveller_changes()
  from public, anon, authenticated;

revoke all on function public.guard_case_passenger_basis_changes()
  from public, anon, authenticated;
  -- Audit every passenger assignment in the same transaction.

create or replace function public.audit_case_passenger_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if new.user_id is distinct from v_owner then
    raise exception 'Assignment owner must match the signed-in owner';
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'case.passenger_assigned',
    'case',
    new.case_id,
    jsonb_build_object(
      'case_traveller_id', new.id,
      'traveller_id', new.traveller_id,
      'passenger_type', new.passenger_type,
      'classification_source', new.classification_source,
      'accompanying_adult_id', new.accompanying_adult_id
    ),
    v_owner
  );

  return new;
end;
$$;

create trigger audit_case_passenger_assignment
after insert on public.case_travellers
for each row
execute function public.audit_case_passenger_assignment();

revoke all on function public.audit_case_passenger_assignment()
  from public, anon, authenticated;
  -- Apply assignment validation to every insert, including direct table writes.

create or replace function public.validate_case_passenger_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_case public.cases%rowtype;
  v_traveller public.travellers%rowtype;
  v_adult public.case_travellers%rowtype;
  v_adult_dob date;
  v_age integer;
  v_type text;
  v_limit integer;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if new.user_id is distinct from v_owner then
    raise exception 'Assignment owner must match the signed-in owner';
  end if;

  select * into v_case
  from public.cases
  where id = new.case_id
  for update;

  if not found then
    raise exception 'Case not found';
  end if;

  if v_case.status in ('booked', 'ticketed', 'closed') then
    raise exception
      'Booked, ticketed or closed cases require a separate passenger change review';
  end if;

  if v_case.return_date is not null
    and v_case.return_date < v_case.departure_date then
    raise exception 'Return date must not precede departure date';
  end if;

  select * into v_traveller
  from public.travellers
  where id = new.traveller_id
  for update;

  if not found then
    raise exception 'Traveller not found';
  end if;

  if v_traveller.client_id is distinct from v_case.client_id then
    raise exception 'Traveller and case must belong to the same client';
  end if;

  if v_traveller.verification_status is distinct from 'verified' then
    raise exception 'Complete owner passport review before assigning';
  end if;

  v_age := public.passenger_age_on(
    v_traveller.dob, v_case.departure_date
  );

  v_type := public.passenger_type_on(
    v_traveller.dob, v_case.departure_date
  );

  if new.passenger_type is distinct from v_type
    or new.age_at_departure is distinct from v_age
    or new.classification_source is distinct from 'dob_calculated'
    or new.classification_override_note is not null
    or new.gds_passenger_type_code is not null then
    raise exception
      'Assignment classification must match the DOB calculation';
  end if;

  if v_case.return_date is not null
    and public.passenger_type_on(
      v_traveller.dob, v_case.return_date
    ) <> v_type then
    raise exception
      'Passenger type changes during the journey. Airline review required';
  end if;

  if exists (
    select 1 from public.case_travellers
    where case_id = new.case_id
      and traveller_id = new.traveller_id
  ) then
    raise exception 'Traveller is already assigned to this case';
  end if;

  v_limit := case v_type
    when 'ADT' then v_case.adult_count
    when 'CHD' then v_case.child_count
    else v_case.infant_count
  end;

  if (
    select count(*)
    from public.case_travellers
    where case_id = new.case_id
      and passenger_type = v_type
  ) >= v_limit then
    raise exception
      'Assignment exceeds the planned passenger count for this type';
  end if;

  if v_type = 'INF' then
    if new.accompanying_adult_id is null then
      raise exception 'Select an accompanying adult for the infant';
    end if;

    select * into v_adult
    from public.case_travellers
    where id = new.accompanying_adult_id
      and case_id = new.case_id
    for update;

    if not found or v_adult.passenger_type <> 'ADT' then
      raise exception
        'Accompanying adult must be an ADT assigned to the same case';
    end if;

    select dob into v_adult_dob
    from public.travellers
    where id = v_adult.traveller_id
      and client_id = v_case.client_id
      and verification_status = 'verified'
    for share;

    if not found then
      raise exception
        'Accompanying adult requires verified traveller details';
    end if;

    if public.passenger_age_on(
      v_adult_dob, v_case.departure_date
    ) < 18 then
      raise exception
        'Accompanying adult must be at least 18 at departure';
    end if;

    if exists (
      select 1 from public.case_travellers
      where case_id = new.case_id
        and accompanying_adult_id = new.accompanying_adult_id
        and passenger_type = 'INF'
    ) then
      raise exception 'This adult already accompanies an infant';
    end if;
  elsif new.accompanying_adult_id is not null then
    raise exception
      'Adult association is only available for infant passengers';
  end if;

  return new;
end;
$$;

create trigger validate_case_passenger_insert
before insert on public.case_travellers
for each row
execute function public.validate_case_passenger_insert();

revoke all on function public.validate_case_passenger_insert()
  from public, anon, authenticated;
  -- Assignments are replaced through audited removal and reassignment.
-- Removal does not delete the traveller profile.

create or replace function public.guard_case_passenger_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_case public.cases%rowtype;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if tg_op = 'UPDATE' then
    raise exception
      'Remove and reassign the passenger instead of updating an assignment';
  end if;

  select * into v_case
  from public.cases
  where id = old.case_id
  for update;

  if not found then
    raise exception
      'Remove passenger assignments before deleting the case';
  end if;

  if v_case.status in ('booked', 'ticketed', 'closed') then
    raise exception
      'Booked, ticketed or closed cases require a separate passenger change review';
  end if;

  if exists (
    select 1
    from public.case_travellers
    where accompanying_adult_id = old.id
  ) then
    raise exception
      'Remove the linked infant assignment before removing this adult';
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'case.passenger_removed',
    'case',
    old.case_id,
    jsonb_build_object(
      'case_traveller_id', old.id,
      'traveller_id', old.traveller_id,
      'passenger_type', old.passenger_type,
      'classification_source', old.classification_source,
      'accompanying_adult_id', old.accompanying_adult_id
    ),
    v_owner
  );

  return old;
end;
$$;

create trigger guard_case_passenger_changes
before update or delete on public.case_travellers
for each row
execute function public.guard_case_passenger_changes();

revoke all on function public.guard_case_passenger_changes()
  from public, anon, authenticated;

-- SOURCE: supabase/migrations/20261006112730_passport_date_safeguards.sql
-- Data-entry safeguards, not airline or immigration eligibility rules.

create or replace function public.validate_passport_dates(
  p_dob date,
  p_expiry_date date,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_age integer;
  v_age_unusual boolean;
  v_expiry_unusual boolean;
begin
  if p_dob is null
    or not isfinite(p_dob)
    or p_dob < date '0001-01-01'
    or p_dob > v_today then
    raise exception
      'Date of birth must be valid and not in the future.';
  end if;

  v_age := public.passenger_age_on(p_dob, v_today);

  if p_expiry_date is null
    or not isfinite(p_expiry_date)
    or p_expiry_date > date '9999-12-31'
    or p_expiry_date <= p_dob then
    raise exception
      'Passport expiry date must be valid and after date of birth.';
  end if;

  v_age_unusual := v_age > 100;
  v_expiry_unusual :=
    p_expiry_date > (v_today + interval '10 years')::date;

  if v_age_unusual
    and p_age_confirmed is distinct from true then
    raise exception
      'Confirm the DOB against the passport because age exceeds 100 years.';
  end if;

  if v_expiry_unusual
    and p_expiry_confirmed is distinct from true then
    raise exception
      'Confirm the expiry against the passport because it is more than 10 years from today.';
  end if;

  return jsonb_build_object(
    'reference_date', v_today,
    'age', v_age,
    'age_requires_confirmation', v_age_unusual,
    'expiry_requires_confirmation', v_expiry_unusual,
    'age_confirmed',
      v_age_unusual and coalesce(p_age_confirmed, false),
    'expiry_confirmed',
      v_expiry_unusual and coalesce(p_expiry_confirmed, false)
  );
end;
$$;

revoke all on function public.validate_passport_dates(
  date, date, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.validate_passport_dates(
  date, date, boolean, boolean
) to authenticated;
create or replace function public.create_traveller_with_date_review(
  p_client_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_image_path text,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller_id uuid;
  v_date_review jsonb;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob,
    p_expiry_date,
    p_age_confirmed,
    p_expiry_confirmed
  );

  v_traveller_id := public.create_traveller_atomic(
    p_client_id,
    p_given_name,
    p_surname,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    p_image_path
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, details, user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      v_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'manual_creation'
      ),
      v_owner
    );
  end if;

  return v_traveller_id;
end;
$$;

revoke all on function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
) to authenticated;
create or replace function public.confirm_passport_draft_with_date_review(
  p_draft_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller_id uuid;
  v_date_review jsonb;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob,
    p_expiry_date,
    p_age_confirmed,
    p_expiry_confirmed
  );

  v_traveller_id := public.confirm_passport_draft(
    p_draft_id,
    p_given_name,
    p_surname,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    p_field_checks
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, details, user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      v_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'passport_draft_confirmation',
        'draft_id', p_draft_id
      ),
      v_owner
    );
  end if;

  return v_traveller_id;
end;
$$;

revoke all on function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
) to authenticated;
create or replace function public.correct_traveller_with_date_review(
  p_traveller_id uuid,
  p_expected_fields jsonb,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb,
  p_reason text,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller_id uuid;
  v_date_review jsonb;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob,
    p_expiry_date,
    p_age_confirmed,
    p_expiry_confirmed
  );

  v_traveller_id := public.correct_traveller_details(
    p_traveller_id,
    p_expected_fields,
    p_given_name,
    p_surname,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    p_field_checks,
    p_reason
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, details, user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      v_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'traveller_correction'
      ),
      v_owner
    );
  end if;

  return v_traveller_id;
end;
$$;

revoke all on function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text, jsonb, text,
  boolean, boolean
) from public, anon, authenticated;

grant execute on function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text, jsonb, text,
  boolean, boolean
) to authenticated;

-- SOURCE: supabase/migrations/20261006182022_passport_expiry_current_date_guard.sql
-- App confirmation policy: passport expiry must be after today.
-- Existing records remain unchanged.

create or replace function public.validate_passport_dates(
  p_dob date,
  p_expiry_date date,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_age integer;
  v_age_unusual boolean;
  v_expiry_unusual boolean;
begin
  if p_dob is null
    or not isfinite(p_dob)
    or p_dob < date '0001-01-01'
    or p_dob > v_today then
    raise exception
      'Date of birth must be valid and not in the future.';
  end if;

  v_age := public.passenger_age_on(p_dob, v_today);

  if p_expiry_date is null
    or not isfinite(p_expiry_date)
    or p_expiry_date > date '9999-12-31'
    or p_expiry_date <= p_dob then
    raise exception
      'Passport expiry date must be valid and after date of birth.';
  end if;

  if p_expiry_date < v_today then
    raise exception
      'Passport has expired. Enter the renewed passport details before confirming.';
  end if;

  if p_expiry_date = v_today then
    raise exception
      'Passport expires today. Enter the renewed passport details before confirming.';
  end if;

  v_age_unusual := v_age > 100;
  v_expiry_unusual :=
    p_expiry_date > (v_today + interval '10 years')::date;

  if v_age_unusual
    and p_age_confirmed is distinct from true then
    raise exception
      'Confirm the DOB against the passport because age exceeds 100 years.';
  end if;

  if v_expiry_unusual
    and p_expiry_confirmed is distinct from true then
    raise exception
      'Confirm the expiry against the passport because it is more than 10 years from today.';
  end if;

  return jsonb_build_object(
    'reference_date', v_today,
    'age', v_age,
    'age_requires_confirmation', v_age_unusual,
    'expiry_requires_confirmation', v_expiry_unusual,
    'age_confirmed',
      v_age_unusual and coalesce(p_age_confirmed, false),
    'expiry_confirmed',
      v_expiry_unusual and coalesce(p_expiry_confirmed, false)
  );
end;
$$;

revoke all on function public.validate_passport_dates(
  date, date, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.validate_passport_dates(
  date, date, boolean, boolean
) to authenticated;

-- SOURCE: supabase/migrations/20261006204203_owner_role_write_enforcement.sql
-- Owner profiles are provisioned through trusted administration.
-- Client roles may read their owner profile but cannot change it.

alter table public.app_users enable row level security;

revoke all privileges on table public.app_users
  from public, anon, authenticated;

grant select on table public.app_users to authenticated;

drop policy if exists owner_self_all
  on public.app_users;

drop policy if exists owner_self_select
  on public.app_users;

create policy owner_self_select
  on public.app_users
  for select
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    and role = 'owner'
  );

-- SOURCE: supabase/migrations/20261006205613_traveller_review_write_enforcement.sql
-- Approved review entry points retain their existing owner checks,
-- date validation, transaction boundaries and audit writes.
-- Direct-write revocations and helper restrictions follow below.

alter function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
)
  security definer;

alter function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
)
  set search_path = '';

alter function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
)
  security definer;

alter function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
)
  set search_path = '';

alter function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text,
  jsonb, text, boolean, boolean
)
  security definer;

alter function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text,
  jsonb, text, boolean, boolean
)
  set search_path = '';

revoke all on function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
) from public, anon, authenticated;

revoke all on function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
) from public, anon, authenticated;

revoke all on function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text,
  jsonb, text, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
) to authenticated;

grant execute on function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
) to authenticated;

grant execute on function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text,
  jsonb, text, boolean, boolean
) to authenticated;
-- Legacy write functions remain internal dependencies.
-- Client roles cannot call them directly to bypass date review.













-- Preserve passenger assignment after traveller UPDATE is revoked.
-- This function locks traveller rows and invokes validation/audit triggers.

alter function public.assign_case_traveller(
  uuid, uuid, date, uuid
)
  security definer;

alter function public.assign_case_traveller(
  uuid, uuid, date, uuid
)
  set search_path = '';

revoke all on function public.assign_case_traveller(
  uuid, uuid, date, uuid
) from public, anon, authenticated;

grant execute on function public.assign_case_traveller(
  uuid, uuid, date, uuid
) to authenticated;
-- Traveller writes must go through the approved review functions.
-- Directory and review pages retain SELECT access under existing RLS.



grant select on table public.travellers
  to authenticated;

-- Passenger assignment writes must go through the approved RPC.
-- This also removes the previously detected TRUNCATE permission.



grant select on table public.case_travellers
  to authenticated;
  -- Register an uploaded passport image and its audit atomically.
create or replace function public.create_passport_review_draft(
  p_client_id uuid,
  p_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_draft_id uuid;
  v_existing public.passport_extraction_drafts%rowtype;
  v_path text := btrim(p_image_path);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_path is null
    or char_length(v_path) not between 1 and 1024
    or v_path not like 'drafts/%' then
    raise exception 'Invalid passport image path';
  end if;

  if not exists (
    select 1 from public.clients
    where id = p_client_id
  ) then
    raise exception 'Client not found';
  end if;

  -- SECURITY DEFINER bypasses Storage RLS, so check ownership explicitly.
  perform 1
  from storage.objects
  where bucket_id = 'passports'
    and name = v_path
    and owner_id = auth.uid()::text
  for update;

  if not found then
    raise exception 'Passport image not found or inaccessible';
  end if;

  select * into v_existing
  from public.passport_extraction_drafts
  where image_path = v_path
  for update;

  if found then
    if v_existing.client_id = p_client_id
      and v_existing.created_by = v_owner then
      return v_existing.id;
    end if;

    raise exception 'Passport image is already registered';
  end if;
  insert into public.passport_extraction_drafts (
    client_id, image_path, status, created_by
  )
  values (
    p_client_id, v_path, 'uploaded', v_owner
  )
  returning id into v_draft_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'passport_draft.uploaded',
    'passport_draft',
    v_draft_id,
    jsonb_build_object('client_id', p_client_id),
    v_owner
  );

  return v_draft_id;

exception
  when no_data_found then
    raise exception 'Owner access required';
end;
$$;

revoke all on function public.create_passport_review_draft(
  uuid, text
) from public, anon, authenticated;

grant execute on function public.create_passport_review_draft(
  uuid, text
) to authenticated;
-- Save assistive extraction without confirming traveller details.
create or replace function public.save_passport_draft_extraction(
  p_draft_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_extracted_fields jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_draft public.passport_extraction_drafts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if jsonb_typeof(p_extracted_fields) is distinct from 'object'
    or octet_length(p_extracted_fields::text) > 16384 then
    raise exception 'Invalid extracted passport fields';
  end if;

  select * into v_draft
  from public.passport_extraction_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'Passport draft not found';
  end if;

  if v_draft.status is distinct from p_expected_status
    or v_draft.updated_at is distinct from p_expected_updated_at then
    raise exception 'The draft changed. Refresh before continuing.';
  end if;

  if v_draft.status not in ('uploaded', 'extraction_failed')
    or v_draft.confirmed_traveller_id is not null then
    raise exception 'This draft is not available for extraction.';
  end if;

  update public.passport_extraction_drafts
  set
    extracted_fields = p_extracted_fields,
    provider_name = 'openai:gpt-4.1-mini',
    confidence_by_field = '{}'::jsonb,
    evidence_by_field = '{}'::jsonb,
    extraction_error_code = null,
    status = 'awaiting_review',
    updated_at = clock_timestamp()
  where id = p_draft_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'passport_draft.extraction_saved',
    'passport_draft',
    p_draft_id,
    jsonb_build_object(
      'source', 'assistive_extraction',
      'review_required', true
    ),
    v_owner
  );

  return p_draft_id;
end;
$$;

revoke all on function public.save_passport_draft_extraction(
  uuid, text, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.save_passport_draft_extraction(
  uuid, text, timestamptz, jsonb
) to authenticated;
-- Draft writes use approved registration, extraction and review RPCs.
-- Queue and review pages retain SELECT access under existing RLS.



grant select on table public.passport_extraction_drafts
  to authenticated;
  -- Link existing payment/ticket uploads without changing financial status.
-- Passport document links remain internal to traveller review RPCs.
create or replace function public.link_operational_document(
  p_entity_type text,
  p_entity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_path text;
  v_bucket text;
  v_file_type text;
  v_document_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if p_entity_type = 'payment' then
    select evidence_file_path into v_path
    from public.payments
    where id = p_entity_id and user_id = v_owner
    for update;

    if not found then
      raise exception 'Payment not found or inaccessible';
    end if;

    v_bucket := 'payment-evidence';
    v_file_type := 'payment_evidence';

  elsif p_entity_type = 'ticket' then
    select e_ticket_path into v_path
    from public.tickets
    where id = p_entity_id
      and user_id = v_owner
      and issued_by = v_owner
    for update;

    if not found then
      raise exception 'Ticket not found or inaccessible';
    end if;

    v_bucket := 'e-tickets';
    v_file_type := 'e_ticket';

  else
    raise exception 'Unsupported document entity';
  end if;

  if nullif(btrim(v_path), '') is null then
    raise exception 'Document file path is missing';
  end if;

  perform 1
  from storage.objects
  where bucket_id = v_bucket
    and name = v_path
    and owner_id = auth.uid()::text
  for share;

  if not found then
    raise exception 'Document upload not found or inaccessible';
  end if;

  select id into v_document_id
  from public.documents
  where entity_type = p_entity_type
    and entity_id = p_entity_id
    and file_type = v_file_type
    and file_path = v_path
    and user_id = v_owner
  order by id
  limit 1;

  if found then
    return v_document_id;
  end if;

  insert into public.documents (
    entity_type, entity_id, file_path, file_type, user_id
  )
  values (
    p_entity_type, p_entity_id, v_path, v_file_type, v_owner
  )
  returning id into v_document_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'document.linked',
    p_entity_type,
    p_entity_id,
    jsonb_build_object(
      'document_id', v_document_id,
      'file_type', v_file_type
    ),
    v_owner
  );

  return v_document_id;
end;
$$;

revoke all on function public.link_operational_document(
  text, uuid
) from public, anon, authenticated;

grant execute on function public.link_operational_document(
  text, uuid
) to authenticated;
-- Document metadata writes must use approved owner-checked RPCs.
-- Authenticated reads remain subject to existing RLS policies.



grant select on table public.documents
to authenticated;
-- Compatibility audit endpoint for existing operational actions.
-- Protected review events are written only by their workflow RPCs.
-- This endpoint does not make separate business writes atomic.

create or replace function public.record_operational_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_allowed boolean;
  v_audit_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_allowed := case p_entity_type
    when 'case' then p_action = any(array[
      'case.created',
      'case.status_changed',
      'case.ai_draft_confirmed'
    ])
    when 'client' then p_action = any(array[
      'client.created', 'client.updated', 'client.deleted'
    ])
    when 'quotation' then p_action = any(array[
      'quotation.created', 'quotation.draft',
      'quotation.approved', 'quotation.sent',
      'quotation.accepted', 'quotation.rejected'
    ])
    when 'booking' then p_action = 'booking.created'
    when 'payment' then p_action = any(array[
      'payment.evidence_submitted',
      'payment.verified', 'payment.rejected'
    ])
    when 'ticket' then p_action = 'ticket.issued'
    when 'reminder' then p_action = 'reminder.scheduled'
    when 'owner_alert' then p_action = any(array[
      'owner_alert.acknowledged', 'owner_alert.dismissed'
    ])
    when 'service_case' then p_action = any(array[
      'service_case.requested', 'service_case.in_review',
      'service_case.accepted', 'service_case.completed',
      'service_case.rejected'
    ])
    when 'inquiry' then p_action = 'inquiry.converted'
    else false
  end;

  if v_allowed is distinct from true then
    raise exception 'Unsupported operational audit event';
  end if;

  if p_entity_id is null then
    raise exception 'Audit entity ID is required';
  end if;

  if jsonb_typeof(p_details) is distinct from 'object'
    or octet_length(p_details::text) > 65536 then
    raise exception 'Invalid audit details';
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner, p_action, p_entity_type,
    p_entity_id, p_details, v_owner
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke all on function public.record_operational_audit(
  text, text, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.record_operational_audit(
  text, text, uuid, jsonb
) to authenticated;
-- Audit writes must use approved RPCs and workflow triggers.
-- Existing RLS policies still control authenticated reads.



grant select on table public.audit_logs
to authenticated;
-- Explicit upload ownership check before privileged traveller creation.
create or replace function public.create_traveller_with_date_review(
  p_client_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_image_path text,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller_id uuid;
  v_date_review jsonb;
  v_path text := nullif(btrim(p_image_path), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob, p_expiry_date,
    p_age_confirmed, p_expiry_confirmed
  );

  if v_path is not null then
    if char_length(v_path) > 1024 then
      raise exception 'Passport image not found or inaccessible';
    end if;

    perform 1
    from storage.objects
    where bucket_id = 'passports'
      and name = v_path
      and owner_id = auth.uid()::text
    for share;

    if not found then
      raise exception 'Passport image not found or inaccessible';
    end if;
  end if;

  v_traveller_id := public.create_traveller_atomic(
    p_client_id,
    p_given_name,
    p_surname,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    v_path
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, details, user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      v_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'manual_creation'
      ),
      v_owner
    );
  end if;

  return v_traveller_id;
end;
$$;

revoke all on function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
) to authenticated;
-- Validate the registered image before privileged draft confirmation.
create or replace function public.confirm_passport_draft_with_date_review(
  p_draft_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_draft public.passport_extraction_drafts%rowtype;
  v_traveller_id uuid;
  v_date_review jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob, p_expiry_date,
    p_age_confirmed, p_expiry_confirmed
  );

  select * into v_draft
  from public.passport_extraction_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'Passport draft not found';
  end if;

  if v_draft.status = 'confirmed'
    or v_draft.confirmed_traveller_id is not null then
    raise exception 'Passport draft is already confirmed';
  end if;

  if v_draft.status is null
    or v_draft.status not in (
      'uploaded', 'awaiting_review', 'extraction_failed'
    ) then
    raise exception 'Passport draft is not available for review';
  end if;

  -- Any authorized owner may review the draft.
  -- The image must belong to the owner who registered it.
  perform 1
  from storage.objects o
  join public.app_users u
    on o.owner_id = u.auth_user_id::text
  where o.bucket_id = 'passports'
    and o.name = v_draft.image_path
    and u.id = v_draft.created_by
    and u.role = 'owner'
  for share of o, u;

  if not found then
    raise exception 'Passport image not found or inaccessible';
  end if;

  v_traveller_id := public.confirm_passport_draft(
    p_draft_id,
    p_given_name,
    p_surname,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    p_field_checks
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, details, user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      v_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'passport_draft_confirmation',
        'draft_id', p_draft_id
      ),
      v_owner
    );
  end if;

  return v_traveller_id;
end;
$$;

revoke all on function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
) to authenticated;
-- Prevent traveller deletion through parent-table cascades.
-- No traveller deletion workflow is currently approved.

create or replace function public.block_traveller_deletion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception
    'Traveller deletion requires an approved deletion workflow';
end;
$$;

revoke all on function public.block_traveller_deletion()
from public, anon, authenticated;

create trigger travellers_block_deletion
before delete on public.travellers
for each row
execute function public.block_traveller_deletion();


-- SOURCE: supabase/migrations/20261007191905_traveller_review_permission_cutover.sql
-- Apply only after production Server Actions use approved RPCs.
-- Preserve authenticated reads under existing RLS policies.

revoke all privileges on table
  public.travellers,
  public.case_travellers,
  public.passport_extraction_drafts,
  public.documents,
  public.audit_logs
from public, anon, authenticated;

grant select on table
  public.travellers,
  public.case_travellers,
  public.passport_extraction_drafts,
  public.documents,
  public.audit_logs
to authenticated;

-- Legacy helpers remain callable internally by privileged RPCs.
-- Direct client execution is prohibited.

revoke all on function public.create_traveller_atomic(
  uuid, text, text, date, date, text, text
) from public, anon, authenticated;

revoke all on function public.create_traveller_atomic(
  uuid, text, text, text, date, date, text, text
) from public, anon, authenticated;

revoke all on function public.confirm_passport_draft(
  uuid, text, text, date, date, text, jsonb
) from public, anon, authenticated;

revoke all on function public.confirm_passport_draft(
  uuid, text, text, text, date, date, text, jsonb
) from public, anon, authenticated;

revoke all on function public.correct_traveller_details(
  uuid, jsonb, text, text, date, date, text, jsonb, text
) from public, anon, authenticated;

revoke all on function public.correct_traveller_details(
  uuid, jsonb, text, text, text, date, date, text, jsonb, text
) from public, anon, authenticated;

-- SOURCE: supabase/migrations/20261007200438_harden_internal_trigger_functions.sql
-- Internal trigger functions are not client RPC entry points.
-- Preserve their bodies and existing trigger bindings.

alter function public.prevent_reminder_attempt_change()
  set search_path = '';

revoke all on function public.prevent_reminder_attempt_change()
  from public, anon, authenticated;

-- Platform helper is absent on this fresh project. Harden it only if present.
do $staging_platform_guard$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$staging_platform_guard$;

-- SOURCE: supabase/migrations/20261008100234_client_selection_and_quick_creation.sql
-- Corporate and individual clients remain separate client accounts.
-- Existing client records keep their IDs and relationships.

alter table public.clients
  add column client_type text not null default 'corporate';

alter table public.clients
  add constraint clients_client_type_check
  check (client_type in ('corporate', 'individual'));

comment on column public.clients.client_type is
  'corporate: company account; individual: personal or retail account';

-- Non-unique lookup index. Existing duplicate records are preserved.
create index clients_type_normalized_name_idx
  on public.clients (
    client_type,
    lower(btrim(company_name))
  );
  -- Each quick-create submission has a stable request UUID.
-- Existing records do not need a request UUID.

alter table public.clients
  add column creation_request_id uuid;

create unique index clients_creation_request_id_unique
  on public.clients (creation_request_id)
  where creation_request_id is not null;

comment on column public.clients.creation_request_id is
  'Idempotency key for client creation; reuse the same UUID when retrying a submission';
  create or replace function public.create_client_with_review(
  p_request_id uuid,
  p_client_type text,
  p_company_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_id uuid;
  v_existing public.clients%rowtype;

  v_type text := btrim(coalesce(p_client_type, ''));
  v_company text := regexp_replace(
    btrim(coalesce(p_company_name, '')),
    '[[:space:]]+', ' ', 'g'
  );
  v_contact text := regexp_replace(
    btrim(coalesce(p_contact_name, '')),
    '[[:space:]]+', ' ', 'g'
  );
  v_email text := nullif(
    lower(btrim(coalesce(p_contact_email, ''))), ''
  );
  v_phone text := nullif(
    btrim(coalesce(p_contact_phone, '')), ''
  );
  v_name_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if p_request_id is null then
    raise exception 'Client creation request ID required';
  end if;

  if v_type not in ('corporate', 'individual') then
    raise exception 'Select a valid client type';
  end if;

  if char_length(v_contact) not between 1 and 200 then
    raise exception 'Contact name must contain 1 to 200 characters';
  end if;

  -- Keep compatibility with existing company_name-based pages.
  -- For personal accounts, the display name is the contact name.
  if v_type = 'individual' then
    v_company := v_contact;
  end if;

  if char_length(v_company) not between 1 and 200 then
    raise exception 'Company name must contain 1 to 200 characters';
  end if;

  if char_length(coalesce(v_email, '')) > 254 then
    raise exception 'Email must be at most 254 characters';
  end if;

  if v_email is not null
    and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'Enter a valid email address';
  end if;

  if char_length(coalesce(v_phone, '')) > 50 then
    raise exception 'Phone must be at most 50 characters';
  end if;

  -- Serialize retries of the same submission.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'client-request:' || p_request_id::text, 0
    )
  );

  select * into v_existing
  from public.clients
  where creation_request_id = p_request_id
  for update;

  if found then
    if v_existing.user_id is distinct from v_owner
      or v_existing.client_type is distinct from v_type
      or v_existing.company_name is distinct from v_company
      or v_existing.contact_name is distinct from v_contact
      or v_existing.contact_email is distinct from v_email
      or v_existing.contact_phone is distinct from v_phone
    then
      raise exception 'Client creation request conflicts with an existing submission';
    end if;

    return v_existing.id;
  end if;

  if v_type = 'corporate' then
    v_name_key := lower(v_company);

    -- Serialize new corporate accounts with the same name.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'corporate-client:' || v_name_key, 0
      )
    );

    if exists (
      select 1
      from public.clients
      where client_type = 'corporate'
        and lower(
          regexp_replace(
            btrim(company_name),
            '[[:space:]]+', ' ', 'g'
          )
        ) = v_name_key
    ) then
      raise exception 'Company already exists. Select the existing corporate client';
    end if;
  end if;

  insert into public.clients (
    client_type,
    company_name,
    contact_name,
    contact_email,
    contact_phone,
    user_id,
    creation_request_id
  )
  values (
    v_type,
    v_company,
    v_contact,
    v_email,
    v_phone,
    v_owner,
    p_request_id
  )
  returning id into v_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details
  )
  values (
    v_owner,
    'client.created',
    'client',
    v_id,
    jsonb_build_object(
      'client_type', v_type,
      'workflow', 'client_quick_creation'
    )
  );

  return v_id;

exception
  when no_data_found then
    raise exception 'Owner access required';
end;
$$;

alter function public.create_client_with_review(
  uuid, text, text, text, text, text
) owner to postgres;

revoke all on function public.create_client_with_review(
  uuid, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_client_with_review(
  uuid, text, text, text, text, text
) to authenticated;

-- SOURCE: supabase/migrations/20261008201359_corporate_client_identity_enforcement.sql

-- Consolidate only the four reviewed Premier Group accounts.
-- Preserve traveller IDs and historical audit records.

lock table
  public.clients,
  public.travellers,
  public.cases,
  public.passport_extraction_drafts,
  public.inquiries,
  public.case_travellers
in share row exclusive mode;

do $$
declare
  v_ids uuid[] := array[
    'dfeb9e2f-b5e6-4e15-8ebd-5c54ff415694'::uuid,
    '7f9ea86e-13b1-4a23-8e28-970f8a741af2'::uuid,
    '16c950ac-895c-4bde-9534-3f69f7acdd59'::uuid,
    'f528c626-f42b-42f9-b280-8b81cd6309c3'::uuid
  ];
begin
  -- Fresh databases do not contain these reviewed account IDs.
  if not exists (
    select 1
    from public.clients
    where id = any(v_ids)
  ) then
    return;
  end if;

  if (
    select count(*)
    from public.clients
    where id = any(v_ids)
      and client_type = 'corporate'
      and lower(regexp_replace(
        btrim(company_name), '[[:space:]]+', ' ', 'g'
      )) = 'premier group'
  ) <> 4 then
    raise exception
      'Preflight failed: expected four reviewed Premier Group accounts';
  end if;

  if exists (
    select 1
    from public.case_travellers ct
    join public.travellers t on t.id = ct.traveller_id
    join public.cases c on c.id = ct.case_id
    where t.client_id = any(v_ids)
       or c.client_id = any(v_ids)
  ) then
    raise exception
      'Preflight failed: passenger assignments require separate consolidation review';
  end if;

  if exists (
    select upper(btrim(passport_number))
    from public.travellers
    where client_id = any(v_ids)
      and nullif(btrim(passport_number), '') is not null
    group by upper(btrim(passport_number))
    having count(*) > 1
  ) then
    raise exception
      'Preflight failed: conflicting traveller passports require review';
  end if;
end;
$$;
do $$
declare
  v_canonical uuid :=
    'dfeb9e2f-b5e6-4e15-8ebd-5c54ff415694'::uuid;

  v_duplicates uuid[] := array[
    '7f9ea86e-13b1-4a23-8e28-970f8a741af2'::uuid,
    '16c950ac-895c-4bde-9534-3f69f7acdd59'::uuid,
    'f528c626-f42b-42f9-b280-8b81cd6309c3'::uuid
  ];

  v_actor uuid;
  v_travellers bigint;
  v_cases bigint;
  v_drafts bigint;
  v_inquiries bigint;
  v_deleted bigint;
begin
  -- Skip account maintenance when none of the reviewed IDs exist.
  if not exists (
    select 1
    from public.clients
    where id = v_canonical
       or id = any(v_duplicates)
  ) then
    return;
  end if;
  -- Attribute this reviewed maintenance operation to the existing owner.
  select id into strict v_actor
  from public.app_users
  where id = '00000000-0000-0000-0000-000000000001'::uuid
    and role = 'owner'
    and auth_user_id is not null;

  update public.travellers
  set client_id = v_canonical
  where client_id = any(v_duplicates);
  get diagnostics v_travellers = row_count;

  update public.cases
  set client_id = v_canonical
  where client_id = any(v_duplicates);
  get diagnostics v_cases = row_count;

  update public.passport_extraction_drafts
  set client_id = v_canonical
  where client_id = any(v_duplicates);
  get diagnostics v_drafts = row_count;

  update public.inquiries
  set matched_client_id = v_canonical
  where matched_client_id = any(v_duplicates);
  get diagnostics v_inquiries = row_count;

  delete from public.clients
  where id = any(v_duplicates);
  get diagnostics v_deleted = row_count;

  if v_deleted <> 3 then
    raise exception
      'Consolidation failed: expected three duplicate company rows';
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    details,
    user_id
  )
  values (
    v_actor,
    'client.consolidated',
    'client',
    v_canonical,
    jsonb_build_object(
      'workflow', 'reviewed_database_migration',
      'migration', '20261008201359',
      'canonical_client_id', v_canonical,
      'removed_client_ids', to_jsonb(v_duplicates),
      'travellers_relinked', v_travellers,
      'cases_relinked', v_cases,
      'drafts_relinked', v_drafts,
      'inquiries_relinked', v_inquiries,
      'traveller_profiles_deleted', 0
    ),
    v_actor
  );
end;
$$;
-- Match the corporate-name normalization used by the creation RPC.
-- Fail rather than silently consolidate any unreviewed duplicate group.

do $$
begin
  if exists (
    select lower(regexp_replace(
      btrim(company_name), '[[:space:]]+', ' ', 'g'
    ))
    from public.clients
    where client_type = 'corporate'
    group by lower(regexp_replace(
      btrim(company_name), '[[:space:]]+', ' ', 'g'
    ))
    having count(*) > 1
  ) then
    raise exception
      'Corporate uniqueness failed: unreviewed duplicate companies remain';
  end if;
end;
$$;

create unique index clients_corporate_name_unique
on public.clients (
  lower(regexp_replace(
    btrim(company_name), '[[:space:]]+', ' ', 'g'
  ))
)
where client_type = 'corporate';

comment on index public.clients_corporate_name_unique is
  'Corporate account names are unique after case and whitespace normalization; individual accounts are excluded';
  create or replace function public.lookup_corporate_traveller(
  p_client_id uuid,
  p_passport_number text
)
returns table (
  id uuid,
  given_name text,
  surname text,
  full_name text,
  verification_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_passport text := upper(btrim(coalesce(p_passport_number, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.app_users u
    where u.auth_user_id = auth.uid()
      and u.role = 'owner'
  ) then
    raise exception 'Owner access required';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.client_type = 'corporate'
  ) then
    raise exception 'Select a valid corporate client';
  end if;

  if char_length(v_passport) not between 1 and 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  return query
  select
    t.id,
    t.given_name::text,
    t.surname::text,
    t.full_name::text,
    t.verification_status::text
  from public.travellers t
  where t.client_id = p_client_id
    and upper(btrim(t.passport_number)) = v_passport
    and nullif(btrim(t.passport_number), '') is not null;
end;
$$;

revoke all on function public.lookup_corporate_traveller(
  uuid, text
) from public, anon, authenticated;

grant execute on function public.lookup_corporate_traveller(
  uuid, text
) to authenticated;



-- SOURCE: supabase/migrations/20261010173316_returning_corporate_passport_draft_review.sql
-- Link a reviewed corporate passport draft to an existing profile.
-- Traveller details remain unchanged.
-- Document linking, draft confirmation and audit are atomic.

create or replace function public.confirm_returning_corporate_passport_draft(
  p_draft_id uuid,
  p_traveller_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_draft public.passport_extraction_drafts%rowtype;
  v_traveller public.travellers%rowtype;
  v_document_id uuid;
  v_document_count bigint;
  v_date_review jsonb;
  v_reviewed_fields jsonb;
  v_now timestamptz := now();

  v_given_name text :=
    nullif(upper(btrim(coalesce(p_given_name, ''))), '');

  v_surname text :=
    nullif(upper(btrim(coalesce(p_surname, ''))), '');

  v_passport text :=
    upper(btrim(coalesce(p_passport_number, '')));

  v_nationality text :=
    upper(btrim(coalesce(p_nationality, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select u.id into v_owner
  from public.app_users u
  where u.auth_user_id = auth.uid()
    and u.role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if p_draft_id is null or p_traveller_id is null then
    raise exception 'Passport draft and traveller are required';
  end if;

  if jsonb_typeof(p_field_checks) is distinct from 'object'
    or (p_field_checks -> 'given_name') is distinct from 'true'::jsonb
    or (p_field_checks -> 'surname') is distinct from 'true'::jsonb
    or (p_field_checks -> 'passport_number') is distinct from 'true'::jsonb
    or (p_field_checks -> 'dob') is distinct from 'true'::jsonb
    or (p_field_checks -> 'expiry_date') is distinct from 'true'::jsonb
    or (p_field_checks -> 'nationality') is distinct from 'true'::jsonb
  then
    raise exception 'Review and confirm all six passport fields';
  end if;

  if v_given_name is null and v_surname is null then
    raise exception 'Enter the passport given name or surname';
  end if;

  if char_length(v_given_name) > 100
    or char_length(v_surname) > 100 then
    raise exception 'Each name field must be at most 100 characters';
  end if;

  if char_length(concat_ws(' ', v_given_name, v_surname)) > 200 then
    raise exception 'Combined name must be at most 200 characters';
  end if;

  if char_length(v_passport) not between 1 and 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  if char_length(v_nationality) not between 1 and 100 then
    raise exception 'Nationality must contain 1 to 100 characters';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob,
    p_expiry_date,
    p_age_confirmed,
    p_expiry_confirmed
  );

  v_reviewed_fields := jsonb_build_object(
    'given_name', v_given_name,
    'surname', v_surname,
    'passport_number', v_passport,
    'dob', p_dob,
    'expiry_date', p_expiry_date,
    'nationality', v_nationality,
    'field_checks', p_field_checks
  );
    select d.* into v_draft
  from public.passport_extraction_drafts d
  where d.id = p_draft_id
  for update;

  if not found then
    raise exception 'Passport draft not found';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = v_draft.client_id
      and c.client_type = 'corporate'
  ) then
    raise exception 'Select a valid corporate client';
  end if;

  if v_draft.status = 'confirmed' then
    -- An identical retry returns the original result without new writes.
    if v_draft.confirmed_traveller_id = p_traveller_id
      and v_draft.reviewed_by = v_owner
      and v_draft.reviewed_fields = v_reviewed_fields
      and exists (
        select 1
        from public.audit_logs a
        where a.action = 'passport_draft.confirmed'
          and a.entity_type = 'passport_draft'
          and a.entity_id = p_draft_id
          and a.actor_id = v_owner
          and a.details ->> 'workflow'
            = 'returning_corporate_passport_review'
          and a.details ->> 'traveller_id'
            = p_traveller_id::text
      )
    then
      return p_traveller_id;
    end if;

    raise exception 'Passport draft is already confirmed';
  end if;

  if v_draft.confirmed_traveller_id is not null
    or v_draft.status not in (
      'uploaded', 'awaiting_review', 'extraction_failed'
    )
  then
    raise exception 'Passport draft is not available for review';
  end if;

  select t.* into v_traveller
  from public.travellers t
  where t.id = p_traveller_id
  for update;

  if not found then
    raise exception 'Traveller not found';
  end if;

  if v_traveller.client_id is distinct from v_draft.client_id then
    raise exception 'Traveller belongs to a different client';
  end if;

  if v_traveller.verification_status is distinct from 'verified' then
    raise exception 'Review and verify the existing traveller first';
  end if;

  if nullif(upper(btrim(v_traveller.given_name)), '')
      is distinct from v_given_name
    or nullif(upper(btrim(v_traveller.surname)), '')
      is distinct from v_surname
    or upper(btrim(v_traveller.passport_number))
      is distinct from v_passport
    or v_traveller.dob is distinct from p_dob
    or v_traveller.expiry_date is distinct from p_expiry_date
    or upper(btrim(v_traveller.nationality))
      is distinct from v_nationality
  then
    raise exception
      'Passport details differ. Correct the existing traveller before linking this draft';
  end if;
    -- Verify the private image belongs to the draft's owner uploader.
  perform 1
  from storage.objects o
  join public.app_users u
    on o.owner_id = u.auth_user_id::text
  where o.bucket_id = 'passports'
    and o.name = v_draft.image_path
    and u.id = v_draft.created_by
    and u.role = 'owner'
  for share of o, u;

  if not found then
    raise exception 'Passport image not found or inaccessible';
  end if;

  -- Refuse an image path already linked elsewhere or ambiguously.
  select count(*), min(d.id::text)::uuid
  into v_document_count, v_document_id
  from public.documents d
  where d.file_path = v_draft.image_path;

  if v_document_count > 1 then
    raise exception 'Passport image has conflicting document links';
  end if;

  if v_document_count = 1 then
    perform 1
    from public.documents d
    where d.id = v_document_id
      and d.entity_type = 'traveller'
      and d.entity_id = p_traveller_id
      and d.file_type = 'passport'
    for update;

    if not found then
      raise exception 'Passport image is already linked elsewhere';
    end if;
  else
    insert into public.documents (
      entity_type,
      entity_id,
      file_path,
      file_type,
      user_id
    )
    values (
      'traveller',
      p_traveller_id,
      v_draft.image_path,
      'passport',
      v_owner
    )
    returning id into v_document_id;
  end if;
    update public.passport_extraction_drafts
  set
    given_name = v_given_name,
    surname = v_surname,
    status = 'confirmed',
    reviewed_fields = v_reviewed_fields,
    confirmed_traveller_id = p_traveller_id,
    reviewed_by = v_owner,
    reviewed_at = v_now,
    updated_at = v_now
  where id = p_draft_id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    details,
    user_id
  )
  values (
    v_owner,
    'passport_draft.confirmed',
    'passport_draft',
    p_draft_id,
    jsonb_build_object(
      'workflow', 'returning_corporate_passport_review',
      'traveller_id', p_traveller_id,
      'client_id', v_draft.client_id,
      'document_id', v_document_id,
      'profile_reused', true,
      'profile_changed', false,
      'reviewed_fields', jsonb_build_array(
        'given_name', 'surname', 'passport_number',
        'dob', 'expiry_date', 'nationality'
      )
    ),
    v_owner
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean
  then
    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      details,
      user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      p_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'returning_corporate_passport_review',
        'draft_id', p_draft_id
      ),
      v_owner
    );
  end if;

  return p_traveller_id;
end;
$$;

alter function public.confirm_returning_corporate_passport_draft(
  uuid, uuid, text, text, text, date, date, text,
  jsonb, boolean, boolean
) owner to postgres;

revoke all on function public.confirm_returning_corporate_passport_draft(
  uuid, uuid, text, text, text, date, date, text,
  jsonb, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.confirm_returning_corporate_passport_draft(
  uuid, uuid, text, text, text, date, date, text,
  jsonb, boolean, boolean
) to authenticated;

-- SOURCE: supabase/migrations/20261011084315_individual_returning_travellers.sql
-- Add individual account lookup and reviewed draft reuse.
-- Existing corporate functions and account-scoped passport uniqueness remain intact.

create or replace function public.lookup_individual_traveller(
  p_client_id uuid,
  p_passport_number text
)
returns table (
  id uuid,
  given_name text,
  surname text,
  full_name text,
  verification_status text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_passport text := upper(btrim(coalesce(p_passport_number, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.app_users u
    where u.auth_user_id = auth.uid()
      and u.role = 'owner'
  ) then
    raise exception 'Owner access required';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.client_type = 'individual'
  ) then
    raise exception 'Select a valid individual client';
  end if;

  if char_length(v_passport) not between 1 and 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  return query
  select
    t.id,
    t.given_name::text,
    t.surname::text,
    t.full_name::text,
    t.verification_status::text
  from public.travellers t
  where t.client_id = p_client_id
    and upper(btrim(t.passport_number)) = v_passport
    and nullif(btrim(t.passport_number), '') is not null;
end;
$$;

revoke all on function public.lookup_individual_traveller(
  uuid, text
) from public, anon, authenticated;

grant execute on function public.lookup_individual_traveller(
  uuid, text
) to authenticated;


-- Link a reviewed individual passport draft to an existing profile.
-- Traveller details remain unchanged.
-- Document linking, draft confirmation and audit are atomic.

create or replace function public.confirm_returning_individual_passport_draft(
  p_draft_id uuid,
  p_traveller_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_draft public.passport_extraction_drafts%rowtype;
  v_traveller public.travellers%rowtype;
  v_document_id uuid;
  v_document_count bigint;
  v_date_review jsonb;
  v_reviewed_fields jsonb;
  v_now timestamptz := now();

  v_given_name text :=
    nullif(upper(btrim(coalesce(p_given_name, ''))), '');

  v_surname text :=
    nullif(upper(btrim(coalesce(p_surname, ''))), '');

  v_passport text :=
    upper(btrim(coalesce(p_passport_number, '')));

  v_nationality text :=
    upper(btrim(coalesce(p_nationality, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select u.id into v_owner
  from public.app_users u
  where u.auth_user_id = auth.uid()
    and u.role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if p_draft_id is null or p_traveller_id is null then
    raise exception 'Passport draft and traveller are required';
  end if;

  if jsonb_typeof(p_field_checks) is distinct from 'object'
    or (p_field_checks -> 'given_name') is distinct from 'true'::jsonb
    or (p_field_checks -> 'surname') is distinct from 'true'::jsonb
    or (p_field_checks -> 'passport_number') is distinct from 'true'::jsonb
    or (p_field_checks -> 'dob') is distinct from 'true'::jsonb
    or (p_field_checks -> 'expiry_date') is distinct from 'true'::jsonb
    or (p_field_checks -> 'nationality') is distinct from 'true'::jsonb
  then
    raise exception 'Review and confirm all six passport fields';
  end if;

  if v_given_name is null and v_surname is null then
    raise exception 'Enter the passport given name or surname';
  end if;

  if char_length(v_given_name) > 100
    or char_length(v_surname) > 100 then
    raise exception 'Each name field must be at most 100 characters';
  end if;

  if char_length(concat_ws(' ', v_given_name, v_surname)) > 200 then
    raise exception 'Combined name must be at most 200 characters';
  end if;

  if char_length(v_passport) not between 1 and 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  if char_length(v_nationality) not between 1 and 100 then
    raise exception 'Nationality must contain 1 to 100 characters';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob,
    p_expiry_date,
    p_age_confirmed,
    p_expiry_confirmed
  );

  v_reviewed_fields := jsonb_build_object(
    'given_name', v_given_name,
    'surname', v_surname,
    'passport_number', v_passport,
    'dob', p_dob,
    'expiry_date', p_expiry_date,
    'nationality', v_nationality,
    'field_checks', p_field_checks
  );
    select d.* into v_draft
  from public.passport_extraction_drafts d
  where d.id = p_draft_id
  for update;

  if not found then
    raise exception 'Passport draft not found';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = v_draft.client_id
      and c.client_type = 'individual'
  ) then
    raise exception 'Select a valid individual client';
  end if;

  if v_draft.status = 'confirmed' then
    -- An identical retry returns the original result without new writes.
    if v_draft.confirmed_traveller_id = p_traveller_id
      and v_draft.reviewed_by = v_owner
      and v_draft.reviewed_fields = v_reviewed_fields
      and exists (
        select 1
        from public.audit_logs a
        where a.action = 'passport_draft.confirmed'
          and a.entity_type = 'passport_draft'
          and a.entity_id = p_draft_id
          and a.actor_id = v_owner
          and a.details ->> 'workflow'
            = 'returning_individual_passport_review'
          and a.details ->> 'traveller_id'
            = p_traveller_id::text
      )
    then
      return p_traveller_id;
    end if;

    raise exception 'Passport draft is already confirmed';
  end if;

  if v_draft.confirmed_traveller_id is not null
    or v_draft.status not in (
      'uploaded', 'awaiting_review', 'extraction_failed'
    )
  then
    raise exception 'Passport draft is not available for review';
  end if;

  select t.* into v_traveller
  from public.travellers t
  where t.id = p_traveller_id
  for update;

  if not found then
    raise exception 'Traveller not found';
  end if;

  if v_traveller.client_id is distinct from v_draft.client_id then
    raise exception 'Traveller belongs to a different client';
  end if;

  if v_traveller.verification_status is distinct from 'verified' then
    raise exception 'Review and verify the existing traveller first';
  end if;

  if nullif(upper(btrim(v_traveller.given_name)), '')
      is distinct from v_given_name
    or nullif(upper(btrim(v_traveller.surname)), '')
      is distinct from v_surname
    or upper(btrim(v_traveller.passport_number))
      is distinct from v_passport
    or v_traveller.dob is distinct from p_dob
    or v_traveller.expiry_date is distinct from p_expiry_date
    or upper(btrim(v_traveller.nationality))
      is distinct from v_nationality
  then
    raise exception
      'Passport details differ. Correct the existing traveller before linking this draft';
  end if;
    -- Verify the private image belongs to the draft's owner uploader.
  perform 1
  from storage.objects o
  join public.app_users u
    on o.owner_id = u.auth_user_id::text
  where o.bucket_id = 'passports'
    and o.name = v_draft.image_path
    and u.id = v_draft.created_by
    and u.role = 'owner'
  for share of o, u;

  if not found then
    raise exception 'Passport image not found or inaccessible';
  end if;

  -- Refuse an image path already linked elsewhere or ambiguously.
  select count(*), min(d.id::text)::uuid
  into v_document_count, v_document_id
  from public.documents d
  where d.file_path = v_draft.image_path;

  if v_document_count > 1 then
    raise exception 'Passport image has conflicting document links';
  end if;

  if v_document_count = 1 then
    perform 1
    from public.documents d
    where d.id = v_document_id
      and d.entity_type = 'traveller'
      and d.entity_id = p_traveller_id
      and d.file_type = 'passport'
    for update;

    if not found then
      raise exception 'Passport image is already linked elsewhere';
    end if;
  else
    insert into public.documents (
      entity_type,
      entity_id,
      file_path,
      file_type,
      user_id
    )
    values (
      'traveller',
      p_traveller_id,
      v_draft.image_path,
      'passport',
      v_owner
    )
    returning id into v_document_id;
  end if;
    update public.passport_extraction_drafts
  set
    given_name = v_given_name,
    surname = v_surname,
    status = 'confirmed',
    reviewed_fields = v_reviewed_fields,
    confirmed_traveller_id = p_traveller_id,
    reviewed_by = v_owner,
    reviewed_at = v_now,
    updated_at = v_now
  where id = p_draft_id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    details,
    user_id
  )
  values (
    v_owner,
    'passport_draft.confirmed',
    'passport_draft',
    p_draft_id,
    jsonb_build_object(
      'workflow', 'returning_individual_passport_review',
      'traveller_id', p_traveller_id,
      'client_id', v_draft.client_id,
      'document_id', v_document_id,
      'profile_reused', true,
      'profile_changed', false,
      'reviewed_fields', jsonb_build_array(
        'given_name', 'surname', 'passport_number',
        'dob', 'expiry_date', 'nationality'
      )
    ),
    v_owner
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean
  then
    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      details,
      user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      p_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'returning_individual_passport_review',
        'draft_id', p_draft_id
      ),
      v_owner
    );
  end if;

  return p_traveller_id;
end;
$$;

alter function public.confirm_returning_individual_passport_draft(
  uuid, uuid, text, text, text, date, date, text,
  jsonb, boolean, boolean
) owner to postgres;

revoke all on function public.confirm_returning_individual_passport_draft(
  uuid, uuid, text, text, text, date, date, text,
  jsonb, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.confirm_returning_individual_passport_draft(
  uuid, uuid, text, text, text, date, date, text,
  jsonb, boolean, boolean
) to authenticated;
