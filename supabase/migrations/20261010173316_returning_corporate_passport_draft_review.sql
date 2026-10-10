-- Link a reviewed corporate passport draft to an existing profile.
-- Traveller details remain unchanged.
-- Document linking, draft confirmation and audit are atomic.

create or replace function public.confirm_returning_corporate_passport_draft(
  p_draft_id uuid,
  p_traveller_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_draft public.passport_extraction_drafts%rowtype;
  v_traveller public.travellers%rowtype;
  v_document_id uuid;
  v_document_count bigint;
  v_date_review jsonb;
  v_reviewed_fields jsonb;
  v_now timestamptz := now();

  v_given_name text :=
    nullif(upper(btrim(coalesce(p_given_name, ''))), '');

  v_surname text :=
    nullif(upper(btrim(coalesce(p_surname, ''))), '');

  v_passport text :=
    upper(btrim(coalesce(p_passport_number, '')));

  v_nationality text :=
    upper(btrim(coalesce(p_nationality, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select u.id into v_owner
  from public.app_users u
  where u.auth_user_id = auth.uid()
    and u.role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if p_draft_id is null or p_traveller_id is null then
    raise exception 'Passport draft and traveller are required';
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

  if char_length(concat_ws(' ', v_given_name, v_surname)) > 200 then
    raise exception 'Combined name must be at most 200 characters';
  end if;

  if char_length(v_passport) not between 1 and 30 then
    raise exception 'Passport number must contain 1 to 30 characters';
  end if;

  if char_length(v_nationality) not between 1 and 100 then
    raise exception 'Nationality must contain 1 to 100 characters';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob,
    p_expiry_date,
    p_age_confirmed,
    p_expiry_confirmed
  );

  v_reviewed_fields := jsonb_build_object(
    'given_name', v_given_name,
    'surname', v_surname,
    'passport_number', v_passport,
    'dob', p_dob,
    'expiry_date', p_expiry_date,
    'nationality', v_nationality,
    'field_checks', p_field_checks
  );
    select d.* into v_draft
  from public.passport_extraction_drafts d
  where d.id = p_draft_id
  for update;

  if not found then
    raise exception 'Passport draft not found';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = v_draft.client_id
      and c.client_type = 'corporate'
  ) then
    raise exception 'Select a valid corporate client';
  end if;

  if v_draft.status = 'confirmed' then
    -- An identical retry returns the original result without new writes.
    if v_draft.confirmed_traveller_id = p_traveller_id
      and v_draft.reviewed_by = v_owner
      and v_draft.reviewed_fields = v_reviewed_fields
      and exists (
        select 1
        from public.audit_logs a
        where a.action = 'passport_draft.confirmed'
          and a.entity_type = 'passport_draft'
          and a.entity_id = p_draft_id
          and a.actor_id = v_owner
          and a.details ->> 'workflow'
            = 'returning_corporate_passport_review'
          and a.details ->> 'traveller_id'
            = p_traveller_id::text
      )
    then
      return p_traveller_id;
    end if;

    raise exception 'Passport draft is already confirmed';
  end if;

  if v_draft.confirmed_traveller_id is not null
    or v_draft.status not in (
      'uploaded', 'awaiting_review', 'extraction_failed'
    )
  then
    raise exception 'Passport draft is not available for review';
  end if;

  select t.* into v_traveller
  from public.travellers t
  where t.id = p_traveller_id
  for update;

  if not found then
    raise exception 'Traveller not found';
  end if;

  if v_traveller.client_id is distinct from v_draft.client_id then
    raise exception 'Traveller belongs to a different client';
  end if;

  if v_traveller.verification_status is distinct from 'verified' then
    raise exception 'Review and verify the existing traveller first';
  end if;

  if nullif(upper(btrim(v_traveller.given_name)), '')
      is distinct from v_given_name
    or nullif(upper(btrim(v_traveller.surname)), '')
      is distinct from v_surname
    or upper(btrim(v_traveller.passport_number))
      is distinct from v_passport
    or v_traveller.dob is distinct from p_dob
    or v_traveller.expiry_date is distinct from p_expiry_date
    or upper(btrim(v_traveller.nationality))
      is distinct from v_nationality
  then
    raise exception
      'Passport details differ. Correct the existing traveller before linking this draft';
  end if;
    -- Verify the private image belongs to the draft's owner uploader.
  perform 1
  from storage.objects o
  join public.app_users u
    on o.owner_id = u.auth_user_id::text
  where o.bucket_id = 'passports'
    and o.name = v_draft.image_path
    and u.id = v_draft.created_by
    and u.role = 'owner'
  for share of o, u;

  if not found then
    raise exception 'Passport image not found or inaccessible';
  end if;

  -- Refuse an image path already linked elsewhere or ambiguously.
  select count(*), min(d.id::text)::uuid
  into v_document_count, v_document_id
  from public.documents d
  where d.file_path = v_draft.image_path;

  if v_document_count > 1 then
    raise exception 'Passport image has conflicting document links';
  end if;

  if v_document_count = 1 then
    perform 1
    from public.documents d
    where d.id = v_document_id
      and d.entity_type = 'traveller'
      and d.entity_id = p_traveller_id
      and d.file_type = 'passport'
    for update;

    if not found then
      raise exception 'Passport image is already linked elsewhere';
    end if;
  else
    insert into public.documents (
      entity_type,
      entity_id,
      file_path,
      file_type,
      user_id
    )
    values (
      'traveller',
      p_traveller_id,
      v_draft.image_path,
      'passport',
      v_owner
    )
    returning id into v_document_id;
  end if;
    update public.passport_extraction_drafts
  set
    given_name = v_given_name,
    surname = v_surname,
    status = 'confirmed',
    reviewed_fields = v_reviewed_fields,
    confirmed_traveller_id = p_traveller_id,
    reviewed_by = v_owner,
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
    v_owner,
    'passport_draft.confirmed',
    'passport_draft',
    p_draft_id,
    jsonb_build_object(
      'workflow', 'returning_corporate_passport_review',
      'traveller_id', p_traveller_id,
      'client_id', v_draft.client_id,
      'document_id', v_document_id,
      'profile_reused', true,
      'profile_changed', false,
      'reviewed_fields', jsonb_build_array(
        'given_name', 'surname', 'passport_number',
        'dob', 'expiry_date', 'nationality'
      )
    ),
    v_owner
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean
  then
    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      details,
      user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      p_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'returning_corporate_passport_review',
        'draft_id', p_draft_id
      ),
      v_owner
    );
  end if;

  return p_traveller_id;
end;
$$;

alter function public.confirm_returning_corporate_passport_draft(
  uuid, uuid, text, text, text, date, date, text,
  jsonb, boolean, boolean
) owner to postgres;

revoke all on function public.confirm_returning_corporate_passport_draft(
  uuid, uuid, text, text, text, date, date, text,
  jsonb, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.confirm_returning_corporate_passport_draft(
  uuid, uuid, text, text, text, date, date, text,
  jsonb, boolean, boolean
) to authenticated;