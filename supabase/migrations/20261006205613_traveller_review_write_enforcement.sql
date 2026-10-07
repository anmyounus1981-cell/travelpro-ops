-- Approved review entry points retain their existing owner checks,
-- date validation, transaction boundaries and audit writes.
-- Direct-write revocations and helper restrictions follow below.

alter function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
)
  security definer;

alter function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
)
  set search_path = '';

alter function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
)
  security definer;

alter function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
)
  set search_path = '';

alter function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text,
  jsonb, text, boolean, boolean
)
  security definer;

alter function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text,
  jsonb, text, boolean, boolean
)
  set search_path = '';

revoke all on function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
) from public, anon, authenticated;

revoke all on function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
) from public, anon, authenticated;

revoke all on function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text,
  jsonb, text, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.create_traveller_with_date_review(
  uuid, text, text, text, date, date, text, text, boolean, boolean
) to authenticated;

grant execute on function public.confirm_passport_draft_with_date_review(
  uuid, text, text, text, date, date, text, jsonb, boolean, boolean
) to authenticated;

grant execute on function public.correct_traveller_with_date_review(
  uuid, jsonb, text, text, text, date, date, text,
  jsonb, text, boolean, boolean
) to authenticated;
-- Legacy write functions remain internal dependencies.
-- Client roles cannot call them directly to bypass date review.













-- Preserve passenger assignment after traveller UPDATE is revoked.
-- This function locks traveller rows and invokes validation/audit triggers.

alter function public.assign_case_traveller(
  uuid, uuid, date, uuid
)
  security definer;

alter function public.assign_case_traveller(
  uuid, uuid, date, uuid
)
  set search_path = '';

revoke all on function public.assign_case_traveller(
  uuid, uuid, date, uuid
) from public, anon, authenticated;

grant execute on function public.assign_case_traveller(
  uuid, uuid, date, uuid
) to authenticated;
-- Traveller writes must go through the approved review functions.
-- Directory and review pages retain SELECT access under existing RLS.



grant select on table public.travellers
  to authenticated;

-- Passenger assignment writes must go through the approved RPC.
-- This also removes the previously detected TRUNCATE permission.



grant select on table public.case_travellers
  to authenticated;
  -- Register an uploaded passport image and its audit atomically.
create or replace function public.create_passport_review_draft(
  p_client_id uuid,
  p_image_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_draft_id uuid;
  v_existing public.passport_extraction_drafts%rowtype;
  v_path text := btrim(p_image_path);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into strict v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_path is null
    or char_length(v_path) not between 1 and 1024
    or v_path not like 'drafts/%' then
    raise exception 'Invalid passport image path';
  end if;

  if not exists (
    select 1 from public.clients
    where id = p_client_id
  ) then
    raise exception 'Client not found';
  end if;

  -- SECURITY DEFINER bypasses Storage RLS, so check ownership explicitly.
  perform 1
  from storage.objects
  where bucket_id = 'passports'
    and name = v_path
    and owner_id = auth.uid()::text
  for update;

  if not found then
    raise exception 'Passport image not found or inaccessible';
  end if;

  select * into v_existing
  from public.passport_extraction_drafts
  where image_path = v_path
  for update;

  if found then
    if v_existing.client_id = p_client_id
      and v_existing.created_by = v_owner then
      return v_existing.id;
    end if;

    raise exception 'Passport image is already registered';
  end if;
  insert into public.passport_extraction_drafts (
    client_id, image_path, status, created_by
  )
  values (
    p_client_id, v_path, 'uploaded', v_owner
  )
  returning id into v_draft_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'passport_draft.uploaded',
    'passport_draft',
    v_draft_id,
    jsonb_build_object('client_id', p_client_id),
    v_owner
  );

  return v_draft_id;

exception
  when no_data_found then
    raise exception 'Owner access required';
end;
$$;

revoke all on function public.create_passport_review_draft(
  uuid, text
) from public, anon, authenticated;

