-- Require an existing linked owner and client.
do $$
begin
  if not exists (
    select 1
    from public.app_users
    where role = 'owner'
      and auth_user_id is not null
  ) then
    raise exception 'TEST FAILED: linked owner required';
  end if;

  if not exists (select 1 from public.clients) then
    raise exception 'TEST FAILED: existing client required';
  end if;
end;
$$;

-- Simulate the owner's authenticated database role.
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
  v_client uuid;
  v_id uuid;
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_dob date := (v_today - interval '30 years')::date;
  v_passport text := 'R' || upper(
    left(replace(gen_random_uuid()::text, '-', ''), 20)
  );
begin
  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid() and role = 'owner';

  select id into strict v_client
  from public.clients
  order by id
  limit 1;

  -- Expired passport must fail without leaving a traveller.
  begin
    perform public.create_traveller_with_date_review(
      v_client, 'ROLLBACK', 'CREATION TEST', v_passport,
      v_dob, v_today - 1, 'TEST', null, false, false
    );

    raise exception 'TEST FAILED: expired passport accepted';
  exception when raise_exception then
    if sqlerrm <>
      'Passport has expired. Enter the renewed passport details before confirming.' then
      raise;
    end if;
  end;

  if exists (
    select 1 from public.travellers
    where client_id = v_client and passport_number = v_passport
  ) then
    raise exception 'TEST FAILED: rejected creation left a traveller';
  end if;

  -- Valid dates must succeed despite revoked direct table writes.
  v_id := public.create_traveller_with_date_review(
    v_client, 'ROLLBACK', 'CREATION TEST', v_passport,
    v_dob, (v_today + interval '5 years')::date,
    'TEST', null, false, false
  );

  if not exists (
    select 1 from public.travellers
    where id = v_id
      and client_id = v_client
      and user_id = v_owner
      and given_name = 'ROLLBACK'
      and surname = 'CREATION TEST'
      and passport_number = v_passport
      and verification_status = 'client_confirmed'
  ) then
    raise exception 'TEST FAILED: approved creation incorrect';
  end if;

  if (
    select count(*) from public.audit_logs
    where entity_id = v_id
      and action = 'traveller.client_confirmed'
      and actor_id = v_owner
      and user_id = v_owner
  ) <> 1 then
    raise exception 'TEST FAILED: creation audit missing or duplicated';
  end if;
end;
$$;

reset role;

select 'Owner creation and audit passed; expired passport rejected'
  as result;