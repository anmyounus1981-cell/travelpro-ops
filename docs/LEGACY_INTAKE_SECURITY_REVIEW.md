# Legacy Inquiry Intake Security Review

Review date: 18 October 2026.
Branch: feature/multi-channel-inquiry-ingestion.
Starting checkpoint: 021cf56.
Production baseline: main 2e23db2.
Status: listed paths inspected; legacy POST retirement implemented locally.
Deployment verification, database permission cutover and atomic conversion remain pending.

## Scope and Evidence

Reviewed repository code:
- app/api/v1/inquiry/route.ts
- lib/inquiries.ts
- lib/supabase/server.ts
- lib/supabase/middleware.ts
- lib/supabase/intake.ts
- app/api/webhooks/inquiries/route.ts, through the inspected receipt handling
- app/actions.ts: requireOwnerId and inquiry conversion
- Relevant inquiry migrations and the ingestion implementation contract

Owner-run read-only database inspection covered:
- Effective privileges for anon and authenticated.
- Inquiry RLS flags and installed policies.
- Anonymous insertable columns.
- Inquiry constraints and user-defined triggers.

No live anonymous insert, public API POST or conversion was performed
during this review. Legacy POST now returns 410 in local source without
reading the request body or importing parser/database dependencies.
Separate TypeScript, production build and diff checks passed.
Build skips linting; lint verification remains pending.
This change is not yet deployment-verified.
Installed grants and policies remain unchanged.

## Verified Findings

### Legacy Public API

/api/v1/inquiry is explicitly public in middleware.

The route:
- Has no route-level owner or provider authorization.
- Runs parseInquiry before attempting the database insert.
- Has no application rate-limit check.
- Has no explicit bounded request-body reader.
- Uses a TypeScript cast rather than complete runtime payload validation.
- Accepts caller-selected web, email or whatsapp source.
- Generates a fresh inquiry UUID for each request.
- Inserts directly into inquiries rather than calling submit_inquiry_intake.
- Returns parsed inquiry data and logs database error.message.

When AI credentials are configured, parseInquiry can make an external AI
request before database write authorization is evaluated. No explicit
timeout is configured on that fetch.

Deployment AI credential availability was not inspected.

### Anonymous Direct Database Insert

Installed database evidence:
- Inquiry RLS is enabled; FORCE ROW LEVEL SECURITY is false.
- anon table-level INSERT privilege is false.
- anon column-level INSERT privilege is true.
- anon SELECT, UPDATE and DELETE table privileges are false.
- anon cannot execute submit_inquiry_intake(jsonb).

The installed public_inquiry_insert policy permits anonymous inserts when:
- status is new.
- matched_client_id, converted_case_id and reviewed_at are null.
- Trimmed raw_message length is between 1 and 10000.

Anonymous insertable columns include contact fields, source, parsed_fields,
parsing_status, parser_source, parser_confidence, channel_metadata,
created_at and status.

Submission constraints permit request identity and payload hash to both
be null. There are no user-defined inquiry triggers in the inspected state.

These controls do not require the new application limiter, intake RPC or
request-ID deduplication for legacy inserts.

A successful anonymous write was not reproduced. Actual external Data API
reachability was not independently tested.

RLS not being forced is not itself evidence of an anonymous RLS bypass.

### Owner Conversion Atomicity

convertInquiryToCase calls requireOwnerId, which verifies the authenticated
user and an app_users row with role owner.

However, conversion performs separate operations:
1. Read inquiry.
2. Insert case.
3. Update inquiry as converted.
4. Write audit.

This sequence is not a single database transaction. Failures can leave
partial state, and concurrent calls are not protected by an inquiry row lock.

The action reads route, dates and cabin from parsed_fields rather than an
explicit owner-reviewed conversion payload. Client compatibility validation
and retry-safe return of the original case need implementation.

These are conversion findings, separate from anonymous intake exposure.

## Existing Controlled Intake

Landing intake uses the new intake RPC and application rate limiter.

