BEGIN;

SET LOCAL ROLE anon;

DO $test$
BEGIN
    BEGIN
        PERFORM public.convert_inquiry_to_case('{}'::jsonb);
        RAISE EXCEPTION 'FAIL: anonymous execution was accepted';
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL;
    END;
END;
$test$;

RESET ROLE;

SELECT set_config(
    'request.jwt.claim.sub',
    'bda997cf-48f4-4bb1-afcd-7a550ffbcc91',
    true
);

SELECT set_config(
    'request.jwt.claims',
    '{"sub":"bda997cf-48f4-4bb1-afcd-7a550ffbcc91","role":"authenticated"}',
    true
);

SET LOCAL ROLE authenticated;

DO $test$
BEGIN
    IF auth.uid() IS DISTINCT FROM
        'bda997cf-48f4-4bb1-afcd-7a550ffbcc91'::uuid THEN
        RAISE EXCEPTION 'FAIL: simulated identity was not established';
    END IF;

    BEGIN
        PERFORM public.convert_inquiry_to_case('{}'::jsonb);
        RAISE EXCEPTION 'FAIL: non-owner execution was accepted';
    EXCEPTION
        WHEN insufficient_privilege THEN
            IF SQLERRM <> 'Owner access required' THEN
                RAISE;
            END IF;
    END;
END;
$test$;

ROLLBACK;

SELECT 'PASS: anonymous denied; authenticated identity without owner membership denied' AS result;