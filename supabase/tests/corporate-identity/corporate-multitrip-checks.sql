do $$
declare
  v_auth_user uuid;
begin
  select auth_user_id into v_auth_user
  from public.app_users
  where role = 'owner'
    and auth_user_id is not null
  order by id
  limit 1;

  if v_auth_user is null then
    raise exception 'TEST FAILED: linked owner required';
  end if;

  perform set_config(
    'request.jwt.claim.sub', v_auth_user::text, true
  );
end;
$$;

set local role authenticated;

do $$
declare
  v_owner uuid;
  v_client uuid;
  v_case_one uuid;
  v_case_two uuid;
  v_traveller uuid;
  v_assignment_one uuid;
  v_assignment_two uuid;
  v_match uuid;
  v_before jsonb;
  v_reviewed_profile jsonb;
  v_clients_before bigint;
  v_travellers_before bigint;

  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_dob date := (v_today - interval '30 years')::date;
  v_expiry date := (v_today + interval '5 years')::date;

  v_passport text := 'P' || upper(
    left(replace(gen_random_uuid()::text, '-', ''), 20)
  );

  v_checks jsonb := '{
    "given_name": true,
    "surname": true,
    "passport_number": true,
    "dob": true,
    "expiry_date": true,
    "nationality": true
  }'::jsonb;
begin
  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  select count(*) into v_clients_before
  from public.clients;

  select count(*) into v_travellers_before
  from public.travellers;

    v_client := public.create_client_with_review(
    gen_random_uuid(),
    'corporate',
    'SYNTHETIC MULTITRIP ' || gen_random_uuid()::text,
    'SYNTHETIC CONTACT',
    null,
    null
  );

  v_traveller := public.create_traveller_with_date_review(
    v_client,
    'SYNTHETIC',
    'RETURNING TRAVELLER',
    v_passport,
    v_dob,
    v_expiry,
    'TEST',
    null,
    false,
    false
  );

  select jsonb_build_object(
    'given_name', given_name,
    'surname', surname,
    'full_name', full_name,
    'passport_number', passport_number,
    'dob', dob,
    'expiry_date', expiry_date,
    'nationality', nationality,
    'verification_status', verification_status
  ) into strict v_before
  from public.travellers
  where id = v_traveller;

  perform public.correct_traveller_with_date_review(
    v_traveller,
    v_before,
    'SYNTHETIC',
    'RETURNING TRAVELLER',
    v_passport,
    v_dob,
    v_expiry,
    'TEST',
    v_checks,
    'Synthetic owner review for multiple-trip test',
    false,
    false
  );

  select to_jsonb(t) into strict v_reviewed_profile
  from public.travellers t
  where t.id = v_traveller;

  if not exists (
    select 1
    from public.travellers
    where id = v_traveller
      and client_id = v_client
      and verification_status = 'verified'
  ) then
    raise exception 'TEST FAILED: reviewed profile missing';
  end if;

    insert into public.cases (
    case_number, client_id, assigned_to, user_id,
    origin, destination, departure_date, trip_type,
    adult_count, child_count, infant_count, passenger_count,
    cabin_class
  )
  values (
    'MULTITRIP-ONE-' || gen_random_uuid()::text,
    v_client, v_owner, v_owner,
    'DAC', 'DXB', v_today + 30, 'oneway',
    1, 0, 0, 1, 'economy'
  )
  returning id into v_case_one;

  insert into public.cases (
    case_number, client_id, assigned_to, user_id,
    origin, destination, departure_date, trip_type,
    adult_count, child_count, infant_count, passenger_count,
    cabin_class
  )
  values (
    'MULTITRIP-TWO-' || gen_random_uuid()::text,
    v_client, v_owner, v_owner,
    'DAC', 'SIN', v_today + 90, 'oneway',
    1, 0, 0, 1, 'economy'
  )
  returning id into v_case_two;

  select id into strict v_match
  from public.lookup_corporate_traveller(
    v_client,
    '  ' || lower(v_passport) || '  '
  );

  if v_match is distinct from v_traveller then
    raise exception 'TEST FAILED: lookup did not reuse existing profile';
  end if;

  v_assignment_one := public.assign_case_traveller(
    v_case_one, v_match, v_dob, null
  );

  v_assignment_two := public.assign_case_traveller(
    v_case_two, v_match, v_dob, null
  );

    if v_assignment_one is null
    or v_assignment_two is null
    or v_assignment_one = v_assignment_two then
    raise exception 'TEST FAILED: distinct trip assignments required';
  end if;

  if (
    select count(*)
    from public.case_travellers
    where traveller_id = v_traveller
  ) <> 2 then
    raise exception 'TEST FAILED: expected two trips for one profile';
  end if;

  if not exists (
    select 1
    from public.case_travellers
    where id = v_assignment_one
      and case_id = v_case_one
      and traveller_id = v_traveller
      and user_id = v_owner
      and passenger_type = 'ADT'
      and accompanying_adult_id is null
  ) or not exists (
    select 1
    from public.case_travellers
    where id = v_assignment_two
      and case_id = v_case_two
      and traveller_id = v_traveller
      and user_id = v_owner
      and passenger_type = 'ADT'
      and accompanying_adult_id is null
  ) then
    raise exception 'TEST FAILED: trip links incorrect';
  end if;

  if (select count(*) from public.clients)
      <> v_clients_before + 1 then
    raise exception 'TEST FAILED: unexpected client creation';
  end if;

  if (select count(*) from public.travellers)
      <> v_travellers_before + 1 then
    raise exception 'TEST FAILED: unexpected traveller creation';
  end if;

  if (
    select to_jsonb(t)
    from public.travellers t
    where t.id = v_traveller
  ) is distinct from v_reviewed_profile then
    raise exception 'TEST FAILED: assignment changed reviewed profile';
  end if;

    if (
    select count(*)
    from public.audit_logs
    where action = 'case.passenger_assigned'
      and entity_id = v_case_one
      and actor_id = v_owner
      and details ->> 'case_traveller_id' =
        v_assignment_one::text
      and details ->> 'traveller_id' = v_traveller::text
      and details ->> 'passenger_type' = 'ADT'
  ) <> 1 then
    raise exception 'TEST FAILED: first trip audit incorrect';
  end if;

  if (
    select count(*)
    from public.audit_logs
    where action = 'case.passenger_assigned'
      and entity_id = v_case_two
      and actor_id = v_owner
      and details ->> 'case_traveller_id' =
        v_assignment_two::text
      and details ->> 'traveller_id' = v_traveller::text
      and details ->> 'passenger_type' = 'ADT'
  ) <> 1 then
    raise exception 'TEST FAILED: second trip audit incorrect';
  end if;
end;
$$;

reset role;

select
  'One corporate client and reviewed traveller reused across two trips; profile unchanged; both assignment audits passed'
  as result;