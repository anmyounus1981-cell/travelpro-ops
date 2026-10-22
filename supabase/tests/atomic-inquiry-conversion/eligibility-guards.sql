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
    'corporate',
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
BEGIN
    SELECT count(*) INTO cases_before FROM public.cases;

    payload := jsonb_build_object(
        'version', 1,
        'requestId', '4d762bd7-9dd5-4a69-83a8-78873c23cf82',
        'inquiryId', '3d762bd7-9dd5-4a69-83a8-78873c23cf82',
        'clientId', '10000000-0000-0000-0000-000000000001',
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

    DECLARE
        scenario record;
        test_payload jsonb;
        original_inquiry jsonb;
        original_audits bigint;
    BEGIN
        SELECT to_jsonb(i) INTO STRICT original_inquiry
        FROM public.inquiries i
        WHERE i.id = (payload ->> 'inquiryId')::uuid;

        SELECT count(*) INTO original_audits
        FROM public.audit_logs;

        FOR scenario IN
            SELECT * FROM (VALUES
                ('dismissed', 'Dismissed inquiry cannot be converted'),
                ('visa_support', 'Only flight-booking inquiries can create travel cases'),
                ('package', 'Only flight-booking inquiries can create travel cases'),
                ('consultation', 'Only flight-booking inquiries can create travel cases'),
                ('legacy_converted', 'Existing conversion requires manual reconciliation'),
                ('past_departure', 'Reviewed departure cannot be in the past'),
                ('missing_inquiry', 'Inquiry not found or unavailable'),
                ('missing_client', 'Selected client not found or unavailable')
            ) AS scenarios(name, expected_message)
        LOOP
            test_payload := payload;

            BEGIN
                CASE scenario.name
                    WHEN 'dismissed' THEN
                        UPDATE public.inquiries
                        SET status = 'dismissed'
                        WHERE id = (payload ->> 'inquiryId')::uuid;

                    WHEN 'visa_support', 'package', 'consultation' THEN
                        UPDATE public.inquiries
                        SET service_type = scenario.name
                        WHERE id = (payload ->> 'inquiryId')::uuid;

                    WHEN 'legacy_converted' THEN
                        UPDATE public.inquiries
                        SET status = 'converted'
                        WHERE id = (payload ->> 'inquiryId')::uuid;

                    WHEN 'past_departure' THEN
                        test_payload := payload || jsonb_build_object(
                            'departureDate',
                            to_char(
                                (clock_timestamp() AT TIME ZONE 'Asia/Dhaka')::date - 1,
                                'YYYY-MM-DD'
                            )
                        );

                    WHEN 'missing_inquiry' THEN
                        test_payload := payload || jsonb_build_object(
                            'inquiryId', gen_random_uuid()::text
                        );

                    WHEN 'missing_client' THEN
                        test_payload := payload || jsonb_build_object(
                            'clientId', gen_random_uuid()::text
                        );
                END CASE;

                PERFORM public.convert_inquiry_to_case(test_payload);

                RAISE EXCEPTION 'FAIL: eligibility scenario accepted: %',
                    scenario.name;

            EXCEPTION WHEN invalid_parameter_value THEN
                IF SQLERRM <> scenario.expected_message THEN
                    RAISE EXCEPTION
                        'FAIL: scenario %, expected %, received %',
                        scenario.name, scenario.expected_message, SQLERRM;
                END IF;
            END;

            -- The exception subtransaction also restores scenario setup.
            IF (
                SELECT to_jsonb(i) FROM public.inquiries i
                WHERE i.id = (payload ->> 'inquiryId')::uuid
            ) IS DISTINCT FROM original_inquiry THEN
                RAISE EXCEPTION 'FAIL: inquiry changed after %', scenario.name;
            END IF;

            IF (SELECT count(*) FROM public.cases) <> cases_before THEN
                RAISE EXCEPTION 'FAIL: case survived %', scenario.name;
            END IF;

            IF (SELECT count(*) FROM public.audit_logs) <> original_audits THEN
                RAISE EXCEPTION 'FAIL: audit survived %', scenario.name;
            END IF;
        END LOOP;
    END;
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
          AND client_id = '10000000-0000-0000-0000-000000000001'
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
          AND matched_client_id = '10000000-0000-0000-0000-000000000001'
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