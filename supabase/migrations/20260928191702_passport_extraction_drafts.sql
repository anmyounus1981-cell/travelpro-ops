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