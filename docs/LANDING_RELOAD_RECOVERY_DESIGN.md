# Landing Inquiry Reload Recovery Design

Status: proposed architecture; not implemented.
Design date: 17 October 2026.
Repository checkpoint: e08753c.
Branch: feature/multi-channel-inquiry-ingestion.
Current recovery implementation: 761eeff.
Production baseline: main 2e23db2.

## Purpose

Preserve an unresolved Landing inquiry across reloads in the same browser
tab without silently creating a new submission identity.

The existing implementation preserves request ID and submitted values
only in page memory. Reload recovery is not currently implemented.

## Initial Scope

- Same-origin, same-tab reload recovery.
- One unresolved Landing inquiry per tab.
- Explicit user action to retry; no automatic submission on restore.
- Existing Server Action validation, rate limits and database idempotency.
- No new public inquiry-read permission or lookup endpoint.

Outside this initial scope:
- Recovery after storage deletion, tab closure or browser session loss.
- Cross-device recovery and coordination between independently opened tabs.
- Guaranteed prevention of duplicate business inquiries with different IDs.
- Support-resolution workflow and server-backed recovery tokens.

Browsers can restore tab sessions or copy sessionStorage into a new tab
in some circumstances. Do not claim sessionStorage provides cross-tab
coordination or guaranteed deletion when a tab closes.

## Safety Invariants

1. Persist the request ID and exact submitted snapshot before invoking
   the Server Action.
2. If persistence cannot be verified, do not send a new submission.
3. Restore storage state before enabling submission or form editing.
4. Treat a restored pending attempt as an unknown outcome.
5. Retry with the original ID and unchanged snapshot.
6. A later rejection does not erase earlier uncertainty.
7. Conflict blocks further submission until an explicit resolution exists.
8. Confirmed acceptance must not be turned into apparent failure because
   browser storage cleanup failed.
9. Do not enable a new inquiry until recovery-record cleanup is verified.
10. Expiry or invalid storage is not proof that the server received nothing.

Database request identity and payload comparison remain authoritative.
Browser storage is untrusted input, not an authorization mechanism.

## Storage Choice

Use sessionStorage for the initial submitted-snapshot recovery mechanism.

Do not use localStorage, cookies, URL parameters or query strings to store
contact details or inquiry notes.

Persist only submitted values. Do not autosave typing drafts.

Use one namespaced, versioned storage key:
travelpro:landing-inquiry-recovery:v1

The record must identify its schema version and submission-contract version.
Incompatible versions must block automatic replay rather than guessing how
to transform an old payload.

Same-origin storage does not follow a user between different Preview URLs
or between Preview and production.

## Privacy and Retention Proposal

The recovery snapshot contains personal contact details and free-text notes.
It is not a secret store and is readable by JavaScript running on the origin.

Do not claim client-side encryption protects against same-origin script
compromise when the application also holds the decryption capability.

Before submission, display a short notice explaining that submitted details
are temporarily retained in this browser tab for retry recovery.

Suggested notice:
"To recover an interrupted submission, we temporarily keep your submitted
details in this browser tab. Avoid including passport, payment or other
sensitive documents or identifiers in Additional requirements."

Proposed maximum snapshot lifetime: 24 hours from initial persistence.
This is a product-design proposal, not an established retention policy.
Retry must not extend the original expiry.

Check expiry on restoration and before each retry. While the page is active,
schedule best-effort expiry handling and recheck on return to the page.

Browser suspension, session restoration, user clock changes and unavailable
storage prevent a guarantee of deletion at an exact wall-clock deadline.

On detected expiry, replace the personal-data snapshot with a minimal blocked
marker before allowing any subsequent action. Do not silently start a new
submission.

Do not log, send to analytics or include in error reports:
- Snapshot contents.
- Contact details and notes.
- Raw storage records.

Request IDs are correlation identifiers, not proof of identity or access tokens.
## Recovery Record

Use a discriminated record format. Do not retain personal data in terminal
or blocked markers when it is no longer needed.

