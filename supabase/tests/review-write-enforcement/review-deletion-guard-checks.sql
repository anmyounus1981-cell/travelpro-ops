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
  v_traveller uuid;
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_audits_before bigint;
  v_passport text := 'G' || upper(
    left(replace(gen_random_uuid()::text, '-', ''), 20)
  );
begin
  insert into public.clients (
    company_name, contact_name, contact_email, contact_phone
  )
  values (
    'ROLLBACK DELETE GUARD ' || gen_random_uuid()::text,
    'Synthetic test',
    'rollback@example.invalid',
    ''
  )
  returning id into v_client;

  v_traveller := public.create_traveller_with_date_review(
    v_client, 'ROLLBACK', 'DELETE GUARD', v_passport,
    (v_today - interval '30 years')::date,
    (v_today + interval '5 years')::date,
    'TEST', null, false, false
  );

  select count(*) into v_audits_before
  from public.audit_logs;

  begin
    delete from public.clients
    where id = v_client;

    raise exception 'TEST FAILED: client cascade deleted traveller';
  exception when raise_exception then
    if sqlerrm <>
      'Traveller deletion requires an approved deletion workflow' then
      raise;
    end if;
  end;

  if not exists (
    select 1 from public.clients where id = v_client
  ) or not exists (
    select 1 from public.travellers
    where id = v_traveller and client_id = v_client
  ) then
    raise exception 'TEST FAILED: rejected deletion changed records';
  end if;

  if (select count(*) from public.audit_logs)
      <> v_audits_before then
    raise exception 'TEST FAILED: rejected deletion changed audit rows';
  end if;
end;
$$;

reset role;

select 'Client cascade deletion blocked; client and traveller preserved'
  as result;