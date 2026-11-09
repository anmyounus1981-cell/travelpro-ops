# Staging UI and scheduler verification, 9 November 2026

Target: zkrpbcxukbtbsakcepxv only.
Branch: review/environment-isolation-20261103.
Supersedes the outstanding UI/scheduler defects recorded on 4 November.
No production configuration, data, cleanup or Auth deletion changed.

- Reminder selector and card use SIMULATION plus simulation_reference; missing
  real references never render PNR null. Production selects no staging-only columns.
- Cards explicitly show channel and audience. Manual reminder Server Action
  hardcodes in_app / owner, ignoring client channel input; database containment
  remains active. No external-channel selector is exposed.
- Dedicated payments/tickets pages return a simulation-only notice before querying
  records or rendering forms outside production. Existing server/database blocks remain.
- Scheduler locks the booking, preserves matching pending reminders, cancels only
  obsolete scheduled/failed reminders, and retains terminal delivery history.
  A processing reminder produces 55000 without mutation; retry after completion.
  No past-due reminders are newly created. Cancelled/dismissed history is not revived
  automatically, including when reverting to a previously cancelled schedule key.
- Migration: 20261109105113_staging_idempotent_ttl_scheduler.sql.
  Staging-only baseline guard, SECURITY INVOKER, empty search_path, owner guard.

Verification:
- 46 Node tests passed, including rendered Server Components with mocked DB boundary.
- TypeScript passed; Next.js production build passed with synthetic staging config.
- Executed owner-context SQL integration tests: unchanged overdue retry, new future
  TTL, repeated future retry, failed/sent history, processing guard, cancellation.
  All test mutations rolled back. Anon/unmapped scheduler rejection passed.
- Readback: original TEST99 TTL unchanged; four scheduled reminders with original
  updated_at=created_at and zero attempts; active cron jobs zero.
- SQL integration test file is staging-only and deliberately ends in ROLLBACK.
- Rendering tests are not authenticated browser E2E. Owner visual confirmation of
  the new preview is required; do not reset TTL merely to remove overdue labels.
- Cleanup draft stays blocked. Audit immutability exception remains separate.
- PR remains draft. Staging-only migrations must not be applied unchanged to production.
