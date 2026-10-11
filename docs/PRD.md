# TravelPro Ops — Product Requirements Document

## Vision

TravelPro Ops supports TravelPro Dhaka's travel operations in Bangladesh,
with a focus on B2B corporate travel management.

The platform connects inquiry intake, client records, reviewed traveller
profiles, trip cases, quotations, bookings, payment evidence, ticket
records, reminders, and operational audit history.

## Target Users

- Agency owner: operational oversight, review, approvals, and accountability.
- Internal travel consultants: intended access to assigned work through
  explicitly implemented permissions.
- Corporate contacts: HR, procurement, administration, and travel coordinators.
- Individual / retail customers: public travel inquiry submission.
- Travellers: passengers whose identity and passport details require review.

Current protected review workflows use owner-only access. Consultant and
client portal access must not be assumed to exist until implemented and tested.

## Human Control

Payment collection, payment verification, and financial transfers remain manual.

GDS and supplier actions, including ticket issuance, reissue, refund, void,
and reservation changes, remain manual.

AI may assist extraction, parsing, drafting, and administrative work.
AI output does not authorize a booking, payment, or ticketing commitment.

## Core Objects

- Inquiry: original lead or request, source details, submitted fields,
  parsing suggestions, review status, and eventual case link.
- Client: a corporate or individual account with contact details.
- Traveller: a retained passenger profile with reviewed passport details.
- Case: a trip or service work item linked to a client.
- Case Traveller: assignment connecting an existing traveller to a case.
- Quotation: fare and itinerary proposal with approval state.
- Booking: recorded PNR, itinerary, ticketing deadline, and booking status.
- Payment: evidence and a human verification decision.
- Ticket: a record of a ticket issued by a human operator.
- Service Case: after-sales work such as reissue or refund.
- Document: private passport, payment, or ticket evidence.
- Reminder: scheduled operational follow-up.
- Audit Log: immutable accountability history.

## Verified Baseline

PR #14 and PR #15 were merged and production verification was reported.
The checkpoint is main commit a9c8067.

Verified capabilities include:

- Corporate and individual client selection with quick client creation.
- Normalized corporate-name uniqueness.
- Reviewed Premier Group account consolidation with traveller IDs retained.
- Corporate traveller lookup by normalized passport under a selected client.
- Reuse of one reviewed traveller across multiple case assignments.
- Trip History showing linked case route, dates, status, and passenger details.
- Returning corporate passport draft confirmation that links the document
  to an existing verified profile without changing or duplicating the profile.
- Owner review enforcement and atomic audit behavior for protected workflows.

Passport OCR remains assistive and feature-gated. Live OCR activation is
not established by this checkpoint.

## Identity and Duplicate Prevention

Corporate names must be unique after the database's defined normalization.

Returning travellers must reuse an existing profile when the selected
client and normalized passport identify that profile.

The current passport uniqueness rule is scoped to a client.
It does not establish a single global identity across different clients.

Names alone must not trigger profile merging. Incomplete historical
profiles and conflicting identity data require human review.

Passport renewal and cross-client affiliations require an explicit identity
design before automatic matching or merging is introduced.

Individual accounts must not be deduplicated solely by a person's name.

## Public Landing Page Inquiry — Active Scope

Extend the existing /inquire experience and inquiries table.

### Form Fields

- Client type: Corporate or Individual / Retail.
- Corporate: company name and contact person name.
- Individual / Retail: full name.
- Phone / WhatsApp number and email address.
- Preferred origin and destination.
- Target departure date and optional return date.
- Service type:
  - Flight Booking
  - Visa Support
  - Package
  - Consultation
- Notes / special requirements.
- Passenger count and cabin preference where relevant to flight requests.

Allow incomplete travel plans where appropriate for the selected service.
Do not invent a route, date, passenger breakdown, or cabin preference.

### Submission

- Use a Next.js Server Action backed by Supabase for the public form.
- Assign source landing_page on the server.
- Preserve existing web, email, and WhatsApp intake compatibility.
- Validate client type, service type, contact fields, lengths, and dates.
- Preserve validated submitted values separately from AI suggestions.
- Keep a stable submission request ID for identical retries.
- Reject conflicting reuse of a request ID.
- Return a receipt without exposing existing client records.
- Include abuse controls appropriate to a public endpoint.
- Create only an unreviewed inquiry.

Public submission must not create a client, traveller, case, booking,
payment, or ticket automatically.

### Client Matching and Internal Review

- Compare normalized email and phone against existing client contacts.
- Restrict candidate suggestions to the appropriate client type.
- Show suggestions only to authorized internal users.
- Treat contact matches as candidates, not proof of identity or affiliation.
- Require human selection when matches are ambiguous or conflicting.
- Retain the original submitted company, contact, and source details.
- If no client exists, use the approved client creation workflow separately.

### Inquiry-to-Case Conversion

An authorized reviewer must confirm the client and case details before
performing one conversion action.

- Validate the inquiry is eligible for conversion.
- Reject dismissed inquiries.
- Use reviewed values rather than silently trusting AI-parsed fields.
- Create the case, record the inquiry link and reviewer, and write the audit
  in one database transaction.
- Prevent concurrent or repeated conversion from creating multiple cases.
- Preserve source and original inquiry details.
- Require valid passenger counts and trip details for flight cases.
- Define support for non-flight cases before enabling their conversion.
- Create no financial or ticketing commitment.

## Trip History

One traveller may be assigned to multiple cases without creating new
client or traveller records.

History displays linked cases, including upcoming trips.
A case assignment does not prove ticket issuance or completed travel.

## Future Work

- Individual / retail returning traveller lookup and passport draft reuse.
- Explicit handling of passport renewal and cross-client identity.
- Meta Lead Ads webhook ingestion with source and event deduplication.
- n8n routing and WhatsApp notification workflows.
- Approved outbound messaging and client portal access.
- Consultant permissions with dedicated authorization tests.
- Broader reporting and after-sales workflow completion.

## Acceptance Criteria for Public Inquiry Ingestion

1. Corporate and individual visitors see the correct dynamic fields.
2. All four service types can submit an inquiry.
3. An anonymous submission is stored with source landing_page.
4. Identical retries create one inquiry; conflicting retries are rejected.
5. Public responses expose no existing client data.
6. Authorized reviewers can see contact-match candidates.
7. A reviewed eligible inquiry converts to one linked case.
8. Repeated or concurrent conversion does not create another case.
9. Case creation, inquiry update, and audit roll back together on failure.
10. Original source and submitted details remain available.
11. No booking, payment, or ticket is automatically created.
12. Existing web, email, and WhatsApp ingestion remains compatible.

## Definition of Done

The public inquiry flow works end to end without sign-in for submission.

Protected dashboards and operational actions require authorization.
Anonymous visitors cannot read private operational records or create cases.

Required database, permission, validation, retry, and rollback checks pass.
TypeScript checking and production build pass.

Preview verification covers submission, review, matching, and conversion
before merge. Production verification follows deployment.

Documentation distinguishes verified capabilities from planned work.