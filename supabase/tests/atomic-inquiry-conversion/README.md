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
## 20 October 2026: Concurrent Conflicting Reviewed Payload

Isolated project: tpfipndxhroliabwlgyb.
Runner: concurrent-conflicting-payload.cjs.
Uses the same pg dependency, CA argument, password environment variable
and synthetic owner prerequisites as concurrent-identical.cjs.

Scenario: same inquiry and request ID, different reviewed notes.
Owner-run execution returned PASS and exit code 0.

Observed evidence:
- Session A PID 52171; session B PID 52173.
- B waited on transactionid; pg_blocking_pids(B) included A.
- After A committed, B returned SQLSTATE 23505 and exact message:
  Conversion identity or reviewed details conflict.
- Inquiry: 53adf3f8-87bd-4a4d-8ac9-8e4dfae31f59.
- Request: cfb59300-5971-42b8-b9fd-657fdf5c98f4.
- Case: d4a5941b-5e52-4d7e-9a63-80fed5bcf751.
- Original request ID, reviewed notes and case notes remained unchanged.
- One linked case, one conversion audit, zero cases with conflicting notes.

Synthetic evidence remains in the isolated database.
This establishes only the same-request-ID/different-notes concurrency scenario.
Concurrent different request IDs and cross-inquiry request-ID uniqueness
remain unverified. Application integration and production security cutover
remain pending. The milestone is not release-ready.

## 20 October 2026: Cross-Inquiry Request-ID Uniqueness

Isolated project: tpfipndxhroliabwlgyb.
Previous pushed checkpoint: f26e54f.

cross-inquiry-uniqueness.sql:
- Sequential second inquiry reuse rejected with SQLSTATE 23505 and:
  Conversion identity already belongs to another inquiry.
- Second inquiry remained unconverted, without case or conversion audit.
- Original conversion and identical retry assertions passed.
- Test ended with ROLLBACK; owner-run exit code 0.

concurrent-cross-inquiry.cjs:
- Uses the same pg 8.16.3, synthetic owner/client, password environment
  variable and CA argument prerequisites as concurrent-identical.cjs.
- Two different inquiries attempted the same conversion request ID.
- A PID 54362; B PID 54364.
- B waited on transactionid; pg_blocking_pids(B) included A.
- After A committed, B received SQLSTATE 23505 with constraint:
  inquiries_conversion_request_id_unique.
- After ROLLBACK TO SAVEPOINT, B's own transaction saw no loser case,
  no conversion audit and all conversion/linkage metadata null.
- B remained new; its transaction then committed.
- Winner readback confirmed original case/review, one request owner,
  one winner case, zero loser cases and one conversion audit.
- Runner returned PASS; owner-run exit code 0.

Evidence identifiers:
- Inquiry A: c0671a53-a06a-4118-9181-002e5afaeaa5.
- Inquiry B: ce40c408-216f-44de-a60f-776f7af2b25a.
- Request: 65de636f-f060-4012-934d-9d7f57ab95be.
- Winner case: fd68362a-a5b2-4405-b759-3829339c90ae.

Concurrent synthetic fixtures and winner case/audit remain in the isolated
database. These are database-role tests, not browser/JWT verification.
No application integration or production security cutover was performed.
Milestone remains incomplete and not release-ready.

## 23 October 2026: Same Inquiry, Concurrent Different Request IDs

Isolated project: tpfipndxhroliabwlgyb.
Previous pushed checkpoint: adc488f.
Runner: concurrent-different-request-ids.cjs.

Uses the same pg 8.16.3, synthetic owner/client, CA argument and password
environment variable prerequisites as concurrent-identical.cjs.

The runner asserts that A and B have different request IDs while all other
reviewed payload fields are identical.

Owner-run execution evidence:
- A PID 358301; B PID 358302.
- B waited on transactionid; pg_blocking_pids(B) included A.
- After A committed, B received SQLSTATE 23505 and exact message:
  Conversion identity or reviewed details conflict.
- Inquiry: 7db1eba4-a47d-4156-bceb-9a21353fb27e.
- Accepted request: cc5326e2-6062-427e-a54a-839603f175df.
- Rejected request: 74a43df8-33f4-4d7f-9342-ba31282f9099.
- Case: e0dc0ef5-e42d-4b58-bbb4-3702133b2ef4.
- Original request ID, reviewed notes and case notes remained unchanged.
- One linked case, one conversion audit and zero rejected-request owners.
- Runner returned PASS; exit code 0.

Synthetic inquiry/case/audit evidence remains in the isolated database.
This is database-role testing, not browser authentication/JWT verification.
Remaining eligibility/client checks, reviewed UI/action integration and
coordinated production security cutover remain pending.
Milestone incomplete; not release-ready.

## 23 October 2026: Individual Client Compatibility

Isolated project: tpfipndxhroliabwlgyb.
Previous pushed checkpoint: 001763c.
Script: individual-client-compatibility.sql.

Owner-run test returned exit code 0:
- Created a synthetic individual client through create_client_with_review.
- Corporate inquiry with individual client rejected with SQLSTATE 22023
  and exact message: Selected client does not match the inquiry client type.
- Rejection created no case, conversion linkage, review metadata or
  inquiry.converted audit.
- Personal inquiry with the individual client converted successfully.
- Identical retry returned the original case.
- Case fields, passenger counts, source, client linkage, reviewer metadata
  and exactly one conversion audit assertions passed.
- Script ended with ROLLBACK.

This verifies database-role behavior, not browser authentication.
Independent post-test cleanup readback has not been performed for this run.
Owner-reviewed UI/action integration, remaining eligibility checks and
coordinated production security cutover remain pending.
Milestone incomplete; not release-ready.
