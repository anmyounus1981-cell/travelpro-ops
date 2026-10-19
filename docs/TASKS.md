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

## 14 October 2026 — Flight, Visa and Package Landing Checkpoint

Verified Preview application: 4de5c1d.
Branch: feature/multi-channel-inquiry-ingestion.
Production baseline remains main 2e23db2.

- [x] Submit Flight Booking without TravelPro owner login.
- [x] Verify submitted DAC-SIN route, departure/return dates,
      passenger count 2 and economy cabin in owner Inbox.
- [x] Verify submitted flight values remain separate from AI suggestions.
- [x] Submit Visa Support without TravelPro owner login.
- [x] Verify Visa submitted fields and service label.
- [x] Verify Visa client selector, ADT/CHD/INF and conversion button disabled.
- [x] Submit Package without TravelPro owner login.
- [x] Verify Package submitted fields and service label.
- [x] Verify Package client selector, ADT/CHD/INF and conversion button disabled.
- [x] Verify all three records display LANDING_PAGE, new and pending parsing.

Receipts:
- Flight: c6889f87-77e0-4dd1-b90e-9cdb36462f99.
- Visa: 70609f04-43a5-4df5-b8ff-1b7b75b74cb3.
- Package: d4ac5a70-c038-4cce-a01d-cbdcbc84e5e2.

This supersedes earlier pending basic Flight, Visa and Package submission
checks. Tests passed Vercel protection without TravelPro owner login.

Still pending:
- [ ] Execution-level validation, honeypot and submission-lock tests.
- [ ] Retry and ambiguous-response behaviour tests.
- [ ] Landing contact/shared rate-limit integration tests.
- [ ] Concurrent first-submission tests.
- [ ] Rate-counter retention cleanup.
- [ ] Legacy API and anonymous insert abuse-control reconciliation.
- [ ] Reviewed atomic conversion and execution-level guard tests.
- [ ] Real provider integration, documentation reconciliation and production release.

Flight conversion was not invoked. These checks do not establish service
fulfilment, AI parsing, client matching or case conversion safety.

## 14 October 2026 — Airport Autocomplete Checkpoint

Verified Preview application: ee98bcc.
Branch: feature/multi-channel-inquiry-ingestion.
Production baseline remains main 2e23db2.

- [x] Generate local OurAirports dataset with source/licence metadata.
- [x] Verify 8798 unique IATA codes, dataset size and SHA-256.
- [x] Preserve generated JSON LF endings through Git attributes.
- [x] Add shared lazy dataset loader with runtime validation.
- [x] Allow only the airport dataset path through application middleware.
- [x] Integrate reusable Origin/Destination autocomplete.
- [x] Preview verify Dhaka city and lowercase lhr code search.
- [x] Verify BKK selection during Suvarnabhumi name search.
- [x] Verify editing selected text clears the previous code.
- [x] Verify Arrow Down/Enter selection and Escape dismissal.
- [x] Verify unselected airport text blocks browser submission.
- [x] Verify submitted fields and raw message contain DAC/BKK codes.
- [x] Verify airport fields reset after successful submission.
- [x] Verify no-results message.
- [x] TypeScript, production build and staged formatting checks.

Synthetic receipt: 03f4c765-fc4f-41f7-9784-24eacaa12803.
Preview testing passed Vercel protection without TravelPro owner login.

Airport follow-up:
- [ ] Mobile layout, touch interaction and dropdown clipping tests.
- [ ] Screen-reader and keyboard edge-case verification.
- [ ] Dataset load failure, timeout and retry recovery tests.
- [ ] Execution-level IME interaction test.
- [ ] Representative minor-airport and multi-airport city coverage checks.
- [ ] Decide and document server-side airport membership policy.

Coverage is limited to IATA-coded large, medium and small airports in the
source snapshot. Closed airports, heliports, seaplane bases and metropolitan
codes are excluded. Source accuracy and complete worldwide coverage are
not guaranteed. Lint verification is not established.

Contact validation testing was paused for autocomplete implementation.
Remaining validation, rate-limit, concurrency, cleanup, legacy-path
reconciliation, atomic conversion, provider integration and production
release tasks are unchanged. The milestone remains incomplete.

## 14 October 2026 — Landing Browser Validation Checkpoint

Verified Preview application: ee98bcc.
Branch: feature/multi-channel-inquiry-ingestion.
Production baseline remains main 2e23db2.
Checks performed on 14 October; recorded after midnight on 15 October.

- [x] Observe required-email focus when both contact methods are empty.
- [x] Observe email-field focus for invalid-email input.
- [x] Verify browser rejects phone without country code.
- [x] Observe required-company focus for an empty Corporate company name.
- [x] Verify browser rejects empty full name.
- [x] Verify browser rejects return date before departure.
- [x] Verify passenger count minimum of 1.
- [x] Verify passenger count maximum of 999.
- [x] Verify fractional passenger count is rejected.

Evidence limits:
- Invalid-email and missing-company checks recorded focus behaviour;
  validation popup text was not captured.
- No successful receipt was reported during invalid-input checks.
- Network requests and database row counts were not inspected.
- Browser checks do not prove server-side rejection when constraints
  are bypassed.

Still pending:
- [ ] Direct Server Action validation and honeypot rejection tests.
- [ ] Submission-lock, retry and ambiguous-response tests.
- [ ] Landing contact/shared rate-limit integration tests.
- [ ] Remaining airport accessibility, mobile and failure-recovery checks.
- [ ] Concurrent first-submission tests and counter retention cleanup.
- [ ] Legacy-path abuse-control reconciliation.
- [ ] Reviewed atomic conversion and execution-level guard tests.
- [ ] Real provider integration, documentation reconciliation and release.

This records browser validation evidence only.
The inquiry-ingestion milestone remains incomplete.

## 15 October 2026 — Local Landing Server Action Test Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Application implementation: ee98bcc.
Production baseline remains main 2e23db2.

- [x] Add scripts/test-landing-inquiry-action.mjs.
- [x] Execute current exported action with mocked dependencies.
- [x] Verify invalid inputs reject before rate-limit/intake calls.
- [x] Verify honeypot, unknown fields, file inputs and duplicate-name rejection.
- [x] Verify contact, Corporate company, date and flight-field validation.
- [x] Verify optional-field omission and clean uppercase IATA payloads.
- [x] Verify stale company/flight-only values are omitted where appropriate.
- [x] Verify mocked rate denial/failure prevents intake RPC.
- [x] Verify duplicate receipt response handling.
- [x] Verify safe RPC errors and malformed-receipt rejection.
- [x] Syntax check and all local test assertions passed.
- [x] No network requests or real database writes during tests.

These checks supersede pending local action-validation and honeypot unit
tests only. Dependencies are mocked; database deduplication, real rate
enforcement and Next.js HTTP transport are not established by this suite.

Still pending:
- [ ] Real transport/integration validation and honeypot rejection tests.
- [ ] Browser submission-lock, retry and ambiguous-response tests.
- [ ] Landing contact/shared rate-limit integration tests.
- [ ] Concurrent first-submission tests.
- [ ] Airport accessibility, mobile and failure-recovery verification.
- [ ] Counter cleanup and legacy-path abuse-control reconciliation.
- [ ] Reviewed atomic conversion and execution-level guard tests.
- [ ] Real provider integration, documentation reconciliation and release.

Airport code syntax checks do not validate membership in the local dataset.
The milestone remains incomplete.

## 15 October 2026 — Dependency and Rate-Test Preparation Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before these changes: 7d71df6.
Production baseline remains main 2e23db2.

- [x] Add exact Playwright 1.64.1 development dependency.
- [x] Apply compatible audit updates to Next.js/ESLint config 15.5.28.
- [x] Apply scoped Next.js PostCSS override 8.5.28.
- [x] Resolve invalid nested PostCSS installation through targeted update.
- [x] TypeScript and production build after dependency changes.
- [x] Local Landing Action and nine webhook regression checks.
- [x] Diff formatting check.
- [x] Production-only npm audit reports zero vulnerabilities.
- [x] Record remaining full-audit findings without forced downgrade/upgrade.
- [x] Record manual Landing email-limit attempt as INCONCLUSIVE.

Outstanding:
- [ ] Review development/build-tool exposure from the unpatched braces chain.
- [ ] Resolve or formally document the remaining five high audit findings.
- [ ] Review the pending unrs-resolver install-script warning.
- [ ] Establish lint verification.
- [ ] Verify updated dependency deployment on Preview.
- [ ] Install Playwright browser and implement automated Landing rate test.
- [ ] Verify email, phone and shared Landing rate ceilings.
- [ ] Continue remaining retry, concurrency, airport, cleanup, legacy-path,
      atomic conversion, provider integration and release work.

