-- Multi-channel inquiry intake
-- Part 1: Extend supported sources without changing existing records.

alter table public.inquiries
  drop constraint inquiries_source_check;

alter table public.inquiries
  add constraint inquiries_source_check
  check (
    source in (
      'web',
      'email',
      'whatsapp',
      'landing_page',
      'meta_lead_ads'
    )
  );
  -- Part 2: Preserve validated submissions and intake identity.
-- New fields remain nullable for existing inquiry records.

alter table public.inquiries
  add column service_type text,
  add column submitted_fields jsonb,
  add column submission_request_id uuid,
  add column submission_payload_hash text,
  add column source_provider text,
  add column source_account_id text;

alter table public.inquiries
  add constraint inquiries_service_type_check
  check (
    service_type in (
      'flight_booking',
      'visa_support',
      'package',
      'consultation'
    )
  ),
  add constraint inquiries_submitted_fields_check
  check (
    submitted_fields is null
    or jsonb_typeof(submitted_fields) = 'object'
  ),
  add constraint inquiries_submission_payload_hash_check
  check (
    submission_payload_hash is null
    or submission_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint inquiries_submission_identity_check
  check (
    (submission_request_id is null)
    = (submission_payload_hash is null)
  );

comment on column public.inquiries.submitted_fields is
  'Validated original submission; stored separately from AI suggestions.';

comment on column public.inquiries.submission_payload_hash is
  'SHA-256 of the canonical validated payload for retry conflict detection.';
  -- Part 3: Enforce request and provider-event uniqueness.

create unique index inquiries_submission_request_id_unique
  on public.inquiries (submission_request_id)
  where submission_request_id is not null;

alter table public.inquiries
  add constraint inquiries_provider_identity_check
  check (
    (
      source_provider is null
      and source_account_id is null
    )
    or
    (
      source_provider is not null
      and source_account_id is not null
      and source_message_id is not null
      and length(trim(source_provider)) between 1 and 100
      and length(trim(source_account_id)) between 1 and 255
      and length(trim(source_message_id)) between 1 and 255
    )
  );

-- Preserve legacy event uniqueness for records without provider identity.
drop index public.inquiries_source_message_id_unique;

create unique index inquiries_source_message_id_unique
  on public.inquiries (source, source_message_id)
  where source_message_id is not null
    and source_provider is null;

-- Provider events are scoped to the originating account.
create unique index inquiries_provider_event_unique
  on public.inquiries (
    source,
    source_provider,
    source_account_id,
    source_message_id
  )
  where source_provider is not null;
  -- Part 4: Require complete intake metadata for new request-based submissions.
-- Legacy records without a submission request ID remain valid.

alter table public.inquiries
  add constraint inquiries_submission_metadata_check
  check (
    submission_request_id is null
    or (
      service_type is not null
      and submitted_fields is not null
      and submission_payload_hash is not null
    )
  ),
  add constraint inquiries_submitted_fields_size_check
  check (
    submitted_fields is null
    or octet_length(submitted_fields::text) <= 65536
  );

comment on column public.inquiries.submission_request_id is
  'Stable request UUID retained across identical submission retries.';

comment on column public.inquiries.source_provider is
  'Original integration provider; supplied through validated server intake.';

comment on column public.inquiries.source_account_id is
  'Original provider account used to scope event identity.';
  -- Part 5A: Server-only intake function and initial validation.

create function public.submit_inquiry_intake(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_source text;
  v_client_type text;
  v_service_type text;
  v_payload_hash text;
  v_existing public.inquiries%rowtype;
  v_inquiry_id uuid;
begin
  if current_user <> 'service_role' then
    raise exception 'Server intake access required'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Inquiry payload must be an object'
      using errcode = '22023';
  end if;

  if octet_length(p_payload::text) > 65536 then
    raise exception 'Inquiry payload is too large'
      using errcode = '22023';
  end if;

  begin
    v_request_id := (p_payload ->> 'requestId')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid submission request ID'
        using errcode = '22023';
  end;

  if v_request_id is null then
    raise exception 'Submission request ID is required'
      using errcode = '22023';
  end if;

  v_source := p_payload ->> 'source';
  v_client_type := p_payload ->> 'clientType';
  v_service_type := p_payload ->> 'serviceType';

  if v_source is null or v_source not in (
    'web', 'email', 'whatsapp', 'landing_page', 'meta_lead_ads'
  ) then
    raise exception 'Invalid inquiry source'
      using errcode = '22023';
  end if;

  if v_client_type is null
     or v_client_type not in ('corporate', 'individual') then
    raise exception 'Invalid client type'
      using errcode = '22023';
  end if;

  if v_service_type is null or v_service_type not in (
    'flight_booking', 'visa_support', 'package', 'consultation'
  ) then
    raise exception 'Invalid service type'
      using errcode = '22023';
  end if;
    -- Validate payload structure before saving.
  if p_payload -> 'version' is distinct from '1'::jsonb then
    raise exception 'Unsupported payload version'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as fields(key)
    where fields.key not in (
      'version', 'requestId', 'source', 'provider',
      'providerAccountId', 'sourceMessageId', 'clientType',
      'serviceType', 'companyName', 'contact', 'travel',
      'rawMessage', 'metadata'
    )
  ) then
    raise exception 'Unsupported inquiry field'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_payload -> 'contact')
       is distinct from 'object' then
    raise exception 'Contact details are required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_payload #> '{contact,name}')
       is distinct from 'string'
     or length(trim(p_payload #>> '{contact,name}'))
       not between 1 and 200 then
    raise exception 'Contact name must contain 1 to 200 characters'
      using errcode = '22023';
  end if;

  if nullif(trim(p_payload #>> '{contact,email}'), '') is null
     and nullif(trim(p_payload #>> '{contact,phone}'), '') is null then
    raise exception 'Contact email or phone is required'
      using errcode = '22023';
  end if;

  if v_client_type = 'corporate' then
    if jsonb_typeof(p_payload -> 'companyName')
         is distinct from 'string'
       or length(trim(p_payload ->> 'companyName'))
         not between 1 and 200 then
      raise exception 'Corporate company name is required'
        using errcode = '22023';
    end if;
  end if;

  if jsonb_typeof(p_payload -> 'rawMessage')
       is distinct from 'string'
     or length(trim(p_payload ->> 'rawMessage'))
       not between 1 and 10000 then
    raise exception 'Inquiry message must contain 1 to 10000 characters'
      using errcode = '22023';
  end if;

  if p_payload ? 'travel'
     and jsonb_typeof(p_payload -> 'travel')
       is distinct from 'object' then
    raise exception 'Travel details must be an object'
      using errcode = '22023';
  end if;

  if p_payload ? 'metadata'
     and jsonb_typeof(p_payload -> 'metadata')
       is distinct from 'object' then
    raise exception 'Metadata must be an object'
      using errcode = '22023';
  end if;
    -- Validate contact fields and reject unexpected contact properties.
  if exists (
    select 1
    from jsonb_object_keys(p_payload -> 'contact') as fields(key)
    where fields.key not in ('name', 'email', 'phone')
  ) then
    raise exception 'Unsupported contact field'
      using errcode = '22023';
  end if;

  if p_payload #> '{contact,email}' is not null
     and jsonb_typeof(p_payload #> '{contact,email}')
       not in ('string', 'null') then
    raise exception 'Email must be text'
      using errcode = '22023';
  end if;

  if nullif(trim(p_payload #>> '{contact,email}'), '') is not null then
    if length(trim(p_payload #>> '{contact,email}')) > 254
       or trim(p_payload #>> '{contact,email}')
         !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Invalid contact email'
        using errcode = '22023';
    end if;
  end if;

  if p_payload #> '{contact,phone}' is not null
     and jsonb_typeof(p_payload #> '{contact,phone}')
       not in ('string', 'null') then
    raise exception 'Phone must be text'
      using errcode = '22023';
  end if;

  if nullif(trim(p_payload #>> '{contact,phone}'), '') is not null then
    if trim(p_payload #>> '{contact,phone}')
         !~ '^[+][1-9][0-9]{7,14}$' then
      raise exception 'Phone must include country code, for example +8801700000000'
        using errcode = '22023';
    end if;
  end if;
    -- Provider identity must be complete when supplied.
  if exists (
    select 1
    from jsonb_each(p_payload) as fields(key, value)
    where fields.key in (
      'provider', 'providerAccountId', 'sourceMessageId'
    )
      and jsonb_typeof(fields.value) not in ('string', 'null')
  ) then
    raise exception 'Provider identity fields must be text'
      using errcode = '22023';
  end if;

  if nullif(p_payload ->> 'provider', '') is not null
     or nullif(p_payload ->> 'providerAccountId', '') is not null then
    if nullif(trim(p_payload ->> 'provider'), '') is null
       or nullif(trim(p_payload ->> 'providerAccountId'), '') is null
       or nullif(trim(p_payload ->> 'sourceMessageId'), '') is null then
      raise exception 'Provider, account and event ID are required together'
        using errcode = '22023';
    end if;

    if length(p_payload ->> 'provider') > 100
       or length(p_payload ->> 'providerAccountId') > 255
       or length(p_payload ->> 'sourceMessageId') > 255 then
      raise exception 'Provider identity exceeds allowed length'
        using errcode = '22023';
    end if;
  end if;

  if v_source in ('email', 'whatsapp', 'meta_lead_ads')
     and (
       nullif(trim(p_payload ->> 'provider'), '') is null
       or nullif(trim(p_payload ->> 'providerAccountId'), '') is null
       or nullif(trim(p_payload ->> 'sourceMessageId'), '') is null
     ) then
    raise exception 'Channel inquiries require provider account and event identity'
      using errcode = '22023';
  end if;

  if v_source = 'landing_page'
     and (
       nullif(p_payload ->> 'provider', '') is not null
       or nullif(p_payload ->> 'providerAccountId', '') is not null
       or nullif(p_payload ->> 'sourceMessageId', '') is not null
     ) then
    raise exception 'Landing page inquiries use request identity only'
      using errcode = '22023';
  end if;
    -- Validate optional travel fields without inventing missing values.
  if p_payload ? 'travel' then
    if exists (
      select 1
      from jsonb_object_keys(p_payload -> 'travel') as fields(key)
      where fields.key not in (
        'origin', 'destination', 'departureDate', 'returnDate',
        'passengerCount', 'cabinClass', 'notes'
      )
    ) then
      raise exception 'Unsupported travel field'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_each(p_payload -> 'travel') as fields(key, value)
      where fields.key in (
        'origin', 'destination', 'departureDate',
        'returnDate', 'cabinClass', 'notes'
      )
        and jsonb_typeof(fields.value) not in ('string', 'null')
    ) then
      raise exception 'Travel text fields must contain text'
        using errcode = '22023';
    end if;

    if nullif(p_payload #>> '{travel,origin}', '') is not null
       and (p_payload #>> '{travel,origin}') !~ '^[A-Z]{3}$' then
      raise exception 'Origin must be a three-letter airport code'
        using errcode = '22023';
    end if;

    if nullif(p_payload #>> '{travel,destination}', '') is not null
       and (p_payload #>> '{travel,destination}') !~ '^[A-Z]{3}$' then
      raise exception 'Destination must be a three-letter airport code'
        using errcode = '22023';
    end if;

    if nullif(p_payload #>> '{travel,cabinClass}', '') is not null
       and (p_payload #>> '{travel,cabinClass}') not in (
         'economy', 'premium_economy', 'business', 'first'
       ) then
      raise exception 'Invalid cabin preference'
        using errcode = '22023';
    end if;

    if length(coalesce(p_payload #>> '{travel,notes}', '')) > 10000 then
      raise exception 'Travel notes exceed allowed length'
        using errcode = '22023';
    end if;
  end if;
    -- Validate dates and optional passenger count.
  declare
    v_departure_text text :=
      nullif(p_payload #>> '{travel,departureDate}', '');
    v_return_text text :=
      nullif(p_payload #>> '{travel,returnDate}', '');
    v_departure date;
    v_return date;
    v_count jsonb := p_payload #> '{travel,passengerCount}';
  begin
    if v_departure_text is not null then
      if v_departure_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Departure date must use YYYY-MM-DD'
          using errcode = '22023';
      end if;

      v_departure := v_departure_text::date;


    end if;

    if v_return_text is not null then
      if v_return_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Return date must use YYYY-MM-DD'
          using errcode = '22023';
      end if;

      v_return := v_return_text::date;

      if v_departure is null then
        raise exception 'Return date requires a departure date'
          using errcode = '22023';
      end if;

      if v_return < v_departure then
        raise exception 'Return date cannot precede departure'
          using errcode = '22023';
      end if;
    end if;

    if v_count is not null and v_count <> 'null'::jsonb then
      if jsonb_typeof(v_count) <> 'number' then
        raise exception 'Passenger count must be a number'
          using errcode = '22023';
      end if;

      if (v_count::text)::numeric < 1
         or (v_count::text)::numeric > 999
         or (v_count::text)::numeric <>
           trunc((v_count::text)::numeric) then
        raise exception 'Passenger count must be an integer from 1 to 999'
          using errcode = '22023';
      end if;
    end if;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Invalid travel date'
        using errcode = '22023';
  end;
    -- Hash the payload without the transport request ID.
  v_payload_hash := encode(
    sha256(
      convert_to((p_payload - 'requestId')::text, 'UTF8')
    ),
    'hex'
  );

  -- Serialize this intake function's identity check and insert.
  -- Unique indexes remain the final protection against other writers.
  perform pg_advisory_xact_lock(261011, 1);

  if (
    select count(*)
    from public.inquiries i
    where i.submission_request_id = v_request_id
       or (
         i.source = v_source
         and i.source_message_id =
           nullif(p_payload ->> 'sourceMessageId', '')
         and i.source_provider is not distinct from
           nullif(p_payload ->> 'provider', '')
         and i.source_account_id is not distinct from
           nullif(p_payload ->> 'providerAccountId', '')
       )
  ) > 1 then
    raise exception 'Request and event identities refer to different inquiries'
      using errcode = '23505';
  end if;

  select i.*
  into v_existing
  from public.inquiries i
  where i.submission_request_id = v_request_id
     or (
       i.source = v_source
       and i.source_message_id =
         nullif(p_payload ->> 'sourceMessageId', '')
       and i.source_provider is not distinct from
         nullif(p_payload ->> 'provider', '')
       and i.source_account_id is not distinct from
         nullif(p_payload ->> 'providerAccountId', '')
     )
  for update;

  if found then
    if v_existing.submission_payload_hash
         is distinct from v_payload_hash then
      raise exception 'Submission identity conflicts with an existing inquiry'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'id', v_existing.id,
      'status', 'accepted',
      'duplicate', true
    );
  end if;
    -- Existing identical retries have already returned above.
  -- Apply the past-date rule only to new submissions.
  if nullif(p_payload #>> '{travel,departureDate}', '') is not null then
    if (p_payload #>> '{travel,departureDate}')::date < (
      current_timestamp at time zone 'Asia/Dhaka'
    )::date then
      raise exception 'Departure date cannot be in the past'
        using errcode = '22023';
    end if;
  end if;
    -- Create only a new, unreviewed inquiry.
  insert into public.inquiries (
    source,
    source_message_id,
    client_type,
    corporate_client_name,
    contact_name,
    contact_email,
    contact_phone,
    raw_message,
    service_type,
    submitted_fields,
    submission_request_id,
    submission_payload_hash,
    source_provider,
    source_account_id,
    channel_metadata,
    parsing_status,
    status
  )
  values (
    v_source,
    nullif(p_payload ->> 'sourceMessageId', ''),
    case
      when v_client_type = 'individual' then 'personal'
      else 'corporate'
    end,
    case
      when v_client_type = 'corporate'
        then trim(p_payload ->> 'companyName')
      else null
    end,
    trim(p_payload #>> '{contact,name}'),
    nullif(trim(p_payload #>> '{contact,email}'), ''),
    nullif(trim(p_payload #>> '{contact,phone}'), ''),
    trim(p_payload ->> 'rawMessage'),
    v_service_type,
    p_payload - 'requestId',
    v_request_id,
    v_payload_hash,
    nullif(p_payload ->> 'provider', ''),
    nullif(p_payload ->> 'providerAccountId', ''),
    coalesce(p_payload -> 'metadata', '{}'::jsonb),
    'pending',
    'new'
  )
  returning id into v_inquiry_id;

  return jsonb_build_object(
    'id', v_inquiry_id,
    'status', 'accepted',
    'duplicate', false
  );
end;
$$;

-- This function is callable only through the privileged server client.
revoke all on function public.submit_inquiry_intake(jsonb)
  from public, anon, authenticated;

grant execute on function public.submit_inquiry_intake(jsonb)
  to service_role;

comment on function public.submit_inquiry_intake(jsonb) is
  'Server-only validated inquiry intake with request/event retry protection.';