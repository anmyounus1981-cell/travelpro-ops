# TravelPro Ops — Architecture

## Stack

- Next.js App Router and TypeScript: pages, React components, Server Actions,
  and HTTP API routes.
- Supabase: PostgreSQL, Auth, row-level security, database functions,
  and private document storage.
- Vercel: application hosting and GitHub deployment integration.
- AI integrations: assistive extraction and parsing with human review.
- n8n and Meta APIs: planned inquiry routing and notification integrations.

A Server Action is a Next.js server function. Supabase provides its
database and authentication services.

## Current Checkpoint

PR #14 and PR #15 were merged and production verification was reported.
The checkpoint is main commit a9c8067.

Corporate client uniqueness, returning corporate traveller lookup,
case-based Trip History, and returning corporate passport draft reuse
are implemented at this checkpoint.

Live passport OCR activation and Meta / n8n messaging integrations remain
separate work. Individual returning travellers are implemented on
feature/individual-returning-travellers, pending owner-authenticated browser
verification and application release.

## Repository Layout

The inspected implementation uses:

- app/: App Router pages, route handlers, and Server Actions.
- app/inquire/: public inquiry form.
- app/api/v1/inquiry/: existing HTTP inquiry intake.
- app/inbox/: protected inquiry review and case conversion UI.
- app/travellers/: client selection and traveller creation / lookup.
- app/travellers/passport-drafts/: passport extraction and owner review.
- app/travellers/[id]/review/: corrections, case assignments, Trip History.
- lib/: shared validation, inquiry parsing, and Supabase helpers.
- lib/data/: operational data access.
- supabase/migrations/: versioned database changes.
- supabase/tests/: database behavior and permission checks.
- docs/: requirements, architecture, roadmap, and supporting documentation.

## Data Relationships

### Clients

The clients table represents both account types:

- corporate: company account.
- individual: personal / retail account.

Corporate names are unique under the database's case and whitespace
normalization.

The existing company_name field also holds an individual account's
display name for compatibility with existing pages.

### Travellers

Each traveller references a client through client_id.

Given names and surname are stored separately. Display names do not
replace the underlying passport name fields.

The current non-empty passport uniqueness rule uses:

- client_id
- upper(btrim(passport_number))

This is client-scoped uniqueness, not a global person identity system.

Blank passport records and same-name records require human identity review.
Passport renewal and cross-client affiliations need an explicit future design.

### Cases and Passenger Assignments

Each case references a client through client_id.

case_travellers connects cases and travellers:

- case_id references the trip case.
- traveller_id references the retained passenger profile.

One traveller may have assignments to multiple cases.

accompanying_adult_id references a case_travellers assignment,
not a travellers profile.

Passenger classification uses reviewed date of birth and case departure date.

Trip History reads existing assignments and associated case details.
It includes upcoming cases and does not establish completed travel.

### Passport Drafts and Documents

passport_extraction_drafts retains uploaded evidence and extraction results.

Confirmation requires owner review of all six passport fields.

Returning corporate draft confirmation:

- Requires a verified traveller under the same corporate client.
- Compares all six reviewed fields with the existing profile.
- Links the passport document to that profile.
- Confirms the draft and writes the audit atomically.
- Preserves the traveller profile unchanged.
- Handles identical retries without duplicate documents or audit entries.

## Authorization

Supabase Auth is implemented.

Current protected review workflows authorize a linked app_users record
with role owner.

Consultant and client portal permissions are planned capabilities,
not implied access granted by this document.

RLS protects private records. Table grants and database function execution
privileges provide additional enforcement.

Protected traveller, passport review, document, assignment, and audit
writes use approved database functions.

Security-definer functions must explicitly validate authorization,
use a fixed search_path, and have narrowly scoped execution privileges.

Private document access uses authorized, expiring signed URLs.

Public users must not read client profiles, traveller records,
inquiries, cases, payment evidence, or audit history.

## Existing Inquiry Pipeline

The current implementation contains:

- /inquire: public flight inquiry form.
- /api/v1/inquiry: web, email, and WhatsApp intake.
- lib/inquiries.ts: deterministic parsing with optional AI parsing.
- inquiries: raw messages, parsed suggestions, source metadata,
  review state, matched client, and converted case link.
- /inbox: client selection and manual conversion UI.

The inspected conversion action performs case creation, inquiry update,
and audit as separate operations. Replacing this with atomic conversion
is part of the active inquiry work.

Existing structured input can currently be overridden by AI parsing.
Validated public form values must be preserved independently.

## Public Landing Page Inquiry — Target Design

### Submission

The public form collects:

- Corporate or Individual / Retail client type.
- Company and contact person for corporate requests.
- Full name for individual requests.
- Phone / WhatsApp and email.
- Origin, destination, and target dates.
- Flight Booking, Visa Support, Package, or Consultation service type.
- Notes and relevant flight preferences.

