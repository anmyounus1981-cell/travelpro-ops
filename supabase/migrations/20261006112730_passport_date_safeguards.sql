-- Data-entry safeguards, not airline or immigration eligibility rules.

create or replace function public.validate_passport_dates(
  p_dob date,
  p_expiry_date date,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_age integer;
  v_age_unusual boolean;
  v_expiry_unusual boolean;
begin
  if p_dob is null
    or not isfinite(p_dob)
    or p_dob < date '0001-01-01'
    or p_dob > v_today then
    raise exception
      'Date of birth must be valid and not in the future.';
  end if;

  v_age := public.passenger_age_on(p_dob, v_today);

  if p_expiry_date is null
    or not isfinite(p_expiry_date)
    or p_expiry_date > date '9999-12-31'
    or p_expiry_date <= p_dob then
    raise exception
      'Passport expiry date must be valid and after date of birth.';
  end if;

  v_age_unusual := v_age > 100;
  v_expiry_unusual :=
    p_expiry_date > (v_today + interval '10 years')::date;

  if v_age_unusual
    and p_age_confirmed is distinct from true then
    raise exception
      'Confirm the DOB against the passport because age exceeds 100 years.';
  end if;

  if v_expiry_unusual
    and p_expiry_confirmed is distinct from true then
    raise exception
      'Confirm the expiry against the passport because it is more than 10 years from today.';
  end if;

  return jsonb_build_object(
    'reference_date', v_today,
    'age', v_age,
    'age_requires_confirmation', v_age_unusual,
    'expiry_requires_confirmation', v_expiry_unusual,
    'age_confirmed',
      v_age_unusual and coalesce(p_age_confirmed, false),
    'expiry_confirmed',
      v_expiry_unusual and coalesce(p_expiry_confirmed, false)
  );
end;
$$;

revoke all on function public.validate_passport_dates(
  date, date, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.validate_passport_dates(
  date, date, boolean, boolean
) to authenticated;
create or replace function public.create_traveller_with_date_review(
  p_client_id uuid,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_image_path text,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller_id uuid;
  v_date_review jsonb;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob,
    p_expiry_date,
    p_age_confirmed,
    p_expiry_confirmed
  );

  v_traveller_id := public.create_traveller_atomic(
    p_client_id,
    p_given_name,
    p_surname,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    p_image_path
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, details, user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      v_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'manual_creation'
      ),
      v_owner
    );
  end if;

  return v_traveller_id;
end;
$$;

revoke all on function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
) to authenticated;
create or replace function public.confirm_passport_draft_with_date_review(
  p_draft_id uuid,
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
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller_id uuid;
  v_date_review jsonb;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob,
    p_expiry_date,
    p_age_confirmed,
    p_expiry_confirmed
  );

  v_traveller_id := public.confirm_passport_draft(
    p_draft_id,
    p_given_name,
    p_surname,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    p_field_checks
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, details, user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      v_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'passport_draft_confirmation',
        'draft_id', p_draft_id
      ),
      v_owner
    );
  end if;

  return v_traveller_id;
end;
$$;

revoke all on function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
) to authenticated;
create or replace function public.correct_traveller_with_date_review(
  p_traveller_id uuid,
  p_expected_fields jsonb,
  p_given_name text,
  p_surname text,
  p_passport_number text,
  p_dob date,
  p_expiry_date date,
  p_nationality text,
  p_field_checks jsonb,
  p_reason text,
  p_age_confirmed boolean,
  p_expiry_confirmed boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller_id uuid;
  v_date_review jsonb;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob,
    p_expiry_date,
    p_age_confirmed,
    p_expiry_confirmed
  );

  v_traveller_id := public.correct_traveller_details(
    p_traveller_id,
    p_expected_fields,
    p_given_name,
    p_surname,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    p_field_checks,
    p_reason
  );

  if (v_date_review ->> 'age_requires_confirmation')::boolean
    or (v_date_review ->> 'expiry_requires_confirmation')::boolean then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, details, user_id
    )
    values (
      v_owner,
      'traveller.unusual_dates_confirmed',
      'traveller',
      v_traveller_id,
      v_date_review || jsonb_build_object(
        'workflow', 'traveller_correction'
      ),
      v_owner
    );
  end if;

  return v_traveller_id;
end;
$$;

revoke all on function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text, jsonb, text,
  boolean, boolean
) from public, anon, authenticated;

grant execute on function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text, jsonb, text,
  boolean, boolean
) to authenticated;