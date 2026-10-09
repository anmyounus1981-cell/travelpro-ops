create function public.test_reject_client_creation_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.action = 'client.created'
    and new.details ->> 'workflow' = 'client_quick_creation' then
    raise exception 'Synthetic client audit failure';
  end if;

  return new;
end;
$$;

create trigger test_reject_client_creation_audit
before insert on public.audit_logs
for each row
execute function public.test_reject_client_creation_audit();

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
  v_request uuid := gen_random_uuid();
  v_company text := 'SYNTHETIC ROLLBACK ' || gen_random_uuid()::text;
  v_clients_before bigint;
  v_audits_before bigint;
begin
  if auth.uid() is null then
    raise exception 'TEST FAILED: linked owner required';
  end if;

  select count(*) into v_clients_before
  from public.clients;

  select count(*) into v_audits_before
  from public.audit_logs;

  begin
    perform public.create_client_with_review(
      v_request, 'corporate', v_company,
      'SYNTHETIC CONTACT', null, null
    );

    raise exception 'TEST FAILED: audit failure not triggered';
  exception when raise_exception then
    if sqlerrm <> 'Synthetic client audit failure' then
      raise;
    end if;
  end;

  if exists (
    select 1 from public.clients
    where creation_request_id = v_request
      or company_name = v_company
  ) then
    raise exception 'TEST FAILED: client survived audit failure';
  end if;

  if (select count(*) from public.clients) <> v_clients_before
    or (select count(*) from public.audit_logs) <> v_audits_before then
    raise exception 'TEST FAILED: residual client or audit writes';
  end if;
end;
$$;

reset role;

select
  'Audit failure rolled back client creation; no residual writes'
  as result;