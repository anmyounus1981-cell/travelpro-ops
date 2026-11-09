BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"c7df54de-b5bf-43b2-997a-9dccbf083d9a","role":"authenticated"}';
DO $test$
DECLARE b uuid := '39f0c159-1ed1-4dfb-8bd7-3cfa2617ed7a'; before_rows jsonb; after_rows jsonb; n integer;
BEGIN
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO before_rows FROM public.reminders r WHERE entity_id=b;
 PERFORM public.schedule_booking_ttl_reminders(b);
 PERFORM public.schedule_booking_ttl_reminders(b);
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO after_rows FROM public.reminders r WHERE entity_id=b;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Expired unchanged retry mutated reminders'; END IF;

 UPDATE public.bookings SET ttl=now()+interval '3 days' WHERE id=b;
 n:=public.schedule_booking_ttl_reminders(b);
 IF n<>4 THEN RAISE EXCEPTION 'Future TTL expected 4 inserts, got %',n; END IF;
 IF (SELECT count(*) FROM public.reminders WHERE entity_id=b AND status='cancelled')<>4 THEN RAISE EXCEPTION 'Old schedule not cancelled'; END IF;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO before_rows FROM public.reminders r WHERE entity_id=b;
 n:=public.schedule_booking_ttl_reminders(b);
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO after_rows FROM public.reminders r WHERE entity_id=b;
 IF n<>0 OR before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Future retry not idempotent'; END IF;

 UPDATE public.reminders SET status='failed',attempt_count=1 WHERE entity_id=b AND status='scheduled' AND message LIKE '%60 minutes';
 UPDATE public.reminders SET status='sent' WHERE entity_id=b AND status='scheduled' AND message LIKE '%120 minutes';
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO before_rows FROM public.reminders r WHERE entity_id=b;
 PERFORM public.schedule_booking_ttl_reminders(b);
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO after_rows FROM public.reminders r WHERE entity_id=b;
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Retry changed failed/sent rows'; END IF;

 UPDATE public.reminders SET status='processing' WHERE entity_id=b AND status='scheduled';
 BEGIN
  PERFORM public.schedule_booking_ttl_reminders(b);
  RAISE EXCEPTION 'Processing guard failed';
 EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
 END;
 UPDATE public.reminders SET status='scheduled' WHERE entity_id=b AND status='processing';
 UPDATE public.bookings SET status='cancelled' WHERE id=b;
 PERFORM public.schedule_booking_ttl_reminders(b);
 IF EXISTS (SELECT 1 FROM public.reminders WHERE entity_id=b AND status IN ('scheduled','failed')) THEN RAISE EXCEPTION 'Cancelled booking retains pending reminders'; END IF;
 IF (SELECT count(*) FROM public.reminders WHERE entity_id=b AND status='sent')<>1 THEN RAISE EXCEPTION 'Sent history lost'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: unchanged overdue retry, changed future TTL, identical future retry, failed/sent preservation, processing guard, cancelled booking; all fixture changes rolled back' AS result;