The inspected webhook code implements:
- A bounded JSON body.
- Timestamped HMAC verification with constant-time comparison.
- Configured source/provider/account allowlisting.
- Rate limiting before privileged intake RPC execution.

The intake client is server-only and disables session persistence.
An environment-variable name alone does not prove its effective database role.

These observations are not a complete audit of every application endpoint.

## Owner-Confirmed Consumer Status

On 18 October 2026, the owner confirmed there are no active consumers of
/api/v1/inquiry.

Tracked repository search found documentation and middleware references,
but no application caller of that URL in the searched paths.

The owner decision supersedes the earlier compatibility-adapter proposal:
retire the unused endpoint instead of adding another public intake adapter.

## Remediation Plan

1. Replace legacy POST implementation with HTTP 410 Gone.
2. Remove parser, AI and database dependencies from that route.
3. Return a small response with Cache-Control: no-store.
4. Keep website inquiry intake at /inquire.
5. Keep provider intake behind authenticated /api/webhooks/inquiries.
6. Update implementation-contract and architecture references.
7. Prepare a migration removing public_inquiry_insert.
8. Revoke anonymous table-level and column-level inquiry INSERT grants.
9. Verify no effective anonymous INSERT privilege remains.
10. Preserve intended owner access and privileged server intake.
11. Verify existing Landing and webhook behaviour with scoped checks.
12. Replace non-atomic conversion with reviewed owner-authorized atomic RPC.

Table-level REVOKE alone does not remove existing column-level grants.

The database is shared by Preview and production. Review deployment order
and production compatibility before applying the permission migration.

## Verification Required

- Retired route returns 410 without parsing a body or invoking dependencies.
- Local route checks make no external AI calls or database writes.
- Installed anonymous table and column INSERT privileges are absent after cutover.
- Public insert policy is absent after cutover.
- Privileged intake RPC and owner access retain intended permissions.
- Atomic conversion validates owner identity, reviewed fields and eligibility.
- Conversion creates case, inquiry linkage and audit in one transaction.
- Identical conversion retry returns the original case.
- Conflicting or concurrent conversion attempts are handled safely.

No new browser storage or recovery test expansion is included in this work.

## File Protection and Backup

Preserve all nine protected local audit/backup files.
Use explicit paths for staging.
Encrypted offsite backup execution remains unverified.
Payment verification and GDS issuance, reissue, refund and void remain manual.

## Preview Retirement Verification — 18 October 2026

Tested commit: 19e5283.
Preview: https://travelpro-47uh3k4u8-anmyounus1981-8496.vercel.app

Owner-run scoped HTTP check passed:
- POST with intentionally malformed JSON returned 410.
- Response code was LEGACY_INQUIRY_ENDPOINT_RETIRED.
- inquiryPage was /inquire.
- Cache-Control was no-store.

This verifies the tested Preview response. It does not establish production
retirement or removal of direct anonymous database INSERT access.
Installed database grants and policies remain unchanged.

## Production Dependency Found — 18 October 2026

Historical production baseline 2e23db2 contains a direct caller:
app/inquire/page.tsx submits to /api/v1/inquiry.

The earlier no-active-consumer assumption is insufficient for cutover.
Current live production deployment commit still requires verification.

Do not apply anonymous INSERT revocation while production depends on
the legacy direct-insert path. Coordinate controlled Landing deployment,
endpoint retirement and database permission changes.

Preview retirement is verified; production retirement is not.
The identified security exposure remains unresolved until coordinated cutover.

## Current Production Confirmed — 19 October 2026

Owner-provided Vercel Project Overview confirms:
- Canonical domain: travelpro-ops.vercel.app.
- Status: Ready.
- Source branch: main.
- Commit: 2e23db2fb23f81cc8fee202d3df0500e19f52cc4.

Source inspection of this commit confirms /inquire calls /api/v1/inquiry.
Anonymous INSERT revocation must be coordinated with a compatible production
intake deployment. It must not be applied independently while this caller remains.

No production deployment or database permissions were changed by this inspection.
