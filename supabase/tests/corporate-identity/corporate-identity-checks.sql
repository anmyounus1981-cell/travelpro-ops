do $$
declare
  v_canonical uuid :=
    'dfeb9e2f-b5e6-4e15-8ebd-5c54ff415694'::uuid;

  v_duplicates uuid[] := array[
    '7f9ea86e-13b1-4a23-8e28-970f8a741af2'::uuid,
    '16c950ac-895c-4bde-9534-3f69f7acdd59'::uuid,
    'f528c626-f42b-42f9-b280-8b81cd6309c3'::uuid
  ];

  v_travellers uuid[] := array[
    '5a94e419-4605-4a00-96a8-55186a2c80ad'::uuid,
    'a00744d8-88e6-4a65-b178-34da7f3b887e'::uuid,
    'c5ab4bd8-3e11-4fd6-a57d-ee72caac8dca'::uuid,
    '6249d5b9-a5ab-4ddb-8cf2-bab22b8278a9'::uuid
  ];

  v_test_client uuid;
begin
  if exists (
    select 1 from public.clients
    where id = any(v_duplicates)
  ) then
    raise exception 'TEST FAILED: duplicate company rows remain';
  end if;

  if (
    select count(*) from public.clients
    where client_type = 'corporate'
      and lower(regexp_replace(
        btrim(company_name), '[[:space:]]+', ' ', 'g'
      )) = 'premier group'
      and id = v_canonical
  ) <> 1 then
    raise exception 'TEST FAILED: canonical company missing';
  end if;

  if (
    select count(*) from public.travellers
    where id = any(v_travellers)
      and client_id = v_canonical
  ) <> 4 then
    raise exception 'TEST FAILED: traveller IDs or links not preserved';
  end if;

  if exists (
    select 1 from public.travellers
    where client_id = any(v_duplicates)
  ) or exists (
    select 1 from public.cases
    where client_id = any(v_duplicates)
  ) or exists (
    select 1 from public.passport_extraction_drafts
    where client_id = any(v_duplicates)
  ) or exists (
    select 1 from public.inquiries
    where matched_client_id = any(v_duplicates)
  ) then
    raise exception 'TEST FAILED: stale company references remain';
  end if;

  if (
    select count(*) from public.audit_logs
    where action = 'client.consolidated'
      and entity_id = v_canonical
      and details ->> 'migration' = '20261008201359'
      and actor_id =
        '00000000-0000-0000-0000-000000000001'::uuid
  ) <> 1 then
    raise exception 'TEST FAILED: consolidation audit missing';
  end if;

  begin
    insert into public.clients (
      company_name, contact_name, client_type
    )
    values (
      '  PREMIER   GROUP  ', 'SYNTHETIC CONTACT', 'corporate'
    );

    raise exception 'TEST FAILED: direct duplicate INSERT accepted';
  exception when unique_violation then
    null;
  end;

  insert into public.clients (
    company_name, contact_name, client_type
  )
  values (
    'SYNTHETIC UNIQUE ' || gen_random_uuid()::text,
    'SYNTHETIC CONTACT',
    'corporate'
  )
  returning id into v_test_client;

  begin
    update public.clients
    set company_name = 'premier group'
    where id = v_test_client;

    raise exception 'TEST FAILED: duplicate company UPDATE accepted';
  exception when unique_violation then
    null;
  end;
end;
$$;

select
  'Company consolidated; traveller IDs preserved; audit and INSERT/UPDATE uniqueness passed'
  as result;