Pending record:
- schemaVersion: 1.
- submissionContractVersion: 1.
- state: pending.
- requestId: valid UUID.
- createdAt: initial persistence time in epoch milliseconds.
- expiresAt: initial creation time plus the configured lifetime.
- snapshot: exact allowlisted InquiryFormValues submitted by the client.

Conflict record:
- Same identity, version and original lifetime metadata.
- state: conflict.
- No automatic retry.
- Retain no personal-data snapshot once the conflict marker is successfully
  persisted and verified.

Accepted marker:
- schemaVersion, submissionContractVersion and requestId.
- state: accepted.
- receiptId: confirmed receipt UUID.
- No contact details, notes or form snapshot.
- Used when acceptance is known but cleanup cannot yet be completed.

Blocked marker:
- schemaVersion: 1.
- state: blocked.
- reason: expired, invalid_record or incompatible_version.
- Preserve a request ID only when it can be safely validated.
- No contact details, notes, raw invalid record or snapshot.
- No automatic submission or new request ID.

Do not persist secrets, Supabase credentials, owner session information,
Vercel bypass values, uploaded documents or browser authentication tokens.

A pending record is written before network dispatch. It does not prove that
dispatch occurred, nor that the server accepted the inquiry.

## Restore Validation

Treat every stored value as untrusted.

Before using a snapshot:
- Bound the serialized record size before JSON parsing.
- Initial proposed record cap: 64 KiB measured as UTF-8.
- Validate the discriminant, versions, UUID and timestamp types.
- Reject unexpected properties and non-string form values.
- Validate field lengths, client/service enums and supported form structure.
- Preserve the exact submitted string values; do not silently trim, normalize
  or manufacture defaults during restoration.
- Require expiry to match the supported lifetime for the record version.
- Detect inconsistent timestamps and substantial future clock skew.
- Proposed future-clock tolerance: five minutes; validate this during testing.
- Never merge arbitrary parsed properties into component state.
- Keep server-side validation authoritative for every actual retry.

Record limits, lifetime and clock tolerance are versioned design choices.
They require explicit implementation constants and tests.

If data is invalid or incompatible, block replay and attempt to replace it
with a minimal blocked marker. Do not render raw invalid data.

## State Transitions

| Event | Required behaviour |
|---|---|
| Initial page load | Restore and validate before enabling interaction |
| Storage empty and accessible | Enable an empty form |
| Valid pending record restored | Restore snapshot, lock fields, show Retry Same Inquiry |
| Valid conflict marker restored | Show conflict resolution message; block submission |
| Valid accepted marker restored | Show receipt, attempt cleanup, block new submission until cleanup succeeds |
| Blocked marker restored | Show recovery assistance message; do not create a new ID |
| New submission | Capture snapshot, persist pending record, verify it, then dispatch |
| Unknown outcome | Keep original pending record and immutable snapshot |
| Retry starts | Verify the same persisted identity and snapshot before dispatch |
| Rejection with no previous uncertainty | Remove recovery record and verify absence before allowing corrections |
| Rejection after uncertainty | Keep pending record and edit lock |
| Conflict | Persist minimal conflict marker, verify it, then release the stored personal snapshot |
| Accepted | Show confirmed receipt, attempt cleanup, then allow a new inquiry only after verified absence |

Restoration of pending state establishes uncertainty for subsequent handling.
A rejection after restoration must not unlock an earlier unresolved attempt.

Do not rely on persisting a separate uncertain flag after a network failure.
The browser may reload before that write. Persisted pending state already
requires conservative recovery.

## Storage Failure Rules

Wrap storage access, serialization, writes, reads and removals in explicit
error handling. Browser storage may be denied, full or unavailable.

Before first dispatch:
- Write the complete pending record.
- Read it back and verify the expected serialized contents.
- If either operation fails, send no request.
- Keep the entered form available in memory with a clear storage error.
- Do not overwrite an existing unresolved record to bypass the error.

Before retry:
- Confirm the stored record still matches the in-memory request ID and snapshot.
- If the record is missing, altered, expired or unreadable, stop dispatch.
- Do not silently reconstruct a new submission identity.

After confirmed rejection without prior uncertainty:
- Remove the pending record and verify that it is absent.
- If cleanup fails, report that this attempt was rejected but local recovery
  cleanup is required before editing or starting another submission.
