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

## 15 October 2026: Landing Phone Rate-Limit Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 1a902dd.
Tested Preview application: dec2cef.
Production baseline remains main 2e23db2.

Script changes:
- Add email/phone mode to scripts/test-preview-landing-rate-limit.mjs.
- Email mode retains a unique synthetic email.
- Phone mode omits email and uses fictional number +12025550124.
- Syntax and diff formatting checks passed.
- Reusing the fixed phone within the same window may consume an existing quota;
  do not automatically rerun expecting five new acceptances.

Automated phone-mode result:
- Fresh browser required owner authentication for private Inbox.
- Public form loaded without TravelPro owner login after Vercel bypass.
- Five distinct submissions accepted:
  90b97467-953a-4054-b4a7-69c150641207
  48e16054-ba1d-422c-b947-006fba75532a
  aa11988e-69c2-4aaf-a8fa-76c3a7b7fc12
  24176cfb-e48a-4744-8367-26e709dc8223
  2ce803e7-1e8d-45f4-916c-9b751af25ba8
- Sixth submission rate-limited with displayed retry delay of 702 seconds.
- Client-observed fixed-window checks passed.
- Private Inbox remained protected after submissions.

Read-only database verification:
- Matching Landing inquiries for +12025550124: 5.
- First created_at: 2026-10-15 14:18:06.51805+00.
- Last created_at: 2026-10-15 14:18:16.012159+00.
- Distinct 15-minute creation windows: 1.
- Inquiries without email: 5.
- New inquiries with no matched client or converted case: 5.

Conclusion:
- Phone-only contact ceiling integration passed.
- This supersedes the earlier pending phone-limit integration check.
- Shared ceiling, email normalization, combined contacts, retries and
  concurrency remain unverified by this test.
- Earlier first-submission timeout remains unexplained; this successful
  phone run does not establish full harness reliability.
- Remaining milestone and production release work is unchanged.

## 15 October 2026: Combined-Contact Phone Ceiling Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 9525fb1.
Tested Preview application: dec2cef.
Production baseline remains main 2e23db2.

Script:
- Add combined mode to scripts/test-preview-landing-rate-limit.mjs.
- Use a new synthetic email for every attempt.
- Keep fictional phone +12025550125 constant.
- Syntax and diff formatting checks passed.

Automated result:
- Fresh browser had no TravelPro owner authentication.
- Private Inbox required owner login before and after submissions.
- Public form was accessible after Vercel protection bypass.
- Five distinct inquiries accepted:
  0dec5957-1948-46e3-8f1e-6851f44203e2
  b2bc1889-f99f-4811-9ef3-6aee451d4f21
  ac13374b-d8f2-4898-8116-4dade0d7ffe4
  5e3a6e53-8414-4db3-8cc8-fc5ccd673679
  ec035732-6dff-4bde-bfe6-d1818f883275
- Sixth attempt rate-limited with displayed retry delay of 814 seconds.
- Client-observed window checks passed.

Read-only database verification:
- Matching Landing inquiries for +12025550125: 5.
- Distinct submitted emails: 5.
- First created_at: 2026-10-15 15:31:11.139128+00.
- Last created_at: 2026-10-15 15:31:23.834289+00.
- Distinct 15-minute creation windows: 1.
- New inquiries with no matched client or converted case: 5.

Conclusion and limits:
- Changing email did not bypass the fixed phone ceiling in this test.
- This covers one direction of combined-contact enforcement.
- Keeping email constant while changing phone remains untested.
- Email normalization variants and shared ceiling remain pending.
- This does not establish identical-retry deduplication or concurrency safety.
- Fixed test phone may retain quota until its window expires.
- Earlier first-submission timeout investigation remains open.
- Remaining milestone and production release work is unchanged.

## 15 October 2026: Reverse-Contact Email Ceiling Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 88d398b.
Tested Preview application: dec2cef.
Production baseline remains main 2e23db2.

Script:
- Add reverse mode to scripts/test-preview-landing-rate-limit.mjs.
- Keep one unique synthetic email constant throughout the run.
- Change fictional phone on each attempt, using +12025550131 through
  +12025550136.
- Syntax and diff formatting checks passed.

