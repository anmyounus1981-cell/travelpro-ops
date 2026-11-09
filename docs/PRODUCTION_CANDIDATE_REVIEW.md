# Production candidate review: 9 November 2026

Status: DRAFT. Do not merge, apply to production, or promote a deployment yet.
Branch: release/prod-security-hardening-20261109.
Parent: main / 2e23db2fb23f81cc8fee202d3df0500e19f52cc4.
This branch was assembled from main, not by cherry-picking the staging branch.

## Read-only production findings

Target inspected: zhqdssbysdebgeijscvm. Only catalog SELECT queries were issued.
No operational records were read, modified, exported, or deleted.

- app/actions.ts calls schedule_booking_ttl_reminders after owner-authorized booking creation and ticket recording.
- No other deployed function body references that scheduler in the inspected database catalogs.
- Active cron travelpro-ttl-owner-alerts runs as postgres and calls dispatch_due_ttl_reminders, not the scheduler.
- Active cron travelpro-owner-followups does not reference the scheduler.
- Historical phase4 migration backfill invoked the scheduler as administrator. It is not a recurring runtime caller. Future backfills require a separately reviewed authorized execution method.
- Dispatcher is SECURITY INVOKER with empty search_path; EXECUTE is restricted to postgres/service_role. Its definition, grants and cron jobs are unchanged.
- Scheduler is SECURITY INVOKER, with pg_catalog/public search_path; anon/authenticated/service_role can currently execute it. There is no explicit owner guard.
- Scheduler currently cancels scheduled/processing/failed reminders before INSERT ON CONFLICT DO NOTHING. An unchanged repeat can cancel reminders permanently instead of preserving them.
- Both immutable trigger functions already have empty search_path but EXECUTE is granted to PUBLIC, anon and authenticated. Existing triggers remain enabled and are not recreated.
- Production bookings.pnr is NOT NULL. There are no simulation columns used by this candidate.
- RLS on app_users permits the authenticated owner's own mapping; bookings/reminders/reminder_rules require a mapped owner.

Scope limit: database catalog and repository inspection cannot establish that no separately hosted external service calls this RPC. Inventory any such service before approving service_role scheduler revocation. No privileged bypass is added based on an unverified assumption.

## Candidate SQL

supabase/migrations/20261109174031_production_ttl_security_reliability.sql

- Single transaction; 5-second lock timeout and 30-second statement timeout.
- Exact pg_get_functiondef MD5 preconditions for all four inspected functions. Drift aborts rather than overwriting a newer definition. MD5 here is a change detector, not a security authenticity check.
- Scheduler: explicit auth.uid() and owner checks, SECURITY INVOKER, empty search_path.
- Locks booking then existing reminder rows in ID order. Same-booking scheduling is serialized; existing dispatcher row locks are respected.
- Processing rows cause a clean error instead of being cancelled underneath a worker.
- Retains unchanged scheduled/failed reminders, including overdue reminders, with no row update on repeat.
- Cancels only obsolete scheduled/failed rows and inserts future due times with existing dedupe semantics.
- Preserves rule-selected channels/audiences, real PNR messaging and terminal history. No staging-only in_app filter is imposed on live rules.
- Revokes scheduler EXECUTE from PUBLIC/anon/service_role; authenticated callers must pass the owner guard. postgres still needs owner claims to call this owner-facing function.
- Revokes trigger-function EXECUTE from PUBLIC/anon/authenticated. Does not disable immutability.

Limits requiring explicit review: cancelled/dismissed historical dedupe keys are not resurrected. Reverting to an old TTL can therefore leave no new reminder for that historical key. Existing epoch-to-bigint key rounding is retained; subsecond TTL changes are not a newly supported workflow. A multi-session scheduler/dispatcher stress test has not been performed. Changes to booking TTL in separate transactions can still race delivery of an already-due reminder; this migration does not make the entire booking/ticket workflow atomic.

## Application diff