Manual rate test used six distinct synthetic inquiries. The sixth response
was reported after a fixed-window boundary; exact server timestamps were
not inspected. It establishes neither rate-limit success nor failure.

Production-only audit results are scoped dependency findings, not a complete
security assessment. Dependency changes are locally verified; updated
Preview compatibility remains pending.

## 15 October 2026 — Automated Landing Email Limit Checkpoint

Tested Preview application: dec2cef.
Branch: feature/multi-channel-inquiry-ingestion.
Production baseline remains main 2e23db2.

- [x] Add bounded Playwright Landing email-limit test script.
- [x] Establish Vercel bypass cookie without TravelPro owner login.
- [x] Verify private Inbox protection before and after submissions.
- [x] Submit five distinct inquiries with one unique synthetic email.
- [x] Verify sixth submission is rate-limited.
- [x] Validate displayed retry delay: 398 seconds.
- [x] Verify database contains exactly five matching inquiries.
- [x] Verify all five creation timestamps fall in one fixed window.
- [x] Verify all five remain new with no matched client or converted case.
- [x] Script syntax and staged formatting checks.

Database evidence:
- First creation: 2026-10-15 13:53:12.441946+00.
- Last creation: 2026-10-15 13:53:20.767623+00.
- Matching inquiries: 5; distinct creation windows: 1.
- New, unlinked inquiries: 5.

Script: scripts/test-preview-landing-rate-limit.mjs.
One successful run after bypass-cookie setup and diagnostic additions.
Earlier first-submission response timeout remains unexplained.

This supersedes the earlier inconclusive manual email-limit test as
successful integration evidence. It does not establish identical-retry
behaviour, concurrent submissions, phone limits or shared ceilings.
Retry delay was verified in the action message, not an HTTP header.

Still pending:
- [ ] Investigate initial submission-response timeout and harness reliability.
- [ ] Phone contact-limit integration tests.
- [ ] Email normalization and combined-contact limit tests.
- [ ] Shared Landing ceiling integration tests.
- [ ] Retry, ambiguous-response and concurrency verification.
- [ ] Remaining airport, dependency, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, real provider integration and release.

The milestone remains incomplete.

## 15 October 2026 — Landing Phone Limit Checkpoint

Tested Preview application: dec2cef.
Branch: feature/multi-channel-inquiry-ingestion.
Production baseline remains main 2e23db2.

- [x] Add email/phone modes to the existing Landing browser test.
- [x] Verify script syntax and diff formatting.
- [x] Submit phone-only inquiries without TravelPro owner login.
- [x] Verify five accepted submissions and sixth rate-limited.
- [x] Validate displayed retry delay: 702 seconds.
- [x] Verify private Inbox protection before and after submissions.
- [x] Verify exactly five matching database inquiries.
- [x] Verify all creation timestamps fall in one fixed window.
- [x] Verify all five omit email and remain new/unlinked.

Database evidence for fictional phone +12025550124:
- First creation: 2026-10-15 14:18:06.51805+00.
- Last creation: 2026-10-15 14:18:16.012159+00.
- Matching inquiries: 5; distinct creation windows: 1.
- Without email: 5; new and unlinked: 5.

This supersedes the pending phone-only rate-limit integration check.
The fixed test phone can retain consumed quota within its current window.
Do not automatically rerun expecting five new acceptances.

Still pending:
- [ ] Email normalization and combined-contact limit tests.
- [ ] Shared Landing ceiling integration test.
- [ ] Retry, ambiguous-response and concurrent-request tests.
- [ ] Investigate the earlier submission-response timeout.
- [ ] Remaining airport, dependency, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

This test used distinct submissions and does not establish retry
deduplication or complete harness reliability. The milestone remains incomplete.

## 15 October 2026 — Combined-Contact Phone Ceiling Checkpoint

Tested Preview application: dec2cef.
Branch: feature/multi-channel-inquiry-ingestion.
Production baseline remains main 2e23db2.

- [x] Add combined mode to the Landing browser test.
- [x] Use a different synthetic email for each attempt with one fixed phone.
- [x] Verify five accepted inquiries and sixth rate-limited.
- [x] Validate displayed retry delay: 814 seconds.
- [x] Verify private Inbox protection before and after submissions.
- [x] Verify exactly five matching database inquiries.
- [x] Verify five distinct emails and one fixed creation window.
- [x] Verify all five inquiries remain new and unlinked.
- [x] Script syntax and diff formatting checks.

Database evidence for fictional phone +12025550125:
- First creation: 2026-10-15 15:31:11.139128+00.
- Last creation: 2026-10-15 15:31:23.834289+00.
- Matching inquiries: 5; distinct emails: 5.
- Distinct creation windows: 1; new and unlinked: 5.

Changing email did not bypass the phone ceiling in this test.
This completes only one direction of combined-contact verification.

Still pending:
- [ ] Fixed email with changing phone integration test.
- [ ] Email normalization variant tests.
- [ ] Shared Landing ceiling integration test.
- [ ] Retry, ambiguous-response and concurrency verification.
- [ ] Investigate the earlier submission-response timeout.
- [ ] Remaining airport, dependency, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

Do not automatically rerun with the fixed phone while its quota is consumed.
These distinct-submission tests do not establish retry deduplication.
The milestone remains incomplete.

## 15 October 2026 — Reverse-Contact Email Ceiling Checkpoint

Tested Preview application: dec2cef.
Branch: feature/multi-channel-inquiry-ingestion.
Production baseline remains main 2e23db2.

- [x] Add reverse mode to the Landing browser test.
- [x] Keep one synthetic email fixed while changing phone per attempt.
- [x] Verify five accepted inquiries and sixth rate-limited.
- [x] Validate displayed retry delay: 663 seconds.
- [x] Verify private Inbox protection before and after submissions.
- [x] Verify exactly five matching database inquiries.
- [x] Verify five distinct phones and one fixed creation window.
- [x] Verify all five remain new and unlinked.
- [x] Script syntax and diff formatting checks.

Database evidence:
- First creation: 2026-10-15 15:48:44.665858+00.
- Last creation: 2026-10-15 15:48:55.412887+00.
- Matching inquiries: 5; distinct phones: 5.
- Distinct creation windows: 1; new and unlinked: 5.

Changing phone did not bypass the fixed email ceiling.
This supersedes the pending fixed-email/changing-phone integration check.
Together with the previous combined test, both contact-ceiling directions
have browser and database evidence.

Still pending:
- [ ] Email normalization variant tests.
- [ ] Shared Landing ceiling integration test.
- [ ] Retry, ambiguous-response and concurrent-request verification.
- [ ] Investigate the earlier submission-response timeout.
- [ ] Remaining airport, dependency, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

These tests do not establish retry deduplication, concurrency safety or
protection against changing both contacts. The milestone remains incomplete.

## 15 October 2026 — Email Case-Normalization Limit Checkpoint

Tested Preview application: dec2cef.
Branch: feature/multi-channel-inquiry-ingestion.
Production baseline remains main 2e23db2.

- [x] Add normalize mode to the Landing browser test.
- [x] Alternate lowercase/uppercase variants of one synthetic email.
- [x] Omit phone to isolate email-ceiling behaviour.
- [x] Verify five accepted inquiries and sixth rate-limited.
- [x] Validate displayed retry delay: 801 seconds.
- [x] Verify private Inbox protection before and after submissions.
- [x] Verify exactly five matching database inquiries.
- [x] Verify two stored casing variants represent one lowercased identity.
- [x] Verify one creation window and five new/unlinked inquiries.
- [x] Script syntax and diff formatting checks.

Database evidence:
- First creation: 2026-10-15 16:16:27.827703+00.
- Last creation: 2026-10-15 16:16:37.919046+00.
- Matching inquiries: 5; stored email variants: 2.
- Lowercased identities: 1; creation windows: 1.
- New and unlinked: 5.

This completes the email letter-case rate-limit integration check.
It does not establish canonical email storage or client deduplication.
Whitespace and provider-specific alias normalization were not tested.

Still pending:
- [ ] Shared Landing ceiling integration test.
- [ ] Retry, ambiguous-response and concurrent-request verification.
- [ ] Investigate the earlier submission-response timeout.
- [ ] Remaining airport, dependency, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

An earlier run stopped before submissions due to insufficient window time.
The milestone remains incomplete.

## 15 October 2026 — Isolated Shared-Ceiling Database Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: b72e56e.
Production baseline remains main 2e23db2.

