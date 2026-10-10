-- Run after returning-corporate-draft-checks.sql,
-- in the same transaction, ending with ROLLBACK.

do $$
declare
  v_function regprocedure :=
    'public.confirm_returning_corporate_passport_draft(uuid,uuid,text,text,text,date,date,text,jsonb,boolean,boolean)'::regprocedure;
begin
  if has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception 'TEST FAILED: anonymous execution allowed';
  end if;

  if not has_function_privilege(
    'authenticated', v_function, 'EXECUTE'
  ) then
    raise exception 'TEST FAILED: authenticated execution missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_function::oid
      and p.prosecdef
      and 'search_path=""' = any(p.proconfig)
  ) then
    raise exception 'TEST FAILED: expected definer and fixed search_path';
  end if;
end;
$$;

-- Prepare another unconfirmed draft for rejection tests.
do $$
declare
  v_fixture returning_draft_fixture%rowtype;
  v_path text :=
    'drafts/synthetic-negative-' || gen_random_uuid()::text || '.png';
  v_draft uuid;
begin
  select * into strict v_fixture
  from returning_draft_fixture;

  insert into storage.objects (
    bucket_id, name, owner_id, metadata
  )
  values (
    'passports',
    v_path,
    v_fixture.auth_user_id::text,
    '{"mimetype":"image/png"}'::jsonb
  );

  insert into public.passport_extraction_drafts (
    client_id, image_path, status, created_by
  )
  values (
    v_fixture.client_id,
    v_path,
    'uploaded',
    v_fixture.owner_id
  )
  returning id into v_draft;

  update returning_draft_fixture
  set draft_id = v_draft,
      image_path = v_path;
end;
$$;
set local role authenticated;

do $$
declare
  v_fixture returning_draft_fixture%rowtype;
  v_field text;
  v_rejected boolean;
  v_expected_error text;
  v_checks jsonb;
  v_all_checks jsonb := '{
    "given_name": true,
    "surname": true,
    "passport_number": true,
    "dob": true,
    "expiry_date": true,
    "nationality": true
  }'::jsonb;
  v_draft_before jsonb;
  v_documents_before bigint;
  v_audits_before bigint;
begin
  select * into strict v_fixture
  from returning_draft_fixture;

  select to_jsonb(d) into strict v_draft_before
  from public.passport_extraction_drafts d
  where d.id = v_fixture.draft_id;

  select count(*) into v_documents_before
  from public.documents;

  select count(*) into v_audits_before
  from public.audit_logs;

  foreach v_field in array array[
    'given_name', 'surname', 'passport_number',
    'dob', 'expiry_date', 'nationality', 'unchecked'
  ] loop
    v_rejected := false;
    v_checks := v_all_checks;

    if v_field = 'unchecked' then
      v_checks := jsonb_set(
        v_checks, '{passport_number}', 'false'::jsonb
      );
      v_expected_error := 'Review and confirm all six passport fields';
    else
      v_expected_error :=
        'Passport details differ. Correct the existing traveller before linking this draft';
    end if;

    begin
      perform public.confirm_returning_corporate_passport_draft(
        v_fixture.draft_id,
        v_fixture.traveller_id,
        case when v_field = 'given_name'
          then 'DIFFERENT' else 'SYNTHETIC' end,
        case when v_field = 'surname'
          then 'DIFFERENT' else 'RETURNING DRAFT' end,
        case when v_field = 'passport_number'
          then 'DIFFERENT-PASSPORT'
          else v_fixture.passport_number end,
        case when v_field = 'dob'
          then v_fixture.dob + 1 else v_fixture.dob end,
        case when v_field = 'expiry_date'
          then v_fixture.expiry_date + 1
          else v_fixture.expiry_date end,
        case when v_field = 'nationality'
          then 'DIFFERENT' else 'TEST' end,
        v_checks,
        false,
        false
      );
    exception
      when others then
        if sqlerrm is distinct from v_expected_error then
          raise;
        end if;
        v_rejected := true;
    end;

    if not v_rejected then
      raise exception 'TEST FAILED: % was accepted', v_field;
    end if;
  end loop;

  if (
    select to_jsonb(d)
    from public.passport_extraction_drafts d
    where d.id = v_fixture.draft_id
  ) is distinct from v_draft_before
    or (select count(*) from public.documents)
      <> v_documents_before
    or (select count(*) from public.audit_logs)
      <> v_audits_before
    or (
      select to_jsonb(t)
      from public.travellers t
      where t.id = v_fixture.traveller_id
    ) is distinct from v_fixture.profile_before
  then
    raise exception 'TEST FAILED: rejected requests changed records';
  end if;
end;
$$;

reset role;
create temporary table returning_draft_negative_profiles (
  wrong_client_traveller_id uuid not null,
  unverified_traveller_id uuid not null
);

do $$
declare
  v_fixture returning_draft_fixture%rowtype;
  v_other_client uuid;
  v_wrong_client_traveller uuid;
  v_unverified_traveller uuid;