- Reads Supabase target from explicit validated environment values instead of a hardcoded production target/key.
- Production mode requires primary project and VERCEL_ENV=production; preview/local cannot declare production.
- Removes committed production configuration defaults. Missing configuration fails closed.
- Validates HTTPS app origin without credentials/path/query/fragment; normalizes host casing/trailing slash. Production origin is travelpro-ops.vercel.app. Custom production domains need a reviewed allowlist change.
- Publishable-key format validation does not prove key/project pairing. Verify pairing securely before deployment.
- Explicit staging/development mode enables practice banner and blocks live financial/provider actions. Production retains booking/payment/ticket/reminder forms and server actions.
- This production candidate intentionally does not implement simulation booking creation. A nonproduction environment cannot create a live booking through these server actions; no staging-only RPC or column is queried.
- Reminder selector/cards use PNR or Booking reference unavailable; render channel and audience explicitly.
- Ports dynamic quotation approver owner ID, checked errors and optimistic status updates. Quotation, case and audit writes remain separate transactions.
- Build no longer suppresses TypeScript errors. Existing lint skip remains; no lint PASS is claimed.

Excluded: staging baseline, simulation table columns/constraints, simulation RPC, production financial-table permission revocations, TEST99 fixtures/data, staging Auth users, cleanup SQL, cron changes, staging credentials.

## Verification evidence

- 63 tests PASS: environment isolation, origin validation, rendered production/practice UI, dynamic quotation approval, actual booking/payment/ticket Server Actions with mocked Supabase boundaries, and local PostgreSQL scheduler integration.
- TypeScript: npm run typecheck PASS.
- Optimized Next.js production build PASS with synthetic publishable key and production-mode configuration. No live credentials or application requests were used.
- Integration runtime: PGlite 0.3.14, in-memory PostgreSQL 17.5. It executes the exact candidate migration against a minimal schema contract fixture and exact catalog-exported old function definitions.
- Integration verifies owner/unmapped/anon access, service-role scheduler denial, initial four reminders, unchanged repeat fingerprints, overdue/failed preservation, TTL changes, ticketed cancellation, processing rejection, terminal history, unchanged dispatcher operation without owner JWT, trigger permissions/immutability, drift rejection.
- Installed dependency package versions match the committed main lockfile.
- These are not a full production restore, all historical SQL fixture suites, real payment/GDS calls, or a live browser/database end-to-end test. No 100% live compatibility claim.

Reproduce Node tests: install @electric-sql/pglite@0.3.14 in a separate test-tools directory, then set PGLITE_MODULE to its absolute dist/index.js path and run node --test tests/*.test.mjs. Existing project dependencies use the committed package-lock.json.

## Promotion gates

1. Review SQL and application diff independently; do not merge PR #17 wholesale.
2. Verify production variable inventory and actual project-specific publishable key securely. Required: NEXT_PUBLIC_OPS_ENV=production, NEXT_PUBLIC_SUPABASE_PROJECT_REF=zhqdssbysdebgeijscvm, NEXT_PUBLIC_SUPABASE_URL=https://zhqdssbysdebgeijscvm.supabase.co, NEXT_PUBLIC_APP_URL=https://travelpro-ops.vercel.app, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from that project. Do not reuse the historical mismatched URL variable.
3. Confirm a verified production recovery copy and rollback procedure before any production migration. This review did not establish one.
4. Run candidate against a production-shaped isolated test database without the staging simulation overlay; run existing SQL fixture suites and multi-session scheduler/dispatcher concurrency tests. Review TTL reversal behavior explicitly.
5. Inventory external scheduler callers; resolve any service_role caller before revocation. Preserve existing trusted dispatcher and financial workflows.
6. Perform owner browser regression for live-mode booking, payment evidence/verification and ticket recording using synthetic data only in the isolated production-shaped test environment.
7. Obtain scoped production migration/configuration/deployment authorization. Capture catalog hashes again immediately before applying. No automatic production release.
8. After authorized deployment, verify target SHA, routing, owner access and cron health. No automatic financial/GDS action is part of verification.

Existing limitations: main's booking/ticket writes are multi-request and can partially succeed; this candidate does not claim transactional repair of all operations. Production recovery readiness, externally hosted integrations, actual hosted preview behavior of this new branch, and live writes are not verified here.
