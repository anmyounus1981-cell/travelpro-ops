# TravelPro Ops — Release Memory

## 11 October 2026: PR #16 preview browser verification

Production baseline: main 2e23db2. PR #16 implements Individual / Retail returning-traveller reuse and typed Case Intake account selection. PR #16 merged and owner-session production verification completed.

Owner-guided tests passed in the authenticated preview session:

- Case Intake filters Corporate and Individual / Retail accounts separately.
- Individual account RETAIL RETURNING TEST 20261011 created; passport lookup returned no match before creation and the existing profile afterward.
- Traveller SYNTHETIC RETAIL TEST, ID 8dfc158a-6bc1-4918-9373-dc689fb6bc13, passport RTTEST261011, reviewed and verified.
- Same profile assigned to TP-261011-D020 (DAC-BKK, 2026-11-15) and TP-261011-F6C8 (DAC-SIN, 2026-12-10), both ADT, age 36.
- Synthetic passport image uploaded; draft 6f7dafa2-7dac-4a65-b3be-8e04767de1cb explicitly confirmed and linked to the existing verified profile.
- Directory remained at 15 travellers with one SYNTHETIC RETAIL TEST entry.
- Both case assignments remained in Trip History after draft confirmation.
- Refresh retained confirmed status; UI reported: This draft is confirmed. Confirmation is unavailable.

Prior automated validation: TypeScript, production build, formatting checks and rollback SQL tests for identity, account isolation, multi-trip reuse, field mismatch rejection, permissions, identical retries and audit rollback passed. Existing database advisor findings are recorded in supabase/tests/returning-traveller/README.md.

Migration 20261011084315_individual_returning_travellers.sql is applied to the connected Supabase project. Browser confirmation guard and SQL retry checks are separate verification evidence.

Production deployment FyzRkFPhrueg4zFBwZyhxPHxKsVi was Ready on main 2e23db2. Owner verified account filtering, both trip assignments, and confirmed-draft guard at the deployment URL; canonical travelpro-ops.vercel.app displayed the new selector after refresh.

Next: Multi-Channel Client Query Ingestion on feature/multi-channel-inquiry-ingestion. Implementation contract: docs/INQUIRY_INGESTION_PLAN.md. No channel credentials, provider connections or new webhook route have been activated by this documentation checkpoint. Payment verification and financial/GDS actions remain manual.
## 12 October 2026: Inquiry Webhook Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed commit: a4ce25b.
Production application remains main 2e23db2.

Migration 20261011144826_multi_channel_inquiry_intake.sql applied
successfully to the shared Supabase database. Local and remote migration
history match.

Verified:
- Rollback SQL checks: execution permissions, intake, identical retries,
  conflicting retries, delayed retries, and provider account isolation.
- Nine local webhook checks passed without intake database writes.
- Preview unsigned requests rejected with 401.
- Valid signatures with unauthorized accounts rejected with 403.
- Synthetic allowed-account inquiry accepted without automatic client
  matching or case creation.
- Identical retry returned the same inquiry ID with duplicate=true.
- Changed payload under the same identity rejected with 409.
- Original saved message remained intact; status=new; client/case links NULL.
- Owner Inbox displays the synthetic inquiry once.

Synthetic inquiry ID: 0bd0bc17-5b25-4a54-897d-ccf82bffc3fa.
Service type: consultation. Source: whatsapp.
This was a signed synthetic HTTP test, not a live WhatsApp integration.

Preview branch configuration:
- SUPABASE_SECRET_KEY
- INQUIRY_WEBHOOK_SECRET
- INQUIRY_WEBHOOK_ALLOWED_ACCOUNTS
No secret values are recorded here.

Pending:
- Concurrent-request tests and durable rate limiting.
- Public Landing Page intake.
- Inbox service type and validated submitted-field display.
- Replace misleading Corporate client labels for individual inquiries.
- Disable unsupported non-flight conversion in UI and server action.
- Reviewed atomic inquiry-to-case conversion.
- Real n8n / Meta / WhatsApp provider setup and verification.
- Milestone PR review, production configuration and release verification.

