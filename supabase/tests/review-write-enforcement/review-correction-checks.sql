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
  v_client uuid;
  v_id uuid;
  v_saved uuid;
  v_before jsonb;
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_dob date := (v_today - interval '30 years')::date;
  v_expiry date := (v_today + interval '5 years')::date;
  v_new_expiry date := (v_today + interval '6 years')::date;
  v_passport text := 'C' || upper(
    left(replace(gen_random_uuid()::text, '-', ''), 20)
  );
  v_checks jsonb := '{
    "given_name": true, "surname": true,
    "passport_number": true, "dob": true,
    "expiry_date": true, "nationality": true
  }'::jsonb;
begin
  select id into strict v_client
  from public.clients order by id limit 1;

  v_id := public.create_traveller_with_date_review(
    v_client, 'ROLLBACK', 'CORRECTION TEST', v_passport,
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
  from public.travellers where id = v_id;

  begin
    perform public.correct_traveller_with_date_review(
      v_id, v_before, 'ROLLBACK', 'CORRECTION TEST',
      v_passport, v_dob, v_today - 1, 'TEST',
      v_checks, 'Synthetic expired correction test',
      false, false
    );

    raise exception 'TEST FAILED: expired correction accepted';
  exception when raise_exception then
    if sqlerrm <>
      'Passport has expired. Enter the renewed passport details before confirming.' then
      raise;
    end if;
  end;

  if not exists (
    select 1 from public.travellers
    where id = v_id and expiry_date = v_expiry
      and verification_status = 'client_confirmed'
  ) or exists (
    select 1 from public.audit_logs
    where entity_id = v_id
      and action = 'traveller.details_corrected'
  ) then
    raise exception 'TEST FAILED: rejected correction left changes';
  end if;

  v_saved := public.correct_traveller_with_date_review(
    v_id, v_before, 'ROLLBACK', 'CORRECTION TEST',
    v_passport, v_dob, v_new_expiry, 'TEST',
    v_checks, 'Synthetic valid correction test',
    false, false
  );

  if v_saved is distinct from v_id
    or not exists (
      select 1 from public.travellers
      where id = v_id and expiry_date = v_new_expiry
        and verification_status = 'verified'
    ) then
    raise exception 'TEST FAILED: approved correction incorrect';
  end if;

  if (
    select count(*) from public.audit_logs
    where entity_id = v_id
      and action = 'traveller.details_corrected'
      and details -> 'changed_fields' ? 'expiry_date'
      and actor_id = (
        select id from public.app_users
        where auth_user_id = auth.uid() and role = 'owner'
      )
  ) <> 1 then
    raise exception 'TEST FAILED: correction audit incorrect';
  end if;
end;
$$;

reset role;

select 'Expired correction rejected; valid correction and audit passed'
  as result;