grant execute on function public.create_passport_review_draft(
  uuid, text
) to authenticated;
-- Save assistive extraction without confirming traveller details.
create or replace function public.save_passport_draft_extraction(
  p_draft_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_extracted_fields jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_draft public.passport_extraction_drafts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if jsonb_typeof(p_extracted_fields) is distinct from 'object'
    or octet_length(p_extracted_fields::text) > 16384 then
    raise exception 'Invalid extracted passport fields';
  end if;

  select * into v_draft
  from public.passport_extraction_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'Passport draft not found';
  end if;

  if v_draft.status is distinct from p_expected_status
    or v_draft.updated_at is distinct from p_expected_updated_at then
    raise exception 'The draft changed. Refresh before continuing.';
  end if;

  if v_draft.status not in ('uploaded', 'extraction_failed')
    or v_draft.confirmed_traveller_id is not null then
    raise exception 'This draft is not available for extraction.';
  end if;

  update public.passport_extraction_drafts
  set
    extracted_fields = p_extracted_fields,
    provider_name = 'openai:gpt-4.1-mini',
    confidence_by_field = '{}'::jsonb,
    evidence_by_field = '{}'::jsonb,
    extraction_error_code = null,
    status = 'awaiting_review',
    updated_at = clock_timestamp()
  where id = p_draft_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'passport_draft.extraction_saved',
    'passport_draft',
    p_draft_id,
    jsonb_build_object(
      'source', 'assistive_extraction',
      'review_required', true
    ),
    v_owner
  );

  return p_draft_id;
end;
$$;