Automated result:
- Fresh browser had no TravelPro owner authentication.
- Private Inbox required owner login before and after submissions.
- Five distinct inquiries accepted:
  a38f102a-687b-4b22-9960-8480c5bc16c9
  b9002082-cc37-4bcc-9089-91162fdbfd28
  fe57208b-e968-46e7-9b16-71eb4f256604
  961c13f0-a735-449d-af23-49ac05d7d2f9
  c9a0645b-4d91-4a92-ad32-fca4bea50e63
- Sixth attempt rate-limited with displayed retry delay of 663 seconds.
- Client-observed fixed-window checks passed.

Read-only database verification:
- Email:
  landing-limit-7dfcce5f-5f98-4cda-9220-cbad73fbc894@example.invalid.
- Matching Landing inquiries: 5.
- Distinct submitted phones: 5.
- First created_at: 2026-10-15 15:48:44.665858+00.
- Last created_at: 2026-10-15 15:48:55.412887+00.
- Distinct 15-minute creation windows: 1.
- New inquiries with no matched client or converted case: 5.

Conclusion and limits:
- Changing phone did not bypass the fixed email ceiling in this test.
- Together with the previous combined-mode test, both contact-ceiling
  directions have browser and database evidence.
- Email normalization variants and shared ceiling remain pending.
- These distinct submissions do not establish identical-retry
  deduplication, concurrency safety or protection against changing both contacts.
- Earlier submission-response timeout investigation remains open.
- Remaining milestone and production release work is unchanged.

## 15 October 2026: Email Case-Normalization Limit Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 797f4eb.
Tested Preview application: dec2cef.
Production baseline remains main 2e23db2.

Script:
- Add normalize mode to scripts/test-preview-landing-rate-limit.mjs.
- Generate one synthetic email and alternate lowercase/uppercase variants.
- Omit phone so this test isolates the email ceiling.
- Syntax and diff formatting checks passed.
- An earlier attempt stopped before submissions because insufficient
  fixed-window time remained.

Successful automated result:
- Five distinct inquiries accepted:
  c3548efa-762f-4646-84d3-00a29cdd7da3
  99435b45-09fb-4b69-bf85-e10b84523219
  7d45271c-7ca9-494c-a06c-d4111541e997
  f5b581e2-9da7-4303-b680-c6d22b5f5618
  b0e8e22b-09c0-4bbb-950e-150e2422936e
- Sixth attempt rate-limited with displayed retry delay of 801 seconds.
- Client-observed fixed-window checks passed.
- Private Inbox required owner authentication before and after intake.

Read-only database verification:
- Lowercase test identity:
  landing-limit-dd5990ed-5e49-4c77-b9ee-ec9a4d8d5372@example.invalid.
- Matching Landing inquiries: 5.
- Distinct stored email variants: 2.
- Distinct lowercased email identities: 1.
- First created_at: 2026-10-15 16:16:27.827703+00.
- Last created_at: 2026-10-15 16:16:37.919046+00.
- Distinct 15-minute creation windows: 1.
- New inquiries with no matched client or converted case: 5.

Conclusion and limits:
- Changing email letter case did not bypass the email rate ceiling.
- Stored contact emails retained two casing variants; this test does not
  establish canonical email storage or client-account deduplication.
- Whitespace and provider-specific alias normalization were not tested.
- Shared ceiling, identical retries, concurrency and timeout reliability
  investigation remain pending.
- Remaining milestone and production release work is unchanged.

## 15 October 2026: Isolated Shared-Ceiling Database Test

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: b72e56e.
Production baseline remains main 2e23db2.

Test file:
supabase/tests/inquiry-intake/shared-ceiling-rollback-checks.sql.

Method:
- Call the installed consume_inquiry_rate_limit function as service_role.
- Use random isolated test buckets, not the application's real global bucket.
- Run inside BEGIN/ROLLBACK with statement and lock timeouts.
- No schema recreation and no inquiry submissions.

Verified:
- First 100 requests allowed with correct remaining counts.
- Attempts 101 and 102 denied with retry delays between 1 and 900 seconds.
- Allowed requests return zero retry delay.
- Stored request_count saturates at 101.
- A different bucket retains its independent allowance.
- Separate read-only query confirmed both test buckets absent after rollback:
  remaining_test_buckets = 0.

Result:
PASS: 100 allowed, subsequent requests denied, counter saturation and
bucket isolation. Rollback independently verified.

