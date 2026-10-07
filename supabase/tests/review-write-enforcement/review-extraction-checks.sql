select set_config(
  'request.jwt.claim.sub',
  (
    select u.auth_user_id::text
    from public.app_users u
    join public.passport_extraction_drafts d
      on d.created_by = u.id
    where u.role = 'owner'
      and u.auth_user_id is not null
      and d.status in ('uploaded', 'extraction_failed')
      and d.confirmed_traveller_id is null
    order by d.created_at, d.id
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  v_owner uuid;
  v_draft public.passport_extraction_drafts%rowtype;
  v_saved uuid;
  v_audits_before bigint;
  v_fields jsonb := '{
    "given_name": "SYNTHETIC",
    "surname": "EXTRACTION TEST",
    "passport_number": "TEST-EXTRACTION-ONLY",
    "dob": "1990-01-01",
    "expiry_date": "2030-01-01",
    "nationality": "TEST"
  }'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'TEST FAILED: owner with available draft required';
  end if;

  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  select * into v_draft
  from public.passport_extraction_drafts
  where created_by = v_owner
    and status in ('uploaded', 'extraction_failed')
    and confirmed_traveller_id is null
  order by created_at, id
  limit 1
  ;

  if not found then
    raise exception 'TEST FAILED: available draft not found';
  end if;

  select count(*) into v_audits_before
  from public.audit_logs;
  v_saved := public.save_passport_draft_extraction(
    v_draft.id,
    v_draft.status,
    v_draft.updated_at,
    v_fields
  );

  if v_saved is distinct from v_draft.id then
    raise exception 'TEST FAILED: unexpected draft ID returned';
  end if;

  if not exists (
    select 1
    from public.passport_extraction_drafts
    where id = v_draft.id
      and status = 'awaiting_review'
      and extracted_fields = v_fields
      and confirmed_traveller_id is null
  ) then
    raise exception 'TEST FAILED: extracted fields not saved for review';
  end if;

  if (
    select count(*)
    from public.audit_logs
    where action = 'passport_draft.extraction_saved'
      and entity_type = 'passport_draft'
      and entity_id = v_draft.id
      and actor_id = v_owner
      and user_id = v_owner
      and details -> 'review_required' = 'true'::jsonb
  ) <> (
    select count(*)
    from public.audit_logs
    where action = 'passport_draft.extraction_saved'
      and entity_type = 'passport_draft'
      and entity_id = v_draft.id
      and actor_id = v_owner
      and user_id = v_owner
      and details -> 'review_required' = 'true'::jsonb
      and false
  ) + 1 then
    raise exception 'TEST FAILED: extraction audit incorrect';
  end if;

  begin
    perform public.save_passport_draft_extraction(
      v_draft.id,
      v_draft.status,
      v_draft.updated_at,
      '{"given_name": "STALE WRITE"}'::jsonb
    );

    raise exception 'TEST FAILED: stale extraction accepted';
  exception when raise_exception then
    if sqlerrm <> 'The draft changed. Refresh before continuing.' then
      raise;
    end if;
  end;

  if not exists (
    select 1
    from public.passport_extraction_drafts
    where id = v_draft.id
      and status = 'awaiting_review'
      and extracted_fields = v_fields
      and confirmed_traveller_id is null
  ) then
    raise exception 'TEST FAILED: stale request changed the draft';
  end if;

  if (select count(*) from public.audit_logs)
      <> v_audits_before + 1 then
    raise exception 'TEST FAILED: unexpected extraction audit writes';
  end if;
end;
$$;

reset role;

select
  'Extraction saved for human review; stale write rejected; audit recorded'
  as result;