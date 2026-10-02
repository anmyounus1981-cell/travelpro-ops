-- Owner-reviewed passport confirmation.
-- All writes succeed together or roll back together.

create or replace function public.confirm_passport_draft(
  p_draft_id uuid,
  p_full_name text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_draft public.passport_extraction_drafts%rowtype;
  v_traveller_id uuid;
  v_full_name text := upper(btrim(p_full_name));
  v_passport_number text := upper(btrim(p_passport_number));
  v_nationality text := upper(btrim(p_nationality));
  v_now timestamptz := now();
  v_reviewed_fields jsonb;
begin
  select u.id
  into v_owner_id
  from public.app_users u
  where u.auth_user_id = (select auth.uid())
    and u.role = 'owner';

  if v_owner_id is null then
    raise exception 'Owner access required';
  end if;

  if jsonb_typeof(p_field_checks) is distinct from 'object'
    or (p_field_checks -> 'full_name') is distinct from 'true'::jsonb
    or (p_field_checks -> 'passport_number') is distinct from 'true'::jsonb
    or (p_field_checks -> 'dob') is distinct from 'true'::jsonb
    or (p_field_checks -> 'expiry_date') is distinct from 'true'::jsonb
    or (p_field_checks -> 'nationality') is distinct from 'true'::jsonb
  then
    raise exception 'Review and confirm all five passport fields';
  end if;

  if coalesce(v_full_name, '') = ''
    or char_length(v_full_name) > 200
  then
    raise exception 'Full name is required and must be at most 200 characters';
  end if;

  if coalesce(v_passport_number, '') = ''
    or char_length(v_passport_number) > 30
  then
    raise exception 'Passport number is required and must be at most 30 characters';
  end if;

  if coalesce(v_nationality, '') = ''
    or char_length(v_nationality) > 100
  then
    raise exception 'Nationality is required and must be at most 100 characters';
  end if;

  if p_dob is null
    or p_dob > (v_now at time zone 'Asia/Dhaka')::date
  then
    raise exception 'Date of birth must be a valid date that is not in the future';
  end if;

  if p_expiry_date is null or p_expiry_date <= p_dob then
    raise exception 'Passport expiry date must be after date of birth';
  end if;

  select d.*
  into v_draft
  from public.passport_extraction_drafts d
  where d.id = p_draft_id
  for update;

  if not found then
    raise exception 'Passport draft not found';
  end if;

  if v_draft.status = 'confirmed' then
    raise exception 'Passport draft is already confirmed';
  end if;

  if v_draft.status not in (
    'uploaded',
    'awaiting_review',
    'extraction_failed'
  ) then
    raise exception 'Passport draft is not available for review';
  end if;

  v_reviewed_fields := jsonb_build_object(
    'full_name', v_full_name,
    'passport_number', v_passport_number,
    'dob', p_dob,
    'expiry_date', p_expiry_date,
    'nationality', v_nationality,
    'field_checks', p_field_checks
  );

  insert into public.travellers (
    client_id,
    full_name,
    passport_number,
    passport_number_source,
    dob,
    dob_source,
    expiry_date,
    expiry_date_source,
    nationality,
    nationality_source,
    verification_status,
    review_status,
    user_id
  )
  values (
    v_draft.client_id,
    v_full_name,
    v_passport_number,
    'owner_review',
    p_dob,
    'owner_review',
    p_expiry_date,
    'owner_review',
    v_nationality,
    'owner_review',
    'verified',
    'confirmed',
    v_owner_id
  )
  returning id into v_traveller_id;

  insert into public.documents (
    entity_type,
    entity_id,
    file_path,
    file_type,
    user_id
  )
  values (
    'traveller',
    v_traveller_id,
    v_draft.image_path,
    'passport',
    v_owner_id
  );

  update public.passport_extraction_drafts
  set
    status = 'confirmed',
    reviewed_fields = v_reviewed_fields,
    confirmed_traveller_id = v_traveller_id,
    reviewed_by = v_owner_id,
    reviewed_at = v_now,
    updated_at = v_now
  where id = p_draft_id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    details,
    user_id
  )
  values (
    v_owner_id,
    'passport_draft.confirmed',
    'passport_draft',
    p_draft_id,
    jsonb_build_object(
      'traveller_id', v_traveller_id,
      'reviewed_fields',
      jsonb_build_array(
        'full_name',
        'passport_number',
        'dob',
        'expiry_date',
        'nationality'
      )
    ),
    v_owner_id
  );

  return v_traveller_id;
end;
$$;

revoke all on function public.confirm_passport_draft(
  uuid, text, text, date, date, text, jsonb
) from public, anon, authenticated;

grant execute on function public.confirm_passport_draft(
  uuid, text, text, date, date, text, jsonb
) to authenticated;