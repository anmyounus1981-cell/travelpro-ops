import { validatePublicEnvironment } from '../environment.mjs';

// Direct references ensure Next.js browser build-time substitution.
const config = validatePublicEnvironment({
  mode: process.env.NEXT_PUBLIC_OPS_ENV,
  projectRef: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export const opsEnvironment = config.mode;
export const supabaseUrl = config.url;
export const supabasePublishableKey = config.key;

