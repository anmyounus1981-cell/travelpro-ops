// Shared pure validation. Never pass private credentials to browser code.
export const PRIMARY_PROJECT_REF = 'zhqdssbysdebgeijscvm';

export function validatePublicEnvironment({ mode, projectRef, url, key }) {
  if (!['production', 'staging', 'development'].includes(mode))
    throw new Error('Set NEXT_PUBLIC_OPS_ENV explicitly.');
  if (!/^[a-z0-9]{20}$/.test(projectRef || ''))
    throw new Error('Set NEXT_PUBLIC_SUPABASE_PROJECT_REF explicitly.');
  if ((mode === 'production') !== (projectRef === PRIMARY_PROJECT_REF))
    throw new Error('Environment cannot use this Supabase project.');
  if (url !== `https://${projectRef}.supabase.co`)
    throw new Error('Supabase URL does not match the approved project reference.');
  if (typeof key !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
    throw new Error('A project-specific Supabase publishable key is required.');
  return { mode, projectRef, url, key };
}

export function validateDeploymentEnvironment(env) {
  const config = validatePublicEnvironment({
    mode: env.NEXT_PUBLIC_OPS_ENV,
    projectRef: env.NEXT_PUBLIC_SUPABASE_PROJECT_REF,
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  // NODE_ENV is production for preview builds too.
  if (env.VERCEL_ENV === 'production' && config.mode !== 'production')
    throw new Error('Production deployment must use production configuration.');
  if (env.VERCEL_ENV !== 'production' && config.mode === 'production')
    throw new Error('Production access is forbidden outside Vercel production.');
  const origin = normalizeAppOrigin(env.NEXT_PUBLIC_APP_URL);
  if (config.mode === 'production' && origin !== 'https://travelpro-ops.vercel.app')
    throw new Error('Production app origin must be explicitly reviewed.');
  if (config.mode !== 'production') {
    const forbidden = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
      'DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL', 'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_ACCOUNT_ID', 'OPENAI_API_KEY',
      'INQUIRY_WEBHOOK_SECRET', 'INQUIRY_RATE_LIMIT_SECRET'];
    if (forbidden.some(name => Boolean(env[name])))
      throw new Error('Remove privileged/provider credentials from practice.');
    if (origin === 'https://travelpro-ops.vercel.app')
      throw new Error('Practice cannot use the production app URL.');
  }
  return config;
}

export function isPracticeEnvironment(mode) {
  return mode === 'staging' || mode === 'development';
}
export function assertLiveOperations(mode) {
  if (mode !== 'production') throw new Error('Live booking, payment and ticket actions require production configuration.');
}
export function normalizeAppOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('A valid HTTPS app origin is required.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('App URL must be an HTTPS origin only.');
  return url.origin;
}
