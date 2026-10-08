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
  v_test record;
  v_documents_before bigint;
  v_audits_before bigint;
begin
  select count(*) into v_documents_before
  from public.documents;

  select count(*) into v_audits_before
  from public.audit_logs;

  for v_test in
    select *
    from (values
      ('traveller', 'Unsupported document entity'),
      ('passport_draft', 'Unsupported document entity'),
      ('payment', 'Payment not found or inaccessible'),
      ('ticket', 'Ticket not found or inaccessible')
    ) as tests(entity_type, expected_error)
  loop
    begin
      perform public.link_operational_document(
        v_test.entity_type,
        gen_random_uuid()
      );

      raise exception 'TEST FAILED: invalid document link accepted: %',
        v_test.entity_type;
    exception when raise_exception then
      if sqlerrm <> v_test.expected_error then
        raise;
      end if;
    end;
  end loop;

  if (select count(*) from public.documents)
      <> v_documents_before
    or (select count(*) from public.audit_logs)
      <> v_audits_before then
    raise exception 'TEST FAILED: rejected linking left document or audit rows';
  end if;
end;
$$;

reset role;

select 'Passport linking bypass and missing payment/ticket records rejected'
  as result;