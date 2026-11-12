BEGIN;
-- Durable inquiry intake rate limits.
-- Counters are shared across application instances.
-- Store opaque bucket identifiers, not raw contact details or IP addresses.

create table public.inquiry_intake_rate_limits (
  scope text not null,
  bucket_key text not null,
  window_started_at timestamptz not null,
  request_count bigint not null,
  updated_at timestamptz not null default now(),

  primary key (scope, bucket_key),

  constraint inquiry_rate_limit_scope_check
    check (scope in ('landing_page', 'webhook')),

  constraint inquiry_rate_limit_bucket_key_check
    check (bucket_key ~ '^[0-9a-f]{64}$'),

  constraint inquiry_rate_limit_count_check
    check (request_count >= 0)
);

alter table public.inquiry_intake_rate_limits
  enable row level security;

revoke all on table public.inquiry_intake_rate_limits
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.inquiry_intake_rate_limits
  to service_role;

comment on table public.inquiry_intake_rate_limits is
  'Server-only durable rate counters using opaque bucket identifiers.';
  -- Atomically consume one request from a fixed-window bucket.

create function public.consume_inquiry_rate_limit(
  p_scope text,
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_window_start timestamptz;
  v_counter public.inquiry_intake_rate_limits%rowtype;
  v_retry_after integer;
begin
  if current_user <> 'service_role' then
    raise exception 'Server rate-limit access required'
      using errcode = '42501';
  end if;

  if p_scope is null
     or p_scope not in ('landing_page', 'webhook')
     or p_bucket_key is null
     or p_bucket_key !~ '^[0-9a-f]{64}$'
     or p_max_requests is null
     or p_max_requests not between 1 and 10000
     or p_window_seconds is null
     or p_window_seconds not between 30 and 3600 then
    raise exception 'Invalid rate-limit parameters'
      using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds)
      * p_window_seconds
  );

  insert into public.inquiry_intake_rate_limits as counters (
    scope,
    bucket_key,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_scope,
    p_bucket_key,
    v_window_start,
    1,
    v_now
  )
  on conflict (scope, bucket_key)
    do update set
    window_started_at = greatest(
      counters.window_started_at,
      excluded.window_started_at
    ),
    request_count = case
      when counters.window_started_at >= excluded.window_started_at
        then least(counters.request_count + 1, p_max_requests + 1)
      else 1
    end,
    updated_at = greatest(counters.updated_at, excluded.updated_at)
  returning * into v_counter;

  v_retry_after := greatest(
    1,
    ceil(
      extract(epoch from (
        v_counter.window_started_at
        + make_interval(secs => p_window_seconds)
        - clock_timestamp()
      ))
    )::integer
  );

  return jsonb_build_object(
    'allowed', v_counter.request_count <= p_max_requests,
    'remaining', greatest(0, p_max_requests - v_counter.request_count),
    'retryAfterSeconds',
      case
        when v_counter.request_count > p_max_requests
          then v_retry_after
        else 0
      end
  );
end;
$$;

revoke all on function public.consume_inquiry_rate_limit(
  text, text, integer, integer
) from public, anon, authenticated;

grant execute on function public.consume_inquiry_rate_limit(
  text, text, integer, integer
) to service_role;
-- Verify public roles cannot access the rate-limit function or table.
DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.consume_inquiry_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.consume_inquiry_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: public function execution allowed';
  END IF;

  IF has_table_privilege(
    'anon', 'public.inquiry_intake_rate_limits', 'SELECT'
  ) OR has_table_privilege(
    'authenticated', 'public.inquiry_intake_rate_limits', 'SELECT'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: public counter reads allowed';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_key text := encode(
    sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'
  );
  v_result jsonb;
  v_attempt integer;
