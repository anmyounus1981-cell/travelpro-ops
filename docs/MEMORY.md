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
