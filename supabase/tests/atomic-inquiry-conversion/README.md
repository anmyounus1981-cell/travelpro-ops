# Atomic Inquiry Conversion: Isolated Database Tests

Checkpoint source: 18a0471.
Evidence dates: 19-20 October 2026, Asia/Dhaka.
Authorized test project: travelpro-ops-atomic-test.
Project ref: tpfipndxhroliabwlgyb.

## Environment and bootstrap

Never run these tests against the shared production/Preview database.
Application environment files and Vercel connections were not changed.

All 28 migrations through 20261018184518 were applied to the isolated
project. Replay included demo owner/client/case records and Storage buckets,
not schema alone. Later security migrations were included.

Historical repository migrations were not edited. Two temporary bootstrap
copies wrapped scheduler creation and cron.alter_job(active := false) in
explicit transactions, with disabled-job assertions:
- 20260927193900_phase4_reminder_dispatcher.sql
- 20260928094545_phase4_case_followup_alerts.sql

An initial direct UPDATE cron.job failed with insufficient privilege.
Readback confirmed rollback: six migrations, no pg_cron, no TTL dispatcher.
The corrected copies subsequently applied successfully.

Database readback verified 28 migrations, latest 20261018184518, both jobs
inactive, conversion SECURITY INVOKER, empty search_path, authenticated
EXECUTE allowed and anonymous EXECUTE denied.

The two test scheduler migration bodies intentionally differ from repository
history. This isolated project is not evidence of unchanged full-chain replay.

## Scripts and verified coverage

The six SQL tests use BEGIN/ROLLBACK and synthetic fixtures.
Run SQL through a file to avoid Windows command-line quoting/length problems.

- authorization.sql: anonymous execution denied; authenticated identity
  without owner membership denied.
- success-and-identical-retry.sql: reviewed corporate conversion, source,
  passenger counts, linkage, review metadata, identical retry and one audit.
- conflicting-retry.sql: changed notes and changed request ID rejected.
- reviewed-field-validation.sql: eight invalid payload variants rejected.
- client-compatibility.sql: personal inquiry with corporate client rejected.
- audit-failure-rollback.sql: injected audit insert failure rolls back case
  and inquiry changes; subsequent valid conversion succeeds.

Owner-run CLI results reported exit code 0. A deliberate SQL exception
control returned the expected error and exit code 1.
Independent readback confirmed rollback fixtures and injected trigger absent.

## Direct concurrency runner

concurrent-identical.cjs requires pg 8.16.3, installed separately in the
temporary test workspace, not the application dependency tree.

It requires the existing synthetic owner mapping:
- Auth ID: 61e2c0bc-f9d7-47c3-992e-b09c1de10b11
- App owner ID: 62e2c0bc-f9d7-47c3-992e-b09c1de10b11
- Corporate client: 10000000-0000-0000-0000-000000000001

It reads TRAVELPRO_ATOMIC_DB_PASSWORD from the process environment and a CA
certificate path from its first argument. Never put passwords in commands,
URLs, repository files or logs. Keep certificate verification enabled.

The runner uses the explicit isolated session-pooler target and creates a
new committed synthetic inquiry. Successful case/audit evidence is retained.
It is a database-role simulation, not browser authentication/JWT verification.

Verified execution:
- Session A PID 46463; B PID 46466.
- B waited on transactionid, with A in pg_blocking_pids(B).
- Inquiry b4e128cd-b364-4312-bf01-7815ea89e33d.
- Request f49c1ff7-e46e-47a8-9adc-c7a11d4c7e43.
- Case b28bba75-8dae-4f3b-b1e4-7d07a1ea7c60.
- First duplicate=false; retry duplicate=true; same case ID.
- One linked case, one conversion audit, exit code 0.

Two earlier CLI background attempts did not establish concurrency.
They retained single-session conversion evidence for inquiries:
- 63e2c0bc-f9d7-47c3-992e-b09c1de10b11
- 65e2c0bc-f9d7-47c3-992e-b09c1de10b11

## Remaining work

- Concurrent conflicting requests and cross-inquiry request-ID uniqueness.
- Reverse client mismatch, individual success and remaining eligibility checks.
- Owner-reviewed UI and RPC-backed Server Action integration.
- Coordinated production intake cutover and anonymous INSERT remediation.
- Scoped application validation and release checks.

Production remains documented at main 2e23db2 with a legacy intake dependency.
Do not revoke shared-database anonymous INSERT independently of cutover.
This milestone is incomplete and is not release-ready.

Preserve all nine protected local files.
Encrypted offsite backup execution remains unverified.
Payment verification and GDS issuance/reissue/refund/void remain manual.