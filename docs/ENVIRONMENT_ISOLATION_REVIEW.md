# Environment separation review and release gates

Reviewed 3 November 2026. Source baseline: main 2e23db2fb23f81cc8fee202d3df0500e19f52cc4.
This change is prepared for review, not an assertion of live separation.

## Verified findings

- Browser, server and auth middleware import one hardcoded primary URL/key.
- Tracked .env.production also supplies primary defaults. Next.js loads this
  for preview builds as well as production; NODE_ENV is not deployment identity.
- Vercel public URL, legacy anon key and app URL have production, preview and
  development targets. No secret values were decrypted for this review.
- Branch-specific secret entries exist for inquiry ingestion and OCR previews.
- No .github/workflows, vercel.json or supabase/config.toml at the main baseline.
  GitHub workflow registry requests were rejected by connector URL validation;
  this review does not claim to audit repository administration or secrets.
- Vercel reports Next.js, Node 24.x, production domains and SSO protection.
  Returned metadata does not expose every Git deployment/build setting.
- Accessible Supabase projects: primary zhqdssbysdebgeijscvm ACTIVE_HEALTHY;
  atomic-test tpfipndxhroliabwlgyb INACTIVE. No usable staging target established.
- Source contains Stripe handlers and optional OpenAI inquiry/OCR calls.
  No application outbound email transport or GDS booking API was found in
  the reviewed main source. Prior quotation email used the Gmail connector,
  outside application enforcement; it is not automated by this branch.

## Implemented in this branch

- Explicit public deployment mode, project reference, URL and publishable key.
- Exact URL/reference match; only production may use the known primary ref.
- Production mode requires VERCEL_ENV=production; preview/local cannot use it.
- Validation at build and server-client/auth middleware entry.
- Remove tracked database/key fallback. No fallback to stale legacy anon key.
- Non-production rejects reviewed privileged database, billing, webhook and AI
  credential variables. Stripe handlers deny non-production; OCR denies it;
  inquiry parsing uses its deterministic fallback there.
- Secret-free CI tests, typecheck and synthetic configuration build.

This is protection against misconfiguration in this application version,
not a network firewall or proof of all external integrations being isolated.
Already-built previews and external n8n/Gmail jobs do not inherit this guard.

## Required rollout (not executed)

1. Select an approved non-production Supabase project. Do not silently reuse
   atomic-test, copy production data or unpause any project.
2. Audit schema/migration compatibility and provision synthetic data only.
   Keep independent Auth users, storage, secrets and callback origins.
3. Keep cron jobs inactive while configuring. Inspect cron.job commands and
   Vault/HTTP destinations before enabling any staging dispatcher. Never copy
   production scheduler/provider credentials. Stage reminders stay in stage DB.
4. Scope these variables separately in Vercel:
   NEXT_PUBLIC_OPS_ENV, NEXT_PUBLIC_SUPABASE_PROJECT_REF,
   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
   NEXT_PUBLIC_APP_URL. Production ref is fixed to the primary; stage ref is
   currently unresolved. Retrieve the correct public key through tools after
   destination selection. Never reuse the legacy key on name similarity.
5. Remove inherited privileged/provider credentials from practice deployment.
   For future email transport, enforce a server-side test-recipient allowlist
   before enabling it. Current provider operations remain disabled there.
6. Review existing preview deployments that still hardcode production. Restrict
   access/retire them separately; a new branch cannot patch old deployments.
7. Deploy a stage build, verify Auth/Storage/database routing and scheduler
   containment, then exercise synthetic Case -> Quote -> Booking -> TTL.
   Add a truthful simulation source/validation in staging before TEST99 entry;
   this branch does not add a fake GDS tag or alter booking enum constraints.
8. Rebuild production only after its new variables are set to the verified
   primary pair. Existing Vercel URL is stale according to the earlier review;
   switching code to env without correcting scope is unsafe. Build should fail
   until configuration is complete. Never promote a stage-built public bundle.

## Acme practice correction strategy (not applied)

Read-only checks found client 1d60c643-a92d-47e3-880b-0a3fd56ba385 has one
case, no travellers and no linked inquiries. Case 56e6cea8-c751-4e4c-9ccd-fc9c62f0eb06
(TP-261103-360E) is new, has one quotation, zero bookings, zero service cases,
zero traveller assignments and zero case reminders. No mock booking exists.

Do not delete, change to paid/ticketed, or treat a practice email as real demand.
No practice/archive column exists in the reviewed clients/cases schema.

Prepare a separately reviewed, transactional owner-only archival operation:
- Add minimal archived_at/archive_reason metadata to cases and clients using
  the normal migration workflow; do not overload closed as an exclusion flag.
- Lock the exact client/case, recheck all dependencies and expected counts.
- Preserve quotation/FK/audit history and label the records PRACTICE.
- Exclude archived parents from operational queues, selectors and reporting.
- Reject all new quotation/booking/payment/ticket/service writes for archived
  cases server-side and in database enforcement for direct API paths.
- Dismiss any discovered active reminders atomically with an audit; add
  archived-parent exclusions to scheduler queries before claiming containment.
- Archive the client only after confirming it has no unrelated live use.
- Verify exclusions, rejected writes, retry behavior and audited rollback in
  staging before applying the exact-record production correction.

No schema migration, archive mutation, credential reset, project deletion,
unpause or provider configuration was performed by this review.

## Evidence and limits

22 pure environment tests passed, npm run typecheck passed, npm run build
passed with synthetic non-production configuration. No real database call or
provider transaction is demonstrated by those checks. Existing build config
skips its built-in lint/type stages; typecheck was run separately. Lint was
not run. Complete staging/browser isolation and database archival remain
unverified and blocked until the above concrete prerequisites are resolved.

References:
- https://nextjs.org/docs/app/guides/environment-variables
- https://supabase.com/docs/guides/deployment/managing-environments
- https://supabase.com/changelog
