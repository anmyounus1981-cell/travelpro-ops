do $$
declare
  v_role text;
  v_table text;
  v_privilege text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_table in array array[
      'travellers',
      'case_travellers',
      'passport_extraction_drafts',
      'documents',
      'audit_logs'
    ] loop
      foreach v_privilege in array array[
        'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ] loop
        if has_table_privilege(
          v_role,
          'public.' || v_table,
          v_privilege
        ) then
          raise exception
            'TEST FAILED: % retains % on %',
            v_role, v_privilege, v_table;
        end if;
      end loop;
    end loop;
  end loop;

  foreach v_table in array array[
    'travellers',
    'case_travellers',
    'passport_extraction_drafts',
    'documents',
    'audit_logs'
  ] loop
    if not has_table_privilege(
      'authenticated', 'public.' || v_table, 'SELECT'
    ) then
      raise exception
        'TEST FAILED: authenticated SELECT missing on %',
        v_table;
    end if;
  end loop;
end;
$$;

select 'Direct write privileges blocked; SELECT preserved' as result;