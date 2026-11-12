import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { dhakaDate, offerFields } from "@/lib/offers";

export function publishedOffers() {
  // Always read as a visitor, including when the Owner is browsing the storefront.
  const db = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return db.from("offers").select(offerFields).eq("is_published", true)
    .or(`expires_at.is.null,expires_at.gte.${dhakaDate()}`);
}
