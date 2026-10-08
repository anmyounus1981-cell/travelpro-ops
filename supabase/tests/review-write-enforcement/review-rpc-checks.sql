do $$
declare
  v_function record;
  v_count integer := 0;
begin
  for v_function in
    select p.oid, p.proname, p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'create_traveller_with_date_review',
        'confirm_passport_draft_with_date_review',
        'correct_traveller_with_date_review',
        'assign_case_traveller',
        'create_passport_review_draft',
        'save_passport_draft_extraction',
        'link_operational_document',
        'record_operational_audit'
      )
  loop
    v_count := v_count + 1;

    if not v_function.prosecdef then
      raise exception 'TEST FAILED: % is not SECURITY DEFINER',
        v_function.proname;
    end if;

    if has_function_privilege(
      'anon', v_function.oid, 'EXECUTE'
    ) then
      raise exception 'TEST FAILED: anon can execute %',
        v_function.proname;
    end if;

    if not has_function_privilege(
      'authenticated', v_function.oid, 'EXECUTE'
    ) then
      raise exception 'TEST FAILED: authenticated cannot execute %',
        v_function.proname;
    end if;
  end loop;

  if v_count <> 8 then
    raise exception 'TEST FAILED: expected 8 approved RPCs, found %',
      v_count;
  end if;

  v_count := 0;

  for v_function in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'create_traveller_atomic',
        'confirm_passport_draft',
        'correct_traveller_details'
      )
  loop
    v_count := v_count + 1;

    if has_function_privilege('anon', v_function.oid, 'EXECUTE')
      or has_function_privilege(
        'authenticated', v_function.oid, 'EXECUTE'
      ) then
      raise exception 'TEST FAILED: legacy RPC remains callable: %',
        v_function.proname;
    end if;
  end loop;

  if v_count <> 6 then
    raise exception 'TEST FAILED: expected 6 legacy overloads, found %',
      v_count;
  end if;
end;
$$;

select 'Approved RPC permissions passed; legacy bypass RPCs blocked'
  as result;