Evidence limits:
- This verifies the installed database counter's 100-request boundary.
- It does not establish that all Landing requests use the same application
  global bucket or that global denial prevents contact/intake calls.
- Application shared-bucket wiring tests remain pending.
- This sequential test does not establish concurrent-request behaviour.
- Real shared quota was not deliberately exhausted.
- Remaining retry, timeout, airport, dependency, cleanup, legacy-path,
  atomic conversion, provider integration and release work stays pending.

## 16 October 2026: Local Rate-Limit Helper Wiring Tests

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 2c23191.
Production baseline remains main 2e23db2.

Test script: scripts/test-inquiry-rate-limit-helper.mjs.
Syntax check and all local assertions passed.

Method:
- Transpile and execute the current lib/inquiry-rate-limit.ts.
- Use a test-only HMAC secret and mocked intake-client RPC.
- Reject unexpected dependencies and network access.
- No real database writes, inquiry submissions or quota consumption.

Landing wiring verified:
- Global bucket uses landing_page/global/all with limit 100 per 900 seconds.
- Different contacts share the same Landing global bucket key.
- Email case and surrounding whitespace normalize to one contact bucket.
- Phone surrounding whitespace is trimmed.
- Contact limits use five requests per 900 seconds.
- Combined email/phone contacts use separate buckets.
- Successful result returns the minimum remaining allowance.
- Global denial skips both contact-counter calls.
- Final allowed global slot remains allowed with zero remaining.
- Email denial skips the subsequent phone-counter call.
- Phone denial propagates after allowed global/email checks.
- Missing contacts reject before counter RPC.

Additional checks:
- Webhook uses separate scope with global 500/60 and account 60/60 limits.
- Webhook global denial skips account-counter call.
- Invalid webhook source rejects before counter RPC.
- Missing/short secret fails before counter RPC.
- RPC errors and thrown failures stop subsequent contact checks.
- RPC error logging exposes only the error code in the tested case.
- Tested malformed responses fail closed.
- Contact remaining counts are validated against the contact ceiling.

Evidence limits:
- RPC is mocked; this suite proves helper wiring and tested response handling.
- Earlier isolated SQL tests independently verify database counter behaviour.
- Together these are not isolated shared-ceiling end-to-end verification.
- Existing Landing Action tests separately verify mocked rate denial prevents
  intake RPC; no combined real transport/global-denial test was performed.
- Concurrent behaviour, real quota enforcement and browser retries are not
  established by this suite.

This supersedes pending local shared-bucket identity/parameter wiring
and global-denial contact-call checks.
Isolated end-to-end, retry, concurrency and remaining milestone work stay pending.

## 16 October 2026: Controlled Landing Lost-Response Retry Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 6fa7688.
Tested Preview application: dec2cef.
Preview: https://travelpro-4k792ne1s-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Test script: scripts/test-preview-landing-retry.mjs.

Method:
- Use a fresh Playwright context without TravelPro owner authentication.
- Access the protected Preview using the environment-provided Vercel bypass.
- Hold the first Server Action request while checking submission locking.
- Dispatch two additional submit events while the first request is held.
- Forward the first request and verify server acceptance.
- Intentionally discard its response before it reaches the browser.
- Retry the unchanged form through the normal submit button.
- Add a cleanup guard so stopping the test does not release a held request
  for forwarding.

Verified browser behaviour:
- Private Inbox required owner authentication before and after the test.
- Visible consultation fields and submit button were disabled in flight.
- Additional in-flight submit events produced no extra action requests
  during the observed test.
- Lost response retained form details and displayed the safe retry message.
- Retry preserved the request ID and all serialized form fields.
- Retry returned the already-received response with the original receipt.
- Successful retry reset the form.
- Script syntax and tracked diff formatting checks passed.

Test identity:
- Email: landing-retry-25b4c0f3-f1ae-4385-b9ab-d3fa368369d0@example.invalid.
- Original and retry receipt: 217b7ec1-cfc8-4c28-80b8-987775db194d.

Owner-run read-only database verification:
- Matching inquiries for the test email: 1.
- Matching original receipt among those inquiries: 1.

Conclusion and limits:
- This controlled lost-response scenario passed with one persisted inquiry.
- It verifies an unchanged retry after confirmed server acceptance.
- It does not establish concurrent first-submission safety, behaviour after
  editing an ambiguous submission, or recovery after page reload.
