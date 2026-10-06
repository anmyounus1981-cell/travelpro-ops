-- Separate passport name fields.
-- Existing full_name values are preserved without guessing name boundaries.
-- Legacy rows and newly uploaded drafts may have both fields unset.

alter table public.travellers
  add column given_name text,
  add column surname text;

alter table public.passport_extraction_drafts
  add column given_name text,
  add column surname text;

alter table public.travellers
  add constraint travellers_given_name_check
    check (
      given_name is null
      or char_length(btrim(given_name)) between 1 and 100
    ),
  add constraint travellers_surname_check
    check (
      surname is null
      or char_length(btrim(surname)) between 1 and 100
    ),
  add constraint travellers_combined_name_length_check
    check (
      char_length(
        concat_ws(' ', btrim(given_name), btrim(surname))
      ) <= 200
    );

alter table public.passport_extraction_drafts
  add constraint passport_drafts_given_name_check
    check (
      given_name is null
      or char_length(btrim(given_name)) between 1 and 100
    ),
  add constraint passport_drafts_surname_check
    check (
      surname is null
      or char_length(btrim(surname)) between 1 and 100
    ),
  add constraint passport_drafts_combined_name_length_check
    check (
      char_length(
        concat_ws(' ', btrim(given_name), btrim(surname))
      ) <= 200
    );

comment on column public.travellers.given_name is
  'Given names exactly as reviewed from the passport; no automatic splitting of legacy full_name.';

comment on column public.travellers.surname is
  'Surname exactly as reviewed from the passport; may be absent on a single-name passport.';

comment on column public.passport_extraction_drafts.given_name is
  'Draft given names; confirmation requires explicit owner review.';

comment on column public.passport_extraction_drafts.surname is
  'Draft surname; confirmation requires explicit owner review.';
-- New overload for separate passport name fields.
-- The existing seven-parameter function remains for deployment compatibility.

create or replace function public.create_traveller_atomic(
  p_client_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_image_path text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_given_name text := nullif(upper(btrim(p_given_name)), '');
  v_surname text := nullif(upper(btrim(p_surname)), '');
  v_full_name text;
  v_traveller_id uuid;
begin
  if v_given_name is null and v_surname is null then
    raise exception 'Enter the passport given name or surname';
  end if;

  if char_length(v_given_name) > 100
    or char_length(v_surname) > 100 then
    raise exception 'Each name field must be at most 100 characters';
  end if;

  v_full_name := concat_ws(' ', v_given_name, v_surname);

  if char_length(v_full_name) > 200 then
    raise exception 'Combined name must be at most 200 characters';
  end if;

  -- Existing function validates owner access, client, DOB, expiry,
  -- passport uniqueness and storage access.
  -- Traveller, document and audit writes remain in this transaction.
  v_traveller_id := public.create_traveller_atomic(
    p_client_id,
    v_full_name,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    p_image_path
  );

  update public.travellers
  set
    given_name = v_given_name,
    surname = v_surname
  where id = v_traveller_id;

  if not found then
    raise exception 'Unable to save separate traveller names';
  end if;

  return v_traveller_id;
end;
$$;

revoke all on function public.create_traveller_atomic(
  uuid, text, text, text, date, date, text, text
) from public, anon, authenticated;

grant execute on function public.create_traveller_atomic(
  uuid, text, text, text, date, date, text, text
) to authenticated;
-- Separate-name draft confirmation.
-- Preserve the original overload during deployment.

create or replace function public.confirm_passport_draft(
  p_draft_id uuid,
  p_given_name text,
  p_surname text,
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
  v_given_name text := nullif(upper(btrim(p_given_name)), '');
  v_surname text := nullif(upper(btrim(p_surname)), '');
  v_full_name text;
  v_passport_number text := upper(btrim(p_passport_number));
  v_nationality text := upper(btrim(p_nationality));
  v_now timestamptz := now();
begin
  select u.id into v_owner_id
  from public.app_users u
  where u.auth_user_id = (select auth.uid())
    and u.role = 'owner';

  if v_owner_id is null then
    raise exception 'Owner access required';
  end if;

  if jsonb_typeof(p_field_checks) is distinct from 'object'
    or (p_field_checks -> 'given_name') is distinct from 'true'::jsonb
    or (p_field_checks -> 'surname') is distinct from 'true'::jsonb
    or (p_field_checks -> 'passport_number') is distinct from 'true'::jsonb
    or (p_field_checks -> 'dob') is distinct from 'true'::jsonb
    or (p_field_checks -> 'expiry_date') is distinct from 'true'::jsonb
    or (p_field_checks -> 'nationality') is distinct from 'true'::jsonb
  then
    raise exception 'Review and confirm all six passport fields';
  end if;

  if v_given_name is null and v_surname is null then
    raise exception 'Enter the passport given name or surname';
  end if;

  if char_length(v_given_name) > 100
    or char_length(v_surname) > 100 then
    raise exception 'Each name field must be at most 100 characters';
  end if;

  v_full_name := concat_ws(' ', v_given_name, v_surname);

  if char_length(v_full_name) > 200 then
    raise exception 'Combined name must be at most 200 characters';
  end if;

  if coalesce(v_passport_number, '') = ''
    or char_length(v_passport_number) > 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  if coalesce(v_nationality, '') = ''
    or char_length(v_nationality) > 100 then
    raise exception 'Nationality must contain 1 to 100 characters';
  end if;

  if p_dob is null
    or p_dob > (v_now at time zone 'Asia/Dhaka')::date then
    raise exception 'Date of birth must not be in the future';
  end if;

  if p_expiry_date is null or p_expiry_date <= p_dob then
    raise exception 'Passport expiry date must be after date of birth';
  end if;

  select d.* into v_draft
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
    'uploaded', 'awaiting_review', 'extraction_failed'
  ) then
    raise exception 'Passport draft is not available for review';
  end if;

  insert into public.travellers (
    client_id, given_name, surname, full_name,
    passport_number, passport_number_confidence, passport_number_source,
    dob, dob_confidence, dob_source,
    expiry_date, expiry_date_confidence, expiry_date_source,
    nationality, nationality_confidence, nationality_source,
    verification_status, review_status, user_id
  )
  values (
    v_draft.client_id, v_given_name, v_surname, v_full_name,
    v_passport_number, null, 'owner_review',
    p_dob, null, 'owner_review',
    p_expiry_date, null, 'owner_review',
    v_nationality, null, 'owner_review',
    'verified', 'confirmed', v_owner_id
  )
  returning id into v_traveller_id;

  insert into public.documents (
    entity_type, entity_id, file_path, file_type, user_id
  )
  values (
    'traveller', v_traveller_id,
    v_draft.image_path, 'passport', v_owner_id
  );

  update public.passport_extraction_drafts
  set
    given_name = v_given_name,
    surname = v_surname,
    status = 'confirmed',
    reviewed_fields = jsonb_build_object(
      'given_name', v_given_name,
      'surname', v_surname,
      'passport_number', v_passport_number,
      'dob', p_dob,
      'expiry_date', p_expiry_date,
      'nationality', v_nationality,
      'field_checks', p_field_checks
    ),
    confirmed_traveller_id = v_traveller_id,
    reviewed_by = v_owner_id,
    reviewed_at = v_now,
    updated_at = v_now
  where id = p_draft_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner_id,
    'passport_draft.confirmed',
    'passport_draft',
    p_draft_id,
    jsonb_build_object(
      'traveller_id', v_traveller_id,
      'reviewed_fields', jsonb_build_array(
        'given_name', 'surname', 'passport_number',
        'dob', 'expiry_date', 'nationality'
      )
    ),
    v_owner_id
  );

  return v_traveller_id;
