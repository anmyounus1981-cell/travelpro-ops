do $$
declare
  v_table text;
  v_privilege text;
  v_function text;
begin
  foreach v_table in array array[
    'travellers',
    'case_travellers',
    'documents'
  ] loop
    foreach v_privilege in array array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE'
    ] loop
      if not has_table_privilege(
        'authenticated',
        'public.' || v_table,
        v_privilege
      ) then
        raise exception
          'TEST FAILED: preparation removed % on %',
          v_privilege, v_table;
      end if;
    end loop;
  end loop;

  foreach v_privilege in array array[
    'SELECT', 'INSERT', 'UPDATE'
  ] loop
    if not has_table_privilege(
      'authenticated',
      'public.passport_extraction_drafts',
      v_privilege
    ) then
      raise exception
        'TEST FAILED: preparation removed % on drafts',
        v_privilege;
    end if;
  end loop;

  if not has_table_privilege(
    'authenticated', 'public.audit_logs', 'SELECT'
  ) or not has_table_privilege(
    'authenticated', 'public.audit_logs', 'INSERT'
  ) then
    raise exception 'TEST FAILED: legacy audit access removed';
  end if;

  foreach v_function in array array[
    'public.create_passport_review_draft(uuid,text)',
    'public.save_passport_draft_extraction(uuid,text,timestamptz,jsonb)',
    'public.link_operational_document(text,uuid)',
    'public.record_operational_audit(text,text,uuid,jsonb)'
  ] loop
    if not has_function_privilege(
      'authenticated', v_function, 'EXECUTE'
    ) then
      raise exception
        'TEST FAILED: approved RPC unavailable: %',
        v_function;
    end if;

    if has_function_privilege(
      'anon', v_function, 'EXECUTE'
    ) then
      raise exception
        'TEST FAILED: anonymous RPC access: %',
        v_function;
    end if;
  end loop;
end;
$$;

select
  'Preparation preserves legacy table permissions; new RPC access is restricted'
  as result;