- The earlier unrelated first-submission timeout remains unexplained.
- Isolated shared-ceiling end-to-end verification and remaining airport,
  dependency, cleanup, legacy-path, atomic conversion, provider integration
  and production release work remain pending.

## 16 October 2026: Landing Ambiguous-Outcome Recovery Implementation

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 08458ce.
Production baseline remains main 2e23db2.
These implementation changes have not yet been verified on Preview.

Server Action:
- Add explicit accepted, rejected, unknown and conflict outcomes.
- Mark local validation and rate-limit denial as rejected for that attempt.
- Mark handled database validation errors as rejected.
- Mark submission-reference conflict separately.
- Infrastructure failures and malformed receipts retain unknown outcome.

Client recovery:
- Capture the submitted form values in an in-memory snapshot.
- Preserve request ID and snapshot for an unchanged retry.
- Lock visible fields after an unknown outcome.
- Keep Retry Same Inquiry available while no request is in flight.
- Ignore field-update handlers while a submission snapshot is retained.
- A later rejection does not unlock an earlier unknown outcome.
- A confirmed rejection without earlier uncertainty releases the snapshot
  and request ID, allowing correction and a fresh submission.
- Conflict locks fields and blocks further submission in the current page.
- Confirmed acceptance resets the form and recovery state.
- Do not automatically issue a new request ID after an unknown outcome.

Local verification:
- TypeScript check passed.
- Production build passed on Next.js 15.5.28.
- Landing Server Action regression suite passed with explicit outcome assertions.
- Ten component recovery scenarios passed using mocked React hooks and action.
- Tests cover rejection editing, unchanged snapshot retry, sticky uncertainty,
  conflict blocking, thrown failures, malformed responses and in-flight guards.
- Updated browser retry script selectors and post-loss field-lock assertions.
- Browser script syntax and tracked diff formatting checks passed.
- Local suites made no real network requests or database writes.
- Build still skips linting; lint verification is not established.

Evidence limits and next work:
- Component logic tests do not establish real DOM or browser behaviour.
- Updated browser retry test has not yet run against these changes.
- Existing browser test still targets the older dec2cef Preview and must
  be repointed to the new verified deployment before execution.
- Recovery state and request ID remain in memory only.
- Reload recovery, navigation persistence and cross-tab handling remain pending.
- Conflict messaging does not yet provide an integrated support workflow.
- The earlier unrelated submission-response timeout remains unexplained.
- Concurrency, isolated shared-ceiling end-to-end verification, airport,
  dependency, cleanup, legacy-path reconciliation, reviewed atomic conversion,
  provider integration and production release work remain pending.

## 16 October 2026: Landing Recovery Preview Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed implementation commit: 761eeff.
Tested Preview: https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2; production release is pending.

Test preparation:
- Pin scripts/test-preview-landing-retry.mjs to the new Preview origin
  and matching hostname assertion.
- An initial run stopped before submissions because insufficient
  fixed-window time remained.
- The subsequent controlled retry run passed.

Verified browser behaviour:
- Fresh browser context used Vercel protection bypass without TravelPro
  owner authentication.
- Private Inbox required owner authentication before and after the test.
- Visible consultation fields and submit button were locked in flight.
- First inquiry acceptance was confirmed before discarding its response.
- The browser retained submitted details and displayed the recovery message.
- Fields remained disabled after the unknown outcome.
- Retry Same Inquiry remained available.
- Retry preserved the request ID and all serialized submission fields.
- Duplicate receipt matched the original server acceptance.
- Confirmed acceptance reset the form.
- Repeated in-flight submit events produced no extra action requests
  during the observed test.

Test identity:
- Email: landing-retry-f4a70093-8252-4753-b01c-c981e4d66432@example.invalid.
- Original and retry receipt: 0f102107-1a87-442d-8896-4481ea039eab.

Owner-run read-only database verification:
- Matching inquiries for the test email: 1.
- Matching original receipt among those inquiries: 1.

Conclusion and limits:
- Unknown-outcome field locking and unchanged retry passed on this Preview
  with one persisted inquiry.
- This supersedes the pending Preview check for this controlled retry flow.
- Confirmed-rejection editing, rejection after prior uncertainty and conflict
  blocking have local mocked component evidence; browser checks remain pending.
- Recovery after reload, navigation persistence and cross-tab handling
  remain pending.
