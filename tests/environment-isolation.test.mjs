import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeploymentEnvironment as validate, PRIMARY_PROJECT_REF } from '../lib/environment.mjs';

// Deliberately synthetic references/keys. No service calls.
const staging = {
  NEXT_PUBLIC_OPS_ENV: 'staging',
  NEXT_PUBLIC_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_APP_URL: 'https://practice.example.com',
};
const production = { ...staging, NEXT_PUBLIC_OPS_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_PROJECT_REF: PRIMARY_PROJECT_REF,
  NEXT_PUBLIC_SUPABASE_URL: `https://${PRIMARY_PROJECT_REF}.supabase.co`,
  VERCEL_ENV: 'production', NEXT_PUBLIC_APP_URL:'https://travelpro-ops.vercel.app' };
test('distinct staging target accepted', () => assert.equal(validate(staging).mode, 'staging'));
test('production requires primary target', () => assert.equal(validate(production).projectRef, PRIMARY_PROJECT_REF));
test('missing configuration rejected', () => assert.throws(() => validate({})));
test('preview cannot declare production', () => assert.throws(() => validate({ ...production, VERCEL_ENV: 'preview' })));
test('local production access rejected', () => assert.throws(() => validate({ ...production, VERCEL_ENV: undefined })));
test('production cannot use staging mode', () => assert.throws(() => validate({ ...staging, VERCEL_ENV: 'production' })));
test('staging cannot use primary even when URL matches', () => assert.throws(() => validate({ ...production, NEXT_PUBLIC_OPS_ENV: 'staging', VERCEL_ENV: 'preview' })));
test('mismatched URL rejected', () => assert.throws(() => validate({ ...staging, NEXT_PUBLIC_SUPABASE_URL: production.NEXT_PUBLIC_SUPABASE_URL })));
test('URL credentials rejected', () => assert.throws(() => validate({ ...staging, NEXT_PUBLIC_SUPABASE_URL: 'https://user:password@abcdefghijklmnopqrst.supabase.co' })));
test('secret key rejected as public key', () => assert.throws(() => validate({ ...staging, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_synthetic' })));
test('practice cannot inherit production app URL', () => assert.throws(() => validate({ ...staging, NEXT_PUBLIC_APP_URL: 'https://travelpro-ops.vercel.app' })));
for (const name of ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_ACCOUNT_ID', 'OPENAI_API_KEY', 'INQUIRY_WEBHOOK_SECRET', 'INQUIRY_RATE_LIMIT_SECRET']) {
  test(`practice rejects inherited ${name}`, () => assert.throws(() => validate({ ...staging, [name]: 'synthetic' })));
}