Parsing remains pending for the new intake path.
Do not use the consultation inquiry's existing Convert to Active Case button.
Payments and GDS actions remain manual.
## 13 October 2026: Inbox Guard and Display Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed commit and verified Preview: 6a74e37.
Production application remains main 2e23db2.

Changes:
- 06e9d8c: server guard rejects non-flight and dismissed inquiries;
  Inbox disables their conversion controls.
- e1143ba: Inbox displays client type and service type;
  company suggestion field appears only for corporate inquiries.
- 6a74e37: empty deployment trigger after a temporary GitHub
  secondary rate limit prevented deployment of e1143ba.

Owner-guided Preview verification:
- Synthetic consultation inquiry displays Individual / Retail.
- Service type displays Consultation.
- No Corporate client or Company name suggestion field on that card.
- Client selector and ADT/CHD/INF fields verified disabled on 06e9d8c.
- Conversion button verified disabled on 06e9d8c.
- Latest Preview retains the conversion-unavailable label.
- Legacy inquiries display Not recorded (legacy inquiry).

TypeScript, production build and diff formatting checks passed.
Direct server-action rejection tests remain pending.
These checks do not establish atomic conversion or concurrency safety.

Still pending:
- Validated submitted-field display.
- Public Landing Page intake and durable rate limiting.
- Concurrent-request tests.
- Reviewed atomic inquiry-to-case conversion.
- Real n8n / Meta / WhatsApp integration.
- Milestone review and production release.

## 13 October 2026: Submitted-Field Display Verification

Latest pushed commit and verified Preview: 5a3c0b4.
Branch: feature/multi-channel-inquiry-ingestion.
Production application remains main 2e23db2.

Owner-guided Preview verification passed:
- Synthetic inquiry displays its original submitted name and email.
- Missing phone and travel values display Not provided.
- Validated submitted fields appear separately from AI-parsed details.
- Legacy inquiries display an explicit missing submitted-record message.
- Consultation inquiry retains the conversion-unavailable label.

TypeScript, production build and formatting checks passed.
This supersedes the pending submitted-field display item.

Remaining milestone work:
- Direct server-action rejection tests.
- Concurrent-request verification and durable rate limiting.
- Public Landing Page intake.
- Reviewed atomic inquiry-to-case conversion.
- Real n8n / Meta / WhatsApp integration.
- Milestone review and production release.

## 13 October 2026: Durable Rate-Limit Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed application commit: f2248fc.
Production application remains main 2e23db2.

Migration 20261012191447_inquiry_intake_rate_limits.sql applied
to the shared database; local and remote migration history matched.

Completed:
- Server-only rate counters and atomic fixed-window consumption.
- Rollback tests passed for permissions, allowance, denial,
  retry delay, scope isolation, old-window reset and
  newer-window preservation.
- Keyed bucket identifiers avoid storing raw contact/account identities.
- Webhook limiter runs after signature and account authorization.
- Landing Page Server Action implemented with validation,
  honeypot, rate checks and intake receipt handling.
- TypeScript, build and nine local webhook regression checks passed.

Owner-executed Preview integration:
- Synthetic rate-limited inquiry accepted.
- Inquiry ID: 281c9438-6daa-4b6f-9964-b6a0aae8dd07.
- Shared and account counters persisted.
- 65 retries using 10 concurrent workers in one minute:
  60 accepted duplicate retries and five HTTP 429 responses.
- Retry-After validated; all accepted retries retained the same receipt.
- Database event-identity query confirmed one matching inquiry.

Preview test script:
scripts/test-preview-inquiry-rate-limit.mjs.
No secret values are stored in the script or documentation.

Limits currently implemented:
- Landing Page: 100 shared attempts per 15 minutes;
  five attempts per supplied normalized email or phone.
