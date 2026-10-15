BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_key text := encode(
    sha256(convert_to(gen_random_uuid()::text, 'UTF8')),
    'hex'
  );
  v_result jsonb;
  v_attempt integer;
  v_count bigint;
BEGIN
  PERFORM set_config('travelpro.test_bucket_key', v_key, true);

  FOR v_attempt IN 1..102 LOOP
    v_result := public.consume_inquiry_rate_limit(
      'landing_page',
      v_key,
      100,
      900
    );

    IF (v_result ->> 'allowed')::boolean
         IS DISTINCT FROM (v_attempt <= 100) THEN
      RAISE EXCEPTION
        'TEST FAILED: incorrect allowance at attempt %', v_attempt;
    END IF;

    IF (v_result ->> 'remaining')::integer
         IS DISTINCT FROM greatest(0, 100 - v_attempt) THEN
      RAISE EXCEPTION
        'TEST FAILED: incorrect remaining at attempt %', v_attempt;
    END IF;

    IF v_attempt <= 100 THEN
      IF (v_result ->> 'retryAfterSeconds')::integer
           IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'TEST FAILED: allowed request has retry delay';
      END IF;
    ELSE
      IF (v_result ->> 'retryAfterSeconds')::integer IS NULL
         OR (v_result ->> 'retryAfterSeconds')::integer
           NOT BETWEEN 1 AND 900 THEN
        RAISE EXCEPTION 'TEST FAILED: invalid denial retry delay';
      END IF;
    END IF;
  END LOOP;

  SELECT request_count
  INTO STRICT v_count
  FROM public.inquiry_intake_rate_limits
  WHERE scope = 'landing_page'
    AND bucket_key = v_key;

  IF v_count IS DISTINCT FROM 101::bigint THEN
    RAISE EXCEPTION 'TEST FAILED: denied counter did not saturate at 101';
  END IF;

  -- A different bucket must retain its own allowance.
  v_result := public.consume_inquiry_rate_limit(
    'landing_page',
    encode(sha256(convert_to(v_key || ':other', 'UTF8')), 'hex'),
    100,
    900
  );

  IF (v_result ->> 'allowed')::boolean IS DISTINCT FROM true
     OR (v_result ->> 'remaining')::integer IS DISTINCT FROM 99 THEN
    RAISE EXCEPTION 'TEST FAILED: isolated bucket allowance changed';
  END IF;
END;
$$;

RESET ROLE;

SELECT
  'PASS: 100 allowed, subsequent requests denied, counter saturation and bucket isolation'
    AS shared_ceiling_database_result,
  current_setting('travelpro.test_bucket_key') AS rolled_back_test_key;

ROLLBACK;