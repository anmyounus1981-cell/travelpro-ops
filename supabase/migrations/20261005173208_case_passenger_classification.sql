-- Passenger classification is calculated for a specific travel date.
-- Profile defaults are not authoritative for a journey.

create or replace function public.passenger_age_on(
  p_dob date,
  p_travel_date date
)
returns integer
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_age integer;
begin
  if p_dob is null
    or p_travel_date is null
    or not isfinite(p_dob)
    or not isfinite(p_travel_date)
    or p_dob < date '0001-01-01'
    or p_travel_date < p_dob then
    raise exception 'Valid DOB and travel date are required';
  end if;

  v_age :=
    extract(year from p_travel_date)::integer
    - extract(year from p_dob)::integer;

  if (
    extract(month from p_travel_date),
    extract(day from p_travel_date)
  ) < (
    extract(month from p_dob),
    extract(day from p_dob)
  ) then
    v_age := v_age - 1;
  end if;

  if v_age > 130 then
    raise exception 'Age at departure must not exceed 130 years';
  end if;

  return v_age;
end;
$$;

create or replace function public.passenger_type_on(
  p_dob date,
  p_travel_date date
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_age integer;
begin
  v_age := public.passenger_age_on(p_dob, p_travel_date);

  return case
    when v_age < 2 then 'INF'
    when v_age < 12 then 'CHD'
    else 'ADT'
  end;
end;
$$;

revoke all on function public.passenger_age_on(date, date)
  from public, anon, authenticated;

revoke all on function public.passenger_type_on(date, date)
  from public, anon, authenticated;

grant execute on function public.passenger_age_on(date, date)
  to authenticated;

grant execute on function public.passenger_type_on(date, date)
  to authenticated;
  -- Add a traveller to a case with server-calculated classification.
-- Case counts represent the planned passenger breakdown.

create or replace function public.assign_case_traveller(
  p_case_id uuid,
  p_traveller_id uuid,
  p_expected_dob date,
  p_accompanying_adult_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_case public.cases%rowtype;
  v_traveller public.travellers%rowtype;
  v_adult public.case_travellers%rowtype;
  v_adult_dob date;
  v_age integer;
  v_type text;
  v_limit integer;
  v_count integer;
  v_id uuid;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  -- Serialize assignments for this case.
  select * into v_case
  from public.cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Case not found';
  end if;

  if v_case.status in ('booked', 'ticketed', 'closed') then
    raise exception 'Booked, ticketed or closed cases require a separate passenger change review';
  end if;

  if v_case.return_date is not null
    and v_case.return_date < v_case.departure_date then
    raise exception 'Return date must not precede departure date';
  end if;

  select * into v_traveller
  from public.travellers
  where id = p_traveller_id
  for update;

  if not found then
    raise exception 'Traveller not found';
  end if;

  if v_traveller.client_id is distinct from v_case.client_id then
    raise exception 'Traveller and case must belong to the same client';
  end if;

  if v_traveller.dob is distinct from p_expected_dob then
    raise exception 'Traveller DOB changed. Refresh before assigning';
  end if;

  if v_traveller.verification_status is distinct from 'verified' then
    raise exception 'Complete owner passport review before assigning';
  end if;

  v_age := public.passenger_age_on(
    v_traveller.dob, v_case.departure_date
  );

  v_type := public.passenger_type_on(
    v_traveller.dob, v_case.departure_date
  );

  -- A category change during the journey needs carrier-specific review.
  if v_case.return_date is not null
    and public.passenger_type_on(
      v_traveller.dob, v_case.return_date
    ) <> v_type then
    raise exception 'Passenger type changes during the journey. Airline review required';
  end if;

  if exists (
    select 1 from public.case_travellers
    where case_id = p_case_id
      and traveller_id = p_traveller_id
  ) then
    raise exception 'Traveller is already assigned to this case';
  end if;

  v_limit := case v_type
    when 'ADT' then v_case.adult_count
    when 'CHD' then v_case.child_count
    else v_case.infant_count
  end;

  select count(*) into v_count
  from public.case_travellers
  where case_id = p_case_id
    and passenger_type = v_type;

  if v_count >= v_limit then
    raise exception 'Assignment exceeds the planned passenger count for this type';
  end if;

  if v_type = 'INF' then
    if p_accompanying_adult_id is null then
      raise exception 'Select an accompanying adult for the infant';
    end if;

    select * into v_adult
    from public.case_travellers
    where id = p_accompanying_adult_id
      and case_id = p_case_id
    for update;

    if not found or v_adult.passenger_type <> 'ADT' then
      raise exception 'Accompanying adult must be an ADT assigned to the same case';
    end if;

    select dob into v_adult_dob
    from public.travellers
    where id = v_adult.traveller_id
      and client_id = v_case.client_id
      and verification_status = 'verified'
    for share;

    if not found then
      raise exception 'Accompanying adult requires verified traveller details';
    end if;

    if public.passenger_age_on(
      v_adult_dob, v_case.departure_date
    ) < 18 then
      raise exception 'Accompanying adult must be at least 18 at departure';
    end if;

    if exists (
      select 1 from public.case_travellers
      where case_id = p_case_id
        and accompanying_adult_id = p_accompanying_adult_id
        and passenger_type = 'INF'
    ) then
      raise exception 'This adult already accompanies an infant';
    end if;
  elsif p_accompanying_adult_id is not null then
    raise exception 'Adult association is only available for infant passengers';
  end if;

  insert into public.case_travellers (
    case_id,
    traveller_id,
    passenger_type,
    age_at_departure,
    accompanying_adult_id,
    classification_source,
    user_id
  )
  values (
    p_case_id,
    p_traveller_id,
    v_type,
    v_age,
    p_accompanying_adult_id,
    'dob_calculated',
    v_owner
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.assign_case_traveller(
  uuid, uuid, date, uuid
) from public, anon, authenticated;

grant execute on function public.assign_case_traveller(
  uuid, uuid, date, uuid
) to authenticated;
-- Prevent silent changes to the basis of an existing classification.
-- Reclassification requires a separate, audited workflow.

create or replace function public.guard_assigned_traveller_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.dob is distinct from old.dob
    or new.client_id is distinct from old.client_id
    or new.verification_status is distinct from old.verification_status
  ) and exists (
    select 1
    from public.case_travellers
    where traveller_id = old.id
  ) then
    raise exception
      'Traveller has case assignments. Review passenger assignments before changing DOB, client or verification status';
  end if;

  return new;
end;
$$;

create trigger guard_assigned_traveller_changes
before update of dob, client_id, verification_status
on public.travellers
for each row
execute function public.guard_assigned_traveller_changes();


create or replace function public.guard_case_passenger_basis_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.client_id is distinct from old.client_id
    or new.departure_date is distinct from old.departure_date
    or new.return_date is distinct from old.return_date
    or new.passenger_count is distinct from old.passenger_count
    or new.adult_count is distinct from old.adult_count
    or new.child_count is distinct from old.child_count
    or new.infant_count is distinct from old.infant_count
  ) and exists (
    select 1
    from public.case_travellers
    where case_id = old.id
  ) then
    raise exception
      'Case has passenger assignments. Review assignments before changing client, travel dates or passenger counts';
  end if;

  return new;
end;
$$;

create trigger guard_case_passenger_basis_changes
before update of
  client_id, departure_date, return_date,
  passenger_count, adult_count, child_count, infant_count
on public.cases
for each row
execute function public.guard_case_passenger_basis_changes();

revoke all on function public.guard_assigned_traveller_changes()
  from public, anon, authenticated;

revoke all on function public.guard_case_passenger_basis_changes()
  from public, anon, authenticated;
  -- Audit every passenger assignment in the same transaction.

create or replace function public.audit_case_passenger_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if new.user_id is distinct from v_owner then
    raise exception 'Assignment owner must match the signed-in owner';
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'case.passenger_assigned',
    'case',
    new.case_id,
    jsonb_build_object(
      'case_traveller_id', new.id,
      'traveller_id', new.traveller_id,
      'passenger_type', new.passenger_type,
      'classification_source', new.classification_source,
      'accompanying_adult_id', new.accompanying_adult_id
    ),
    v_owner
  );

  return new;
