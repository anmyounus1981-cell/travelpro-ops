-- Check RPC execution privileges.
do $$
declare
  v_function regprocedure :=
    'public.lookup_corporate_traveller(uuid,text)'::regprocedure;
begin
  if has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception 'TEST FAILED: anonymous lookup access allowed';
  end if;

  if not has_function_privilege(
    'authenticated', v_function, 'EXECUTE'
  ) then
    raise exception 'TEST FAILED: authenticated lookup access missing';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (
    select auth_user_id::text
    from public.app_users
    where id = '00000000-0000-0000-0000-000000000001'::uuid
      and role = 'owner'
      and auth_user_id is not null
  ),
  true
);

set local role authenticated;

do $$
declare
  v_canonical uuid :=
    'dfeb9e2f-b5e6-4e15-8ebd-5c54ff415694'::uuid;
  v_expected uuid :=
    '6249d5b9-a5ab-4ddb-8cf2-bab22b8278a9'::uuid;
  v_other_client uuid;
  v_match uuid;
  v_count bigint;
  v_travellers_before bigint;
  v_audits_before bigint;
begin
  if auth.uid() is null then
    raise exception 'TEST FAILED: linked owner required';
  end if;

  select count(*) into v_travellers_before
  from public.travellers;

  select count(*) into v_audits_before
  from public.audit_logs;

  select count(*), min(id::text)::uuid
  into v_count, v_match
  from public.lookup_corporate_traveller(
    v_canonical, '  a06986048  '
  );

  if v_count <> 1 or v_match is distinct from v_expected then
    raise exception 'TEST FAILED: normalized passport lookup incorrect';
  end if;

    if exists (
    select 1
    from public.lookup_corporate_traveller(
      v_canonical, 'NO-MATCH-' || left(gen_random_uuid()::text, 12)
    )
  ) then
    raise exception 'TEST FAILED: unknown passport matched';
  end if;
    -- Choose a corporate account that does not hold this passport.
  select c.id into v_other_client
  from public.clients c
  where c.client_type = 'corporate'
    and c.id <> v_canonical
    and not exists (
      select 1 from public.travellers t
      where t.client_id = c.id
        and upper(btrim(t.passport_number)) = 'A06986048'
    )
  order by c.id
  limit 1;

  if v_other_client is null then
    raise exception 'TEST FAILED: another corporate account required';
  end if;

  if exists (
    select 1
    from public.lookup_corporate_traveller(
      v_other_client, 'A06986048'
    )
  ) then
    raise exception 'TEST FAILED: lookup returned another company profile';
  end if;

  if (select count(*) from public.travellers) <> v_travellers_before
    or (select count(*) from public.audit_logs) <> v_audits_before then
    raise exception 'TEST FAILED: lookup caused unexpected writes';
  end if;
end;
$$;

reset role;

select set_config(
  'request.jwt.claim.sub',
  gen_random_uuid()::text,
  true
);

set local role authenticated;

do $$
begin
  if exists (
    select 1 from public.app_users
    where auth_user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'TEST FAILED: expected a non-owner identity';
  end if;

  begin
    perform public.lookup_corporate_traveller(
      'dfeb9e2f-b5e6-4e15-8ebd-5c54ff415694'::uuid,
      'A06986048'
    );

    raise exception 'TEST FAILED: non-owner lookup accepted';
  exception when raise_exception then
    if sqlerrm <> 'Owner access required' then
      raise;
    end if;
  end;
end;
$$;

reset role;

select
  'Normalized lookup, company isolation, read-only behavior and non-owner rejection passed'
  as result;