- Webhook: 500 shared attempts per minute;
  60 attempts per configured source/provider/account.
These are initial limits and count retries.

Pending:
- Landing Page form wiring and anonymous end-to-end tests.
- Landing contact-limit integration tests and shared-ceiling tests.
- Rate-counter retention cleanup.
- Signed-request protections do not establish protection for legacy
  /api/v1/inquiry or direct anonymous insert paths.
- Atomic reviewed inquiry-to-case conversion and its tests.
- Real n8n / Meta / WhatsApp integration.
- Documentation reconciliation and production release.

## 14 October 2026: Landing Form and Anonymous Preview Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed application commit: 4de5c1d.
Preview deployment reported Ready.
Production baseline remains main 2e23db2; this milestone is not merged.

Implementation:
- b496798: wire the Travel Inquiry form to the rate-limited Server Action.
- Add four service choices and Corporate / Individual conditional fields.
- Keep travel details and passenger count optional; cabin starts unselected.
- Add a honeypot, field-length limits and submission-time field disabling.
- 4de5c1d: explicitly allow /inquire in the middleware public-route list.
- TypeScript, production build and diff checks passed for form changes.
- TypeScript and diff checks passed for the public-route change.
- Build configuration skips linting; lint verification is not established.

Owner-guided Preview evidence:
- Corporate selection shows Company name and Contact person name.
- Individual selection hides Company name and shows Full name.
- Consultation selection hides passenger-count and cabin fields.
- Email-only consultation submission succeeded on b496798.
- Receipt: 24386950-cbeb-4e07-b8ae-0270b0c9184b.
- Submitted values appeared correctly in the owner Inbox.
- Consultation client selector, ADT/CHD/INF and conversion button were disabled.

Anonymous application verification on 4de5c1d:
- Fresh Incognito session passed Vercel protection using Vercel login only.
- No TravelPro owner login was performed in that session.
- /inquire displayed the form.
- /inbox required owner authentication before submission.
- Anonymous email-only consultation submission succeeded.
- Receipt: eaee21a8-5d83-4e24-a1bc-f5010a1da0cb.
- Owner Inbox showed SYNTHETIC ANONYMOUS LANDING TEST with source
  LANDING_PAGE, status new and parsing pending.
- Submitted name, email and notes matched; omitted fields showed Not provided.
- After submission, Incognito /inbox still redirected to
  /login?error=authentication_required.
- This verifies access without TravelPro authentication after passing
  Vercel Preview protection, not unrestricted public internet access.

Limitations and next work:
- Before /inquire was explicitly allowlisted, the owner reported the form
  visible in Incognito despite the committed middleware configuration.
  The cause remains unresolved; do not record it as a diagnosed issue.
- Phone-only and Corporate submissions remain unverified.
- Form validation, honeypot rejection, submission lock and retry behaviour
  need execution-level tests.
- Landing contact/shared rate-limit tests remain pending.
- Concurrent first-submission tests, counter cleanup, legacy intake-path
  reconciliation, atomic reviewed conversion and real provider integration
  remain pending.
- Documentation reconciliation, final review and production release remain pending.

## 14 October 2026: Phone-Only and Corporate Landing Tests

Verified Preview application: 4de5c1d.
Branch: feature/multi-channel-inquiry-ingestion.
Previous documentation checkpoint: 667d900.
Production baseline remains main 2e23db2.

Owner-guided tests used the Incognito application session without
TravelPro owner login, after passing Vercel Preview protection.

Phone-only consultation:
- Receipt: 4619567a-4cf1-4611-b853-be2475d5d061.
- Name: SYNTHETIC PHONE ONLY TEST.
- Fictional test phone: +12025550123.
- Email omitted; Inbox displayed Not provided.
- Submitted name, phone and notes matched.
- Omitted travel fields displayed Not provided.
- Client type displayed Individual / Retail; service displayed Consultation.
- Parsing remained pending.

