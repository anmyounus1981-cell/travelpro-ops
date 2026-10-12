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