A Next.js Server Action validates the submission and calls a narrowly
scoped database intake function.

The server assigns source landing_page.

The database stores validated submitted fields and original source details.
AI suggestions remain separate and require review.

The public intake path:

- Creates only a new, unreviewed inquiry.
- Uses a stable request UUID for identical retries.
- Rejects conflicting request reuse.
- Returns no existing client metadata.
- Includes public endpoint abuse controls.
- Creates no client, traveller, case, booking, payment, or ticket.

Database intake permissions must work for intended anonymous submissions
and signed-in visitors without granting private read access.

### Existing Channel Compatibility

Keep the existing HTTP intake route for channel integrations.

Preserve web, email, and WhatsApp source handling.

The existing inquiry client type personal maps to the clients table's
individual account type. Handle this mapping explicitly.

Do not rename existing persisted values without a reviewed migration.

Channel authentication and source attribution must be evaluated separately.
A caller-supplied source label is not proof of channel authenticity.

### Client Match Suggestions

Authorized internal review compares inquiry contact details with client
contacts using defined email and phone normalization.

Candidate matching is scoped to the corresponding client type.

Shared contacts, multiple matches, or conflicting email and phone matches
must require human selection.

A candidate is not an authenticated identity or confirmed affiliation.

Public submission responses must not reveal whether a client exists.

The reviewer confirms the selected client before conversion.
Client creation, if required, uses the approved separate workflow.

### Reviewed Conversion

Replace separate writes with one authorized database function.

The function must:

1. Authorize the current reviewer.
2. Lock and validate the inquiry.
3. Reject dismissed or otherwise ineligible inquiries.
4. Validate the selected client and reviewed case fields.
5. Return the existing case for an identical completed retry.
6. Reject conflicting conversion retries.
7. Create one case linked to the selected client.
8. Store the inquiry's case link, confirmed client, and reviewer metadata.
9. Write the conversion audit.
10. Commit all writes together or roll all writes back.

Preserve original inquiry source and submitted details.

Flight conversion requires confirmed trip details and passenger counts.
Define non-flight case support before enabling conversion for other services.
Do not manufacture flight fields for visa or consultation inquiries.

Conversion creates an operational case only.
It does not create a financial or ticketing commitment.

## AI Boundaries

AI may assist with parsing, OCR, drafting, and missing-field suggestions.

Validated user-entered fields remain authoritative as submitted data.
AI suggestions must not silently overwrite them.

Parsing confidence is not identity verification or permission to convert.

When AI is unavailable, public submission and manual review must still work.

## Auditing and Retry Behavior

Approved operational writes and their audit entries must share a transaction.

Unknown submission or conversion outcomes must not be reported as definite
failure followed by an unrestricted new request.

Reuse stable request identifiers and provide a way to check the result.

Historical audit entries remain immutable.

## Future Integrations

- Meta Lead Ads: authenticated webhook ingestion and event deduplication.
- n8n: routing, follow-up scheduling, and notification orchestration.
- WhatsApp: approved outbound templates and delivery tracking.
- Client portal: authenticated or appropriately secured scoped access.
- Consultant access: explicit role permissions and authorization tests.

None of these integrations may automate payment verification or
GDS ticket issuance, reissue, refund, or void.

## Verification

Required inquiry checks include:

- Anonymous submission and private-data isolation.
- Corporate and individual field validation.
- All service types and incomplete-plan handling.
- Identical retries and conflicting request rejection.
- Client matching, ambiguity, and client-type isolation.
- Authorized conversion and unauthorized rejection.
- Dismissed inquiry rejection.
- Repeated and concurrent conversion behavior.
- Atomic rollback when audit or case creation fails.
- Preservation of submitted data and source.
- Existing channel compatibility.
- TypeScript checks, production build, and browser verification.

## Individual Returning Traveller Implementation

Migration 20261011084315 adds lookup_individual_traveller (security invoker)
and confirm_returning_individual_passport_draft (owner-authorized security
definer with empty search_path and no anonymous execution). The confirmation
function retains the corporate workflow's six-field comparison, document
ownership validation, draft locking, atomic audit and identical retry behavior.
Existing corporate functions retain their interface and behavior.

The manual traveller form and passport draft review both require a successful
account-scoped lookup before creating a new profile. Existing matches link to
the review/case-assignment page; draft reuse requires a verified profile and
explicit six-field confirmation. Input changes invalidate stale lookup or
reuse consent. Server Actions choose the lookup/confirmation function from
persisted account data, never a submitted account-type flag.

No uniqueness or matching based only on individual account names was added.
Passport renewal and cross-client identity remain outside this workflow.