end;
$$;

create trigger audit_case_passenger_assignment
after insert on public.case_travellers
for each row
execute function public.audit_case_passenger_assignment();

revoke all on function public.audit_case_passenger_assignment()
  from public, anon, authenticated;
  -- Apply assignment validation to every insert, including direct table writes.

create or replace function public.validate_case_passenger_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_case public.cases%rowtype;
  v_traveller public.travellers%rowtype;
  v_adult public.case_travellers%rowtype;
  v_adult_dob date;
  v_age integer;
  v_type text;
  v_limit integer;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if new.user_id is distinct from v_owner then
    raise exception 'Assignment owner must match the signed-in owner';
  end if;

  select * into v_case
  from public.cases
  where id = new.case_id
  for update;

  if not found then
    raise exception 'Case not found';
  end if;

  if v_case.status in ('booked', 'ticketed', 'closed') then
    raise exception
      'Booked, ticketed or closed cases require a separate passenger change review';
  end if;

  if v_case.return_date is not null
    and v_case.return_date < v_case.departure_date then
    raise exception 'Return date must not precede departure date';
  end if;

  select * into v_traveller
  from public.travellers
  where id = new.traveller_id
  for update;

  if not found then
    raise exception 'Traveller not found';
  end if;

  if v_traveller.client_id is distinct from v_case.client_id then
    raise exception 'Traveller and case must belong to the same client';
  end if;

  if v_traveller.verification_status is distinct from 'verified' then
    raise exception 'Complete owner passport review before assigning';
  end if;

  v_age := public.passenger_age_on(
    v_traveller.dob, v_case.departure_date
  );

  v_type := public.passenger_type_on(
    v_traveller.dob, v_case.departure_date
  );

  if new.passenger_type is distinct from v_type
    or new.age_at_departure is distinct from v_age
    or new.classification_source is distinct from 'dob_calculated'
    or new.classification_override_note is not null
    or new.gds_passenger_type_code is not null then
    raise exception
      'Assignment classification must match the DOB calculation';
  end if;

  if v_case.return_date is not null
    and public.passenger_type_on(
      v_traveller.dob, v_case.return_date
    ) <> v_type then
    raise exception
      'Passenger type changes during the journey. Airline review required';
  end if;

  if exists (
    select 1 from public.case_travellers
    where case_id = new.case_id
      and traveller_id = new.traveller_id
  ) then
    raise exception 'Traveller is already assigned to this case';
  end if;

  v_limit := case v_type
    when 'ADT' then v_case.adult_count
    when 'CHD' then v_case.child_count
    else v_case.infant_count
  end;

  if (
    select count(*)
    from public.case_travellers
    where case_id = new.case_id
      and passenger_type = v_type
  ) >= v_limit then
    raise exception
      'Assignment exceeds the planned passenger count for this type';
  end if;

  if v_type = 'INF' then
    if new.accompanying_adult_id is null then
      raise exception 'Select an accompanying adult for the infant';
    end if;

    select * into v_adult
    from public.case_travellers
    where id = new.accompanying_adult_id
      and case_id = new.case_id
    for update;

    if not found or v_adult.passenger_type <> 'ADT' then
      raise exception
        'Accompanying adult must be an ADT assigned to the same case';
    end if;

    select dob into v_adult_dob
    from public.travellers
    where id = v_adult.traveller_id
      and client_id = v_case.client_id
      and verification_status = 'verified'
    for share;

    if not found then
      raise exception
        'Accompanying adult requires verified traveller details';
    end if;

    if public.passenger_age_on(
      v_adult_dob, v_case.departure_date
    ) < 18 then
      raise exception
        'Accompanying adult must be at least 18 at departure';
    end if;

    if exists (
      select 1 from public.case_travellers
      where case_id = new.case_id
        and accompanying_adult_id = new.accompanying_adult_id
        and passenger_type = 'INF'
    ) then
      raise exception 'This adult already accompanies an infant';
    end if;
  elsif new.accompanying_adult_id is not null then
    raise exception
      'Adult association is only available for infant passengers';
  end if;

  return new;