- This test does not establish concurrent first-submission safety.
- Earlier unrelated submission-response timeout investigation and remaining
  shared-ceiling, airport, dependency, lint, cleanup, legacy-path, atomic
  conversion, provider integration and production release work remain pending.

## 16 October 2026: Confirmed-Rejection Editing Preview Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint: 5be9837.
Tested application implementation: 761eeff.
Preview: https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Owner-guided browser test:
- Submit an Individual / Retail consultation with departure 2020-01-01.
- Name: SYNTHETIC REJECTION EDIT TEST.
- Email: rejection-edit-20261016@example.invalid.
- Browser displayed: Check your inquiry details and travel dates.
- No successful receipt was reported for that attempt.
- Owner confirmed departure date and notes remained editable.
- Clear departure date and replace notes with:
  Synthetic corrected submission after confirmed rejection. Do not contact.
- Corrected submission succeeded.
- Receipt: c6e00511-ce6c-4987-a297-6f0067325329.

Owner-run read-only database verification:
- Matching inquiries for the test email: 1.
- Matching successful receipt: 1.
- Inquiries without submitted departure date: 1.
- Inquiries with the exact corrected notes: 1.

Conclusion and limits:
- Editing after a confirmed rejection and subsequent corrected submission
  passed on this Preview.
- The single matching inquiry contains the corrected submitted values.
- Browser network payloads and request-ID rotation were not inspected.
- The past-date guard exists in the reviewed migration; the browser showed
  the generic validation message, not a database error code.
- This test does not cover rejection following an earlier unknown outcome.
- Sticky uncertainty and conflict blocking still need browser verification.
- Reload recovery, concurrency and remaining milestone/release work stay pending.

## 16 October 2026: Sticky Recovery Browser Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: fa9ad29.
Tested application implementation: 761eeff.
Preview: https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-sticky-recovery.mjs.

Method:
- Use a fresh browser context with Vercel bypass and no TravelPro owner login.
- Restrict traffic to the pinned Preview origin.
- Allow at most three action requests.
- Forward the first request and confirm real server acceptance.
- Discard its response to create an unknown outcome in the browser.
- Intercept the second request without forwarding it to the server.
- Supply a controlled rejected outcome using the captured action-response
  framing and a synthetic rate-limit message.
- Forward the third request as an unchanged real retry.
- No deliberate exhaustion of real shared rate quota.

Verified:
- Private Inbox required owner authentication before and after the test.
- Response loss left fields locked with unchanged retry available.
- Controlled rejection after uncertainty did not unlock fields.
- Submitted name, email and notes remained unchanged.
- Both retries preserved the original request ID and all serialized fields.
- Third request returned the original receipt as already received.
- Confirmed acceptance reset and unlocked the form.
- Script syntax check passed.

Test identity:
- Email: sticky-recovery-b001841c-1705-4ac2-9528-8ceaa4381f97@example.invalid.
- Original and retry receipt: 815a9344-589d-46fb-ba17-db00f0c1c40c.

Owner-run read-only database verification:
- Matching inquiries: 1.
- Matching original receipt: 1.

Conclusion and limits:
- Browser handling of rejection after an earlier unknown outcome passed
  with a controlled rejection and one persisted inquiry.
- The second attempt was not processed by the real Server Action or limiter.
- This does not verify real rate-limit denial during recovery.
- Response rewriting depends on the tested Next.js action-response format;
  unsupported framing stops the test.
- Conflict blocking still needs browser verification.
- Reload recovery, navigation persistence, cross-tab handling, concurrency
  and remaining milestone/release work remain pending.

## 16 October 2026: Landing Conflict Browser Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 51dd570.
Tested application implementation: 761eeff.
Preview: https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2.

Script: scripts/test-preview-landing-conflict.mjs.

Method:
- Use a fresh browser context with Vercel bypass and no TravelPro owner login.
- Restrict traffic to the pinned Preview origin.
- Allow at most two action requests to be forwarded.
- Confirm first server acceptance, then discard its response.
- Verify the browser retry preserves the original request ID and form fields.
- Deliberately alter only the forwarded retry notes in test interception.
- Preserve request identity and serializer metadata during re-encoding.
- Receive a real Server Action conflict response for the altered payload.