- Do not mislabel a confirmed rejection as server acceptance uncertainty.

After confirmed acceptance:
- Preserve and display the confirmed receipt independently of cleanup.
- Remove the recovery record and verify absence.
- If removal fails, attempt a minimal accepted marker and verify that write.
- If both operations fail, retain acceptance in memory and block new submission.
- Do not tell the user that the accepted inquiry failed.
- A stale pending record on later reload may still retry the same identity
  and obtain its original duplicate receipt, subject to normal rate limits.

On expiry or conflict:
- Replace the stored snapshot with the appropriate minimal marker and verify it.
- Clear personal snapshot references from the active UI after successful replacement.
- If replacement fails, attempt removal and verify absence to reduce retention.
- Keep the current page blocked even if removal succeeds.
- If storage remains unavailable, report that local deletion could not be confirmed.

Clearing storage can remove the evidence needed to maintain a recovery block
after reload. Do not claim a persistent block survives deliberate storage
deletion, failed marker persistence or loss of the browser session.
## User Experience

Restoring:
- Show a short recovery-loading message.
- Disable editing and submission until storage inspection finishes.
- Do not briefly expose an enabled empty form before restoration.

Pending:
- Explain that receipt is unconfirmed and submitted details are locked.
- Offer Retry Same Inquiry.
- Do not automatically retry on load, reconnect or timer.
- Explain that retries remain subject to rate limits.

Accepted with cleanup pending:
- Display the confirmed receipt.
- Explain that the inquiry was received and local cleanup is incomplete.
- Offer Retry Local Cleanup, which performs no network submission.
- Enable a new inquiry only after storage absence is verified.

Conflict, expired or invalid record:
- Explain that automatic recovery cannot safely continue.
- Keep submission blocked.
- Provide an operationally supported contact route before production release.
- Do not present an inert Contact TravelPro button as a working contact action.
- Do not offer an unrestricted Start Over action as a duplicate-safe resolution.

Privacy:
- Do not place request IDs, receipts or submitted details in navigation URLs.
- Render stored strings as text; never use HTML injection.
- Keep error messages separate from raw storage/parser exceptions.
- An explicit local-data removal action must explain that removal does not
  cancel an inquiry already received by TravelPro.
- Local-data removal is not a server-side duplicate-prevention mechanism.

## Integration Boundaries

Proposed implementation responsibilities:

- A client-safe recovery module handles record types, validation, storage
  operations, expiry decisions and structured storage errors.
- The inquiry page handles restore state, immutable form snapshots,
  user messages, edit locks and explicit retry actions.
- The existing Server Action remains responsible for input validation,
  rate limiting, intake invocation and explicit submission outcomes.
- The database remains responsible for identical-retry deduplication and
  conflicting request-identity rejection.

Do not import server-only modules into the browser recovery module.
Keep storage access out of module initialization and server rendering.
Make restoration idempotent under repeated React effect execution.
Cancel stale restoration/timer callbacks when the component unmounts.

Browser navigation and back/forward restoration must not initiate submission.
Recheck record identity and expiry before any user-triggered retry.
Restored airport values are IATA codes; labels may load separately.
Airport dataset failure must not silently clear the stored submission.

Do not change payload construction or normalization for a restored attempt.
A deployment that changes the submission contract requires explicit
compatibility handling before replaying older records.

## Duplicate-Prevention Limits

The database deduplicates a stable request identity with matching payload.
It does not deduplicate all inquiries describing the same business request.

Reload recovery reduces accidental new-ID submissions only while a usable
recovery record remains available on the same origin.

It cannot guarantee prevention when:
- Storage is cleared or unavailable.
- The user opens an independent tab, browser or device.
- The user moves between Preview origins or Preview and production.
- A copied tab starts another inquiry with a different identity.
- A support resolution incorrectly authorizes a new submission.

A future server-backed recovery design must use a scoped, high-entropy
capability with defined expiry, authorization, rate limits and minimal
response data. The request UUID alone must not authorize private reads.

No public inquiry lookup or broad anonymous database read grant is included
in this design.

## Verification Matrix

