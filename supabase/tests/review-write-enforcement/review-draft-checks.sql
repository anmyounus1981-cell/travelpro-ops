-- Select an existing uploaded draft with its registered image.
-- No image files are uploaded or deleted by this SQL test.
do $$
declare
  v_auth_user uuid;
begin
  select u.auth_user_id into v_auth_user
  from public.passport_extraction_drafts d
  join public.app_users u on u.id = d.created_by
  join storage.objects o
    on o.bucket_id = 'passports'
    and o.name = d.image_path
    and o.owner_id = u.auth_user_id::text
  where u.role = 'owner'
    and u.auth_user_id is not null
    and d.status = 'uploaded'
    and d.confirmed_traveller_id is null
    and d.image_path like 'drafts/%'
  order by d.id
  limit 1;

  if v_auth_user is null then
    raise exception
      'TEST FIXTURE MISSING: uploaded draft with owner-owned image required';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    v_auth_user::text,
    true
  );
end;
$$;

set local role authenticated;
do $$
declare
  v_draft public.passport_extraction_drafts%rowtype;
  v_owner uuid;
  v_result uuid;
  v_drafts_before bigint;
  v_audits_before bigint;
begin
  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid() and role = 'owner';

  select d.* into strict v_draft
  from public.passport_extraction_drafts d
  join storage.objects o
    on o.bucket_id = 'passports'
    and o.name = d.image_path
    and o.owner_id = auth.uid()::text
  where d.created_by = v_owner
    and d.status = 'uploaded'
    and d.confirmed_traveller_id is null
    and d.image_path like 'drafts/%'
  order by d.id
  limit 1;

  select count(*) into v_drafts_before
  from public.passport_extraction_drafts;

  select count(*) into v_audits_before
  from public.audit_logs;

  for i in 1..2 loop
    v_result := public.create_passport_review_draft(
      v_draft.client_id,
      v_draft.image_path
    );

    if v_result is distinct from v_draft.id then
      raise exception 'TEST FAILED: retry returned a different draft';
    end if;
  end loop;

  if (select count(*) from public.passport_extraction_drafts)
      <> v_drafts_before
    or (select count(*) from public.audit_logs)
      <> v_audits_before then
    raise exception 'TEST FAILED: retry created duplicate draft or audit';
  end if;
end;
$$;
do $$
declare
  v_draft public.passport_extraction_drafts%rowtype;
  v_owner uuid;
  v_id uuid;
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_passport text := 'D' || upper(
    left(replace(gen_random_uuid()::text, '-', ''), 20)
  );
  v_checks jsonb := '{
    "given_name": true,
    "surname": true,
    "passport_number": true,
    "dob": true,
    "expiry_date": true,
    "nationality": true
  }'::jsonb;
begin
  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid() and role = 'owner';

  select d.* into strict v_draft
  from public.passport_extraction_drafts d
  join storage.objects o
    on o.bucket_id = 'passports'
    and o.name = d.image_path
    and o.owner_id = auth.uid()::text
  where d.created_by = v_owner
    and d.status = 'uploaded'
    and d.confirmed_traveller_id is null
    and d.image_path like 'drafts/%'
  order by d.id
  limit 1;

  begin
    perform public.confirm_passport_draft_with_date_review(
      v_draft.id, 'ROLLBACK', 'DRAFT TEST', v_passport,
      (v_today - interval '30 years')::date,
      v_today - 1, 'TEST', v_checks, false, false
    );

    raise exception 'TEST FAILED: expired draft accepted';
  exception when raise_exception then
    if sqlerrm <>
      'Passport has expired. Enter the renewed passport details before confirming.' then
      raise;
    end if;
  end;

  if not exists (
    select 1 from public.passport_extraction_drafts
    where id = v_draft.id
      and status = 'uploaded'
      and confirmed_traveller_id is null
  ) or exists (
    select 1 from public.travellers
    where client_id = v_draft.client_id
      and passport_number = v_passport
  ) then
    raise exception 'TEST FAILED: rejected confirmation changed data';
  end if;

  v_id := public.confirm_passport_draft_with_date_review(
    v_draft.id, 'ROLLBACK', 'DRAFT TEST', v_passport,
    (v_today - interval '30 years')::date,
    (v_today + interval '5 years')::date,
    'TEST', v_checks, false, false
  );

  if not exists (
    select 1 from public.passport_extraction_drafts
    where id = v_draft.id
      and status = 'confirmed'
      and confirmed_traveller_id = v_id
  ) or not exists (
    select 1 from public.travellers
    where id = v_id
      and given_name = 'ROLLBACK'
      and surname = 'DRAFT TEST'
      and verification_status = 'verified'
  ) then
    raise exception 'TEST FAILED: approved confirmation incorrect';
  end if;

  if (
    select count(*) from public.documents
    where entity_type = 'traveller'
      and entity_id = v_id
      and file_type = 'passport'
      and file_path = v_draft.image_path
      and user_id = v_owner
  ) <> 1 then
    raise exception 'TEST FAILED: passport document link incorrect';
  end if;

  if (
    select count(*) from public.audit_logs
    where entity_type = 'passport_draft'
      and entity_id = v_draft.id
      and action = 'passport_draft.confirmed'
      and actor_id = v_owner
  ) <> 1 then
    raise exception 'TEST FAILED: confirmation audit incorrect';
  end if;
end;
$$;

reset role;

select 'Draft retry, expiry rejection, confirmation, document and audit passed'
  as result;