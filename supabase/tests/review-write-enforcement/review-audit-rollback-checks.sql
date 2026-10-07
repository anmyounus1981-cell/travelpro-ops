-- Test-only trigger, removed by the outer ROLLBACK.
create function public.test_reject_review_creation_audit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.action = 'traveller.client_confirmed' then
    raise exception 'Synthetic creation audit failure';
  end if;

  return new;
end;
$$;

create trigger test_reject_review_creation_audit
before insert on public.audit_logs
for each row
execute function public.test_reject_review_creation_audit();

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
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_passport text := 'A' || upper(
    left(replace(gen_random_uuid()::text, '-', ''), 20)
  );
  v_travellers_before bigint;
  v_documents_before bigint;
  v_audits_before bigint;
begin
  select id into strict v_client
  from public.clients order by id limit 1;

  select count(*) into v_travellers_before
  from public.travellers;

  select count(*) into v_documents_before
  from public.documents;

  select count(*) into v_audits_before
  from public.audit_logs;

  begin
    perform public.create_traveller_with_date_review(
      v_client, 'ROLLBACK', 'AUDIT FAILURE', v_passport,
      (v_today - interval '30 years')::date,
      (v_today + interval '5 years')::date,
      'TEST', null, false, false
    );

    raise exception 'TEST FAILED: audit failure was not triggered';
  exception when raise_exception then
    if sqlerrm <> 'Synthetic creation audit failure' then
      raise;
    end if;
  end;

  if exists (
    select 1 from public.travellers
    where client_id = v_client
      and passport_number = v_passport
  ) or (select count(*) from public.travellers)
      <> v_travellers_before
    or (select count(*) from public.documents)
      <> v_documents_before
    or (select count(*) from public.audit_logs)
      <> v_audits_before then
    raise exception 'TEST FAILED: writes survived creation audit failure';
  end if;
end;
$$;

reset role;

select 'Audit failure rolled back traveller creation; no residual writes'
  as result;