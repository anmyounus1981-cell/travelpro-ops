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