revoke all on function public.save_passport_draft_extraction(
  uuid, text, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.save_passport_draft_extraction(
  uuid, text, timestamptz, jsonb
) to authenticated;
-- Draft writes use approved registration, extraction and review RPCs.
-- Queue and review pages retain SELECT access under existing RLS.



grant select on table public.passport_extraction_drafts
  to authenticated;
  -- Link existing payment/ticket uploads without changing financial status.
-- Passport document links remain internal to traveller review RPCs.
create or replace function public.link_operational_document(
  p_entity_type text,
  p_entity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_path text;
  v_bucket text;
  v_file_type text;
  v_document_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  if p_entity_type = 'payment' then
    select evidence_file_path into v_path
    from public.payments
    where id = p_entity_id and user_id = v_owner
    for update;

    if not found then
      raise exception 'Payment not found or inaccessible';
    end if;

    v_bucket := 'payment-evidence';
    v_file_type := 'payment_evidence';

  elsif p_entity_type = 'ticket' then
    select e_ticket_path into v_path
    from public.tickets
    where id = p_entity_id
      and user_id = v_owner
      and issued_by = v_owner
    for update;

    if not found then
      raise exception 'Ticket not found or inaccessible';
    end if;

    v_bucket := 'e-tickets';
    v_file_type := 'e_ticket';

  else
    raise exception 'Unsupported document entity';
  end if;

  if nullif(btrim(v_path), '') is null then
    raise exception 'Document file path is missing';
  end if;

  perform 1
  from storage.objects
  where bucket_id = v_bucket
    and name = v_path
    and owner_id = auth.uid()::text
  for share;

  if not found then
    raise exception 'Document upload not found or inaccessible';
  end if;

  select id into v_document_id
  from public.documents
  where entity_type = p_entity_type
    and entity_id = p_entity_id
    and file_type = v_file_type
    and file_path = v_path
    and user_id = v_owner
  order by id
  limit 1;

  if found then
    return v_document_id;
  end if;

  insert into public.documents (
    entity_type, entity_id, file_path, file_type, user_id
  )
  values (
    p_entity_type, p_entity_id, v_path, v_file_type, v_owner
  )
  returning id into v_document_id;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner,
    'document.linked',
    p_entity_type,
    p_entity_id,
    jsonb_build_object(
      'document_id', v_document_id,
      'file_type', v_file_type
    ),
    v_owner
  );

  return v_document_id;
end;
$$;

revoke all on function public.link_operational_document(
  text, uuid
) from public, anon, authenticated;

grant execute on function public.link_operational_document(
  text, uuid
) to authenticated;
-- Document metadata writes must use approved owner-checked RPCs.
-- Authenticated reads remain subject to existing RLS policies.



grant select on table public.documents
to authenticated;
-- Compatibility audit endpoint for existing operational actions.
-- Protected review events are written only by their workflow RPCs.
-- This endpoint does not make separate business writes atomic.

create or replace function public.record_operational_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_allowed boolean;
  v_audit_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_allowed := case p_entity_type
    when 'case' then p_action = any(array[
      'case.created',
      'case.status_changed',
      'case.ai_draft_confirmed'
    ])
    when 'client' then p_action = any(array[
      'client.created', 'client.updated', 'client.deleted'
    ])
    when 'quotation' then p_action = any(array[
      'quotation.created', 'quotation.draft',
      'quotation.approved', 'quotation.sent',
      'quotation.accepted', 'quotation.rejected'
    ])
    when 'booking' then p_action = 'booking.created'
    when 'payment' then p_action = any(array[
      'payment.evidence_submitted',
      'payment.verified', 'payment.rejected'
    ])
    when 'ticket' then p_action = 'ticket.issued'
    when 'reminder' then p_action = 'reminder.scheduled'
    when 'owner_alert' then p_action = any(array[
      'owner_alert.acknowledged', 'owner_alert.dismissed'
    ])
    when 'service_case' then p_action = any(array[
      'service_case.requested', 'service_case.in_review',
      'service_case.accepted', 'service_case.completed',
      'service_case.rejected'
    ])
    when 'inquiry' then p_action = 'inquiry.converted'
    else false
  end;

  if v_allowed is distinct from true then
    raise exception 'Unsupported operational audit event';
  end if;

  if p_entity_id is null then
    raise exception 'Audit entity ID is required';
  end if;

  if jsonb_typeof(p_details) is distinct from 'object'
    or octet_length(p_details::text) > 65536 then
    raise exception 'Invalid audit details';
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details, user_id
  )
  values (
    v_owner, p_action, p_entity_type,
    p_entity_id, p_details, v_owner
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke all on function public.record_operational_audit(
  text, text, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.record_operational_audit(
  text, text, uuid, jsonb
) to authenticated;
-- Audit writes must use approved RPCs and workflow triggers.
-- Existing RLS policies still control authenticated reads.



grant select on table public.audit_logs
to authenticated;
-- Explicit upload ownership check before privileged traveller creation.
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
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_traveller_id uuid;
  v_date_review jsonb;
  v_path text := nullif(btrim(p_image_path), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob, p_expiry_date,
    p_age_confirmed, p_expiry_confirmed
  );

  if v_path is not null then
    if char_length(v_path) > 1024 then
      raise exception 'Passport image not found or inaccessible';
    end if;

    perform 1
    from storage.objects
    where bucket_id = 'passports'
      and name = v_path
      and owner_id = auth.uid()::text
    for share;

    if not found then
      raise exception 'Passport image not found or inaccessible';
    end if;
  end if;

  v_traveller_id := public.create_traveller_atomic(
    p_client_id,
    p_given_name,
    p_surname,
    p_passport_number,
    p_dob,
    p_expiry_date,
    p_nationality,
    v_path
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
-- Validate the registered image before privileged draft confirmation.
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
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_draft public.passport_extraction_drafts%rowtype;
  v_traveller_id uuid;
  v_date_review jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into v_owner
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner';

  if v_owner is null then
    raise exception 'Owner access required';
  end if;

  v_date_review := public.validate_passport_dates(
    p_dob, p_expiry_date,
    p_age_confirmed, p_expiry_confirmed
  );

  select * into v_draft
  from public.passport_extraction_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'Passport draft not found';
  end if;

  if v_draft.status = 'confirmed'
    or v_draft.confirmed_traveller_id is not null then
    raise exception 'Passport draft is already confirmed';
  end if;

  if v_draft.status is null
    or v_draft.status not in (
      'uploaded', 'awaiting_review', 'extraction_failed'
    ) then
    raise exception 'Passport draft is not available for review';
  end if;

  -- Any authorized owner may review the draft.
  -- The image must belong to the owner who registered it.
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
-- Prevent traveller deletion through parent-table cascades.
-- No traveller deletion workflow is currently approved.

create or replace function public.block_traveller_deletion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception
    'Traveller deletion requires an approved deletion workflow';
end;
$$;

revoke all on function public.block_traveller_deletion()
from public, anon, authenticated;

create trigger travellers_block_deletion
before delete on public.travellers
for each row
execute function public.block_traveller_deletion();