Test:
supabase/tests/inquiry-intake/shared-ceiling-rollback-checks.sql.

- [x] Test the installed rate-limit function using isolated random buckets.
- [x] Verify first 100 requests allowed with correct remaining counts.
- [x] Verify attempts 101 and 102 denied with valid retry delays.
- [x] Verify allowed requests return zero retry delay.
- [x] Verify stored counter saturates at 101.
- [x] Verify a different bucket retains independent allowance.
- [x] Roll back test changes.
- [x] Independently verify remaining_test_buckets = 0.

These checks establish the database counter boundary only.
The real application global bucket was not deliberately exhausted.
No schema recreation or inquiry submissions were performed.

Still pending:
- [ ] Verify application shared-bucket identity and parameter wiring.
- [ ] Verify global denial prevents contact-counter and intake calls.
- [ ] Shared-ceiling end-to-end verification in an isolated environment.
- [ ] Retry, ambiguous-response and concurrency verification.
- [ ] Investigate the earlier submission-response timeout.
- [ ] Remaining airport, dependency, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

This sequential rollback test does not establish concurrency safety.
The inquiry-ingestion milestone remains incomplete.

## 16 October 2026 — Local Rate-Limit Helper Wiring Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 2c23191.
Production baseline remains main 2e23db2.

- [x] Add scripts/test-inquiry-rate-limit-helper.mjs.
- [x] Execute the current helper with a test secret and mocked RPC.
- [x] Verify shared Landing global bucket identity and 100/900 parameters.
- [x] Verify five-request contact limits and normalized email bucket identity.
- [x] Verify separate email/phone buckets and minimum remaining allowance.
- [x] Verify global denial skips contact-counter calls.
- [x] Verify email denial skips the subsequent phone-counter call.
- [x] Verify phone denial propagates.
- [x] Verify final allowed global slot with zero remaining.
- [x] Verify webhook parameters and scope isolation.
- [x] Verify missing contact/secret and tested RPC failures fail closed.
- [x] Verify tested malformed-response rejection and safe error-code logging.
- [x] Syntax, local assertions and staged formatting checks passed.
- [x] No network requests or real quota changes.

This supersedes pending local shared-bucket identity/parameter wiring
and global-denial contact-call checks. Existing Landing Action tests
separately cover mocked rate denial preventing intake RPC.

RPC is mocked. Database boundary tests and local helper tests do not
together establish a real shared-ceiling end-to-end result.

Still pending:
- [ ] Isolated shared-ceiling end-to-end/global-denial verification.
- [ ] Browser submission-lock, retry and ambiguous-response tests.
- [ ] Concurrent first-submission verification.
- [ ] Investigate the earlier submission-response timeout.
- [ ] Remaining airport, dependency, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

The inquiry-ingestion milestone remains incomplete.

## 16 October 2026 — Controlled Landing Retry Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 6fa7688.
Tested Preview application: dec2cef.
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-retry.mjs.

- [x] Add bounded browser test for controlled response loss and retry.
- [x] Add cleanup guard for a held first request.
- [x] Verify visible consultation fields and submit button lock in flight.
- [x] Verify repeated in-flight submit events produce no extra action requests
      during the observed test.
- [x] Confirm first server acceptance before discarding its response.
- [x] Verify form details remain populated with the safe retry message.
- [x] Verify retry preserves request ID and all serialized form fields.
- [x] Verify duplicate response returns the original receipt.
- [x] Verify successful retry resets the form.
- [x] Verify private Inbox protection before and after the test.
- [x] Independently verify exactly one matching database inquiry.
- [x] Verify that inquiry has the original receipt ID.
- [x] Script syntax and tracked diff formatting checks passed.

Receipt: 217b7ec1-cfc8-4c28-80b8-987775db194d.
Matching inquiries: 1; matching original receipt: 1.

This completes the tested unchanged retry after controlled response loss.
It does not establish concurrent first-submission safety, recovery after
page reload, or behaviour when details change after an ambiguous result.

Still pending:
- [ ] Define and verify safe handling of edits after an ambiguous submission.
- [ ] Verify recovery after page reload.
- [ ] Concurrent first-submission verification.
- [ ] Isolated shared-ceiling end-to-end verification.
- [ ] Investigate the earlier unrelated submission-response timeout.
- [ ] Remaining airport, dependency, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

The inquiry-ingestion milestone remains incomplete.

## 16 October 2026 — Landing Recovery Implementation Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 08458ce.
Production baseline remains main 2e23db2.

- [x] Add accepted/rejected/unknown/conflict Server Action outcomes.
- [x] Add explicit outcome assertions to the local action tests.
- [x] Capture an in-memory submission snapshot for unchanged retries.
- [x] Lock fields after an unknown outcome and retain the original request ID.
- [x] Keep unchanged retry available when no request is in flight.
- [x] Preserve uncertainty when a subsequent retry is rejected.
- [x] Allow correction after rejection when no earlier uncertainty exists.
- [x] Block further submission after conflict in the current page.
- [x] Reset form and recovery state after confirmed acceptance.
- [x] Add ten local component recovery scenarios with mocked dependencies.
- [x] Update browser retry selectors and post-loss field-lock assertions.
- [x] TypeScript, production build, local suites and script syntax checks.
- [x] Tracked diff formatting checks.

Local component tests execute the current page with mocked React hooks
and Server Action. They do not establish real browser or DOM behaviour.
No real database writes were made by these local suites.

Immediate follow-up:
- [ ] Deploy the recovery implementation to Preview.
- [ ] Pin the browser retry test to the new deployment.
- [ ] Verify locked fields and unchanged retry after controlled response loss.
- [ ] Independently verify exactly one matching database inquiry.
- [ ] Record the new Preview evidence.

Still pending:
- [ ] Browser verification of rejection editing and sticky uncertainty.
- [ ] Browser verification of conflict blocking.
- [ ] Recovery after reload, navigation and cross-tab handling.
- [ ] Integrated support workflow for unresolved conflicts.
- [ ] Concurrent first-submission and isolated shared-ceiling end-to-end tests.
- [ ] Investigate the earlier unrelated submission-response timeout.
- [ ] Remaining airport, dependency, lint, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

The updated browser script still targets the older dec2cef Preview.
Do not run it there as verification of this implementation.
The inquiry-ingestion milestone remains incomplete.

## 16 October 2026 — Landing Recovery Preview Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Tested implementation: 761eeff.
Preview: https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

- [x] Access the Preview containing the recovery implementation.
- [x] Pin the browser retry script to that deployment.
- [x] Verify visible consultation fields and submit button lock in flight.
- [x] Confirm first server acceptance before discarding its response.
- [x] Verify submitted details remain populated after response loss.
- [x] Verify fields remain locked after the unknown outcome.
- [x] Verify Retry Same Inquiry remains available.
- [x] Verify retry preserves request ID and all serialized form fields.
- [x] Verify duplicate receipt matches the original receipt.
- [x] Verify successful retry resets the form.
- [x] Verify no extra action requests from tested in-flight submit events.
- [x] Verify private Inbox protection before and after intake.
- [x] Independently verify exactly one matching database inquiry.
- [x] Verify that inquiry has the original receipt ID.

Receipt: 0f102107-1a87-442d-8896-4481ea039eab.
Matching inquiries: 1; matching original receipt: 1.

An earlier run stopped before submissions because insufficient window
time remained. The subsequent controlled retry run passed.

This supersedes the pending Preview verification for this controlled
unknown-outcome locking and unchanged-retry flow.

Still pending:
- [ ] Browser verification of editing after confirmed rejection.
- [ ] Browser verification that rejection after uncertainty retains the lock.
- [ ] Browser verification of conflict blocking.
- [ ] Reload recovery, navigation persistence and cross-tab handling.
- [ ] Integrated support workflow for unresolved conflicts.
- [ ] Concurrent first-submission and isolated shared-ceiling end-to-end tests.
- [ ] Investigate the earlier unrelated submission-response timeout.
- [ ] Remaining airport, dependency, lint, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

Local mocked tests cover rejection editing, sticky uncertainty and
conflict blocking; those browser scenarios remain unverified.
The inquiry-ingestion milestone remains incomplete.

## 16 October 2026 — Confirmed-Rejection Editing Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 5be9837.
Tested application implementation: 761eeff.
Preview: https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

