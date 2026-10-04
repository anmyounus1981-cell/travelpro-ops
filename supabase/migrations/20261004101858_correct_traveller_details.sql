-- Owner-reviewed corrections and audit succeed together.

create or replace function public.correct_traveller_details(
  p_traveller_id uuid,
  p_expected_fields jsonb,
  p_full_name text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller public.travellers%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_changed jsonb;
  v_name text := upper(btrim(p_full_name));
  v_passport text := upper(btrim(p_passport_number));
  v_nationality text := upper(btrim(p_nationality));
  v_reason text := btrim(p_reason);
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
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

  if coalesce(v_name, '') = '' or char_length(v_name) > 200 then
    raise exception 'Full name must contain 1 to 200 characters';
  end if;

  if coalesce(v_passport, '') = ''
    or char_length(v_passport) > 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  if coalesce(v_nationality, '') = ''
    or char_length(v_nationality) > 100 then
    raise exception 'Nationality must contain 1 to 100 characters';
  end if;

  if p_dob is null
    or p_dob > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Date of birth must not be in the future';
  end if;

  if p_expiry_date is null or p_expiry_date <= p_dob then
    raise exception 'Passport expiry date must be after date of birth';
  end if;

  if coalesce(v_reason, '') = ''
    or char_length(v_reason) > 500 then
    raise exception 'Correction reason must contain 1 to 500 characters';
  end if;

  select * into v_traveller
  from public.travellers
  where id = p_traveller_id
  for update;

  if not found then
    raise exception 'Traveller not found';
  end if;

  v_before := jsonb_build_object(
    'full_name', v_traveller.full_name,
    'passport_number', v_traveller.passport_number,
    'dob', v_traveller.dob,
    'expiry_date', v_traveller.expiry_date,
    'nationality', v_traveller.nationality,
    'verification_status', v_traveller.verification_status
  );

  if p_expected_fields is distinct from v_before then
    raise exception 'Traveller changed. Refresh before saving';
  end if;

  v_after := jsonb_build_object(
    'full_name', v_name,
    'passport_number', v_passport,
    'dob', p_dob,
    'expiry_date', p_expiry_date,
    'nationality', v_nationality,
    'verification_status', 'verified'
  );

  select coalesce(jsonb_agg(e.key order by e.key), '[]'::jsonb)
  into v_changed
  from jsonb_each(v_after) as e
  where e.value is distinct from (v_before -> e.key);

  if v_changed = '[]'::jsonb then
    raise exception 'No changes to save';
  end if;

  update public.travellers
  set full_name = v_name,
      passport_number = v_passport,
      dob = p_dob,
      expiry_date = p_expiry_date,
      nationality = v_nationality,
      passport_number_confidence = null,
      dob_confidence = null,
      expiry_date_confidence = null,
      nationality_confidence = null,
      passport_number_source = 'owner_review',
      dob_source = 'owner_review',
      expiry_date_source = 'owner_review',
      nationality_source = 'owner_review',
      verification_status = 'verified',
      review_status = 'confirmed'
  where id = p_traveller_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'traveller.details_corrected',
    'traveller',
    p_traveller_id,
    jsonb_build_object(
      'changed_fields', v_changed,
      'reason', v_reason,
      'field_checks', p_field_checks
    ),
    v_owner
  );

  return p_traveller_id;
end;
$$;

revoke all on function public.correct_traveller_details(
  uuid, jsonb, text, text, date, date, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.correct_traveller_details(
  uuid, jsonb, text, text, date, date, text, jsonb, text
) to authenticated;