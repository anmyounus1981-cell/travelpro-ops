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