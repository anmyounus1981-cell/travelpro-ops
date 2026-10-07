-- Use a synthetic identity that has no owner profile.
select set_config(
  'request.jwt.claim.sub',
  gen_random_uuid()::text,
  true
);

set local role authenticated;

do $$
declare
  v_function record;
  v_arguments text;
  v_count integer := 0;
begin
  for v_function in
    select p.oid, p.proname, p.proargtypes
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

    select string_agg(
      'NULL::' || format_type(a.type_oid, null),
      ', ' order by a.position
    )
    into v_arguments
    from unnest(v_function.proargtypes::oid[])
      with ordinality as a(type_oid, position);

    begin
      execute format(
        'select public.%I(%s)',
        v_function.proname,
        v_arguments
      );

      raise exception 'TEST FAILED: non-owner could call %',
        v_function.proname;
    exception when raise_exception then
      if sqlerrm <> 'Owner access required' then
        raise;
      end if;
    end;
  end loop;

  if v_count <> 8 then
    raise exception 'TEST FAILED: expected 8 RPCs, tested %',
      v_count;
  end if;
end;
$$;

reset role;

select 'All 8 approved RPCs rejected the authenticated non-owner'
  as result;