- [x] Submit a synthetic consultation with past departure date 2020-01-01.
- [x] Observe the generic inquiry-details/travel-dates rejection message.
- [x] Verify departure date and notes remain editable after rejection.
- [x] Clear departure date and update notes before resubmission.
- [x] Verify corrected submission succeeds.
- [x] Verify exactly one matching database inquiry.
- [x] Verify the successful receipt matches that inquiry.
- [x] Verify submitted departure is absent and corrected notes match exactly.

Receipt: c6e00511-ce6c-4987-a297-6f0067325329.
Database counts: matching inquiries 1; matching receipt 1;
without departure 1; with corrected notes 1.

This supersedes the pending browser check for editing after confirmed
rejection. Browser network payloads and request-ID rotation were not
inspected. The browser message did not expose the database error code.

Still pending:
- [ ] Browser verification that rejection after uncertainty retains the lock.
- [ ] Browser verification of conflict blocking.
- [ ] Reload recovery, navigation persistence and cross-tab handling.
- [ ] Integrated support workflow for unresolved conflicts.
- [ ] Concurrent first-submission and isolated shared-ceiling end-to-end tests.
- [ ] Investigate the earlier unrelated submission-response timeout.
- [ ] Remaining airport, dependency, lint, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

This test does not establish behaviour after an earlier unknown outcome.
The inquiry-ingestion milestone remains incomplete.

## 16 October 2026 — Sticky Recovery Browser Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: fa9ad29.
Tested application implementation: 761eeff.
Preview: https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-sticky-recovery.mjs.

- [x] Add a bounded browser test with at most three action requests.
- [x] Confirm first server acceptance before discarding its response.
- [x] Verify unknown outcome keeps fields locked with retry available.
- [x] Inject a controlled rejection without forwarding the second request.
- [x] Verify that rejection does not unlock the earlier uncertain submission.
- [x] Verify name, email and notes remain unchanged.
- [x] Verify both retries preserve request ID and all serialized fields.
- [x] Verify the third request returns the original duplicate receipt.
- [x] Verify acceptance resets and unlocks the form.
- [x] Verify private Inbox protection before and after the test.
- [x] Independently verify one matching database inquiry and original receipt.
- [x] Verify script syntax.

Receipt: 815a9344-589d-46fb-ba17-db00f0c1c40c.
Matching inquiries: 1; matching original receipt: 1.

This supersedes the pending browser sticky-uncertainty check for a
controlled rejected response. The second request did not reach the real
Server Action or limiter. Real rate-limit denial during recovery remains
unverified by this test.

The response rewrite depends on the tested Next.js action-response format.
Unsupported framing stops the test.

Still pending:
- [ ] Browser verification of conflict blocking.
- [ ] Reload recovery, navigation persistence and cross-tab handling.
- [ ] Integrated support workflow for unresolved conflicts.
- [ ] Concurrent first-submission and isolated shared-ceiling end-to-end tests.
- [ ] Earlier unrelated submission-response timeout investigation.
- [ ] Remaining airport, dependency, lint, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

The inquiry-ingestion milestone remains incomplete.

## 16 October 2026 — Landing Conflict Browser Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 51dd570.
Tested application implementation: 761eeff.
Preview: https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-conflict.mjs.

- [x] Add browser test allowing at most two forwarded action requests.
- [x] Confirm first server acceptance before discarding its response.
- [x] Verify browser retry preserves original request ID and form fields.
- [x] Deliberately alter forwarded retry notes while preserving request identity.
- [x] Verify real Server Action returns a conflict outcome.
- [x] Verify conflict locks visible consultation fields and disables submission.
- [x] Verify browser retains original name, email and notes.
- [x] Verify tested programmatic submits produce no additional action requests
      during the bounded observation.
- [x] Verify private Inbox protection before and after the test.
- [x] Verify one matching inquiry with the original receipt and notes.
- [x] Verify no matching inquiry contains the conflicting notes.
- [x] Script syntax check passed.

Receipt: 5ef5ef72-7236-4492-976d-e6196dd13c27.
Database counts: matching inquiries 1; original receipt 1;
original notes 1; conflicting notes 0.

This supersedes the pending browser conflict-blocking check.
The payload alteration was deliberate test interception, not normal form editing.
The test does not establish concurrency safety or cross-tab conflict handling.

Still pending:
- [ ] Reload recovery, navigation persistence and cross-tab handling.
- [ ] Integrated support-resolution workflow for unresolved conflicts.
- [ ] Concurrent first-submission and isolated shared-ceiling end-to-end tests.
- [ ] Earlier unrelated submission-response timeout investigation.
- [ ] Remaining airport, dependency, lint, cleanup and legacy-path checks.
- [ ] Reviewed atomic conversion, provider integration and production release.

The inquiry-ingestion milestone remains incomplete.

## 17 October 2026 — Landing Reload Recovery Design Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: e08753c.
Current application recovery implementation: 761eeff.
Production baseline remains main 2e23db2.

Design: docs/LANDING_RELOAD_RECOVERY_DESIGN.md.
Status: proposal only; reload recovery is not implemented or execution-tested.

- [x] Draft same-origin, same-tab sessionStorage recovery architecture.
- [x] Define persistence-before-dispatch and immutable retry requirements.
- [x] Define restore gating and conservative pending-state recovery.
- [x] Define accepted, rejected, unknown and conflict handling with storage failures.
- [x] Define expiry, invalid-record and compatibility blocking rules.
- [x] Document personal-data exposure and deletion limitations.
- [x] Address historical keys, multiple records and unavailable storage.
- [x] Define local, component, browser and database verification matrix.
- [x] Record outdated architecture/security documentation for reconciliation.

Before implementation:
- [ ] Confirm proposed 24-hour snapshot lifetime.
- [ ] Confirm proposed five-minute future-clock tolerance.
- [ ] Finalize browser-storage notice and sensitive-notes handling.
- [ ] Define a usable support-resolution route for blocked recovery states.
- [ ] Check installed intake behaviour and deduplication retention assumptions.
- [ ] Define submission-contract compatibility expectations.

Implementation and verification:
- [ ] Implement client-safe recovery record validation and storage operations.
- [ ] Integrate restore gating, immutable retries and explicit cleanup recovery.
- [ ] Test denied storage, write/read-back failures and cleanup failures.
- [ ] Test malformed, expired, incompatible and multiple records.
- [ ] Test accepted-state preservation when cleanup fails.
- [ ] Verify response loss followed by reload and unchanged retry on Preview.
- [ ] Independently verify one persisted inquiry after recovered retry.
- [ ] Verify no dispatch when required recovery persistence fails.

Cross-tab coordination, tab/session-loss recovery and cross-device recovery
remain outside the proposed initial scope. Browser-storage deletion can
remove the evidence needed for duplicate prevention.

No application or database changes were made for this design.
Remaining concurrency, shared-ceiling, airport, dependency, lint, cleanup,
legacy-path, atomic conversion, provider integration and release work is unchanged.
The inquiry-ingestion milestone remains incomplete.

## 17 October 2026 — Recovery Review and WhatsApp Support Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before these changes: 5f3e300.
Production baseline remains main 2e23db2.

Database review:
- [x] Inspect installed intake identity lookup and payload-hash comparison.
- [x] Verify existing lookup has no age-based cutoff.
- [x] Verify identical-retry return precedes the new-submission past-date guard.
- [x] Verify request-ID index is unique and valid.
- [x] Document that inquiry deletion or identity/hash changes affect deduplication.
- [ ] Review external cleanup jobs and establish long-term retention policy.

Support contact and local implementation:
- [x] Record owner-selected business WhatsApp: +880 1842737654.
- [x] Add conflict-state support link: https://wa.me/8801842737654.
- [x] Include no inquiry data or prefilled message in the link.
- [x] Add noopener, noreferrer and no-referrer attributes.
- [x] Keep conflict submission locked and label it Submission Paused.
- [x] Add support styling and keyboard-focus treatment.
- [x] Update local button-label assertion and pass recovery suite.
- [x] Add browser support-link assertions and pass script syntax check.
- [x] Pass separate TypeScript, production build and diff checks.

Immediate follow-up:
- [ ] Deploy the support UI to Preview.
- [ ] Pin the conflict browser test to the updated deployment.
- [ ] Execute support-link and conflict-lock browser assertions.
- [ ] Independently verify one original inquiry after the conflict test.
- [ ] Record Preview evidence without claiming WhatsApp delivery was tested.

Still pending:
- [ ] Define support identity-verification and resolution procedures.
- [ ] Integrate support into expired/blocked reload states when implemented.
- [ ] Finalize proposed storage lifetime and clock tolerance.
- [ ] Implement and verify reload recovery.
- [ ] Reconcile outdated architecture/security documentation.
- [ ] Remaining concurrency, shared-ceiling, airport, dependency, lint,
      cleanup, legacy-path, atomic conversion, provider integration and release work.