BEGIN
  -- Three requests allowed; subsequent requests denied.
  FOR v_attempt IN 1..5 LOOP
    v_result := public.consume_inquiry_rate_limit(
      'landing_page', v_key, 3, 3600
    );

    IF (v_result ->> 'allowed')::boolean
         IS DISTINCT FROM (v_attempt <= 3) THEN
      RAISE EXCEPTION 'TEST FAILED: incorrect allowance at attempt %',
        v_attempt;
    END IF;

    IF (v_result ->> 'remaining')::integer
         IS DISTINCT FROM greatest(0, 3 - v_attempt) THEN
      RAISE EXCEPTION 'TEST FAILED: incorrect remaining count';
    END IF;

    IF v_attempt > 3
       AND (v_result ->> 'retryAfterSeconds')::integer
         NOT BETWEEN 1 AND 3600 THEN
      RAISE EXCEPTION 'TEST FAILED: invalid retry delay';
    END IF;
  END LOOP;

  -- Same key in another scope must have a separate counter.
  v_result := public.consume_inquiry_rate_limit(
    'webhook', v_key, 3, 3600
  );

  IF v_result -> 'allowed' IS DISTINCT FROM 'true'::jsonb
     OR (v_result ->> 'remaining')::integer IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'TEST FAILED: scope isolation failed';
  END IF;
END;
$$;

RESET ROLE;

SELECT 'PASS: permissions, allowance, denial, retry delay, scope isolation'
  AS rate_limit_test_result;
  SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_key text := encode(
    sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'
  );
  v_result jsonb;
  v_window_start timestamptz;
  v_saved_window timestamptz;
  v_saved_count bigint;
BEGIN
  -- Exhaust a two-request bucket.
  PERFORM public.consume_inquiry_rate_limit(
    'landing_page', v_key, 2, 3600
  );
  PERFORM public.consume_inquiry_rate_limit(
    'landing_page', v_key, 2, 3600
  );
  v_result := public.consume_inquiry_rate_limit(
    'landing_page', v_key, 2, 3600
  );

  IF v_result -> 'allowed' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'TEST FAILED: exhausted bucket accepted';
  END IF;

  SELECT window_started_at INTO STRICT v_window_start
  FROM public.inquiry_intake_rate_limits
  WHERE scope = 'landing_page' AND bucket_key = v_key;

  -- Simulate a counter retained from the previous window.
  UPDATE public.inquiry_intake_rate_limits
  SET window_started_at = v_window_start - interval '1 hour'
  WHERE scope = 'landing_page' AND bucket_key = v_key;

  v_result := public.consume_inquiry_rate_limit(
    'landing_page', v_key, 2, 3600
  );

  SELECT window_started_at, request_count
  INTO STRICT v_saved_window, v_saved_count
  FROM public.inquiry_intake_rate_limits
  WHERE scope = 'landing_page' AND bucket_key = v_key;

  IF v_result -> 'allowed' IS DISTINCT FROM 'true'::jsonb
     OR (v_result ->> 'remaining')::integer IS DISTINCT FROM 1
     OR v_saved_window IS DISTINCT FROM v_window_start
     OR v_saved_count IS DISTINCT FROM 1::bigint THEN
    RAISE EXCEPTION 'TEST FAILED: previous-window counter did not reset';
  END IF;

  -- Simulate a newer window already stored by another request.
  UPDATE public.inquiry_intake_rate_limits
  SET window_started_at = v_window_start + interval '1 hour',
      request_count = 2
  WHERE scope = 'landing_page' AND bucket_key = v_key;

  v_result := public.consume_inquiry_rate_limit(
    'landing_page', v_key, 2, 3600
  );

  SELECT window_started_at, request_count
  INTO STRICT v_saved_window, v_saved_count
  FROM public.inquiry_intake_rate_limits
  WHERE scope = 'landing_page' AND bucket_key = v_key;

  IF v_result -> 'allowed' IS DISTINCT FROM 'false'::jsonb
     OR v_saved_window IS DISTINCT FROM
       v_window_start + interval '1 hour'
     OR v_saved_count IS DISTINCT FROM 3::bigint
     OR (v_result ->> 'retryAfterSeconds')::integer
       NOT BETWEEN 1 AND 7200 THEN
    RAISE EXCEPTION 'TEST FAILED: stale request reset a newer window';
  END IF;
END;
$$;

RESET ROLE;

SELECT 'PASS: previous-window reset and newer-window preservation'
  AS window_test_result;
ROLLBACK;
