import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

export function createIntakeClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("Inquiry intake is not configured.");
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}