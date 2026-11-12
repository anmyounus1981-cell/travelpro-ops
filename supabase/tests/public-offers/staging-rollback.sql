-- Run only on staging. Use the staging Owner mapping and existing Vault key.
BEGIN;

SELECT set_config('request.jwt.claim.sub','c7df54de-b5bf-43b2-997a-9dccbf083d9a',true);
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  live_id uuid;
  hidden_id uuid;
  expired_id uuid;
  revision timestamptz;
BEGIN
  INSERT INTO public.offers(category,title,destination,details,price_label,is_published)
    VALUES ('flight','STAGING ONLY: Dhaka to Singapore','Singapore','Synthetic fixture for offer attribution.','Test BDT 100',false)
    RETURNING id, updated_at INTO live_id, revision;
  UPDATE public.offers SET is_published=true WHERE id=live_id AND updated_at=revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owner could not publish'; END IF;
  INSERT INTO public.offers(category,title,destination,details) VALUES
    ('visa','STAGING ONLY: Draft','Singapore','Synthetic unpublished offer.') RETURNING id INTO hidden_id;
  INSERT INTO public.offers(category,title,destination,details,is_published,expires_at) VALUES
    ('holiday','STAGING ONLY: Expired','Singapore','Synthetic expired offer.',true,(now() AT TIME ZONE 'Asia/Dhaka')::date-1)
    RETURNING id INTO expired_id;

  IF (SELECT count(*) FROM public.offers WHERE id IN (live_id,hidden_id,expired_id)) <> 3 THEN
    RAISE EXCEPTION 'Owner cannot read all offer states';
  END IF;
  PERFORM set_config('test.live_offer',live_id::text,true);
  PERFORM set_config('test.draft_offer',hidden_id::text,true);
  PERFORM set_config('test.expired_offer',expired_id::text,true);
END $test$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','bda997cf-48f4-4bb1-afcd-7a550ffbcc91',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.offers WHERE id=current_setting('test.draft_offer')::uuid) THEN
    RAISE EXCEPTION 'Non-owner read draft';
  END IF;
  BEGIN
    INSERT INTO public.offers(category,title,destination,details) VALUES ('visa','Forged offer','Dhaka','Synthetic forbidden insert.');
    RAISE EXCEPTION 'Non-owner inserted offer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.offers SET is_published=false WHERE id=current_setting('test.live_offer')::uuid;
  IF FOUND THEN RAISE EXCEPTION 'Non-owner updated offer'; END IF;
  DELETE FROM public.offers WHERE id=current_setting('test.live_offer')::uuid;
  IF FOUND THEN RAISE EXCEPTION 'Non-owner deleted offer'; END IF;
END $test$;
RESET ROLE;

DO $test$
BEGIN
  IF NOT has_table_privilege('anon','public.offers','SELECT')
    OR has_any_column_privilege('anon','public.offers','INSERT')
    OR has_any_column_privilege('anon','public.offers','UPDATE')
    OR has_table_privilege('anon','public.offers','DELETE')
    OR has_function_privilege('anon','public.capture_inquiry_offer()','EXECUTE')
    OR has_any_column_privilege('anon','public.inquiries','SELECT')
    OR has_any_column_privilege('anon','public.inquiries','INSERT') THEN
    RAISE EXCEPTION 'Unexpected anonymous grants';
  END IF;
END $test$;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.offers WHERE id IN (
    current_setting('test.live_offer')::uuid,
    current_setting('test.draft_offer')::uuid,
    current_setting('test.expired_offer')::uuid
  )) <> 1 THEN RAISE EXCEPTION 'Anonymous offer visibility incorrect'; END IF;
END $test$;
RESET ROLE;

INSERT INTO public.clients(id, company_name, contact_name, contact_email, contact_phone)
VALUES ('c7c83001-dc1b-411e-8830-c70f3e21db81','STAGING ONLY: Offer Client','Synthetic','phase2-offer@example.invalid','');

DO $test$
DECLARE
  secret text;
  stamp bigint := floor(extract(epoch FROM clock_timestamp()));
  body jsonb;
  kind text;
  offer_id text;
BEGIN
  SELECT decrypted_secret INTO STRICT secret FROM vault.decrypted_secrets WHERE name='travelpro_web_intake_hmac_v1';
  PERFORM set_config('test.offer_stamp',stamp::text,true);
  FOREACH kind IN ARRAY ARRAY['live','draft','expired'] LOOP
    offer_id := current_setting('test.' || kind || '_offer');
    body := jsonb_build_object(
      'version',1,'requestId',gen_random_uuid(),'source','landing_page','clientType','corporate',
      'companyName','STAGING ONLY: Offer Client','serviceType','flight_booking',
      'rawMessage','Synthetic offer inquiry','contact',jsonb_build_object('name','Synthetic','email','phase2-offer@example.invalid'),
      'travel',jsonb_build_object('origin','DAC','destination','SIN'),'metadata',jsonb_build_object('offerId',offer_id)
    );
    PERFORM set_config('test.offer_'||kind||'_body',body::text,true);
    PERFORM set_config('test.offer_'||kind||'_mac',encode(extensions.hmac(
      convert_to('travelpro:web-intake:v1:'||stamp::text||':'||body::text,'UTF8'),convert_to(secret,'UTF8'),'sha256'
    ),'hex'),true);
  END LOOP;