Verified browser behaviour:
- Private Inbox required owner authentication before and after the test.
- Conflict locked visible consultation fields and disabled submission.
- Original name, email and notes remained displayed.
- Two programmatic submit events produced no additional action requests
  during the bounded observation.
- Script syntax check passed.

Test identity:
- Email: landing-conflict-cff05765-3ba1-4a26-95cd-76da9626e207@example.invalid.
- Original receipt: 5ef5ef72-7236-4492-976d-e6196dd13c27.

Owner-run read-only database verification:
- Matching inquiries: 1.
- Matching original receipt: 1.
- Inquiries with original notes: 1.
- Inquiries with deliberately conflicting notes: 0.

Conclusion and limits:
- Tested conflict handling blocked further browser submission.
- The original inquiry remained intact after the conflicting attempt.
- Payload alteration was deliberate test interception, not normal form editing.
- The test does not establish concurrency safety or cross-tab conflict handling.
- Conflict messaging still has no integrated support-resolution workflow.
- Reload recovery, navigation persistence and remaining milestone/release
  work remain pending.

## 17 October 2026: Landing Reload Recovery Architecture Proposal

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: e08753c.
Current application recovery implementation: 761eeff.
Production baseline remains main 2e23db2.

Design document: docs/LANDING_RELOAD_RECOVERY_DESIGN.md.
Status: proposed architecture; not implemented or execution-tested.

Proposed scope:
- Same-origin, same-tab reload recovery using sessionStorage.
- Persist request ID and exact submitted snapshot before network dispatch.
- Verify persistence before allowing submission.
- Restore before enabling interaction; no automatic submission on restore.
- Treat restored pending attempts as unknown outcomes.
- Preserve sticky uncertainty and unchanged retry identity.
- Separate pending, conflict, accepted and blocked record states.
- Keep confirmed acceptance visible even when storage cleanup fails.
- Block new submission until required cleanup is verified.

Privacy and compatibility:
- Store submitted snapshots only, not typing drafts.
- Proposed snapshot lifetime: 24 hours; future-clock tolerance: five minutes.
- These values remain design proposals, not approved retention policy.
- No exact-time deletion or secure-erasure guarantee.
- Minimize personal data in terminal/blocked markers.
- No secrets, documents, authentication tokens or analytics snapshot logging.
- Explicitly handle historical keys, incompatible records and multiple records.
- Storage read failure must not be interpreted as an empty record.
- Never clear unrelated sessionStorage data.
- Request IDs do not authorize private reads.

Review findings:
- Reviewed ARCHITECTURE.md contains an outdated application checkpoint.
- SECURITY.md contains historical demo/target permission descriptions.
- Documentation reconciliation remains pending; these documents were not
  treated as evidence of current deployed permissions.

Open decisions and verification:
- Confirm lifetime, clock tolerance and browser-storage notice.
- Define a usable support-resolution route for blocked recovery states.
- Check installed intake behaviour and deduplication retention assumptions.
- Implement and test storage/module/component/browser failure cases.
- Cross-tab coordination, tab/session loss and cross-device recovery are
  outside the proposed initial scope.
- No application, database schema or deployment changes made for this design.
- Existing milestone integration and production release work remains pending.

## 17 October 2026: Recovery Database Review and WhatsApp Support

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before these changes: 5f3e300.
Production baseline remains main 2e23db2.

Read-only database review:
- Inspected installed submit_inquiry_intake function.
- Existing request lookup has no age-based cutoff.
- Matching payload hash returns the original duplicate receipt.
- Conflicting payload hash raises SQLSTATE 23505.
- Existing identical retries return before the new-submission past-date guard.
- Request-ID unique index is unique and valid, covering non-null IDs.
- Identity/hash remain on the inquiry row, not an independent idempotency ledger.
- Row deletion or identity/hash changes can disrupt replay protection.
- External cleanup jobs and long-term retention policy remain unverified.
- Findings added to docs/LANDING_RELOAD_RECOVERY_DESIGN.md.

Owner-selected support:
- Official business WhatsApp: +880 1842737654.
- URL: https://wa.me/8801842737654.
- No personal email address used.

Local implementation:
- Add actionable WhatsApp support link in the existing conflict state.
- Keep conflict fields locked and submission disabled.
- Rename disabled submit label to Submission Paused.
- Link contains no prefilled message, inquiry fields, request ID or receipt.
- External-link attributes include noopener, noreferrer and no-referrer.
- Add scoped support styles and visible keyboard-focus treatment.
- Add a reminder not to send sensitive documents or credentials.
- Update local and browser conflict button-label checks.
- Add browser assertions for support URL and privacy attributes.
- No WhatsApp message sent and no automated contact action added.

