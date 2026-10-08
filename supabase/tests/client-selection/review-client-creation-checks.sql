select set_config(
  'request.jwt.claim.sub',
  (
    select auth_user_id::text
    from public.app_users
    where role = 'owner'
      and auth_user_id is not null
    order by id
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  v_owner uuid;
  v_request uuid := gen_random_uuid();
  v_company text := 'SYNTHETIC CLIENT ' || gen_random_uuid()::text;
  v_client uuid;
  v_retry uuid;
  v_individual_one uuid;
  v_individual_two uuid;
  v_clients_before bigint;
  v_audits_before bigint;
begin
  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  select count(*) into v_clients_before
  from public.clients;

  select count(*) into v_audits_before
  from public.audit_logs;
    v_client := public.create_client_with_review(
    v_request, 'corporate', v_company,
    'SYNTHETIC CONTACT', null, null
  );

  v_retry := public.create_client_with_review(
    v_request, 'corporate', v_company,
    'SYNTHETIC CONTACT', null, null
  );

  if v_client is null or v_retry is distinct from v_client then
    raise exception 'TEST FAILED: retry returned a different client';
  end if;

  if not exists (
    select 1 from public.clients
    where id = v_client
      and client_type = 'corporate'
      and company_name = v_company
      and user_id = v_owner
      and creation_request_id = v_request
  ) then
    raise exception 'TEST FAILED: corporate client fields incorrect';
  end if;

  if (
    select count(*) from public.audit_logs
    where entity_type = 'client'
      and entity_id = v_client
      and action = 'client.created'
      and actor_id = v_owner
      and details ->> 'workflow' = 'client_quick_creation'
  ) <> 1 then
    raise exception 'TEST FAILED: expected one attributed creation audit';
  end if;

  begin
    perform public.create_client_with_review(
      gen_random_uuid(), 'corporate',
      '  ' || lower(replace(v_company, ' ', '   ')) || '  ',
      'SYNTHETIC CONTACT', null, null
    );
    raise exception 'TEST FAILED: duplicate corporate name accepted';
  exception when raise_exception then
    if sqlerrm <> 'Company already exists. Select the existing corporate client' then
      raise;
    end if;
  end;

  begin
    perform public.create_client_with_review(
      v_request, 'corporate', v_company,
      'CHANGED CONTACT', null, null
    );
    raise exception 'TEST FAILED: conflicting request accepted';
  exception when raise_exception then
    if sqlerrm <> 'Client creation request conflicts with an existing submission' then
      raise;
    end if;
  end;

  v_individual_one := public.create_client_with_review(
    gen_random_uuid(), 'individual', null,
    'SYNTHETIC RETAIL CLIENT', null, null
  );

  v_individual_two := public.create_client_with_review(
    gen_random_uuid(), 'individual', null,
    'SYNTHETIC RETAIL CLIENT', null, null
  );

  if v_individual_one is null
    or v_individual_two is null
    or v_individual_one = v_individual_two then
    raise exception 'TEST FAILED: same-name individual accounts not separate';
  end if;

  if (
    select count(*) from public.clients
    where id in (v_individual_one, v_individual_two)
      and client_type = 'individual'
      and company_name = 'SYNTHETIC RETAIL CLIENT'
      and contact_name = 'SYNTHETIC RETAIL CLIENT'
      and user_id = v_owner
  ) <> 2 then
    raise exception 'TEST FAILED: individual client fields incorrect';
  end if;

  if (
    select count(*) from public.audit_logs
    where entity_id in (v_individual_one, v_individual_two)
      and entity_type = 'client'
      and action = 'client.created'
      and actor_id = v_owner
      and details ->> 'client_type' = 'individual'
  ) <> 2 then
    raise exception 'TEST FAILED: individual creation audits missing';
  end if;

  if (select count(*) from public.clients) <> v_clients_before + 3
    or (select count(*) from public.audit_logs) <> v_audits_before + 3 then
    raise exception 'TEST FAILED: unexpected writes or duplicate audits';
  end if;
end;
$$;

reset role;

select
  'Corporate creation, retry, duplicate rejection and separate retail accounts passed'
  as result;