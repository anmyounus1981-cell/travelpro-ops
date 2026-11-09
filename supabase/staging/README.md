# Dedicated staging provisioning evidence

Project: travelpro-ops-staging
Reference: zkrpbcxukbtbsakcepxv
Organization: yxlotzmkdwxdiwwcvwkf
Region: ap-northeast-1
Verified status: ACTIVE_HEALTHY, PostgreSQL 17.11.0.011.

## Applied baseline

Migration version: 20261103145230
Migration name: staging_reviewed_main_baseline
Source: 25 ordered migrations at main 2e23db2fb23f81cc8fee202d3df0500e19f52cc4.
Applied SQL is retained in bootstrap-reviewed-main.sql.
SQL file SHA256: d09e51aa7493ee4340b2275a97d4164dfceb28445f5739f5dbaf6d64c3e0092a.

Adaptations:
- Excluded the three legacy owner/client/case seed INSERT statements.
- Omitted both cron.schedule calls. No automatic job was created.
- Conditional permission revoke for public.rls_auto_enable(), absent on the
  new platform. No substitute function or relaxed permission was created.
- Removed source-level BEGIN/COMMIT lines to keep the baseline together
  under the migration operation.

First attempt failed on the missing platform helper. Readback showed zero
public tables and empty migration history before the reviewed correction.
The subsequent baseline application returned success.

Verification:
- 22 public tables; zero public tables without RLS.
- Zero clients, cases and app_users.
- Four storage buckets; all private.
- Zero cron jobs and zero legacy demo policy names.
- One recorded baseline migration.
- Security advisor returned 11 authenticated SECURITY DEFINER execution
  warnings. These require function-level authorization review; they are not
  declared resolved by RLS presence.

## Migration history boundary

This is an explicit staging-only consolidated baseline, NOT the original
25-version history and NOT a production migration. Do not run the original
historical chain through db push against this database: it would attempt to
replay already installed definitions. Future migration tooling must reconcile
this baseline deliberately before any automated push is enabled.
Nothing in this directory is automatically applied by the GitHub workflow.

## Vercel state

Four values were saved and metadata read back on preview branch
review/environment-isolation-20261103 only:
NEXT_PUBLIC_OPS_ENV, NEXT_PUBLIC_SUPABASE_PROJECT_REF,
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
No key value is recorded here. No production variable was changed.

NEXT_PUBLIC_APP_URL and Auth redirect allowlist are still pending a verified
staging application origin. The inherited production app URL must not be used.
Existing build validation blocks that combination. No usable staging web
deployment or browser end-to-end success is claimed.

## Remaining access gates

The connector cannot configure Auth settings, redirect URLs or create an
Auth identity. Dashboard access reached sign-in, so those changes require
an authenticated dashboard session. No owner Auth user has been created,
no password has been generated and no invitation email has been sent.
Do not copy the production auth.users rows or passwords.

Keep automatic dispatchers unscheduled pending later explicit verification.
Production and the existing Acme practice records were not modified.