Verification:
- Separate TypeScript check passed.
- Production build passed on Next.js 15.5.28.
- Local mocked recovery suite passed.
- Updated browser script syntax passed.
- Diff formatting checks passed.
- Build still skips linting.
- Updated support UI browser assertions have not yet run on Preview.

Scope and pending:
- Expired and other blocked reload states remain unimplemented.
- Support-number reachability and operational identity verification are unverified.
- Reload storage lifetime and clock-tolerance proposals remain unresolved.
- No database schema changes were made.
- Remaining inquiry-ingestion and production release work is unchanged.

## 17 October 2026: WhatsApp Support Preview Verification

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed implementation commit: 961e51e.
Tested Preview: https://travelpro-68nj4l8h6-anmyounus1981-8496.vercel.app
Production baseline remains main 2e23db2; production release is pending.

Test: scripts/test-preview-landing-conflict.mjs.
The script was pinned to the new Preview origin and hostname.

Verified browser behaviour:
- Fresh browser used Vercel bypass without TravelPro owner authentication.
- Private Inbox required owner authentication before and after the test.
- First inquiry was accepted before its response was deliberately discarded.
- Altered forwarded retry payload produced a real conflict outcome.
- Conflict kept visible fields locked and submission disabled.
- Disabled submit label was Submission Paused.
- Original name, email and notes remained displayed.
- Tested programmatic submit events produced no additional action requests.
- Official business WhatsApp support link was visible.
- Link URL was exactly https://wa.me/8801842737654.
- No query string, fragment or prefilled inquiry data was present.
- Link used target _blank, noopener, noreferrer and no-referrer.
- The test did not click the link or send a WhatsApp message.

Test identity:
- Email: landing-conflict-45e08ef9-006f-49e0-a717-041ff9882d28@example.invalid.
- Original receipt: fdbeda7b-776e-4e26-9fd0-e48beab45860.

Owner-run read-only database verification:
- Matching inquiries: 1.
- Matching original receipt: 1.
- Inquiries with original notes: 1.
- Inquiries with deliberately conflicting notes: 0.

Conclusion and limits:
- Conflict-state support-link attributes and existing submission locks passed
  on this Preview.
- The original database inquiry remained intact.
- WhatsApp number reachability, delivery and support-resolution procedures
  were not verified.
- Mobile layout and assistive-technology behaviour were not established.
- Expired/blocked reload recovery states remain unimplemented.
- Reload recovery, retention decisions and remaining milestone/release work
  remain pending.

## 17 October 2026: Backup and Local File Protection Policy

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 90355df.
Production baseline remains main 2e23db2.

Policy: docs/BACKUP_AND_FILE_PROTECTION.md.
Read this policy at the beginning of future working sessions.

Documented:
- Exact inventory of nine critical local untracked audit/backup files.
- No overwrite, truncation, deletion, rename, move or replacement without
  explicit owner authorization for the specific action.
- No cleanup commands that could remove protected files.
- No automatic staging or GitHub upload of protected local records.
- Explicit-path staging for authorized project changes.
- Session-close verification of commits, pushes and outstanding local work.
- Single-C-drive risk and the limits of GitHub coverage.
- Manual AES-256 encrypted project archive and private Google Drive upload.
- Password separation, archive integrity checks, downloaded checksum comparison
  and separate-directory restore verification.
- Separate database/Storage backup planning remains necessary.

Evidence:
- Local status showed all nine protected filenames as untracked.
- Tracked application work was committed and pushed at 90355df.
- No protected file contents were inspected for this policy task.
- Encrypted archive creation, Google Drive upload and restore verification
  have not been performed or verified in this session.
- Policy documentation is not evidence of an actual offsite backup.
- No application code, database schema or deployment configuration changed.

Next:
- Commit and push the policy documentation checkpoint.
- Continue reload recovery lifetime, clock-tolerance and implementation decisions.
- Arrange owner-performed encrypted offsite backup and record verification
  separately without exposing passwords or private links.

## 17 October 2026: Landing Recovery Storage Module Checkpoint

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before these changes: a3462b5.
Production baseline remains main 2e23db2.