Corporate consultation:
- Receipt: dbe02455-c6cc-41a9-9f9b-44f5673f7ca8.
- Source LANDING_PAGE and status new appeared in the owner Inbox.
- Company: SYNTHETIC CORPORATE LANDING TEST.
- Contact person: SYNTHETIC CORPORATE CONTACT.
- Email: corporate-landing@example.invalid.
- Submitted company, contact name, email and notes matched.
- Phone and omitted travel fields displayed Not provided.
- Client type displayed Corporate; service displayed Consultation.
- Company name suggestion appeared; parsing remained pending.

These results supersede the earlier pending phone-only and Corporate
consultation submission checks. They do not establish flight, visa or
package submission behaviour, client-account creation or matching,
duplicate prevention, rate-limit enforcement, or atomic conversion.

Execution-level validation, honeypot, submission-lock and retry tests
remain pending, alongside the remaining milestone integration and release work.

## 14 October 2026: Flight, Visa and Package Landing Tests

Verified Preview application: 4de5c1d.
Branch: feature/multi-channel-inquiry-ingestion.
Previous documentation checkpoint: d8c146c.
Production baseline remains main 2e23db2.

Owner-guided submissions used Incognito without TravelPro owner login,
after passing Vercel Preview protection. Results were inspected separately
in the authenticated owner Inbox.

Flight Booking:
- Receipt: c6889f87-77e0-4dd1-b90e-9cdb36462f99.
- Name: SYNTHETIC LANDING FLIGHT TEST.
- Submitted route DAC to SIN matched.
- Departure 2026-11-15 and return 2026-11-20 matched.
- Passenger count 2 and cabin economy matched.
- Submitted name, email and notes matched; phone was omitted.
- Source LANDING_PAGE, status new and parsing pending were displayed.
- Submitted travel values remained separate from empty AI suggestions.
- Convert to Active Case was displayed but was not invoked.
- Flight-to-case conversion remains unverified and requires reviewed,
  atomic conversion work.

Visa Support:
- Receipt: 70609f04-43a5-4df5-b8ff-1b7b75b74cb3.
- Name: SYNTHETIC LANDING VISA TEST.
- Submitted name, email and notes matched.
- Omitted phone and travel fields displayed Not provided.
- Source LANDING_PAGE, service Visa Support, status new and parsing
  pending were displayed.
- Owner verified client selector, ADT/CHD/INF fields and conversion
  button disabled.

Package:
- Receipt: d4ac5a70-c038-4cce-a01d-cbdcbc84e5e2.
- Name: SYNTHETIC LANDING PACKAGE TEST.
- Submitted name, email and notes matched.
- Omitted phone and travel fields displayed Not provided.
- Source LANDING_PAGE, service Package, status new and parsing
  pending were displayed.
- Owner verified client selector, ADT/CHD/INF fields and conversion
  button disabled.

This supersedes earlier pending basic Flight, Visa and Package submission
checks. It does not establish service fulfilment, AI parsing, first-submit
concurrency, retry behaviour, client matching or case conversion safety.

Validation, honeypot, submission-lock, retry, Landing rate-limit integration,
cleanup, legacy-path reconciliation, atomic conversion, real provider
integration and production release checks remain pending.

## 14 October 2026: Airport Autocomplete Preview Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed application commit: ee98bcc.
Preview: https://travelpro-m72fq46ad-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2; milestone release is pending.

