BEGIN;
SET LOCAL lock_timeout = '5s';

-- Keep the existing service-only contracts. The signed web wrapper runs as
-- postgres and is the only anonymous entry point to these routines.
DO $guard$
DECLARE
  signature regprocedure;
  definition text;
  marker constant text := 'if current_user <> ''service_role'' then';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.submit_inquiry_intake(jsonb)'::regprocedure,
    'public.consume_inquiry_rate_limit(text,text,integer,integer)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(signature);
    IF (length(definition) - length(replace(definition, marker, ''))) <> length(marker)
       OR has_function_privilege('anon', signature, 'EXECUTE')
       OR has_function_privilege('authenticated', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected intake function contract: %', signature;
    END IF;
    EXECUTE replace(definition, marker, 'if current_user not in (''service_role'', ''postgres'') then');
  END LOOP;
END
$guard$;

CREATE FUNCTION public.submit_signed_web_inquiry(
  p_body text, p_timestamp bigint, p_mac text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_secret text;
  v_expected bytea;
  v_mac bytea;
  v_difference integer := 0;
  v_now bigint := floor(extract(epoch FROM clock_timestamp()));
  v_payload jsonb;
  v_bucket text;
  v_limit jsonb;
BEGIN
  IF p_body IS NULL OR octet_length(p_body) > 32768
     OR p_timestamp IS NULL OR p_timestamp NOT BETWEEN v_now - 60 AND v_now + 15
     OR p_mac IS NULL OR p_mac !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid intake authorization' USING ERRCODE = '42501';
  END IF;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets
  WHERE name = 'travelpro_web_intake_hmac_v1';
  IF v_secret IS NULL OR v_secret !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Intake unavailable' USING ERRCODE = '42501';
  END IF;

  v_expected := extensions.hmac(
    convert_to('travelpro:web-intake:v1:' || p_timestamp::text || ':' || p_body, 'UTF8'),
    convert_to(v_secret, 'UTF8'), 'sha256'
  );
  v_mac := decode(p_mac, 'hex');
  FOR i IN 0..31 LOOP
    v_difference := v_difference | (get_byte(v_expected, i) # get_byte(v_mac, i));
  END LOOP;
  IF v_difference <> 0 THEN
    RAISE EXCEPTION 'Invalid intake authorization' USING ERRCODE = '42501';
  END IF;

  v_payload := p_body::jsonb;
  IF v_payload ->> 'source' IS DISTINCT FROM 'landing_page' THEN
    RAISE EXCEPTION 'Invalid intake source' USING ERRCODE = '22023';
  END IF;

  FOR v_bucket IN SELECT unnest(ARRAY[
    'global',
    'email:' || lower(nullif(btrim(v_payload #>> '{contact,email}'), '')),
    'phone:' || nullif(btrim(v_payload #>> '{contact,phone}'), '')
  ]) LOOP
    CONTINUE WHEN v_bucket IS NULL;
    v_limit := public.consume_inquiry_rate_limit(
      'landing_page',
      encode(extensions.hmac(convert_to('bucket:v1:' || v_bucket, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha256'), 'hex'),
      CASE WHEN v_bucket = 'global' THEN 100 ELSE 5 END, 900
    );
    IF NOT (v_limit ->> 'allowed')::boolean THEN
      RETURN jsonb_build_object('status', 'rate_limited', 'retryAfterSeconds', v_limit -> 'retryAfterSeconds');
    END IF;
  END LOOP;

  RETURN public.submit_inquiry_intake(v_payload);
END
$function$;

ALTER FUNCTION public.submit_signed_web_inquiry(text,bigint,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_signed_web_inquiry(text,bigint,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_signed_web_inquiry(text,bigint,text) TO anon;

DROP POLICY IF EXISTS public_inquiry_insert ON public.inquiries;
REVOKE INSERT ON public.inquiries FROM PUBLIC, anon;
DO $columns$
DECLARE
  columns text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ') INTO columns
  FROM pg_attribute
  WHERE attrelid = 'public.inquiries'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s) ON public.inquiries FROM PUBLIC, anon', columns);
END
$columns$;
COMMIT;