begin
  select * into strict v_fixture
  from returning_draft_fixture;

  v_other_client := public.create_client_with_review(
    gen_random_uuid(),
    'corporate',
    'SYNTHETIC OTHER COMPANY ' || gen_random_uuid()::text,
    'SYNTHETIC CONTACT',
    null,
    null
  );

  -- Same passport under another company must not be linked.
  v_wrong_client_traveller :=
    public.create_traveller_with_date_review(
      v_other_client,
      'SYNTHETIC',
      'RETURNING DRAFT',
      v_fixture.passport_number,
      v_fixture.dob,
      v_fixture.expiry_date,
      'TEST',
      null,
      false,
      false
    );

  -- A separate profile under the correct company remains unverified.
  v_unverified_traveller :=
    public.create_traveller_with_date_review(
      v_fixture.client_id,
      'SYNTHETIC',
      'UNVERIFIED',
      'P' || upper(left(replace(gen_random_uuid()::text, '-', ''), 20)),
      v_fixture.dob,
      v_fixture.expiry_date,
      'TEST',
      null,
      false,
      false
    );

  insert into returning_draft_negative_profiles
  values (
    v_wrong_client_traveller,
    v_unverified_traveller
  );
end;
$$;

grant select on returning_draft_negative_profiles
  to authenticated;
  set local role authenticated;

do $$
declare
  v_fixture returning_draft_fixture%rowtype;
  v_profiles returning_draft_negative_profiles%rowtype;
  v_target uuid;
  v_expected_error text;
  v_rejected boolean;
  v_test integer;
  v_documents_before bigint;
  v_audits_before bigint;
  v_draft_before jsonb;
  v_checks jsonb := '{
    "given_name": true,
    "surname": true,
    "passport_number": true,
    "dob": true,
    "expiry_date": true,
    "nationality": true
  }'::jsonb;
begin
  select * into strict v_fixture
  from returning_draft_fixture;

  select * into strict v_profiles
  from returning_draft_negative_profiles;

  select count(*) into v_documents_before
  from public.documents;

  select count(*) into v_audits_before
  from public.audit_logs;

  select to_jsonb(d) into strict v_draft_before
  from public.passport_extraction_drafts d
  where d.id = v_fixture.draft_id;

  for v_test in 1..2 loop
    if v_test = 1 then
      v_target := v_profiles.wrong_client_traveller_id;
      v_expected_error := 'Traveller belongs to a different client';
    else
      v_target := v_profiles.unverified_traveller_id;
      v_expected_error := 'Review and verify the existing traveller first';
    end if;

    v_rejected := false;

    begin
      perform public.confirm_returning_corporate_passport_draft(
        v_fixture.draft_id,
        v_target,
        'SYNTHETIC',
        'RETURNING DRAFT',
        v_fixture.passport_number,
        v_fixture.dob,
        v_fixture.expiry_date,
        'TEST',
        v_checks,
        false,
        false
      );
    exception
      when others then
        if sqlerrm is distinct from v_expected_error then
          raise;
        end if;
        v_rejected := true;
    end;

    if not v_rejected then
      raise exception 'TEST FAILED: profile rejection test % accepted',
        v_test;
    end if;
  end loop;

  if (select count(*) from public.documents)
      <> v_documents_before
    or (select count(*) from public.audit_logs)
      <> v_audits_before
    or (
      select to_jsonb(d)
      from public.passport_extraction_drafts d
      where d.id = v_fixture.draft_id
    ) is distinct from v_draft_before
    or (
      select to_jsonb(t)
      from public.travellers t
      where t.id = v_fixture.traveller_id
    ) is distinct from v_fixture.profile_before
  then
    raise exception 'TEST FAILED: rejected profile links changed records';
  end if;
end;
$$;

reset role;
set local role authenticated;

do $$
declare
  v_fixture returning_draft_fixture%rowtype;
  v_test integer;
  v_rejected boolean;
  v_expected_error text;
  v_checks jsonb := '{
    "given_name": true,
    "surname": true,
    "passport_number": true,
    "dob": true,
    "expiry_date": true,
    "nationality": true
  }'::jsonb;
begin
  select * into strict v_fixture
  from returning_draft_fixture;

  for v_test in 1..2 loop
    if v_test = 1 then
      perform set_config('request.jwt.claim.sub', '', true);
      v_expected_error := 'Authentication required';
    else
      -- Random identity has no linked owner account.
      perform set_config(
        'request.jwt.claim.sub',
        gen_random_uuid()::text,
        true
      );
      v_expected_error := 'Owner access required';
    end if;

    v_rejected := false;

    begin
      perform public.confirm_returning_corporate_passport_draft(
        v_fixture.draft_id,
        v_fixture.traveller_id,
        'SYNTHETIC',
        'RETURNING DRAFT',
        v_fixture.passport_number,
        v_fixture.dob,
        v_fixture.expiry_date,
        'TEST',
        v_checks,
        false,
        false
      );
    exception
      when others then
        if sqlerrm is distinct from v_expected_error then
          raise;
        end if;
        v_rejected := true;
    end;

    if not v_rejected then
      raise exception 'TEST FAILED: identity test % accepted', v_test;
    end if;
  end loop;

  perform set_config(
    'request.jwt.claim.sub',
    v_fixture.auth_user_id::text,
    true
  );
end;
$$;

reset role;

select
  'RPC permissions, fixed search_path, field mismatches, unchecked fields, wrong client, unverified profile and unauthorized identities rejected'
  as result;