Implementation:
- Reusable Origin/Destination airport autocomplete with Tailwind styling.
- Local OurAirports dataset; no paid API or runtime third-party data request.
- Source commit: a5a1ab8c3d9d57568c4bf9a7d398a23a60623830.
- Dataset contains 8798 unique IATA-coded airports, 785604 bytes.
- Includes large, medium and small airports with valid three-letter codes.
- Excludes closed airports, heliports, seaplane bases and metropolitan codes.
- Missing municipality remains empty; source accuracy is not guaranteed.
- Source metadata records licence, source hashes and generated dataset hash.
- Git attributes preserve LF endings for generated JSON files.
- Dataset integrity checks passed for count, unique codes, size and SHA-256.
- Shared lazy loader validates data and uses same-origin credentials.
- Only /data/airports.json was added to the middleware public-route list.
- Search supports city, airport name and IATA, with normalized matching.
- Dropdown shows up to 12 ranked results.
- Selection passes uppercase IATA to the existing form state.
- Editing selected text clears the previous code.
- Keyboard navigation, Escape handling and an IME guard are implemented.
- Nonempty unselected airport text blocks normal browser form submission.
- TypeScript, production build and staged diff checks passed.
- Build skips linting; lint verification is not established.

Owner-guided Preview evidence:
- Test used Incognito without TravelPro owner login after Vercel protection.
- Dhaka city search displayed Hazrat Shahjalal International Airport (DAC).
- Lowercase lhr search displayed London Heathrow Airport (LHR).
- Owner reported BKK selection during Suvarnabhumi airport-name search.
- Editing selected BKK to London cleared the selected-code helper.
- Arrow Down and Enter selected LHR.
- Escape closed the dropdown.
- Unselected airport text displayed:
  Select an airport from the search results.
- Synthetic consultation with selected DAC and BKK was accepted.
- Receipt: 03f4c765-fc4f-41f7-9784-24eacaa12803.
- Owner Inbox raw message and submitted fields contained DAC and BKK,
  not airport display labels.
- Submitted name, email and notes matched; omitted fields remained absent.
- Origin and Destination reset after successful submission.
- Unmatched query displayed the no-results message.

Remaining airport verification:
- Mobile layout, touch interaction and dropdown clipping.
- Screen-reader behaviour and keyboard edge cases.
- Dataset load failure, timeout and retry recovery.
- IME interaction; adding a guard is not execution-level verification.
- Representative minor-airport and multi-airport city coverage.
- Client-side selection validation is not server-side dataset membership validation.

Contact validation testing was paused for this feature.
The remaining inquiry-ingestion validation, rate-limit, concurrency,
cleanup, legacy-path reconciliation, atomic conversion, provider
integration and production release work remains pending.

## 14 October 2026: Landing Browser Validation Checks

Branch: feature/multi-channel-inquiry-ingestion.
Verified Preview application: ee98bcc.
Latest pushed documentation checkpoint: 2ee6467.
Production baseline remains main 2e23db2.

Owner-guided browser checks:
- Email and phone both empty: submission focused the required email field.
- Email containing invalid-email: submission focused the email field;
  no validation popup text was reported.
- Phone without country code: browser displayed
  "Please match the requested format."
- Corporate company name empty: submission focused the company field;
  no popup text was reported.
- Full name empty: browser displayed "Please fill out this field".
- Departure 2026-11-20 with return 2026-11-15: browser displayed
  "Value must be 20/11/2026 or later."
- Passenger count 0: browser required a value greater than or equal to 1.
- Passenger count 1000: browser required a value less than or equal to 999.
- Passenger count 1.5: browser rejected the value and identified
  1 and 2 as the nearest valid values.
- No successful receipt was reported during these invalid-input checks.

Evidence limits:
- These checks exercise normal browser constraint validation.
- They do not prove Server Action or database rejection when browser
  validation is bypassed.
- Network requests and database row counts were not inspected for these checks.
- Invalid-email and missing-company results are focus observations,
  not captured validation-message assertions.

Pending:
- Direct Server Action validation and honeypot rejection tests.
- Submission-lock, retry and ambiguous-response tests.
- Landing contact/shared rate-limit integration tests.
- Remaining airport accessibility, mobile and failure-recovery checks.
- Concurrency, counter cleanup, legacy-path reconciliation,
  reviewed atomic conversion, real provider integration and release work.