Files:
- lib/landing-inquiry-recovery.ts.
- scripts/test-landing-inquiry-recovery-storage.mjs.
- docs/LANDING_RELOAD_RECOVERY_DESIGN.md.

Owner-selected settings:
- Snapshot lifetime: 24 hours from initial persistence.
- Future-clock tolerance: five minutes.
- Retries do not extend expiry.
- Clock tolerance provides no grace period after expiry.

Local implementation:
- Validate bounded, versioned pending, accepted, conflict and blocked records.
- Preserve exact submitted snapshot strings.
- Access storage through an injected provider, without browser access at import.
- Distinguish unavailable storage from empty storage.
- Refuse new persistence when a recognized recovery record already exists.
- Verify persistence by reading the stored value back.
- Require the stored pending record to match before retry.
- Clear only an exact matching recognized record and verify absence.
- Preserve unrelated storage keys.
- Replace matching pending records with minimal outcome markers.
- Accepted and conflict markers contain no submitted snapshot.
- Expired markers retain only blocked-state metadata and optional identity.
- Permit a confirmed acceptance marker after the pending deadline.
- Reject invalid receipt format before accessing storage.

Verification:
- Local validation and fake-storage tests passed.
- Separate TypeScript and tracked diff formatting checks passed.
- Tests cover expiry boundaries, malformed records, changed records,
  storage failures, silently ignored writes and conditional cleanup.
- No real browser storage, network requests or database writes were used.

Limits and remaining work:
- The module is not integrated into the Landing form.
- Real browser reload recovery has not been tested.
- Malformed/incompatible-record privacy cleanup remains pending.
- Historical-key migration and multiple-record scenarios need further verification.
- Storage operations do not establish atomic cross-tab coordination.
- A stored receipt marker is not fresh server verification or read authorization.
- Receipt UUID validation does not establish server acceptance.
- Accepted UI preservation during storage failure still needs integration tests.
- No application deployment or database schema changes were made.
- Remaining inquiry-ingestion and production release work stays pending.

File protection and backup:
- Preserve all nine protected untracked audit/backup files.
- No protected file modification or upload was authorized.
- Encrypted offsite backup execution remains unverified.

## 17 October 2026: Recovery Privacy Cleanup Helper

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 0560f0b.
Production baseline remains main 2e23db2.

Implementation:
- Add quarantineInvalidRecovery to the client-safe storage module.
- Replace a single parser-rejected record with a minimal blocked marker.
- Retain only the blocked reason and a valid request ID when available.
- Recheck recognized keys before writing and verify the saved marker.
- Refuse valid records, missing records and multiple recognized records.
- Preserve unrelated storage keys.
- Successful quarantine does not authorize a new submission.

Verification:
- Local fake-storage suite and separate TypeScript check passed.
- Diff formatting checks passed.
- New tests cover malformed and incompatible records, valid pending
  protection, changes during inspection and failed or silently ignored writes.
- No real browser storage, network requests or database writes were used.

Limits:
- Failed replacement may leave original personal data in storage.
- Operations are not atomic cross-tab coordination or secure erasure.
- Historical-key and multiple-record scenarios need further verification.
- Form integration, blocked-state UI and browser reload tests remain pending.
- No deployment or database schema changes were made.
- All nine protected local files remain outside this checkpoint.
- Encrypted offsite backup execution remains unverified.

## 17 October 2026: Recovery Recognized-Key Compatibility Checks

Branch: feature/multi-channel-inquiry-ingestion.
Latest pushed checkpoint before this change: 7223e36.

Local fake-storage verification:
- Temporarily extend the test VM's recognized-key registry with a synthetic key.
- Verify a record under that key restores and prevents a new pending write.
- Verify two recognized records produce multiple_records blocking.
- Verify new persistence, retry verification, conditional cleanup,
  outcome replacement and quarantine all refuse the multiple-record state.
- Verify neither stored record nor unrelated data is changed.
- Restore the test registry after each scenario.
- Local storage suite and diff formatting checks passed.

Limits:
- Production registry still contains only the current v1 key.
- These tests do not establish migration of a real historical schema.
- No production module changes, browser storage, network or database writes.
- Form integration and real browser reload verification remain pending.
- Preserve all nine protected files.
- Encrypted offsite backup execution remains unverified.
