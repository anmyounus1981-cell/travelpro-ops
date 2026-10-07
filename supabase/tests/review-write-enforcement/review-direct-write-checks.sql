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
  v_table text;
begin
  foreach v_table in array array[
    'travellers',
    'case_travellers',
    'passport_extraction_drafts',
    'documents',
    'audit_logs'
  ] loop
    begin
      execute format(
        'insert into public.%I default values',
        v_table
      );

      raise exception 'TEST FAILED: direct INSERT allowed on %',
        v_table;
    exception when insufficient_privilege then
      null;
    end;

    begin
      execute format(
        'update public.%I set id = id where false',
        v_table
      );

      raise exception 'TEST FAILED: direct UPDATE allowed on %',
        v_table;
    exception when insufficient_privilege then
      null;
    end;

    begin
      execute format(
        'delete from public.%I where false',
        v_table
      );

      raise exception 'TEST FAILED: direct DELETE allowed on %',
        v_table;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end;
$$;

reset role;

select 'Authenticated owner direct INSERT, UPDATE and DELETE blocked on all 5 tables'
  as result;