## 15 October 2026: Local Landing Server Action Tests

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint: 7d229fd.
Application implementation remains ee98bcc.
Production baseline remains main 2e23db2.

Test script: scripts/test-landing-inquiry-action.mjs.
Syntax check and all local assertions passed.

Test method:
- Load and transpile the current app/inquire/actions.ts.
- Execute the exported submitLandingInquiry function.
- Replace rate-limit and intake-client dependencies with test doubles.
- Reject unexpected imports and network access.
- No real network requests or database writes.

Verified rejection before rate-limit or intake calls:
- Missing request ID; invalid client/service types; blank name.
- Missing Corporate company; both contact methods missing.
- Invalid email and phone without country code.
- Filled honeypot, unknown protected field and file-valued input.
- Duplicate contactName field and oversized name/notes.
- Invalid airport code syntax and impossible calendar date.
- Return without departure and return before departure.
- Flight passenger counts 0, -1, 1.5 and 1000.
- Invalid flight cabin.

Verified payload construction:
- Email-only and phone-only contacts omit absent contact properties.
- Corporate company and contact person remain separate.
- Individual payload omits stale company values.
- Flight codes normalize to uppercase; passenger count becomes numeric.
- Unknown flight details remain omitted without invented defaults.
- Visa, Package and Consultation omit stale flight-only count/cabin fields.

Verified response handling:
- Mocked rate-limit denial and failure prevent intake RPC invocation.
- Duplicate RPC receipt produces the already-received response.
- Conflict, validation and infrastructure RPC codes produce safe failures.
- Malformed receipts never report success.
- Thrown RPC failure returns a safe failure response.

Evidence limits:
- Mocked duplicate receipt tests response handling, not database deduplication.
- Mocked rate-limit results do not establish real counter enforcement.
- These tests do not exercise Next.js HTTP transport, browser submission
  locking, real retries, database authorization or transaction behaviour.
- Airport syntax validation does not establish dataset membership.

This supersedes pending local action-validation and honeypot unit checks.
Real transport/integration tests, submission-lock and retry behaviour,
Landing rate-limit integration and the remaining milestone work stay pending.

## 15 October 2026: Dependency and Landing Rate-Test Preparation

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint: 7d71df6.
Verified airport Preview application remains ee98bcc.
Production baseline remains main 2e23db2.

Local dependency changes, not yet committed:
- Add Playwright 1.64.1 as an exact development dependency.
- Compatible audit updates installed Next.js and eslint-config-next 15.5.28.
- Add scoped npm override: next -> postcss 8.5.28.
- Targeted PostCSS update resolved the initially invalid nested dependency.
- Installed Tailwind PostCSS dependency is 8.5.30.
- package.json and package-lock.json changed.
- No forced audit fix or Next.js major upgrade was performed.

Validation after updates:
- npm ci passed; clean installation reproduced the expected dependency versions.
- TypeScript check passed.
- Production build passed on Next.js 15.5.28.
- Local Landing Server Action suite passed with mocked dependencies.
- All nine local webhook regression checks passed without intake writes.
- Diff formatting check passed.
- npm audit --omit=dev reported zero vulnerabilities.
- Full npm audit still reports five high findings in the
  braces -> micromatch -> fast-glob -> Next ESLint dependency chain.
- Advisory GHSA-vfj7-8cjw-p6xm lists no patched braces version.
- Development/build-tool exposure assessment and remediation remain pending.
- A clean production-only audit is not a complete application security audit.
- Build configuration still skips linting.
- Webpack cache serialization warnings did not fail the build.
- npm reported a pending unrs-resolver install-script approval warning;
  no blanket script approval was performed.

