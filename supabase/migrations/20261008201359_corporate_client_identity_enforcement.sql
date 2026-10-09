BEGIN;
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

COMMIT;