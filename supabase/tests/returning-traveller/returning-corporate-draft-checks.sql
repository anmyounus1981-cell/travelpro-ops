-- Run this file inside a transaction ending with ROLLBACK.
-- Synthetic Storage metadata tests database checks only.
-- It does not test an actual image upload or download.

create temporary table returning_draft_fixture (
  owner_id uuid not null,
  auth_user_id uuid not null,
  client_id uuid,
  traveller_id uuid,
  draft_id uuid,
  image_path text,
  passport_number text,
  dob date,
  expiry_date date,
  profile_before jsonb
);

do $$
declare
  v_owner uuid;
  v_auth_user uuid;
begin
  select id, auth_user_id
  into v_owner, v_auth_user
  from public.app_users
  where role = 'owner'
    and auth_user_id is not null
  order by id
  limit 1;

  if v_auth_user is null then
    raise exception 'TEST FAILED: linked owner required';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    v_auth_user::text,
    true
  );

  insert into returning_draft_fixture (
    owner_id,
    auth_user_id,
    image_path,
    passport_number,
    dob,
    expiry_date
  )
  values (
    v_owner,
    v_auth_user,
    'drafts/synthetic-returning-' || gen_random_uuid()::text || '.png',
    'P' || upper(left(replace(gen_random_uuid()::text, '-', ''), 20)),
    ((now() at time zone 'Asia/Dhaka')::date - interval '30 years')::date,
    ((now() at time zone 'Asia/Dhaka')::date + interval '5 years')::date
  );