No WhatsApp message was sent. Number reachability and support operations
have not been verified. Reload recovery remains a design proposal.
The inquiry-ingestion milestone remains incomplete.

## 17 October 2026 — WhatsApp Support Preview Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Tested implementation: 961e51e.
Preview: https://travelpro-68nj4l8h6-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

- [x] Pin conflict browser test to the updated Preview.
- [x] Verify real conflict response after deliberate forwarded-payload alteration.
- [x] Verify fields stay locked and submission remains disabled.
- [x] Verify disabled submit label is Submission Paused.
- [x] Verify original form details remain displayed.
- [x] Verify tested programmatic submits produce no additional action requests.
- [x] Verify official WhatsApp support link is visible.
- [x] Verify exact URL https://wa.me/8801842737654.
- [x] Verify no query string, fragment or prefilled inquiry data.
- [x] Verify _blank, noopener, noreferrer and no-referrer attributes.
- [x] Verify private Inbox protection before and after the test.
- [x] Verify one database inquiry with original receipt and notes.
- [x] Verify no matching inquiry contains conflicting notes.

Receipt: fdbeda7b-776e-4e26-9fd0-e48beab45860.
Database counts: matching inquiries 1; original receipt 1;
original notes 1; conflicting notes 0.

This supersedes the pending Preview support-link attribute and conflict-lock
checks. The test did not open WhatsApp or send a message.

Still pending:
- [ ] Verify support-number reachability and operational resolution procedures.
- [ ] Mobile and assistive-technology verification of the support UI.
- [ ] Integrate support into expired/blocked reload states when implemented.
- [ ] Finalize recovery lifetime and clock tolerance.
- [ ] Implement and verify reload recovery.
- [ ] Review external cleanup jobs and establish retention policy.
- [ ] Reconcile outdated architecture/security documentation.
- [ ] Remaining concurrency, shared-ceiling, airport, dependency, lint,
      cleanup, legacy-path, atomic conversion, provider integration and release work.

The inquiry-ingestion milestone remains incomplete.

## 17 October 2026 — Backup and File Protection Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 90355df.
Production baseline remains main 2e23db2.

Policy: docs/BACKUP_AND_FILE_PROTECTION.md.
Read this policy at the beginning of future working sessions.

- [x] Document the exact inventory of nine protected untracked local files.
- [x] Document explicit authorization requirements for modifying/removing them.
- [x] Prohibit automated cleanup that could remove protected records.
- [x] Require explicit-path staging and session-close push verification.
- [x] Document single-C-drive risk and GitHub backup coverage limits.
- [x] Define manual encrypted archive and private Google Drive backup procedure.
- [x] Define password separation and archive integrity verification.
- [x] Require downloaded checksum comparison and separate-directory restore test.
- [x] Distinguish policy documentation from verified backup completion.
- [x] Preserve all nine protected files without inspecting their contents.

Pending backup execution:
- [ ] Owner creates an AES-256 encrypted project archive outside the project folder.
- [ ] Verify inclusion of all nine protected files and archive integrity.
- [ ] Upload to private Google Drive and verify restricted sharing.
- [ ] Download and compare archive checksum.
- [ ] Verify decryption and restore into a separate directory.
- [ ] Record verification metadata without passwords or private sharing links.
- [ ] Establish separate database and document-storage backup/recovery procedures.

No encrypted offsite backup has been verified in this session.
No application code or database changes were made for this policy task.

Next application work:
- [ ] Finalize reload recovery lifetime and clock-tolerance decisions.
- [ ] Continue reload recovery implementation and its verification matrix.
- [ ] Preserve all remaining inquiry-ingestion and production release tasks.

## 17 October 2026 — Landing Recovery Storage Module Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before these changes: a3462b5.
Production baseline remains main 2e23db2.

- [x] Record owner-selected 24-hour lifetime and five-minute clock tolerance.
- [x] Add client-safe recovery record validation and storage helpers.
- [x] Preserve exact snapshot strings and original expiry.
- [x] Distinguish unavailable storage from empty storage.
- [x] Refuse new persistence over an existing recognized record.
- [x] Verify new writes and outcome markers by reading them back.
- [x] Verify matching pending identity and snapshot before retry.
- [x] Add conditional cleanup with verified absence.
- [x] Preserve unrelated storage keys.
- [x] Add minimal accepted, conflict and expired outcome markers.
- [x] Verify confirmed acceptance can be recorded after pending expiry.
- [x] Test malformed records, expiry boundaries and changed-record guards.
- [x] Test storage failures and silently ignored writes/removals.
- [x] Pass local fake-storage suite and separate TypeScript check.
- [x] Pass tracked diff formatting checks.

Tests use fake storage. No real browser storage, network requests or
database writes were used. The module is not integrated into the form.

Immediate follow-up:
- [ ] Implement conservative privacy cleanup for malformed/incompatible records.
- [ ] Verify historical-key and multiple-record handling.
- [ ] Integrate restoration gating and persistence before network dispatch.
- [ ] Restore pending submissions as unknown without automatic submission.
- [ ] Preserve exact request identity and snapshot during recovered retries.
- [ ] Preserve confirmed acceptance when storage operations fail.
- [ ] Implement verified cleanup and blocked-state support messaging.
- [ ] Test component integration and storage-failure paths.
- [ ] Verify response loss, reload and unchanged retry on Preview.
- [ ] Independently verify exactly one persisted inquiry.
- [ ] Verify failed required persistence prevents action dispatch.

Limits:
- Storage operations do not establish atomic cross-tab coordination.
- Stored receipt markers are not fresh server verification or authorization.
- Reload, navigation and session-loss behaviour remain unverified.
- No deployment or database schema changes were made.

Preserve all nine protected untracked audit/backup files.
Encrypted offsite backup execution remains unverified.
Remaining inquiry-ingestion and production release work is unchanged.

## 17 October 2026 — Recovery Privacy Cleanup Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 0560f0b.
Production baseline remains main 2e23db2.

- [x] Add conditional quarantine of a single parser-rejected record.
- [x] Replace rejected content with minimal blocked-state metadata.
- [x] Recheck recognized keys before writing and verify the saved marker.
- [x] Preserve valid pending records and unrelated storage.
- [x] Test malformed and incompatible record cleanup.
- [x] Test changes during inspection and failed or ignored writes.
- [x] Pass local fake-storage suite, TypeScript and diff checks.

The helper is not integrated into the form. Successful quarantine does
not permit a fresh submission. Failed replacement can leave original
data in storage. This is not secure erasure or atomic cross-tab protection.

Next:
- [ ] Verify historical-key and multiple-record scenarios.
- [ ] Integrate restore gating and persistence before action dispatch.
- [ ] Integrate blocked-state support and storage-failure handling.
- [ ] Preserve confirmed acceptance when storage operations fail.
- [ ] Test component integration and real browser reload recovery.
- [ ] Independently verify one inquiry after a recovered retry.

No real browser storage, network or database writes were used by these tests.
No deployment or database schema changes were made.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
Remaining milestone and production release work is unchanged.

## 17 October 2026 — Recovery Recognized-Key Compatibility Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 7223e36.

- [x] Test a synthetic historical key in the test VM registry.
- [x] Verify its record restores and blocks new pending persistence.
- [x] Verify multiple recognized records block restoration.
- [x] Verify persistence, retry verification, cleanup, outcome replacement
      and quarantine refuse the multiple-record state without mutations.
- [x] Restore the test registry after each scenario.
- [x] Pass local fake-storage suite and diff formatting checks.

This completes the tested recognized-key and multiple-record guards.
Production still recognizes only v1. Real historical-schema migration
is not established by these synthetic-key tests.

Next:
- [ ] Integrate restoration gating and persistence before action dispatch.
- [ ] Integrate immutable recovered retries and blocked-state support.
- [ ] Preserve confirmed acceptance during storage failures.
- [ ] Test component integration and browser reload recovery.
- [ ] Independently verify one inquiry after recovered retry.

No production module changes, real browser storage, network or database writes.
Preserve all nine protected files.
Encrypted offsite backup execution remains unverified.
Remaining milestone and production release work is unchanged.

## 18 October 2026 — Landing Reload Recovery Integration Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 123379d.
Production baseline remains main 2e23db2.

