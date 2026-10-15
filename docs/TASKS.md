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
