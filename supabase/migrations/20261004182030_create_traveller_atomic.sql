-- Manual traveller creation, document link and audit are atomic.
-- Storage upload remains a separate operation.

create or replace function public.create_traveller_atomic(
  p_client_id uuid,
  p_full_name text,
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
  v_owner uuid;
  v_traveller uuid;
  v_name text := upper(btrim(p_full_name));
  v_passport text := upper(btrim(p_passport_number));
  v_nationality text := upper(btrim(p_nationality));
  v_image_path text := nullif(btrim(p_image_path), '');
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if p_client_id is null or not exists (
    select 1 from public.clients
    where id = p_client_id
  ) then
    raise exception 'Client not found';
  end if;

  if coalesce(v_name, '') = ''
    or char_length(v_name) > 200 then
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

  if v_image_path is not null then
    if char_length(v_image_path) > 1024 or not exists (
      select 1 from storage.objects
      where bucket_id = 'passports'
        and name = v_image_path
    ) then
      raise exception 'Passport image not found or inaccessible';
    end if;
  end if;

  insert into public.travellers (
    client_id,
    full_name,
    passport_number,
    passport_number_confidence,
    passport_number_source,
    dob,
    dob_confidence,
    dob_source,
    expiry_date,
    expiry_date_confidence,
    expiry_date_source,
    nationality,
    nationality_confidence,
    nationality_source,
    verification_status,
    review_status,
    user_id
  )
  values (
    p_client_id,
    v_name,
    v_passport,
    null,
    case when v_image_path is null
      then 'manual' else 'manual_after_upload' end,
    p_dob,
    null,
    'manual',
    p_expiry_date,
    null,
    'manual',
    v_nationality,
    null,
    'manual',
    'client_confirmed',
    'unreviewed',
    v_owner
  )
  returning id into v_traveller;

  if v_image_path is not null then
    insert into public.documents (
      entity_type,
      entity_id,
      file_path,
      file_type,
      user_id
    )
    values (
      'traveller',
      v_traveller,
      v_image_path,
      'passport',
      v_owner
    );
  end if;

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
    'traveller.client_confirmed',
    'traveller',
    v_traveller,
    jsonb_build_object(
      'passport_uploaded', v_image_path is not null
    ),
    v_owner
  );

  return v_traveller;
end;
$$;

revoke all on function public.create_traveller_atomic(
  uuid, text, text, date, date, text, text
) from public, anon, authenticated;

grant execute on function public.create_traveller_atomic(
  uuid, text, text, date, date, text, text
) to authenticated;