Local module tests:
- Valid pending record round-trip with exact string preservation.
- Unknown keys, invalid enums, UUIDs, timestamps and field types rejected.
- Oversized, malformed and incompatible records blocked.
- Expiry does not extend on retry.
- Future timestamps and clock changes handled conservatively.
- Storage access, write, read-back and removal failures.
- Accepted-marker and blocked-marker fallback failures.
- No raw personal data included in diagnostics.

Component tests:
- Form remains disabled during restoration.
- Restored pending state locks editing and preserves identity.
- Rejection after restoration retains uncertainty.
- Confirmed rejection without prior uncertainty permits correction only
  after verified cleanup.
- Success remains visible when cleanup fails.
- New inquiry stays blocked until cleanup succeeds.
- Conflict and expiry release personal snapshots only through defined handling.
- Repeated effect execution does not erase records or submit requests.

Preview browser and database tests:
- Acceptance followed by response loss, reload and unchanged retry.
- Reload while the first action is still in flight.
- Request identity and all submitted fields preserved across reload.
- One persisted inquiry after the recovered duplicate retry.
- Storage failure before first dispatch produces no intake request.
- Cleanup failure after acceptance does not create a second inquiry.
- Conflict state remains blocked after reload.
- Expired/corrupt records never auto-submit.
- Existing consultation, Corporate and flight form behaviour remains intact.
- Private Inbox remains inaccessible without owner authentication.

Use bounded synthetic tests and separate read-only database verification.
Do not automatically rerun after an ambiguous write-producing test failure.

## Release Gates and Open Decisions

This document is a proposal, not evidence of implementation or verification.

Before implementation:
- Confirm the proposed 24-hour lifetime and five-minute clock tolerance.
- Review the browser-storage notice and treatment of sensitive free-text notes.
- Define a usable support-resolution route for blocked recovery states.
- Check the installed intake function and deduplication retention behaviour.
- Define compatibility expectations for future submission-contract changes.

Before production release:
- Complete the applicable verification matrix.
- Reconcile outdated architecture and security documentation.
- Establish a supported resolution path for expired, invalid and conflicting records.
- Record remaining same-origin, tab/session-loss and cross-device limitations.

Payment verification and GDS issuance, reissue, refund and void remain
human-operated. This recovery design creates no booking or financial commitment.

## Review Clarifications

### Storage Key Evolution

Changing the active storage key must not hide an older unresolved record.

Maintain an explicit registry of recognized historical recovery keys.
Inspect those keys before enabling a new submission.

If an older record is incompatible, block replay and new submission.
Do not ignore it merely because a newer schema uses another key.

If multiple recovery records exist, do not choose one automatically or
overwrite either record. Enter a blocked recovery state without exposing
their raw contents.

Tests must cover upgrades with an unresolved historical record and multiple
recognized records.

### Unavailable Storage During Restoration

A storage read failure is not equivalent to an empty storage key.

If restoration cannot determine whether an unresolved record exists:
- Keep submission blocked.
- Explain that browser recovery storage could not be accessed.
- Offer Retry Local Recovery, which performs no network submission.
- Do not create a request ID or fall back silently to memory-only intake.

### Marker Trust and Cleanup

A restored accepted marker is locally saved receipt information, not a fresh
server verification. Label it accordingly and never use it to authorize reads.

Unknown marker versions or malformed markers enter blocked recovery handling.
Do not interpret arbitrary stored receipt strings as trusted server responses.

Cleanup must operate only on recognized TravelPro recovery keys.
Never call sessionStorage.clear() or delete unrelated application data.

### Rejection Cleanup Failure

If a confirmed rejection cannot be cleared from storage, the current page
retains that known rejection and offers local cleanup retry only.

A later reload may conservatively restore a stale pending record as unknown.
This limitation must not be hidden by automatically rotating the request ID.

### Privacy Limits

Removing a storage record or clearing component references is best-effort
application cleanup, not guaranteed secure erasure from browser memory,
session restoration files or device backups.

A blocked marker may remain for the browser page session. It is not a
24-hour snapshot and must contain no contact details or notes.

The proposed lifetime is not a legal-compliance claim or an exact-deletion
guarantee.