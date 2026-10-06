-- App confirmation policy: passport expiry must be after today.
-- Existing records remain unchanged.

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

  if p_expiry_date < v_today then
    raise exception
      'Passport has expired. Enter the renewed passport details before confirming.';
  end if;

  if p_expiry_date = v_today then
    raise exception
      'Passport expires today. Enter the renewed passport details before confirming.';
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