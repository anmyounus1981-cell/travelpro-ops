-- Dedicated staging only. Never apply this overlay to production.
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
                 WHERE name = 'staging_reviewed_main_baseline') THEN
    RAISE EXCEPTION 'Dedicated staging baseline required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings) THEN
    RAISE EXCEPTION 'Review existing bookings before applying simulation overlay';
  END IF;
END $guard$;

ALTER TABLE public.bookings
  ALTER COLUMN pnr DROP NOT NULL,
  ADD COLUMN execution_mode text NOT NULL DEFAULT 'simulation',
  ADD COLUMN simulation_reference text,
  ADD COLUMN simulation_run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  DROP CONSTRAINT bookings_pnr_source_check,
  ADD CONSTRAINT bookings_staging_simulation_only CHECK (
    execution_mode = 'simulation' AND pnr IS NULL
    AND pnr_source = 'practice_simulation'
    AND simulation_reference IS NOT NULL
    AND simulation_reference ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
    AND ttl_source = 'manual_practice_simulation'
    AND status IN ('unticketed', 'cancelled', 'expired')
  ),
  ADD CONSTRAINT bookings_simulation_reference_unique UNIQUE(simulation_reference);

-- This staging database stores internal reminders only.
ALTER TABLE public.reminders ADD CONSTRAINT staging_reminders_internal_only
  CHECK (channel IS NOT DISTINCT FROM 'in_app' AND audience IS NOT DISTINCT FROM 'owner');
REVOKE INSERT, UPDATE, DELETE ON public.payments, public.tickets,
  public.service_cases, public.proposal_deliveries FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.create_simulation_booking(
  p_case_id uuid, p_quotation_id uuid, p_reference text,
  p_amount numeric, p_ttl timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  v_owner uuid;
  v_case public.cases%rowtype;
  v_quote public.quotations%rowtype;
  v_existing public.bookings%rowtype;
  v_id uuid;
  v_count integer;
  v_ref text := upper(btrim(p_reference));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_owner FROM public.app_users
    WHERE auth_user_id = auth.uid() AND role = 'owner';
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Owner access required' USING ERRCODE = '42501';
  END IF;
  IF v_ref IS NULL OR v_ref !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' THEN
    RAISE EXCEPTION 'Invalid simulation reference';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 OR p_amount::text IN ('NaN','Infinity','-Infinity')
    OR p_ttl IS NULL OR NOT isfinite(p_ttl) OR p_ttl <= now() THEN
    RAISE EXCEPTION 'Valid amount and future simulation deadline required';
  END IF;
  SELECT * INTO v_case FROM public.cases WHERE id = p_case_id AND user_id = v_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found or inaccessible'; END IF;
  SELECT * INTO v_quote FROM public.quotations
    WHERE id = p_quotation_id AND case_id = p_case_id AND user_id = v_owner FOR SHARE;
  IF NOT FOUND OR v_quote.status NOT IN ('approved','sent','accepted') THEN
    RAISE EXCEPTION 'Approved quotation for the same case required';
  END IF;
  IF v_quote.expiry_date IS NULL OR v_quote.expiry_date <= now() THEN
    RAISE EXCEPTION 'Quotation has expired or has no validity';
  END IF;
  IF p_amount IS DISTINCT FROM (v_quote.base_fare + v_quote.taxes + v_quote.service_fee) THEN
    RAISE EXCEPTION 'Amount must match approved quotation';
  END IF;
  SELECT * INTO v_existing FROM public.bookings WHERE simulation_reference = v_ref;
  IF FOUND THEN
    IF v_existing.case_id = p_case_id AND v_existing.quotation_id = p_quotation_id
      AND v_existing.user_id = v_owner AND v_existing.quoted_amount = p_amount
      AND v_existing.ttl = p_ttl THEN RETURN v_existing.id; END IF;
    RAISE EXCEPTION 'Simulation reference already used with different details';
  END IF;
  IF v_case.status IN ('booked','ticketed','closed') THEN
    RAISE EXCEPTION 'Case is not available for simulation booking';
  END IF;
  INSERT INTO public.bookings(case_id,quotation_id,pnr,pnr_source,execution_mode,
    simulation_reference,quoted_amount,ttl,ttl_source,status,user_id)
  VALUES(p_case_id,p_quotation_id,NULL,'practice_simulation','simulation',
    v_ref,p_amount,p_ttl,'manual_practice_simulation','unticketed',v_owner)
  RETURNING id INTO v_id;
  v_count := public.schedule_booking_ttl_reminders(v_id);
  UPDATE public.cases SET status='booked',
    next_action='SIMULATION ONLY: review internal TTL log; no payment or ticketing',
    next_action_deadline=p_ttl WHERE id=p_case_id;
  PERFORM public.record_operational_audit('booking.created','booking',v_id,
    jsonb_build_object('execution_mode','simulation','simulation_reference',v_ref,
      'manual_gds_action_recorded',false,'reminder_count',v_count));
  RETURN v_id;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.create_simulation_booking(uuid,uuid,text,numeric,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_simulation_booking(uuid,uuid,text,numeric,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.schedule_booking_ttl_reminders(p_booking_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  booking_record public.bookings%rowtype;
  inserted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.app_users as u
    where u.auth_user_id = auth.uid() and u.role = 'owner'
  ) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  select *
  into booking_record
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  if booking_record.execution_mode <> 'simulation' or booking_record.pnr is not null then
    raise exception 'Simulation booking required';
  end if;

  update public.reminders
  set
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
  where entity_type = 'booking'
    and entity_id = p_booking_id
    and reminder_type = 'ttl'
    and status in ('scheduled', 'processing', 'failed');

  if booking_record.status <> 'unticketed' then
    return 0;
  end if;

  insert into public.reminders (
    rule_id,
    entity_type,
    entity_id,
    reminder_type,
    due_at,
    status,
    message,
    channel,
    audience,
    attempt_count,
    max_attempts,
    next_attempt_at,
    dedupe_key,
    user_id
  )
  select
    rule.id,
    'booking',
    booking_record.id,
    'ttl',
    booking_record.ttl
      - (rule.threshold_minutes * interval '1 minute'),
    'scheduled',
    'SIMULATION '
      || booking_record.simulation_reference
      || ' reaches TTL within '
      || rule.threshold_minutes::text
      || ' minutes',
    rule.channel,
    rule.audience,
    0,
    rule.max_attempts,
    booking_record.ttl
      - (rule.threshold_minutes * interval '1 minute'),
    'ttl:'
      || booking_record.id::text
      || ':'
      || rule.threshold_minutes::text
      || ':'
      || rule.channel
      || ':'
      || rule.audience
      || ':'
      || extract(epoch from booking_record.ttl)::bigint::text,
    booking_record.user_id
  from public.reminder_rules as rule
  where rule.reminder_type = 'ttl'
    and rule.enabled = true
    and rule.channel = 'in_app'
    and rule.audience = 'owner'
    and booking_record.ttl
      - (rule.threshold_minutes * interval '1 minute') > now()
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;

  return inserted_count;
end;
$function$;