end;
$$;
do $$
declare
  v_fixture returning_draft_fixture%rowtype;
  v_client uuid;
  v_traveller uuid;
  v_before jsonb;
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

  v_client := public.create_client_with_review(
    gen_random_uuid(),
    'corporate',
    'SYNTHETIC RETURNING DRAFT ' || gen_random_uuid()::text,
    'SYNTHETIC CONTACT',
    null,
    null
  );

  v_traveller := public.create_traveller_with_date_review(
    v_client,
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

  select jsonb_build_object(
    'given_name', t.given_name,
    'surname', t.surname,
    'full_name', t.full_name,
    'passport_number', t.passport_number,
    'dob', t.dob,
    'expiry_date', t.expiry_date,
    'nationality', t.nationality,
    'verification_status', t.verification_status
  )
  into strict v_before
  from public.travellers t
  where t.id = v_traveller;

  perform public.correct_traveller_with_date_review(
    v_traveller,
    v_before,
    'SYNTHETIC',
    'RETURNING DRAFT',
    v_fixture.passport_number,
    v_fixture.dob,
    v_fixture.expiry_date,
    'TEST',
    v_checks,
    'Synthetic owner review for returning draft test',
    false,
    false
  );

  update returning_draft_fixture
  set
    client_id = v_client,
    traveller_id = v_traveller,
    profile_before = (
      select to_jsonb(t)
      from public.travellers t
      where t.id = v_traveller
    );
end;
$$;
do $$
declare
  v_fixture returning_draft_fixture%rowtype;
  v_draft uuid;
begin
  select * into strict v_fixture
  from returning_draft_fixture;

  if not exists (
    select 1
    from storage.buckets
    where id = 'passports'
  ) then
    raise exception 'TEST FAILED: passports bucket missing';
  end if;

  insert into storage.objects (
    bucket_id,
    name,
    owner_id,
    metadata
  )
  values (
    'passports',
    v_fixture.image_path,
    v_fixture.auth_user_id::text,
    '{"mimetype":"image/png"}'::jsonb
  );

  insert into public.passport_extraction_drafts (
    client_id,
    image_path,
    status,
    created_by
  )
  values (
    v_fixture.client_id,
    v_fixture.image_path,
    'uploaded',
    v_fixture.owner_id
  )
  returning id into v_draft;

  update returning_draft_fixture
  set draft_id = v_draft;
end;
$$;

-- Fixtures are prepared by the database administrator.
-- The actual confirmation assertions run as authenticated.
grant select on returning_draft_fixture to authenticated;

set local role authenticated;
do $$
declare
  v_fixture returning_draft_fixture%rowtype;
  v_result uuid;
  v_travellers_before bigint;
  v_documents_before bigint;
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

  select count(*) into v_travellers_before
  from public.travellers;

  select count(*) into v_documents_before
  from public.documents;

  v_result := public.confirm_returning_corporate_passport_draft(
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

  if v_result is distinct from v_fixture.traveller_id then
    raise exception 'TEST FAILED: existing traveller not reused';
  end if;

  if (select count(*) from public.travellers)
      <> v_travellers_before then
    raise exception 'TEST FAILED: traveller count changed';
  end if;

  if (
    select to_jsonb(t)
    from public.travellers t
    where t.id = v_fixture.traveller_id
  ) is distinct from v_fixture.profile_before then
    raise exception 'TEST FAILED: existing profile changed';
  end if;

  if (select count(*) from public.documents)
      <> v_documents_before + 1 then
    raise exception 'TEST FAILED: document count incorrect';
  end if;

  if (
    select count(*)
    from public.documents d
    where d.entity_type = 'traveller'
      and d.entity_id = v_fixture.traveller_id
      and d.file_path = v_fixture.image_path
      and d.file_type = 'passport'
      and d.user_id = v_fixture.owner_id
  ) <> 1 then
    raise exception 'TEST FAILED: passport document link incorrect';
  end if;

  if not exists (
    select 1
    from public.passport_extraction_drafts d
    where d.id = v_fixture.draft_id
      and d.status = 'confirmed'
      and d.confirmed_traveller_id = v_fixture.traveller_id
      and d.reviewed_by = v_fixture.owner_id
      and d.reviewed_at is not null
      and d.reviewed_fields ->> 'passport_number'
        = v_fixture.passport_number
      and d.reviewed_fields -> 'field_checks' = v_checks
  ) then
    raise exception 'TEST FAILED: draft confirmation incorrect';
  end if;

  if (
    select count(*)
    from public.audit_logs a
    where a.action = 'passport_draft.confirmed'
      and a.entity_type = 'passport_draft'
      and a.entity_id = v_fixture.draft_id
      and a.actor_id = v_fixture.owner_id
      and a.details ->> 'workflow'
        = 'returning_corporate_passport_review'
      and a.details ->> 'traveller_id'
        = v_fixture.traveller_id::text
      and a.details -> 'profile_reused' = 'true'::jsonb
      and a.details -> 'profile_changed' = 'false'::jsonb
      and exists (
        select 1
        from public.documents d
        where d.id::text = a.details ->> 'document_id'
          and d.entity_id = v_fixture.traveller_id
          and d.file_path = v_fixture.image_path
      )
  ) <> 1 then
    raise exception 'TEST FAILED: confirmation audit incorrect';
  end if;
end;
$$;
do $$
declare
  v_fixture returning_draft_fixture%rowtype;
  v_result uuid;
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

  select count(*) into v_documents_before
  from public.documents;

  select count(*) into v_audits_before
  from public.audit_logs;

  select to_jsonb(d) into strict v_draft_before
  from public.passport_extraction_drafts d
  where d.id = v_fixture.draft_id;

  v_result := public.confirm_returning_corporate_passport_draft(
    v_fixture.draft_id,
    v_fixture.traveller_id,
    'SYNTHETIC',
    'RETURNING DRAFT',
    lower(v_fixture.passport_number),
    v_fixture.dob,
    v_fixture.expiry_date,
    'test',
    v_checks,
    false,
    false
  );

  if v_result is distinct from v_fixture.traveller_id then
    raise exception 'TEST FAILED: retry returned a different traveller';
  end if;

  if (select count(*) from public.documents)
      <> v_documents_before then
    raise exception 'TEST FAILED: retry created another document';
  end if;

  if (select count(*) from public.audit_logs)
      <> v_audits_before then
    raise exception 'TEST FAILED: retry created another audit';
  end if;

  if (
    select to_jsonb(d)
    from public.passport_extraction_drafts d
    where d.id = v_fixture.draft_id
  ) is distinct from v_draft_before then
    raise exception 'TEST FAILED: retry changed the confirmed draft';
  end if;

  if (
    select to_jsonb(t)
    from public.travellers t
    where t.id = v_fixture.traveller_id
  ) is distinct from v_fixture.profile_before then
    raise exception 'TEST FAILED: retry changed the traveller profile';
  end if;
end;
$$;

reset role;

select
  'Existing corporate profile reused unchanged; document and audit passed; identical retry created no duplicates'
  as result;