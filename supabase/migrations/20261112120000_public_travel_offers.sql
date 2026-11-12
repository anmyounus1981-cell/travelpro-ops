BEGIN;

CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('flight', 'holiday', 'umrah', 'visa')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 100),
  destination text NOT NULL CHECK (char_length(btrim(destination)) BETWEEN 2 AND 80),
  details text NOT NULL CHECK (char_length(btrim(details)) BETWEEN 10 AND 1200),
  price_label text CHECK (char_length(btrim(price_label)) BETWEEN 1 AND 60),
  is_published boolean NOT NULL DEFAULT false,
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.offers TO anon, authenticated;
GRANT INSERT (category, title, destination, details, price_label, is_published, expires_at)
  ON public.offers TO authenticated;
GRANT UPDATE (category, title, destination, details, price_label, is_published, expires_at)
  ON public.offers TO authenticated;
GRANT DELETE ON public.offers TO authenticated;

CREATE POLICY published_offers ON public.offers FOR SELECT TO anon, authenticated
  USING (is_published AND (expires_at IS NULL OR expires_at >= (now() AT TIME ZONE 'Asia/Dhaka')::date));

CREATE POLICY manage_offers_as_owner ON public.offers FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_users WHERE auth_user_id = (SELECT auth.uid()) AND role = 'owner'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.app_users WHERE auth_user_id = (SELECT auth.uid()) AND role = 'owner'
  ));

CREATE FUNCTION public.touch_offer_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_offer_updated_at() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER touch_offer_updated_at BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.touch_offer_updated_at();

ALTER TABLE public.inquiries ADD COLUMN offer_snapshot jsonb;

CREATE FUNCTION public.capture_inquiry_offer() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  selected_offer public.offers%ROWTYPE;
  expected_service text;
BEGIN
  NEW.offer_snapshot := NULL;
  IF NEW.source <> 'landing_page' OR NOT coalesce(NEW.channel_metadata ? 'offerId', false) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO selected_offer FROM public.offers
    WHERE id = (NEW.channel_metadata ->> 'offerId')::uuid
      AND is_published
      AND (expires_at IS NULL OR expires_at >= (now() AT TIME ZONE 'Asia/Dhaka')::date)
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer is no longer available' USING ERRCODE = '22023';
  END IF;

  expected_service := CASE selected_offer.category
    WHEN 'flight' THEN 'flight_booking'
    WHEN 'visa' THEN 'visa_support'
    ELSE 'package'
  END;
  IF NEW.service_type IS DISTINCT FROM expected_service THEN
    RAISE EXCEPTION 'Inquiry service does not match the offer' USING ERRCODE = '22023';
  END IF;

  NEW.offer_snapshot := jsonb_build_object(
    'id', selected_offer.id, 'title', selected_offer.title,
    'category', selected_offer.category, 'destination', selected_offer.destination,
    'details', selected_offer.details, 'priceLabel', selected_offer.price_label,
    'expiresAt', selected_offer.expires_at, 'version', selected_offer.updated_at
  );
  RETURN NEW;
END;
$$;
-- Scope this read to the trigger. Intake still runs through the existing signed RPC.
ALTER FUNCTION public.capture_inquiry_offer() OWNER TO postgres;
ALTER FUNCTION public.capture_inquiry_offer() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.capture_inquiry_offer() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER capture_inquiry_offer BEFORE INSERT ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.capture_inquiry_offer();

COMMIT;