END $test$;

SET LOCAL ROLE anon;
DO $test$
DECLARE
  result jsonb;
  kind text;
  stamp bigint := current_setting('test.offer_stamp')::bigint;
BEGIN
  FOREACH kind IN ARRAY ARRAY['draft','expired'] LOOP
    BEGIN
      PERFORM public.submit_signed_web_inquiry(current_setting('test.offer_'||kind||'_body'),stamp,current_setting('test.offer_'||kind||'_mac'));
      RAISE EXCEPTION 'Inactive offer inquiry accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
      IF SQLERRM <> 'Offer is no longer available' THEN RAISE; END IF;
    END;
  END LOOP;
  result := public.submit_signed_web_inquiry(current_setting('test.offer_live_body'),stamp,current_setting('test.offer_live_mac'));
  IF result->>'status' IS DISTINCT FROM 'accepted' OR result->>'id' IS NULL THEN
    RAISE EXCEPTION 'Published offer inquiry not accepted';
  END IF;
  PERFORM set_config('test.offer_inquiry',result->>'id',true);
END $test$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','c7df54de-b5bf-43b2-997a-9dccbf083d9a',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  inquiry_id uuid := current_setting('test.offer_inquiry')::uuid;
  offer_id uuid := current_setting('test.live_offer')::uuid;
  payload jsonb;
  result jsonb;
BEGIN
  UPDATE public.offers SET title='STAGING ONLY: Revised' WHERE id=offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owner could not edit'; END IF;
  DELETE FROM public.offers WHERE id=offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Owner could not delete'; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.inquiries WHERE id=inquiry_id AND status='new'
    AND offer_snapshot->>'id'=offer_id::text
    AND offer_snapshot->>'title'='STAGING ONLY: Dhaka to Singapore'
    AND offer_snapshot->>'priceLabel'='Test BDT 100'
    AND offer_snapshot->>'details'='Synthetic fixture for offer attribution.') THEN
    RAISE EXCEPTION 'Owner cannot see original offer attribution';
  END IF;
  IF EXISTS(SELECT 1 FROM public.cases WHERE client_id='c7c83001-dc1b-411e-8830-c70f3e21db81') THEN
    RAISE EXCEPTION 'Intake created a case without review';
  END IF;

  payload := jsonb_build_object(
    'version',1,'requestId',inquiry_id,'inquiryId',inquiry_id,
    'clientId','c7c83001-dc1b-411e-8830-c70f3e21db81','serviceType','flight_booking',
    'reviewConfirmed',true,'origin','DAC','destination','SIN',
    'departureDate',((now() AT TIME ZONE 'Asia/Dhaka')::date+30)::text,'returnDate','',
    'tripType','oneway','adultCount',1,'childCount',0,'infantCount',0,'cabinClass','economy',
    'notes','Synthetic offer review'
  );
  result := public.convert_inquiry_to_case(payload);
  IF NOT EXISTS (SELECT 1 FROM public.inquiries WHERE id=inquiry_id AND status='converted'
    AND converted_case_id::text=result->>'id' AND offer_snapshot->>'id'=offer_id::text) THEN
    RAISE EXCEPTION 'Conversion lost offer attribution or case linkage';
  END IF;
  IF (SELECT count(*) FROM public.audit_logs WHERE entity_id=inquiry_id AND action='inquiry.converted') <> 1 THEN
    RAISE EXCEPTION 'Expected one conversion audit event';
  END IF;
END $test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
DECLARE
  result jsonb;
BEGIN
  result := public.submit_signed_web_inquiry(current_setting('test.offer_live_body'),
    current_setting('test.offer_stamp')::bigint,current_setting('test.offer_live_mac'));
  IF result->>'duplicate' IS DISTINCT FROM 'true' OR result->>'id' IS DISTINCT FROM current_setting('test.offer_inquiry') THEN
    RAISE EXCEPTION 'Deleting the offer broke an accepted submission retry';
  END IF;
END $test$;
ROLLBACK;

SELECT 'PASS: Owner CRUD, visitor visibility, non-owner write denial, inactive offer rejection, snapshot, atomic conversion, retry after deletion' AS result;