- [x] Gate interaction until local recovery restoration finishes.
- [x] Persist and verify the exact snapshot before action dispatch.
- [x] Restore pending submissions as unknown without automatic dispatch.
- [x] Preserve request identity and snapshot during recovered retries.
- [x] Block missing or changed records after known uncertainty.
- [x] Integrate rejected-record quarantine attempts.
- [x] Preserve confirmed acceptance during cleanup failure.
- [x] Require verified cleanup before fresh submission or rejection editing.
- [x] Add local-only recovery and cleanup retry buttons.
- [x] Integrate blocked-state WhatsApp support and storage privacy notice.
- [x] Label restored receipt markers as locally saved information.
- [x] Update component harness to execute the actual storage module.
- [x] Pass existing scenarios and eight new local integration scenarios.
- [x] Pass storage and Server Action regression suites.
- [x] Pass separate TypeScript, production build and diff checks.

Local component tests mock React hooks, effects, browser storage and
Server Action. They do not establish real browser or DOM behaviour.
Build skips linting. No database schema changes were made.

Immediate follow-up:
- [ ] Deploy the implementation to Preview and verify its source commit.
- [ ] Add a bounded response-loss, reload and unchanged-retry browser test.
- [ ] Verify no automatic action dispatch during restoration.
- [ ] Verify recovered retry preserves original identity and fields.
- [ ] Verify receipt matches the original server acceptance.
- [ ] Independently verify exactly one matching database inquiry.
- [ ] Verify browser storage failure prevents action dispatch.
- [ ] Record Preview evidence and remaining limitations.

Still pending:
- [ ] Broader browser coverage of cleanup failures and blocked states.
- [ ] Lint verification and recovery UI accessibility checks.
- [ ] Support-resolution procedures and external retention-job review.
- [ ] Remaining concurrency, shared-ceiling, timeout, airport, dependency,
      cleanup, legacy-path, atomic conversion, provider and release work.

Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 18 October 2026 — Landing Reload Recovery Preview Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Tested implementation: d48ffd0.
Preview: https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-reload-recovery.mjs.

- [x] Add a separate bounded browser test pinned to the new Preview.
- [x] Confirm server acceptance before deliberately discarding its response.
- [x] Verify pending storage matches the captured identity and fields.
- [x] Reload and restore locked details with explicit retry available.
- [x] Verify the stored record and expiry remain unchanged across reload.
- [x] Observe no automatic action during the bounded restoration check.
- [x] Verify explicit retry preserves request ID and all serialized fields.
- [x] Verify duplicate response returns the original receipt.
- [x] Verify acceptance clears recovery storage and resets/unlocks the form.
- [x] Verify tested in-flight submit events create no extra action requests.
- [x] Verify private Inbox protection before and after intake.
- [x] Independently verify one inquiry with the original receipt.
- [x] Pass browser test syntax check.

Receipt: f5e35c6f-46b6-4bb9-9bf2-7443844eadb8.
Matching inquiries: 1; matching original receipt: 1.

This completes Preview verification of the controlled same-tab reload
and unchanged-retry flow. It does not establish universal duplicate prevention.

Still pending:
- [ ] Browser storage-failure verification preventing action dispatch.
- [ ] Browser cleanup-failure and broader blocked-state verification.
- [ ] Mobile, accessibility and navigation verification.
- [ ] Tab/session-loss and cross-tab handling decisions.
- [ ] Support-resolution procedures and external retention-job review.
- [ ] Remaining concurrency, shared-ceiling, timeout, airport, dependency,
      lint, cleanup, legacy-path, atomic conversion, provider and release work.

No production release or database schema changes were performed.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 18 October 2026 — Browser Storage-Failure Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 781d4c1.
Tested application implementation: d48ffd0.
Preview: https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-storage-failure.mjs.

- [x] Add separate browser test with fresh contexts and pinned origin.
- [x] Inject recovery-key read denial, write failure and ignored write.
- [x] Verify all injected fault modes are exercised.
- [x] Verify restoration or submission remains paused as appropriate.
- [x] Exercise programmatic submit events while paused.
- [x] Observe zero non-GET browser requests in every scenario.
- [x] Guard against forwarding any inquiry POST.
- [x] Verify read/write local recovery unlocks without submission.
- [x] Verify private Inbox protection before and after each scenario.
- [x] Pass script syntax and tracked diff formatting checks.

This completes the tested controlled storage-failure dispatch checks.
It does not cover every native browser failure mode.
No inquiry POST was forwarded and no database count query was performed.

Still pending:
- [ ] Browser cleanup-failure and broader blocked-state verification.
- [ ] SessionStorage getter denial and read-back exception browser scenarios.
- [ ] Mobile, accessibility and navigation verification.
- [ ] Tab/session-loss and cross-tab handling decisions.
- [ ] Support-resolution procedures and external retention-job review.
- [ ] Remaining concurrency, shared-ceiling, timeout, airport, dependency,
      lint, cleanup, legacy-path, atomic conversion, provider and release work.

No production release or database schema changes were made.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 18 October 2026 — Accepted-Inquiry Cleanup-Failure Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: e3989e0.
Tested application implementation: d48ffd0.
Preview: https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-cleanup-failure.mjs.

- [x] Inject recovery-key removeItem failure in a fresh browser context.
- [x] Forward at most one inquiry action.
- [x] Confirm real server acceptance and preserve its displayed receipt.
- [x] Verify cleanup failure locks fields and prevents fresh submission.
- [x] Verify accepted marker contains no submitted snapshot.
- [x] Verify repeated submits produce no additional action requests.
- [x] Verify failed local cleanup retry remains paused.
- [x] Remove the fault and verify successful local cleanup.
- [x] Verify cleanup preserves the receipt and unlocks the form.
- [x] Observe exactly one non-GET request and one forwarded action.
- [x] Verify private Inbox protection before and after intake.
- [x] Independently verify one inquiry with the original receipt.
- [x] Pass script syntax and tracked diff formatting checks.

Receipt: aef0f116-0036-4176-b754-c88fefb7a2ce.
Matching inquiries: 1; matching original receipt: 1.

This completes the tested accepted-inquiry removeItem failure scenario.
It does not establish behaviour for every cleanup or storage failure.

Still pending:
- [ ] Browser verification of rejected-outcome cleanup failure.
- [ ] Marker-write and cleanup read-back failure browser scenarios.
- [ ] Reload during failed cleanup and broader blocked-state verification.
- [ ] Mobile, accessibility, navigation and cross-tab handling.
- [ ] Support-resolution procedures and external retention-job review.
- [ ] Remaining concurrency, shared-ceiling, timeout, airport, dependency,
      lint, cleanup, legacy-path, atomic conversion, provider and release work.

No production release or database schema changes were performed.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 18 October 2026 — Rejected-Inquiry Cleanup-Failure Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 273ad3c.
Tested application implementation: d48ffd0.
Preview: https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-rejected-cleanup.mjs.

- [x] Inject recovery-key removeItem failure in a fresh browser context.
- [x] Confirm real validation rejection for a past departure date.
- [x] Verify failed cleanup retains and locks submitted details.
- [x] Verify failed local cleanup retry preserves the pending record.
- [x] Verify repeated submits produce no additional action requests.
- [x] Restore removal and verify local cleanup unlocks editing.
- [x] Verify local cleanup retries do not dispatch inquiry actions.
- [x] Correct departure and notes, then submit with a fresh request ID.
- [x] Verify corrected submission is accepted and recovery storage clears.
- [x] Observe exactly two non-GET requests and two forwarded actions.
- [x] Verify private Inbox protection before and after intake.
- [x] Independently verify one inquiry with the successful receipt.
- [x] Verify departureDate is absent and corrected notes match exactly.
- [x] Pass script syntax and tracked diff formatting checks.

Receipt: d6cba5ed-1961-414b-9a2e-6102cc70e5c8.
Database counts: matching inquiries 1; receipt 1;
without departure 1; corrected notes 1.

This completes the tested confirmed-rejection cleanup-failure scenario.
There was no earlier unknown outcome. Reload during failed cleanup
and other storage failure modes are not established by this test.

Still pending:
- [ ] Reload during failed cleanup and broader blocked-state verification.
- [ ] Marker-write and cleanup read-back failure browser scenarios.
- [ ] Mobile, accessibility, navigation and cross-tab handling.
- [ ] Support-resolution procedures and external retention-job review.
- [ ] Remaining concurrency, shared-ceiling, timeout, airport, dependency,
      lint, cleanup, legacy-path, atomic conversion, provider and release work.

No production release or database schema changes were performed.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 18 October 2026 — Accepted Cleanup-Failure Reload Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 946dc72.
Tested application implementation: d48ffd0.
Preview: https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-cleanup-reload.mjs.