Manual Landing email-limit test:
- Synthetic email: landing-limit-20261015@example.invalid.
- Six successful receipts were reported:
  5726395c-6542-41ef-abd1-76f9e808b053
  35e12e51-1737-4881-830f-5aca2ac20255
  f8e055b8-eb04-4bb4-94b2-a601c1f80d29
  34359478-c4d9-4b35-b68d-7e961f205d93
  5c00fe48-c625-4b4c-930a-84f184204087
  465e2f52-2cc2-4587-a386-2a65b275dcf6
- The sixth response was reported after the 01:15 Asia/Dhaka boundary.
- Exact server submission timestamps were not inspected.
- Result is INCONCLUSIVE; do not record rate enforcement as passed or failed.
- Submissions were distinct inquiries, not identical retries.
- Automated Landing browser rate-limit testing remains to be implemented.
- Playwright browser installation and test execution remain pending.

Next work:
- Commit dependency changes with their verification and unresolved findings.
- Verify the updated Preview before recording deployment compatibility.
- Implement bounded automated Landing contact-limit tests.
- Preserve the remaining validation, retry, shared-ceiling, concurrency,
  cleanup, atomic conversion, provider integration and release tasks.

## 15 October 2026: Automated Landing Email Rate-Limit Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint: dec2cef.
Tested Preview application: dec2cef.
Preview: https://travelpro-4k792ne1s-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2; milestone release is pending.

Test script:
scripts/test-preview-landing-rate-limit.mjs.

Implementation and scope:
- Playwright fresh browser context without TravelPro owner authentication.
- Restrict traffic to the exact configured Preview origin.
- Read Vercel bypass from an environment variable; no secret stored in code.
- Establish Vercel bypass cookie before browser navigation.
- Verify private Inbox requires owner authentication before and after intake.
- Use a unique synthetic email and at most six distinct submissions.
- Guard against fixed-window boundary crossing.
- Stop on unexpected outcomes; no automatic test reruns.

Troubleshooting:
- Initial browser navigation reached Vercel login.
- Direct bypass requests confirmed health 200, Inbox redirect to login,
  login 200 and inquiry form 200.
- Adding bypass-cookie setup allowed browser access checks to pass.
- A subsequent run timed out awaiting the first submission response.
- Its email was not found in the owner-provided Inbox listing;
  database absence was not independently verified.
- Submission diagnostics were added before the successful run.
- The first timeout cause remains unresolved.

Successful automated run:
- Email:
  landing-limit-c90203a4-a5b9-4971-945f-8c443df5f6ce@example.invalid.
- Five submissions accepted with distinct receipts:
  0d946315-0563-4195-a99b-0c50bc8cbe2f
  ab9ddf10-ae05-4bd1-8871-efa67575e72d
  0a7e6063-14aa-4f8f-a0df-05419bbbd4fe
  c3c571a6-880e-4fca-85c9-bd0d452528fb
  6bb91f3a-cd0f-4c87-a7e8-693af3c86865
- Sixth submission returned rate-limit message with 398-second retry delay.
- Browser window checks passed.
- Private Inbox remained protected after submissions.

Read-only database verification:
- Matching inquiries: 5.
- First created_at: 2026-10-15 13:53:12.441946+00.
- Last created_at: 2026-10-15 13:53:20.767623+00.
- Distinct 15-minute creation windows: 1.
- New inquiries with no matched client or converted case: 5.

Conclusion and limits:
- Landing email ceiling integration passed: five accepted, sixth denied.
- This successful run supersedes the earlier inconclusive manual test
  for email-limit enforcement evidence.
- These were distinct submissions, not identical retries.
- Phone ceiling, email normalization variants, shared ceiling,
  concurrency and retry behaviour remain pending.
- The displayed retry delay was checked, not an HTTP Retry-After header.
- No unrestricted-public-access claim: Vercel protection was bypassed,
  while TravelPro owner authentication remained absent.
- Current script passed once after diagnostics; timeout reliability
  investigation remains open.
- Remaining airport, dependency, cleanup, legacy-path, atomic conversion,
  provider integration and production release tasks remain pending.
