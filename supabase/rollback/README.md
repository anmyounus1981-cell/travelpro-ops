# PR #18 function/grant rollback

`20261110_restore_pre_pr18_functions.sql` restores the exact pre-change production
function definitions and EXECUTE ACLs captured read-only on 10 November 2026.
Production project: `zhqdssbysdebgeijscvm`. It has only been exercised locally.

After separately authorized rollback, using a securely supplied database URL:

```powershell
psql "$env:TRAVELPRO_ROLLBACK_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/rollback/20261110_restore_pre_pr18_functions.sql
```

The file is one transaction with lock/statement timeouts. Expected candidate
function hashes and EXECUTE grants are checked before any replacement. Drift
aborts the transaction. It does not disable triggers, change cron, update
operational rows, delete audit history or modify migration history. Confirm
project identity and current catalog immediately before authorized execution.

This rollback restores the old scheduler behavior, including its known retry
cancellation defect, and the original broader grants. It is a recovery option,
not a security improvement. It does not reverse reminders already reactivated
or delivered, nor replace a full production recovery backup. Application/env
rollback and migration-history reconciliation require a separate reviewed plan.

Source capture: `tests/fixtures/production-function-catalog.json`.
Local round-trip test: `tests/isolated/rollback.mjs`.
