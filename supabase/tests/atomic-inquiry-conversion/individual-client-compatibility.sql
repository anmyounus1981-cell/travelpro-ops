BEGIN;

INSERT INTO auth.users (id)
VALUES ('1d762bd7-9dd5-4a69-83a8-78873c23cf82');

INSERT INTO public.app_users (
    id, name, email, role, auth_user_id
)
VALUES (
    '2d762bd7-9dd5-4a69-83a8-78873c23cf82',
    'Synthetic Atomic Test Owner',
    'atomic-owner@example.invalid',
    'owner',
    '1d762bd7-9dd5-4a69-83a8-78873c23cf82'
);

INSERT INTO public.inquiries (
    id, source, client_type, raw_message, service_type
)
VALUES (
    '3d762bd7-9dd5-4a69-83a8-78873c23cf82',
    'landing_page',
    'personal',
    'Synthetic atomic conversion test',
    'flight_booking'
);

SELECT set_config(
    'request.jwt.claim.sub',
    '1d762bd7-9dd5-4a69-83a8-78873c23cf82',
    true
);

SELECT set_config(
    'request.jwt.claims',
    '{"sub":"1d762bd7-9dd5-4a69-83a8-78873c23cf82","role":"authenticated"}',
    true
);

SET LOCAL ROLE authenticated;

DO $test$
DECLARE
    payload jsonb;
    first_result jsonb;
    retry_result jsonb;
    created_case uuid;
    cases_before bigint;
    individual_client uuid;
BEGIN
    SELECT count(*) INTO cases_before FROM public.cases;

    individual_client := public.create_client_with_review(
        gen_random_uuid(),
        'individual',
        'Synthetic Atomic Individual',
        'Synthetic Atomic Individual',
        'atomic-individual@example.invalid',
        ''
    );

    IF individual_client IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.clients
        WHERE id = individual_client AND client_type = 'individual'
    ) THEN
        RAISE EXCEPTION 'FAIL: individual client fixture not established';
    END IF;

    payload := jsonb_build_object(
        'version', 1,
        'requestId', '4d762bd7-9dd5-4a69-83a8-78873c23cf82',
        'inquiryId', '3d762bd7-9dd5-4a69-83a8-78873c23cf82',
        'clientId', individual_client,
        'serviceType', 'flight_booking',
        'reviewConfirmed', true,
        'origin', 'DAC',
        'destination', 'BKK',
        'departureDate',
            to_char(
                (clock_timestamp() AT TIME ZONE 'Asia/Dhaka')::date + 30,
                'YYYY-MM-DD'
            ),
        'returnDate', '',
        'tripType', 'oneway',
        'adultCount', 2,
        'childCount', 1,
        'infantCount', 1,
        'cabinClass', 'economy',
        'notes', 'Synthetic owner-reviewed test'
    );

    UPDATE public.inquiries
    SET client_type = 'corporate'
    WHERE id = '3d762bd7-9dd5-4a69-83a8-78873c23cf82';

    BEGIN
        PERFORM public.convert_inquiry_to_case(payload);
        RAISE EXCEPTION 'FAIL: incompatible individual client accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
        IF SQLERRM <>
            'Selected client does not match the inquiry client type' THEN
            RAISE;
        END IF;
    END;

    IF (SELECT count(*) FROM public.cases) <> cases_before THEN
        RAISE EXCEPTION 'FAIL: incompatible client created a case';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.inquiries
        WHERE id = '3d762bd7-9dd5-4a69-83a8-78873c23cf82'
          AND status = 'new'
          AND matched_client_id IS NULL
          AND converted_case_id IS NULL
          AND reviewed_at IS NULL
          AND conversion_request_id IS NULL
          AND conversion_payload_hash IS NULL
          AND conversion_reviewed_fields IS NULL
          AND conversion_reviewed_by IS NULL
    ) THEN
        RAISE EXCEPTION 'FAIL: incompatible client changed inquiry linkage';
    END IF;

    UPDATE public.inquiries
    SET client_type = 'personal'
    WHERE id = '3d762bd7-9dd5-4a69-83a8-78873c23cf82';
    IF EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE entity_id = '3d762bd7-9dd5-4a69-83a8-78873c23cf82'
          AND action = 'inquiry.converted'
    ) THEN
        RAISE EXCEPTION 'FAIL: mismatch created conversion audit';
    END IF;

    first_result := public.convert_inquiry_to_case(payload);
    created_case := (first_result ->> 'id')::uuid;

    IF created_case IS NULL
       OR first_result -> 'duplicate' IS DISTINCT FROM 'false'::jsonb THEN
        RAISE EXCEPTION 'FAIL: invalid first conversion response';
    END IF;

    retry_result := public.convert_inquiry_to_case(payload);

    IF retry_result ->> 'id' IS DISTINCT FROM created_case::text
       OR retry_result -> 'duplicate' IS DISTINCT FROM 'true'::jsonb THEN
        RAISE EXCEPTION 'FAIL: identical retry did not return original case';
    END IF;

    IF (SELECT count(*) FROM public.cases) <> cases_before + 1 THEN
        RAISE EXCEPTION 'FAIL: expected exactly one new case';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.cases
        WHERE id = created_case
          AND client_id = individual_client
          AND origin = 'DAC' AND destination = 'BKK'
          AND passenger_count = 4
          AND adult_count = 2 AND child_count = 1 AND infant_count = 1
          AND intake_source = 'landing_page'
          AND user_id = '2d762bd7-9dd5-4a69-83a8-78873c23cf82'
    ) THEN
        RAISE EXCEPTION 'FAIL: case fields or original source mismatch';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.inquiries
        WHERE id = '3d762bd7-9dd5-4a69-83a8-78873c23cf82'
          AND status = 'converted'
          AND converted_case_id = created_case
          AND matched_client_id = individual_client
          AND conversion_request_id =
              '4d762bd7-9dd5-4a69-83a8-78873c23cf82'
          AND conversion_reviewed_by =
              '2d762bd7-9dd5-4a69-83a8-78873c23cf82'
          AND reviewed_at IS NOT NULL
          AND conversion_reviewed_fields IS NOT NULL
          AND conversion_payload_hash ~ '^[0-9a-f]{64}$'
    ) THEN
        RAISE EXCEPTION 'FAIL: inquiry linkage or review metadata mismatch';
    END IF;

    IF (
        SELECT count(*) FROM public.audit_logs
        WHERE entity_id = '3d762bd7-9dd5-4a69-83a8-78873c23cf82'
          AND action = 'inquiry.converted'
          AND actor_id = '2d762bd7-9dd5-4a69-83a8-78873c23cf82'
          AND details ->> 'case_id' = created_case::text
    ) <> 1 THEN
        RAISE EXCEPTION 'FAIL: expected exactly one conversion audit';
    END IF;
END;
$test$;

ROLLBACK;