- [x] Add a separate browser test for reload during failed acceptance cleanup.
- [x] Confirm one real inquiry acceptance with removal failure injected.
- [x] Verify receipt remains visible and stored marker has no snapshot.
- [x] Verify failed cleanup retry and repeated submits send no extra action.
- [x] Reload and verify the accepted marker remains unchanged.
- [x] Verify restored receipt is labeled local and not freshly server-verified.
- [x] Verify restored cleanup state blocks submission.
- [x] Observe no automatic action during the bounded restoration check.
- [x] Restore removal and complete local cleanup without another action.
- [x] Verify receipt remains visible and the form unlocks.
- [x] Observe exactly one non-GET request and one forwarded action.
- [x] Verify private Inbox protection before and after intake.
- [x] Independently verify one inquiry with the original receipt.
- [x] Pass script syntax and tracked diff formatting checks.

Receipt: 4b361bf9-12b9-4863-8a91-a4c022d11b9d.
Matching inquiries: 1; matching original receipt: 1.

This completes the tested reload-during-accepted-cleanup-failure flow.
A restored receipt marker is not fresh server verification or authorization.

Still pending:
- [ ] Reload after rejected-outcome cleanup failure.
- [ ] Marker-write and cleanup read-back failure browser scenarios.
- [ ] Broader blocked-state, mobile, accessibility and navigation verification.
- [ ] Tab/session-loss and cross-tab handling decisions.
- [ ] Support-resolution procedures and external retention-job review.
- [ ] Remaining concurrency, shared-ceiling, timeout, airport, dependency,
      lint, cleanup, legacy-path, atomic conversion, provider and release work.

No production release or database schema changes were performed.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 18 October 2026 — Rejected Cleanup-Failure Reload Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: a73f931.
Tested application implementation: d48ffd0.
Preview: https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-rejected-cleanup-reload.mjs.

- [x] Add a separate bounded browser test for rejected cleanup followed by reload.
- [x] Confirm initial real validation rejection with removal failure injected.
- [x] Verify cleanup failure retains and locks the submitted details.
- [x] Reload and restore the pending record as unknown.
- [x] Observe no automatic action during the bounded restoration check.
- [x] Verify Retry Same Inquiry is available without a local cleanup button.
- [x] Restore removal availability and explicitly retry the unchanged inquiry.
- [x] Verify request ID and all captured fields remain unchanged.
- [x] Confirm a second real rejection without unlocking or clearing uncertainty.
- [x] Verify stored identity, snapshot and expiry remain unchanged.
- [x] Observe exactly two non-GET requests and two forwarded actions.
- [x] Verify private Inbox protection before and after the test.
- [x] Independently verify zero matching database inquiries.
- [x] Pass script syntax and tracked diff formatting checks.

Matching inquiries: 0.

This completes the tested conservative restoration after rejected-attempt
cleanup failure. Unknown restoration is not evidence of server acceptance.
A usable resolution path for this state remains unresolved.

Still pending:
- [ ] Marker-write and cleanup read-back failure browser scenarios.
- [ ] Broader blocked-state, mobile, accessibility and navigation verification.
- [ ] Tab/session-loss and cross-tab handling decisions.
- [ ] Support-resolution procedures, including unresolved restored attempts.
- [ ] External retention-job review.
- [ ] Remaining concurrency, shared-ceiling, timeout, airport, dependency,
      lint, cleanup, legacy-path, atomic conversion, provider and release work.

No production release or database schema changes were performed.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 18 October 2026 — Accepted Marker-Write Failure Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 58d074f.
Tested application implementation: d48ffd0.
Preview: https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-marker-write-failure.mjs.

- [x] Add a separate bounded browser test for accepted marker-write failure.
- [x] Permit initial pending persistence and one forwarded inquiry action.
- [x] Inject accepted-marker setItem failure and fallback removeItem failure.
- [x] Confirm both injected faults execute.
- [x] Verify confirmed receipt remains visible and new submission stays locked.
- [x] Verify the original pending snapshot remains after failed replacement.
- [x] Verify failed local cleanup retry preserves the record.
- [x] Verify tested repeated submits produce no additional action requests.
- [x] Restore removal while leaving marker-write failure active.
- [x] Verify local cleanup removes the record without another inquiry action.
- [x] Verify receipt remains visible and the form unlocks.
- [x] Observe exactly one non-GET request and one forwarded action.
- [x] Verify private Inbox protection before and after intake.
- [x] Independently verify one inquiry with the original receipt.
- [x] Pass script syntax and tracked diff formatting checks.

Receipt: 30c77368-a35f-450d-aa77-97e10e297daa.
Matching inquiries: 1; matching original receipt: 1.

This completes the tested combined marker-write and fallback-removal failure.
Personal data remained in the pending snapshot until removal succeeded.
Marker-write failure alone may allow successful fallback cleanup.

Still pending:
- [ ] Reload during combined marker-write and cleanup failures.
- [ ] Cleanup read-back failure browser scenarios.
- [ ] Broader blocked-state, mobile, accessibility and navigation verification.
- [ ] Tab/session-loss and cross-tab handling decisions.
- [ ] Support-resolution procedures and external retention-job review.
- [ ] Remaining concurrency, shared-ceiling, timeout, airport, dependency,
      lint, cleanup, legacy-path, atomic conversion, provider and release work.

No production release or database schema changes were performed.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 18 October 2026 — Combined Marker-Failure Reload Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: d9808bb.
Tested application implementation: d48ffd0.
Preview: https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-marker-failure-reload.mjs.

- [x] Add a separate bounded combined-failure reload browser test.
- [x] Accept one inquiry with marker writes and fallback removal failing.
- [x] Verify confirmed receipt remains visible while submission is paused.
- [x] Verify the pending snapshot remains after failed marker replacement.
- [x] Verify failed local cleanup retry and repeated submits send no extra action.
- [x] Reload and restore the unchanged pending record as unknown.
- [x] Verify fields stay locked and no automatic action is observed.
- [x] Restore storage operations before explicit unchanged retry.
- [x] Verify retry preserves request ID and all serialized fields.
- [x] Verify real duplicate response returns the original receipt.
- [x] Verify duplicate acceptance clears storage and resets/unlocks the form.
- [x] Observe exactly two non-GET requests and two forwarded actions.
- [x] Verify private Inbox protection before and after intake.
- [x] Independently verify one inquiry with the original receipt.
- [x] Pass script syntax and tracked diff formatting checks.

Receipt: 96ebbf60-a37a-4363-973d-ad41c8878ed0.
Matching inquiries: 1; matching original receipt: 1.

An initial run stopped before browser setup due to insufficient fixed-window
time. The subsequent controlled run passed.

Personal data remained in the pending snapshot until successful cleanup.
Storage faults were removed before the explicit inquiry retry.
This does not establish recovery after storage/session loss or behaviour
when both injected faults persist during retry.

Still pending:
- [ ] Cleanup read-back failure browser scenarios.
- [ ] Broader blocked-state, mobile, accessibility and navigation verification.
- [ ] Tab/session-loss and cross-tab handling decisions.
- [ ] Support-resolution procedures and external retention-job review.
- [ ] Remaining concurrency, shared-ceiling, timeout, airport, dependency,
      lint, cleanup, legacy-path, atomic conversion, provider and release work.

No production release or database schema changes were performed.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 18 October 2026 — Cleanup Read-Back Failure Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 4b5eec8.
Tested application implementation: d48ffd0.
Preview: https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-cleanup-readback-failure.mjs.

- [x] Add a separate bounded cleanup read-back failure browser test.
- [x] Accept one real synthetic inquiry.
- [x] Allow recovery-key removal, then inject absence-verification read failure.
- [x] Independently assert physical absence through a test-only original getter.
- [x] Verify failed verification keeps submission and fields locked.
- [x] Verify confirmed receipt remains visible.
- [x] Verify repeated submits and failed local cleanup retry send no extra action.
- [x] Verify local retry exercises the read fault again.
- [x] Restore reads and verify already-empty storage through local cleanup.
- [x] Verify receipt remains visible and the form unlocks.
- [x] Observe exactly one non-GET request and one forwarded action.
- [x] Verify private Inbox protection before and after intake.
- [x] Independently verify one inquiry with the original receipt.
- [x] Pass script syntax and tracked diff formatting checks.

Receipt: c24cfcba-f2f3-4c51-8ff9-4e626e36fc81.
Matching inquiries: 1; matching original receipt: 1.

This completes the tested read exception after successful cleanup removal.
Physical removal did not permit fresh submission until absence was verified.