end;
$$;

revoke all on function public.confirm_passport_draft(
  uuid, text, text, text, date, date, text, jsonb
) from public, anon, authenticated;

grant execute on function public.confirm_passport_draft(
  uuid, text, text, text, date, date, text, jsonb
) to authenticated;
-- Separate-name correction with atomic audit and stale-form protection.

create or replace function public.correct_traveller_details(
  p_traveller_id uuid,
  p_expected_fields jsonb,
  p_given_name text,
  p_surname text,
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
  v_given_name text := nullif(upper(btrim(p_given_name)), '');
  v_surname text := nullif(upper(btrim(p_surname)), '');
  v_name text;
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
    or (p_field_checks -> 'given_name') is distinct from 'true'::jsonb
    or (p_field_checks -> 'surname') is distinct from 'true'::jsonb
    or (p_field_checks -> 'passport_number') is distinct from 'true'::jsonb
    or (p_field_checks -> 'dob') is distinct from 'true'::jsonb
    or (p_field_checks -> 'expiry_date') is distinct from 'true'::jsonb
    or (p_field_checks -> 'nationality') is distinct from 'true'::jsonb
  then
    raise exception 'Review and confirm all six passport fields';
  end if;

  if v_given_name is null and v_surname is null then
    raise exception 'Enter the passport given name or surname';
  end if;

  if char_length(v_given_name) > 100
    or char_length(v_surname) > 100 then
    raise exception 'Each name field must be at most 100 characters';
  end if;

  v_name := concat_ws(' ', v_given_name, v_surname);

  if char_length(v_name) > 200 then
    raise exception 'Combined name must be at most 200 characters';
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
    'given_name', v_traveller.given_name,
    'surname', v_traveller.surname,
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
    'given_name', v_given_name,
    'surname', v_surname,
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
  set
    given_name = v_given_name,
    surname = v_surname,
    full_name = v_name,
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
  uuid, jsonb, text, text, text, date, date, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.correct_traveller_details(
  uuid, jsonb, text, text, text, date, date, text, jsonb, text
) to authenticated;
-- Keep the compatibility full_name consistent with separate names.
-- Legacy records with both name fields unset retain their original name.

alter table public.travellers
  add constraint travellers_full_name_matches_parts_check
  check (
    (given_name is null and surname is null)
    or full_name = concat_ws(
      ' ',
      btrim(given_name),
      btrim(surname)
    )
  );