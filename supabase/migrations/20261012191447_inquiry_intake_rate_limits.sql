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