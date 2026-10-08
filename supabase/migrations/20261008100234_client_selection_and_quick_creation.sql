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