Still pending:
- [ ] Broader blocked-state, mobile, accessibility and navigation verification.
- [ ] Tab/session-loss and cross-tab handling decisions.
- [ ] Support-resolution procedures and external retention-job review.
- [ ] Remaining concurrency, shared-ceiling, timeout, airport, dependency,
      lint, cleanup, legacy-path, atomic conversion, provider and release work.

Reload while reads remain unavailable, silently ignored removal and changed-record
cleanup races were not established by this browser test.
No production release or database schema changes were performed.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 18 October 2026 — Legacy Intake Review and Retirement Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before these changes: 021cf56.
Production baseline remains main 2e23db2.

- [x] Inspect legacy route, middleware, parser and database client.
- [x] Inspect installed inquiry grants, policies, constraints and triggers.
- [x] Identify anonymous column INSERT access outside the new intake RPC.
- [x] Identify public parser/resource exposure before write authorization.
- [x] Confirm with owner that the legacy endpoint has no active consumers.
- [x] Document findings in docs/LEGACY_INTAKE_SECURITY_REVIEW.md.
- [x] Replace legacy POST locally with 410 Gone and no-store response.
- [x] Remove parser and database dependencies from the retired route.
- [x] Update compatibility decision and architecture references.
- [x] Pass separate TypeScript, production build and diff checks.

Immediate follow-up:
- [ ] Commit and push the endpoint retirement checkpoint.
- [ ] Verify the new Preview source commit and deployed 410 response.
- [ ] Prepare anonymous INSERT policy/grant removal migration.
- [ ] Review shared-database production compatibility before applying it.
- [ ] Verify anonymous table and column INSERT privileges are absent.
- [ ] Verify intended privileged intake and owner access remain functional.

Atomic conversion:
- [ ] Replace separate case/inquiry/audit writes with an authorized atomic RPC.
- [ ] Validate owner-reviewed fields, client compatibility and eligibility.
- [ ] Lock the inquiry and handle identical/conflicting conversion retries.
- [ ] Verify rollback, authorization and concurrent conversion behaviour.

Installed anonymous INSERT access remains unresolved.
Local endpoint retirement is not yet deployment-verified.
Build skips linting; lint verification remains pending.
No database schema changes or production release were performed.

Do not expand browser storage or recovery tests.
Prioritize legacy intake remediation and reviewed atomic conversion.
Preserve all nine protected untracked files.
Encrypted offsite backup execution remains unverified.
The inquiry-ingestion milestone remains incomplete.

## 19 October 2026 — Legacy Retirement Deployment Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 19e5283.

- [x] Verify retired endpoint on Preview commit 19e5283.
- [x] Verify malformed JSON POST returns 410 and retirement response code.
- [x] Verify Cache-Control: no-store.
- [x] Confirm current production is Ready on main commit 2e23db2.
- [x] Identify production /inquire dependency on /api/v1/inquiry.
- [x] Document correction to the earlier no-consumer assumption.

Release blocker:
- [ ] Prepare a compatible production intake cutover.
- [ ] Prepare anonymous table/column INSERT revocation and policy removal.
- [ ] Apply permission changes only in the coordinated cutover sequence.
- [ ] Verify intended server intake and owner access after cutover.
- [ ] Complete reviewed atomic inquiry-to-case conversion and necessary checks.

Preview retirement does not establish production retirement.
Anonymous direct INSERT exposure remains unresolved.
No production deployment or database permissions were changed.
Do not expand browser storage/recovery tests.
Preserve all nine protected files.
Encrypted offsite backup execution remains unverified.

## 19 October 2026 — Atomic Inquiry Conversion Draft Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: cedf4b0.

Draft:
supabase/migrations/20261018184518_reviewed_atomic_inquiry_conversion.sql.

- [x] Inspect Inbox review inputs and existing conversion action.
- [x] Inspect installed case schema, client-type mapping, RLS and audit RPC.
- [x] Generate migration with pinned Supabase CLI 2.121.0.
- [x] Draft owner-authorized SECURITY INVOKER conversion RPC.
- [x] Draft reviewed-field validation and client compatibility checks.
- [x] Draft inquiry locking, retry identity and conflicting-retry handling.
- [x] Draft transactional case creation, inquiry linkage and audit.
- [x] Add update-row-count and post-lock time guards.

Not applied or execution-tested:
- [ ] Establish an isolated PostgreSQL/Supabase test environment.
- [ ] Verify migration and function compilation.
- [ ] Test owner/non-owner/anonymous authorization.
- [ ] Test reviewed-field validation and service/client compatibility.
- [ ] Test success, identical retry and conflicting conversion requests.
- [ ] Prove audit failure rolls back case and inquiry changes.
- [ ] Test concurrent conversion behaviour and identity uniqueness.
- [ ] Integrate explicit owner review UI and RPC-backed Server Action.
- [ ] Run scoped application and owner workflow verification.

Environment blocker:
- docker and psql were not found on the laptop PATH.
- No confirmed disposable Supabase test project is available.
- Do not modify existing paused projects as an assumed test environment.
- Do not apply the draft to the shared production/Preview database.

Anonymous INSERT revocation remains tied to coordinated production intake cutover.
No database changes or production deployment were performed.
Do not expand browser storage/recovery tests.
Preserve all nine protected files.
Encrypted offsite backup execution remains unverified.

## 20 October 2026: Isolated Atomic Conversion Database Test Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Source checkpoint: 18a0471.
Test project: tpfipndxhroliabwlgyb only.

Applied 28 migrations through 20261018184518 in the isolated project.
Replay included demo data. Two temporary scheduler migration copies used
transactional cron.alter_job(active := false); originals remain unchanged.
Readback confirmed both jobs inactive and expected conversion RPC permissions.

Owner-run tests passed for authorization rejection, corporate success,
identical retry, conflicting retry, eight invalid payloads, one client
mismatch direction, audit-failure rollback and real identical concurrency.
Direct concurrency observed B blocked by A, same returned case, one audit.
Detailed evidence and limits: supabase/tests/atomic-inquiry-conversion/README.md.

Remaining: concurrent conflicts, cross-inquiry request identity uniqueness,
additional eligibility/client coverage, reviewed UI/action integration,
coordinated production cutover and anonymous INSERT remediation.

No shared production/Preview database or deployment changes were performed.
Synthetic concurrency evidence remains in the isolated database.
Seven test scripts added; application dependencies were not changed.
Milestone incomplete; not release-ready.
Preserve all nine protected files. Encrypted offsite backup remains unverified.

## 20 October 2026: Concurrent Conflict Test Passed

Branch: feature/multi-channel-inquiry-ingestion.
Previous pushed checkpoint: 071fedc.
Isolated test project: tpfipndxhroliabwlgyb.

Real concurrent same-inquiry/same-request-ID/different-notes test passed.
Observed B blocked by A; after A commit, B received expected SQLSTATE 23505.
Original review and case notes remained unchanged; one case and one audit.
Runner and exact evidence:
supabase/tests/atomic-inquiry-conversion/README.md
supabase/tests/atomic-inquiry-conversion/concurrent-conflicting-payload.cjs

Still pending: concurrent different request identities, cross-inquiry identity
uniqueness, remaining eligibility/client checks, reviewed UI/action integration
and coordinated production intake/permission cutover.
No production database or deployment changes were performed by this test.
Preserve all nine protected files. Encrypted offsite backup remains unverified.
Milestone incomplete; not release-ready.

## 20 October 2026: Cross-Inquiry Uniqueness Tests Passed

Branch: feature/multi-channel-inquiry-ingestion.
Previous pushed checkpoint: f26e54f.
Isolated test project: tpfipndxhroliabwlgyb only.

Sequential cross-inquiry request-ID rejection passed with unchanged loser state.
Concurrent cross-inquiry collision passed with observed lock blocking,
SQLSTATE 23505 from inquiries_conversion_request_id_unique, and loser
case/linkage/audit rollback verified inside its transaction after savepoint
recovery. Winner readback showed one request owner, one case and one audit.
Both owner-run tests returned exit code 0.

Scripts and exact evidence:
supabase/tests/atomic-inquiry-conversion/README.md
supabase/tests/atomic-inquiry-conversion/cross-inquiry-uniqueness.sql
supabase/tests/atomic-inquiry-conversion/concurrent-cross-inquiry.cjs

Remaining: concurrent same-inquiry different request IDs, remaining
eligibility/client checks, owner-reviewed UI/action integration and
coordinated production intake/anonymous INSERT permission cutover.
No shared database changes or production deployment were performed here.
Preserve all nine protected files. Encrypted offsite backup remains unverified.
Milestone incomplete; not release-ready.
