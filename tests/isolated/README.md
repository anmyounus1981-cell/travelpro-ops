# Isolated production-shaped regression

Run from the repository root with PostgreSQL 17 listening **only locally** at
127.0.0.1:55432, user postgres, trust authentication in a dedicated disposable
cluster. Every script fixes that local address and the database name
`travelpro_regression`; no hosted connection string is accepted.

Install test dependencies outside the application (versions used here):

```powershell
npm install --prefix "$env:TEMP/travelpro-test-tools" --save-exact pg@8.16.3 @electric-sql/pglite@0.3.14
$env:PG_MODULE = "$env:TEMP/travelpro-test-tools/node_modules/pg/esm/index.mjs"
$env:PGLITE_MODULE = "$env:TEMP/travelpro-test-tools/node_modules/@electric-sql/pglite/dist/index.js"
node --test tests/*.test.mjs
node tests/isolated/run.mjs
```

For an explicit repeat run, `node tests/isolated/run.mjs --reset-local` drops and
recreates **only that fixed local test database**. The scripts never connect to
production or staging. The caller is responsible for starting the local cluster.

The setup applies every main migration, substitutes a non-running cron contract,
and supplies minimal Auth/Storage platform tables plus an unattached platform
`rls_auto_enable()` event function. Application tables, constraints, RLS policies,
triggers and RPCs are the actual migrations. Four exact production function
catalog definitions/grants are overlaid before the candidate. JSON preserves
CRLF bytes needed by the migration's function-drift hashes.

The 12-table catalog comparison checks columns/types/nullability, constraints,
RLS flags and policies against the read-only production capture. It is not a
full managed-platform restore, index/default/grant comparison, backup test or
Auth/Storage HTTP test.

Historical fixtures supply synthetic records for old data-specific assertions.
The preparation compatibility test runs at its intended pre-cutover checkpoint;
the other 33 SQL files run in 28 rollback-isolated groups after the candidate.
No real customer rows are exported. Fixture identities that match old test
constants are synthetic local prerequisites, not copied production profiles.

Concurrency uses independent PostgreSQL sessions and observes actual lock waits,
not promise scheduling in a single-connection emulator. Checks cover scheduler
versus dispatcher in both orders, competing schedulers, competing dispatchers,
TTL reversal, dedupe, and exactly one alert/attempt per delivered reminder.

The workflow runner executes actual Server Action bodies against a PostgreSQL
transport adapter. It tests owner authorization, RLS, constraints, document RPCs,
audit and the full client-to-ticket-record path. Identity transport, Storage
upload, GDS parsing and Next.js navigation are test boundaries. Payment/GDS calls
are never made. This is not an authenticated browser/PostgREST/Storage E2E test.
The runner's outer rollback is test cleanup, not a claim that app actions are
transactional across HTTP requests.

The rollback runner generates and tests the reviewed rollback SQL, verifies
original definition hashes/effective grants, checks drift refusal, and reapplies
the candidate. Do not run this runner against a hosted database.