end;
$$;

create trigger validate_case_passenger_insert
before insert on public.case_travellers
for each row
execute function public.validate_case_passenger_insert();

revoke all on function public.validate_case_passenger_insert()
  from public, anon, authenticated;
  -- Assignments are replaced through audited removal and reassignment.
-- Removal does not delete the traveller profile.

create or replace function public.guard_case_passenger_changes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_case public.cases%rowtype;
begin
  select id into v_owner
  from public.app_users
  where auth_user_id = (select auth.uid())
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if tg_op = 'UPDATE' then
    raise exception
      'Remove and reassign the passenger instead of updating an assignment';
  end if;

  select * into v_case
  from public.cases
  where id = old.case_id
  for update;

  if not found then
    raise exception
      'Remove passenger assignments before deleting the case';
  end if;

  if v_case.status in ('booked', 'ticketed', 'closed') then
    raise exception
      'Booked, ticketed or closed cases require a separate passenger change review';
  end if;

  if exists (
    select 1
    from public.case_travellers
    where accompanying_adult_id = old.id
  ) then
    raise exception
      'Remove the linked infant assignment before removing this adult';
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'case.passenger_removed',
    'case',
    old.case_id,
    jsonb_build_object(
      'case_traveller_id', old.id,
      'traveller_id', old.traveller_id,
      'passenger_type', old.passenger_type,
      'classification_source', old.classification_source,
      'accompanying_adult_id', old.accompanying_adult_id
    ),
    v_owner
  );

  return old;
end;
$$;

create trigger guard_case_passenger_changes
before update or delete on public.case_travellers
for each row
execute function public.guard_case_passenger_changes();

revoke all on function public.guard_case_passenger_changes()
  from public, anon, authenticated;