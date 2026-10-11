-- Run inside BEGIN ... ROLLBACK, using synthetic records only.
do $$
declare v_auth uuid;
begin
  select auth_user_id into strict v_auth from public.app_users
  where role = 'owner' and auth_user_id is not null order by id limit 1;
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
end; $$;

set local role authenticated;
do $$
declare
  v_a uuid; v_b uuid; v_corporate uuid; v_t uuid; v_other uuid;
  v_name text := 'SYNTHETIC RETAIL ' || gen_random_uuid()::text;
  v_passport text := 'P' || upper(left(replace(gen_random_uuid()::text, '-', ''), 20));
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_rejected boolean := false;
  v_constraint text;
  v_clients_before bigint;
  v_travellers_before bigint;
  v_audits_before bigint;
begin
  v_a := public.create_client_with_review(gen_random_uuid(), 'individual', v_name, 'SYNTHETIC CONTACT', null, null);
  v_b := public.create_client_with_review(gen_random_uuid(), 'individual', v_name, 'SYNTHETIC CONTACT', null, null);
  if v_a = v_b then raise exception 'TEST FAILED: name-only account merging'; end if;
  v_t := public.create_traveller_with_date_review(v_a, 'SYNTHETIC', 'RETAIL', v_passport, (v_today - interval '30 years')::date, (v_today + interval '5 years')::date, 'TEST', null, false, false);
  begin
    perform public.create_traveller_with_date_review(v_a, 'SYNTHETIC', 'RETAIL', lower(v_passport), (v_today - interval '30 years')::date, (v_today + interval '5 years')::date, 'TEST', null, false, false);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'travellers_client_passport_unique' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'TEST FAILED: normalized duplicate passport accepted'; end if;

  select count(*) into v_clients_before from public.clients;
  select count(*) into v_travellers_before from public.travellers;
  select count(*) into v_audits_before from public.audit_logs;
  if (select count(*) from public.lookup_individual_traveller(v_a, '  ' || lower(v_passport) || '  ') where id = v_t) <> 1 then
    raise exception 'TEST FAILED: normalized lookup incorrect';
  end if;
  if exists (select 1 from public.lookup_individual_traveller(v_b, v_passport)) then
    raise exception 'TEST FAILED: lookup leaked another account profile';
  end if;
  if exists (select 1 from public.lookup_individual_traveller(v_a, 'NO-MATCH')) then
    raise exception 'TEST FAILED: unknown passport matched';
  end if;
  if (select count(*) from public.clients) <> v_clients_before
    or (select count(*) from public.travellers) <> v_travellers_before
    or (select count(*) from public.audit_logs) <> v_audits_before then
    raise exception 'TEST FAILED: lookup wrote records';
  end if;

  v_other := public.create_traveller_with_date_review(v_b, 'SYNTHETIC', 'RETAIL', v_passport, (v_today - interval '30 years')::date, (v_today + interval '5 years')::date, 'TEST', null, false, false);
  if v_other = v_t then raise exception 'TEST FAILED: cross-account profile merged'; end if;
  if (select count(*) from public.lookup_individual_traveller(v_b, v_passport) where id = v_other) <> 1 then
    raise exception 'TEST FAILED: selected account isolation';
  end if;

  v_corporate := public.create_client_with_review(gen_random_uuid(), 'corporate', v_name, 'SYNTHETIC CONTACT', null, null);
  begin
    perform public.lookup_individual_traveller(v_corporate, v_passport);
    raise exception 'TEST FAILED: corporate account accepted';
  exception when raise_exception then
    if sqlerrm <> 'Select a valid individual client' then raise; end if;
  end;
  begin
    perform public.lookup_corporate_traveller(v_a, v_passport);
    raise exception 'TEST FAILED: individual account accepted by corporate lookup';
  exception when raise_exception then
    if sqlerrm <> 'Select a valid corporate client' then raise; end if;
  end;
end; $$;
reset role;

do $$
begin
  if has_function_privilege('anon', 'public.lookup_individual_traveller(uuid,text)', 'EXECUTE') then
    raise exception 'TEST FAILED: anonymous lookup allowed';
  end if;
end; $$;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.lookup_individual_traveller(gen_random_uuid(), 'NO-MATCH');
    raise exception 'TEST FAILED: non-owner lookup allowed';
  exception when raise_exception then
    if sqlerrm <> 'Owner access required' then raise; end if;
  end;
end; $$;
reset role;
select 'Individual identity, passport uniqueness, normalized read-only lookup, account/type isolation and permissions passed' as result;
