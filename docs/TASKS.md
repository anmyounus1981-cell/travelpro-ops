# TravelPro Ops — Task Plan

## Checkpoint

- Production baseline: main 2e23db2 (PR #16).
- PR #14: merged; corporate lookup and Trip History production verified.
- PR #15: merged; returning corporate passport draft reuse verified in
  preview, followed by production deployment and lookup verification.
- Active branch: feature/multi-channel-inquiry-ingestion.
- Current priority: public landing page inquiry submission and reviewed
  inquiry-to-case conversion.

Checked items below reflect recorded verification.
Unchecked items are remaining work, not claims of missing implementation
across every historical module.

## Completed — Security and Corporate Traveller Workflows

- [x] Supabase Auth and owner-only protected access.
- [x] Review write enforcement and permission cutover for protected
  traveller, passport draft, document, assignment, and audit workflows.
- [x] Corporate and individual client selector with quick creation.
- [x] Retry-safe client creation with atomic audit logging.
- [x] Database uniqueness for normalized corporate names.
- [x] Reviewed Premier Group consolidation with traveller IDs retained.
- [x] Corporate traveller lookup by client and normalized passport.
- [x] Clear stale lookup results when lookup inputs change.
- [x] Trip History with case route, departure, return, and case status.
- [x] Database test: one reviewed traveller reused across two trip cases.
- [x] Returning corporate passport draft links to an existing verified
  profile without changing or duplicating that profile.
- [x] Returning draft checks for field mismatches, permissions, retries,
  and atomic rollback on audit failure.
- [x] Preview confirmation retained the traveller count at 14.
- [x] PR #14 and PR #15 merged and deployed.

## Phase 6 — Review Enforcement Follow-up

Review Write Enforcement and Permission Cutover is the established
security baseline. Related verification and workflow improvements continue.

- [x] Verify multi-trip history ordering with multiple cases in the browser.
- [x] Add a linked non-owner identity test for returning draft confirmation.
- [ ] Review database security and performance advisors after new migrations.
- [ ] Review incomplete historical traveller profiles without automatic
  name-based merging or deletion.
- [ ] Define passport renewal and cross-client identity handling.
- [ ] Implement and test consultant permissions before exposing
  owner-only operations to consultants.

## Active Milestone — Public Inquiry Ingestion

### 1. Inspect and Document

- [x] Inspect the existing public form and HTTP intake route.
- [x] Inspect the original inquiries schema and owner security cutover.
- [x] Inspect Inbox review UI and existing conversion Server Action.
- [x] Inspect deterministic and optional AI inquiry parsing.
- [x] Read the existing PRD, ARCHITECTURE, and TASKS documents.
- [x] Update and verify all three documents against the current checkpoint.
- [ ] Inspect relevant case constraints, Supabase helpers, and any later
  inquiry schema changes before writing the migration.

### 2. Public Form and Submission

- [ ] Corporate / Individual-Retail client type selection.
- [ ] Corporate company name and contact person fields.
- [ ] Individual full name field.
- [ ] Phone / WhatsApp and email validation.
- [ ] Service type: Flight Booking, Visa Support, Package, Consultation.
- [ ] Preferred route, target dates, and special requirements.
- [ ] Relevant flight passenger count and cabin preference.
- [ ] Allow incomplete plans where appropriate to the service type.
- [ ] Next.js Server Action backed by a scoped Supabase intake function.
- [ ] Assign landing_page source on the server.
- [ ] Preserve validated submitted fields independently of AI suggestions.
- [ ] Stable request UUID with identical retry and conflict handling.
- [ ] Submission feedback for validation errors and unknown outcomes.
- [ ] Public endpoint abuse controls.
- [ ] Preserve existing web, email, and WhatsApp intake compatibility.

### 3. Internal Matching and Review

- [ ] Explicit mapping from inquiry personal to client individual.
- [ ] Defined email and phone normalization.
- [ ] Contact-match candidates scoped by client type.
- [ ] Suggestions visible only to authorized internal users.
- [ ] Human selection for ambiguous or conflicting matches.
- [ ] Review and correct case fields before conversion.
- [ ] Use the separate approved client creation workflow when required.
- [ ] Preserve original inquiry contact, company, and source details.

### 4. Atomic Case Conversion

- [ ] Define non-flight case support before enabling its conversion.
- [ ] Replace separate conversion writes with one authorized database RPC.
- [ ] Lock and validate the inquiry during conversion.
- [ ] Reject dismissed inquiries.
- [ ] Validate client type, reviewed trip fields, and passenger counts.
- [ ] Create one case, update inquiry review metadata, and write audit
  within the same transaction.
- [ ] Identical completed retry returns the existing case.
- [ ] Conflicting retry is rejected.
- [ ] Concurrent conversion cannot create duplicate cases.
- [ ] Store and display the converted case reference.
- [ ] Create no booking, payment, or ticket automatically.

### 5. Verification and Delivery

- [ ] Anonymous submission and private-data isolation tests.
- [ ] Corporate and individual validation tests.
- [ ] All service types and incomplete-plan tests.
- [ ] Submission retry and request conflict tests.
- [ ] Matching ambiguity and client-type isolation tests.
- [ ] Authorized and unauthorized conversion tests.
- [ ] Dismissed inquiry rejection test.
- [ ] Conversion retry and concurrency tests.
- [ ] Audit-failure rollback test.
- [ ] Source and submitted-data preservation checks.
- [ ] Existing channel compatibility checks.
- [ ] npx tsc --noEmit.
- [ ] git diff --check.
- [ ] npm run build.
- [ ] Preview browser verification of submission, review, and conversion.
- [ ] Review staged changes and commit only milestone files.
- [ ] Apply reviewed migration through the established deployment workflow.
- [ ] Merge PR after required checks.
- [ ] Production verification and checkpoint update.

## Individual Returning Travellers — Implementation Checkpoint

Advanced ahead of public inquiry implementation at the owner's request.
Application changes are on feature/individual-returning-travellers;
merged to main as 2e23db2; production verification completed.

- [x] Review individual account identity and duplicate prevention rules.
- [x] Individual traveller lookup under the selected account.
- [x] Returning individual passport draft reuse.
- [x] Retain existing profiles and multi-trip history (database verified).
- [x] Permission, mismatch, retry, and audit rollback tests.
- [x] Linked consultant rejected by both corporate and individual functions.
- [x] Apply migration 20261011084315_individual_returning_travellers.sql.
- [x] TypeScript, production build, and diff checks.
- [x] Review security and performance advisors; record existing advisories.
- [x] Owner-guided preview: individual client created, no-match lookup,
  traveller creation, returning match, and verified owner review.
- [x] Fix Case Intake mixed client dropdown: reuse typed account selector,
  clear selection on type changes, and validate the account type server-side.
- [x] Verify the updated Case Intake selector in preview: individual account
  appears only under Individual / Retail.
- [x] Complete two-trip assignment and passport draft reuse browser checks.
  Owner-guided verification on 11 October 2026: traveller
  8dfc158a-6bc1-4918-9373-dc689fb6bc13 assigned to TP-261011-D020
  (DAC-BKK, 2026-11-15) and TP-261011-F6C8 (DAC-SIN, 2026-12-10).
  Draft 6f7dafa2-7dac-4a65-b3be-8e04767de1cb confirmed against that
  existing verified profile. Directory remained at 15 travellers with one
  SYNTHETIC RETAIL TEST entry; both trips remained in history. Refresh
  retained confirmed status and confirmation was unavailable.
- [x] PR #16 merged as 2e23db2; Production deployment Ready.
- [x] Owner verified typed client filtering, both trip assignments, and
  confirmed-draft guard on Production. Canonical travelpro-ops.vercel.app
  also displays the new selector after refresh.
- [x] No duplicate profile during multi-case assignment and draft linking;
  preview directory count remained 15 with one synthetic retail profile.

Preview browser verification completed in the owner's authenticated session.
Production owner-session verification completed on 11 October 2026.
Database tests use synthetic fixtures in transactions ending in ROLLBACK.

Do not deduplicate individual clients solely by name.

## Later — Messaging and Automation

- [ ] Meta Lead Ads webhook authentication and event deduplication.
- [ ] Source-preserving inquiry ingestion through n8n.
- [ ] WhatsApp template notifications and delivery tracking.
- [ ] Email delivery integration.
- [ ] Secure client portal access.
- [ ] Live passport OCR activation and provider verification.
- [ ] Reporting and remaining after-sales workflows.

## Historical Roadmap Reconciliation

The earlier sprint plan contained permissive RLS, anonymous operational
writes, future Auth setup, and unchecked tasks that no longer accurately
represented the deployed checkpoint.

- [ ] Reconcile broader quotation, booking, reminder, reporting, and
  service-case requirements against implemented code and tests.
- [ ] Track unverified historical features without marking them completed
  solely because a page or table exists.

## Mandatory Boundaries

- Public visitors submit inquiries only.
- Protected operational records require authorization.
- Client matching is a suggestion, not proof of identity.
- AI extraction and parsing require human review.
- Payment collection and verification remain manual.
- Ticket issuance, reissue, refund, void, and GDS changes remain manual.
- Case assignment does not prove ticket issuance or completed travel.
- Do not delete or stage unrelated local audit and backup files.

## Resume Procedure

At the beginning of each resumed session:

1. Summarize verified completed work.
2. Summarize remaining work and the immediate next task.
3. Confirm the repository branch and checkpoint from available evidence.
4. Continue with one clearly identified editor or terminal step at a time.
## 12 October 2026 — Signed Inquiry Webhook Checkpoint

These checks cover the new webhook intake path, not completion of the
whole Public Inquiry Ingestion milestone.

- [x] Apply migration 20261011144826; local/remote history matched.
- [x] Server-only Supabase intake helper.
- [x] Signed POST /api/webhooks/inquiries with bounded body reading.
- [x] Timestamp, signature and configured source/account validation.
- [x] Middleware exception with authentication enforced by route handler.
- [x] Rollback SQL tests for intake, permissions, retry conflicts,
  historical identical retries and provider account isolation.
- [x] Nine local webhook checks without intake database writes.
- [x] TypeScript, production build and formatting checks.
- [x] Preview rejection: unsigned 401, unauthorized account 403.
- [x] Preview accepted synthetic inquiry:
  0bd0bc17-5b25-4a54-897d-ccf82bffc3fa.
- [x] Identical retry returned same ID and duplicate=true.
- [x] Conflicting retry rejected with 409.
- [x] Saved original message intact; status=new; client/case links NULL.
- [x] Owner Inbox displays the inquiry once.
- [ ] Concurrent-request verification.
- [ ] Durable rate limiting.
- [ ] Public Landing Page intake implementation and verification.
- [ ] Display service type and validated submitted fields in Inbox.
- [ ] Correct Corporate client labels for individual inquiries.
- [ ] Block unsupported non-flight conversion in UI and server action.
- [ ] Reviewed atomic inquiry-to-case conversion.
- [ ] Real n8n / Meta / WhatsApp integration and channel verification.
- [ ] Milestone PR review and production release.

Latest pushed application commit: a4ce25b.
Production application baseline: main 2e23db2.
Database is shared; the intake migration is applied.
Synthetic HTTP tests do not establish a live WhatsApp connection.

## 13 October 2026 — Inbox Guard and Display Checkpoint

Latest verified Preview: 6a74e37.
Production application remains main 2e23db2.

- [x] Add server-action guard for non-flight and dismissed inquiries.
- [x] Disable consultation conversion controls in Inbox.
- [x] Owner verified client selector, ADT/CHD/INF fields and button disabled.
- [x] Display client type and service type.
- [x] Remove corporate suggestion field from individual inquiry cards.
- [x] Preview verified Individual / Retail and Consultation labels.
- [x] Preserve explicit Not recorded label for legacy service types.
- [x] TypeScript, production build and formatting checks.
- [x] Recover Preview deployment after temporary GitHub secondary rate limit.
- [ ] Direct server-action rejection tests.
- [ ] Display validated submitted fields separately from AI suggestions.
- [ ] Concurrent-request tests and durable rate limiting.
- [ ] Public Landing Page intake.
- [ ] Reviewed atomic inquiry-to-case conversion.
- [ ] Real n8n / Meta / WhatsApp integration.
- [ ] Milestone review and production release.

This checkpoint supersedes the earlier pending client-label and
non-flight UI/server guard implementation items. Execution-level
server guard tests remain pending.

## 13 October 2026 — Submitted-Field Display Checkpoint

Latest verified Preview: 5a3c0b4.
Production application remains main 2e23db2.

- [x] Query and display validated submitted fields in Inbox.
- [x] Separate submitted values from AI suggestions.
- [x] Show Not provided for missing submitted values.
- [x] Show explicit missing-record message for legacy inquiries.
- [x] Preview verified synthetic submitted name/email and missing fields.
- [x] TypeScript, production build and formatting checks.

This supersedes the earlier pending submitted-field display item.
The full inquiry-ingestion milestone remains incomplete.

## 13 October 2026 — Durable Rate-Limit Checkpoint

Verified Preview application: f2248fc.
Production application remains main 2e23db2.

- [x] Apply rate-limit migration 20261012191447; history matched.
- [x] Server-only counters, keyed buckets and atomic consumption.
- [x] Rollback permission, allowance, denial and window tests.
- [x] Integrate webhook limiter after signature/account authorization.
- [x] Implement rate-checked Landing Page Server Action.
- [x] TypeScript, build and local webhook regression checks.
- [x] Preview synthetic intake with persisted rate counters.
- [x] Concurrent Preview retries: 60 accepted, five HTTP 429.
- [x] Verify Retry-After and unchanged duplicate receipt.
- [x] Database verification: one inquiry for the tested event identity.
- [ ] Wire public Landing Page form to the new Server Action.
- [ ] Anonymous submission and private-data isolation verification.
- [ ] Landing contact-limit and shared-ceiling integration tests.
- [ ] Rate-counter retention cleanup.
- [ ] Reconcile legacy API and anonymous insert abuse-control paths.
- [ ] Atomic reviewed conversion and execution-level guard tests.
- [ ] Real provider/n8n integration and production release.

The concurrency check covers retries of an existing synthetic inquiry.
It does not establish concurrent first-submission or conversion safety.
Earlier pending rate-limiter implementation items are superseded;
remaining integration and release checks are listed above.

## 14 October 2026 — Landing Form and Anonymous Verification Checkpoint

Verified Preview application: 4de5c1d.
Branch: feature/multi-channel-inquiry-ingestion.
Production baseline remains main 2e23db2.

- [x] Wire the Landing Page form to the rate-limited Server Action.
- [x] Add four service choices and conditional Corporate / Individual fields.
- [x] Keep unknown travel details optional and cabin unselected.
- [x] Add honeypot, field-length limits and submission-time field disabling.
- [x] Explicitly allow /inquire through application middleware.
- [x] TypeScript, production build and diff checks for form changes.
- [x] TypeScript and diff checks for the public-route change.
- [x] Preview verify conditional client and service fields.
- [x] Verify email-only consultation submission and owner Inbox display.
- [x] Verify consultation conversion controls disabled on b496798.
- [x] Fresh Incognito: form access without TravelPro owner login.
- [x] Fresh Incognito: private Inbox requires owner authentication.
- [x] Anonymous consultation accepted; receipt:
      eaee21a8-5d83-4e24-a1bc-f5010a1da0cb.
- [x] Verify submitted values, LANDING_PAGE source, new status and pending parsing.
- [x] Verify private Inbox still requires authentication after submission.

Remaining:
- [ ] Phone-only and Corporate submission verification.
- [ ] Execution-level form validation, honeypot and submission-lock tests.
- [ ] Retry and ambiguous-response behaviour tests.
- [ ] Landing contact-limit and shared-ceiling integration tests.
- [ ] Concurrent first-submission tests.
- [ ] Rate-counter retention cleanup.
- [ ] Reconcile legacy API and direct anonymous insert abuse controls.
- [ ] Atomic reviewed conversion and execution-level guard tests.
- [ ] Real provider/n8n integration.
- [ ] Documentation reconciliation, final review and production release.

Anonymous verification passed Vercel Preview protection using Vercel login,
without TravelPro owner authentication. It does not establish unrestricted
public internet access. The earlier unexpected /inquire visibility before
allowlisting remains unexplained. Lint verification is not established.

This checkpoint supersedes earlier pending form-wiring and basic anonymous
submission/private-Inbox verification items. The full milestone remains incomplete.

## 14 October 2026 — Phone-Only and Corporate Landing Checkpoint

Verified Preview application: 4de5c1d.
Branch: feature/multi-channel-inquiry-ingestion.
Production baseline remains main 2e23db2.

- [x] Submit phone-only Individual / Retail consultation without owner login.
- [x] Verify submitted phone and omitted email in the owner Inbox.
- [x] Submit Corporate consultation without owner login.
- [x] Verify company and contact person as separate submitted fields.
- [x] Verify Corporate label, LANDING_PAGE source, new status and pending parsing.
- [x] Verify submitted email/notes and omitted travel fields.

Receipts:
- Phone-only: 4619567a-4cf1-4611-b853-be2475d5d061.
- Corporate: dbe02455-c6cc-41a9-9f9b-44f5673f7ca8.

This supersedes the earlier pending phone-only and Corporate consultation
submission checks. Tests passed Vercel protection without TravelPro owner login.

Still pending:
- [ ] Flight, visa and package submission verification.
- [ ] Execution-level validation, honeypot and submission-lock tests.
- [ ] Retry and ambiguous-response behaviour tests.
- [ ] Landing contact/shared rate-limit integration tests.
- [ ] Remaining concurrency, cleanup, legacy-path reconciliation,
      atomic conversion, provider integration and production release work.

These checks do not establish client-account creation or matching,
duplicate prevention, rate-limit enforcement, or atomic conversion.
