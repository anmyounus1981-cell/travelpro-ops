-- Reviewed atomic inquiry-to-case conversion.
-- Prepare and test before applying to the shared database.
-- Anonymous intake permissions are not changed by this migration.

ALTER TABLE public.inquiries
  ADD COLUMN conversion_request_id uuid,
  ADD COLUMN conversion_payload_hash text,
  ADD COLUMN conversion_reviewed_fields jsonb,
  ADD COLUMN conversion_reviewed_by uuid
    REFERENCES public.app_users(id);

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_conversion_metadata_check
  CHECK (
    (
      conversion_request_id IS NULL
      AND conversion_payload_hash IS NULL
      AND conversion_reviewed_fields IS NULL
      AND conversion_reviewed_by IS NULL
    )
    OR
    (
      conversion_request_id IS NOT NULL
      AND conversion_payload_hash IS NOT NULL
      AND conversion_reviewed_fields IS NOT NULL
      AND conversion_reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
  ),
  ADD CONSTRAINT inquiries_conversion_hash_check
  CHECK (
    conversion_payload_hash IS NULL
    OR conversion_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT inquiries_conversion_review_check
  CHECK (
    conversion_reviewed_fields IS NULL
    OR (
      jsonb_typeof(conversion_reviewed_fields) = 'object'
      AND octet_length(conversion_reviewed_fields::text) <= 65536
    )
  );

CREATE UNIQUE INDEX inquiries_conversion_request_id_unique
  ON public.inquiries (conversion_request_id)
  WHERE conversion_request_id IS NOT NULL;

COMMENT ON COLUMN public.inquiries.conversion_request_id IS
  'Owner conversion request identity; reused for an unchanged conversion retry.';

COMMENT ON COLUMN public.inquiries.conversion_payload_hash IS
  'SHA-256 of the canonical owner-reviewed conversion request.';

COMMENT ON COLUMN public.inquiries.conversion_reviewed_fields IS
  'Reviewed conversion snapshot for retry comparison and accountability; not AI suggestions.';

COMMENT ON COLUMN public.inquiries.conversion_reviewed_by IS
  'Authenticated application owner who completed the reviewed conversion.';

-- Preserve the original inquiry source when creating a case.
ALTER TABLE public.cases
  DROP CONSTRAINT cases_intake_source_check;

ALTER TABLE public.cases
  ADD CONSTRAINT cases_intake_source_check
  CHECK (
    intake_source IN (
      'web',
      'email',
      'whatsapp',
      'manual',
      'landing_page',
      'meta_lead_ads'
    )
  );

  CREATE FUNCTION public.convert_inquiry_to_case(p_review jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_owner uuid;
  v_request_id uuid;
  v_inquiry_id uuid;
  v_client_id uuid;

  v_inquiry public.inquiries%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_case public.cases%ROWTYPE;

  v_origin text;
  v_destination text;
  v_departure date;
  v_return date;
  v_trip_type text;
  v_cabin text;
  v_notes text;

  v_adults bigint;
  v_children bigint;
  v_infants bigint;
  v_total bigint;

  v_review jsonb;
  v_hash text;
  v_case_id uuid;
  v_case_number text;
  v_audit_id uuid;
    v_updated_count integer;
  v_now timestamptz := statement_timestamp();
BEGIN
  IF current_user <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authenticated owner access required'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_owner
  FROM public.app_users
  WHERE auth_user_id = auth.uid()
    AND role = 'owner';

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Owner access required'
      USING ERRCODE = '42501';
  END IF;

  IF p_review IS NULL
     OR jsonb_typeof(p_review) IS DISTINCT FROM 'object'
     OR octet_length(p_review::text) > 65536 THEN
    RAISE EXCEPTION 'Invalid conversion review'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    p_review ?& ARRAY[
      'version', 'requestId', 'inquiryId', 'clientId',
      'serviceType', 'reviewConfirmed',
      'origin', 'destination', 'departureDate', 'returnDate',
      'tripType', 'adultCount', 'childCount', 'infantCount',
      'cabinClass', 'notes'
    ]
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_review) AS fields(key)
    WHERE fields.key <> ALL (ARRAY[
      'version', 'requestId', 'inquiryId', 'clientId',
      'serviceType', 'reviewConfirmed',
      'origin', 'destination', 'departureDate', 'returnDate',
      'tripType', 'adultCount', 'childCount', 'infantCount',
      'cabinClass', 'notes'
    ])
  ) THEN
    RAISE EXCEPTION 'Unexpected or missing conversion fields'
      USING ERRCODE = '22023';
  END IF;

  IF p_review -> 'version' IS DISTINCT FROM '1'::jsonb
     OR p_review -> 'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb
     OR p_review -> 'serviceType'
       IS DISTINCT FROM '"flight_booking"'::jsonb THEN
    RAISE EXCEPTION 'Confirmed flight-booking review required'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY['requestId', 'inquiryId', 'clientId']) AS ids(key)
    WHERE jsonb_typeof(p_review -> ids.key) IS DISTINCT FROM 'string'
       OR (p_review ->> ids.key) !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) THEN
    RAISE EXCEPTION 'Valid conversion, inquiry and client identities required'
      USING ERRCODE = '22023';
  END IF;

  v_request_id := (p_review ->> 'requestId')::uuid;
  v_inquiry_id := (p_review ->> 'inquiryId')::uuid;
  v_client_id := (p_review ->> 'clientId')::uuid;

    IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'origin', 'destination', 'departureDate', 'returnDate',
      'tripType', 'cabinClass', 'notes'
    ]) AS fields(key)
    WHERE jsonb_typeof(p_review -> fields.key)
      IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION 'Reviewed travel fields must be strings'
      USING ERRCODE = '22023';
  END IF;

  IF length(p_review ->> 'origin') > 3
     OR length(p_review ->> 'destination') > 3
     OR length(p_review ->> 'departureDate') > 10
     OR length(p_review ->> 'returnDate') > 10
     OR length(p_review ->> 'tripType') > 20
     OR length(p_review ->> 'cabinClass') > 30
     OR length(p_review ->> 'notes') > 4000 THEN
    RAISE EXCEPTION 'Reviewed field exceeds its allowed length'
      USING ERRCODE = '22023';
  END IF;

  v_origin := upper(trim(p_review ->> 'origin'));
  v_destination := upper(trim(p_review ->> 'destination'));
  v_trip_type := p_review ->> 'tripType';
  v_cabin := p_review ->> 'cabinClass';
  v_notes := trim(p_review ->> 'notes');

  IF v_origin !~ '^[A-Z]{3}$'
     OR v_destination !~ '^[A-Z]{3}$'
     OR v_origin = v_destination THEN
    RAISE EXCEPTION 'Confirm distinct three-letter airport codes'
      USING ERRCODE = '22023';
  END IF;

  IF (p_review ->> 'departureDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR (
       (p_review ->> 'returnDate') <> ''
       AND (p_review ->> 'returnDate')
         !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     ) THEN
    RAISE EXCEPTION 'Reviewed dates must use YYYY-MM-DD'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_departure := (p_review ->> 'departureDate')::date;
    v_return := nullif(p_review ->> 'returnDate', '')::date;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid reviewed travel date'
        USING ERRCODE = '22023';
  END;

  IF to_char(v_departure, 'YYYY-MM-DD') <>
       (p_review ->> 'departureDate')
     OR (
       v_return IS NOT NULL
       AND to_char(v_return, 'YYYY-MM-DD') <>
         (p_review ->> 'returnDate')
     ) THEN
    RAISE EXCEPTION 'Invalid reviewed calendar date'
      USING ERRCODE = '22023';
  END IF;

  IF v_trip_type NOT IN ('oneway', 'roundtrip')
     OR (v_trip_type = 'oneway' AND v_return IS NOT NULL)
     OR (v_trip_type = 'roundtrip' AND v_return IS NULL)
     OR (v_return IS NOT NULL AND v_return < v_departure) THEN
    RAISE EXCEPTION 'Reviewed trip type and dates do not agree'
      USING ERRCODE = '22023';
  END IF;

  IF v_cabin NOT IN (
    'economy', 'premium_economy', 'business', 'first'
  ) THEN
    RAISE EXCEPTION 'Select a valid reviewed cabin class'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'adultCount', 'childCount', 'infantCount'
    ]) AS counts(key)
    WHERE jsonb_typeof(p_review -> counts.key)
        IS DISTINCT FROM 'number'
       OR (p_review ->> counts.key) !~ '^(0|[1-9][0-9]{0,9})$'
  ) THEN
    RAISE EXCEPTION 'Passenger counts must be non-negative integers'
      USING ERRCODE = '22023';
  END IF;

  v_adults := (p_review ->> 'adultCount')::bigint;
  v_children := (p_review ->> 'childCount')::bigint;
  v_infants := (p_review ->> 'infantCount')::bigint;
  v_total := v_adults + v_children + v_infants;

  IF v_adults > 2147483647
     OR v_children > 2147483647
     OR v_infants > 2147483647
     OR v_total NOT BETWEEN 1 AND 2147483647
     OR v_infants > v_adults THEN
    RAISE EXCEPTION 'Invalid reviewed passenger counts'
      USING ERRCODE = '22023';
  END IF;

    v_review := jsonb_build_object(
    'version', 1,
    'inquiryId', v_inquiry_id::text,
    'clientId', v_client_id::text,
    'serviceType', 'flight_booking',
    'reviewConfirmed', true,
    'origin', v_origin,
    'destination', v_destination,
    'departureDate', to_char(v_departure, 'YYYY-MM-DD'),
    'returnDate', coalesce(to_char(v_return, 'YYYY-MM-DD'), ''),
    'tripType', v_trip_type,
    'adultCount', v_adults,
    'childCount', v_children,
    'infantCount', v_infants,
    'cabinClass', v_cabin,
    'notes', v_notes
  );

  v_hash := encode(
    sha256(convert_to(v_review::text, 'UTF8')),
    'hex'
  );

  SELECT * INTO v_inquiry
  FROM public.inquiries
  WHERE id = v_inquiry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inquiry not found or unavailable'
      USING ERRCODE = '22023';
  END IF;

  IF v_inquiry.status = 'dismissed' THEN
    RAISE EXCEPTION 'Dismissed inquiry cannot be converted'
      USING ERRCODE = '22023';
  END IF;

  IF v_inquiry.status = 'converted'
     OR v_inquiry.converted_case_id IS NOT NULL
     OR v_inquiry.conversion_request_id IS NOT NULL THEN

    IF v_inquiry.status IS DISTINCT FROM 'converted'
       OR v_inquiry.converted_case_id IS NULL
       OR v_inquiry.conversion_request_id IS NULL
       OR v_inquiry.conversion_payload_hash IS NULL
       OR v_inquiry.conversion_reviewed_fields IS NULL THEN
      RAISE EXCEPTION 'Existing conversion requires manual reconciliation'
        USING ERRCODE = '22023';
    END IF;

    IF v_inquiry.conversion_request_id IS DISTINCT FROM v_request_id
       OR v_inquiry.conversion_payload_hash IS DISTINCT FROM v_hash
       OR v_inquiry.conversion_reviewed_fields IS DISTINCT FROM v_review THEN
      RAISE EXCEPTION 'Conversion identity or reviewed details conflict'
        USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_case
    FROM public.cases
    WHERE id = v_inquiry.converted_case_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Previously converted case is unavailable'
        USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
      'id', v_case.id,
      'caseNumber', v_case.case_number,
      'inquiryId', v_inquiry_id,
      'status', 'converted',
      'duplicate', true
    );
  END IF;

  IF v_inquiry.status IS DISTINCT FROM 'new' THEN
    RAISE EXCEPTION 'Inquiry is not eligible for conversion'
      USING ERRCODE = '22023';
  END IF;

  IF v_inquiry.service_type IS NOT NULL
     AND v_inquiry.service_type <> 'flight_booking' THEN
    RAISE EXCEPTION 'Only flight-booking inquiries can create travel cases'
      USING ERRCODE = '22023';
  END IF;
  -- Refresh time after any wait for the inquiry lock.
  v_now := clock_timestamp();
  IF v_departure < (v_now AT TIME ZONE 'Asia/Dhaka')::date THEN
    RAISE EXCEPTION 'Reviewed departure cannot be in the past'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inquiries
    WHERE conversion_request_id = v_request_id
      AND id <> v_inquiry_id
  ) THEN
    RAISE EXCEPTION 'Conversion identity already belongs to another inquiry'
      USING ERRCODE = '23505';
  END IF;

    SELECT * INTO v_client
  FROM public.clients
  WHERE id = v_client_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected client not found or unavailable'
      USING ERRCODE = '22023';
  END IF;

  IF (
    v_inquiry.client_type = 'personal'
    AND v_client.client_type IS DISTINCT FROM 'individual'
  ) OR (
    v_inquiry.client_type = 'corporate'
    AND v_client.client_type IS DISTINCT FROM 'corporate'
  ) THEN
    RAISE EXCEPTION 'Selected client does not match the inquiry client type'
      USING ERRCODE = '22023';
  END IF;

  v_case_id := gen_random_uuid();
  v_case_number :=
    'TP-' ||
    to_char(v_now AT TIME ZONE 'Asia/Dhaka', 'YYMMDD') ||
    '-' ||
    upper(replace(v_case_id::text, '-', ''));

  INSERT INTO public.cases (
    id,
    case_number,
    client_id,
    assigned_to,
    user_id,
    origin,
    destination,
    departure_date,
    return_date,
    trip_type,
    passenger_count,
    adult_count,
    child_count,
    infant_count,
    cabin_class,
    notes,
    status,
    intake_source,
    next_action,
    next_action_deadline
  )
  VALUES (
    v_case_id,
    v_case_number,
    v_client_id,
    v_owner,
    v_owner,
    v_origin,
    v_destination,
    v_departure,
    v_return,
    v_trip_type,
    v_total::integer,
    v_adults::integer,
    v_children::integer,
    v_infants::integer,
    v_cabin,
    nullif(v_notes, ''),
    'new',
    v_inquiry.source,
    'Prepare fare options',
    v_now + interval '24 hours'
  );

  UPDATE public.inquiries
  SET
    status = 'converted',
    matched_client_id = v_client_id,
    converted_case_id = v_case_id,
    reviewed_at = v_now,
    conversion_request_id = v_request_id,
    conversion_payload_hash = v_hash,
    conversion_reviewed_fields = v_review,
    conversion_reviewed_by = v_owner
  WHERE id = v_inquiry_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'Inquiry linkage was not updated'
      USING ERRCODE = '42501';
  END IF;

  v_audit_id := public.record_operational_audit(
    'inquiry.converted',
    'inquiry',
    v_inquiry_id,
    jsonb_build_object(
      'case_id', v_case_id,
      'case_number', v_case_number,
      'client_id', v_client_id,
      'conversion_request_id', v_request_id,
      'review_payload_hash', v_hash,
      'source', v_inquiry.source,
      'adult_count', v_adults,
      'child_count', v_children,
      'infant_count', v_infants,
      'passenger_count', v_total
    )
  );

  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'Conversion audit was not confirmed';
  END IF;

  RETURN jsonb_build_object(
    'id', v_case_id,
    'caseNumber', v_case_number,
    'inquiryId', v_inquiry_id,
    'status', 'converted',
    'duplicate', false
  );
END;
$function$;

REVOKE ALL
  ON FUNCTION public.convert_inquiry_to_case(jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.convert_inquiry_to_case(jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.convert_inquiry_to_case(jsonb) IS
  'Owner-authorized reviewed flight conversion; inquiry lock, case creation, linkage and audit are atomic.';