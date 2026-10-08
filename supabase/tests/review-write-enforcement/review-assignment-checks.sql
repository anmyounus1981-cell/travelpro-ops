do $$
declare
  v_auth_user uuid;
begin
  select auth_user_id into v_auth_user
  from public.app_users
  where role = 'owner' and auth_user_id is not null
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
  v_case uuid;
  v_traveller uuid;
  v_assignment uuid;
  v_before jsonb;
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_dob date := (v_today - interval '30 years')::date;
  v_expiry date := (v_today + interval '5 years')::date;
  v_passport text := 'P' || upper(
    left(replace(gen_random_uuid()::text, '-', ''), 20)
  );
  v_checks jsonb := '{
    "given_name": true, "surname": true,
    "passport_number": true, "dob": true,
    "expiry_date": true, "nationality": true
  }'::jsonb;
begin
  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid() and role = 'owner';

  select id into strict v_client
  from public.clients order by id limit 1;

  insert into public.cases (
    case_number, client_id, assigned_to, user_id,
    origin, destination, departure_date, trip_type,
    adult_count, child_count, infant_count, passenger_count,
    cabin_class
  )
  values (
    'ROLLBACK-' || gen_random_uuid()::text,
    v_client, v_owner, v_owner,
    'DAC', 'BKK', v_today + 30, 'oneway',
    1, 0, 0, 1, 'economy'
  )
  returning id into v_case;

  v_traveller := public.create_traveller_with_date_review(
    v_client, 'ROLLBACK', 'ASSIGNMENT TEST', v_passport,
    v_dob, v_expiry, 'TEST', null, false, false
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
  from public.travellers where id = v_traveller;

  perform public.correct_traveller_with_date_review(
    v_traveller, v_before, 'ROLLBACK', 'ASSIGNMENT TEST',
    v_passport, v_dob, v_expiry, 'TEST',
    v_checks, 'Synthetic owner review for assignment test',
    false, false
  );

  v_assignment := public.assign_case_traveller(
    v_case, v_traveller, v_dob, null
  );

  if not exists (
    select 1 from public.case_travellers
    where id = v_assignment
      and case_id = v_case
      and traveller_id = v_traveller
      and user_id = v_owner
      and passenger_type = 'ADT'
      and age_at_departure = 30
      and accompanying_adult_id is null
  ) then
    raise exception 'TEST FAILED: assignment incorrect';
  end if;

  if (
    select count(*) from public.audit_logs
    where entity_id = v_case
      and action = 'case.passenger_assigned'
      and actor_id = v_owner
      and details ->> 'case_traveller_id' = v_assignment::text
      and details ->> 'traveller_id' = v_traveller::text
      and details ->> 'passenger_type' = 'ADT'
  ) <> 1 then
    raise exception 'TEST FAILED: assignment audit incorrect';
  end if;
end;
$$;

reset role;

select 'Reviewed traveller assignment and atomic assignment audit passed'
  as result;