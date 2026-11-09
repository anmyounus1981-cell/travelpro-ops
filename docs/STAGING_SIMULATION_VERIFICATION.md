# Staging simulation verification - 4 November 2026

Target: zkrpbcxukbtbsakcepxv. Branch: review/environment-isolation-20261103.
Production was not changed. This PR must not be merged or its migrations applied
to production without a separate migration-scope review.

## Migration evidence

- 20261104100717_staging_harden_ttl_scheduler_and_trigger_execute.sql
  is the exact SQL retrieved from staging migration history.
- 20261104153714_staging_controlled_simulation_bookings.sql is the exact
  staging-only overlay. It requires staging_reviewed_main_baseline and an empty
  bookings table. It deliberately prohibits all live bookings in this database.
- Staging uses a consolidated baseline, not the historical main migration chain.
  These files synchronize these two changes; they do not establish identical
  production/staging migration histories. Never run a blind db push against production.

## Controls and scope

The Server Action derives booking mode from deployment configuration, never
FormData. Only the approved staging reference can select simulation.
Simulation bookings use execution_mode=simulation, a simulation_reference and
simulation_run_id. Real pnr must be NULL; source is practice_simulation.
Database constraints reject live mode, real PNR and ticketed status in staging.
The database restricts reminders to in_app / owner. Payments, tickets,
service cases and proposal deliveries cannot be mutated by authenticated clients.
Corresponding server actions are blocked outside production.

create_simulation_booking is SECURITY INVOKER, has an empty search_path,
denies anon EXECUTE and checks the authenticated owner. It locks the case,
requires that owner's approved quotation for the same case, checks validity,
price and future TTL, and writes booking, reminders, case status and audit
atomically. An identical reference retry returns the same booking.

Reviewed createBooking and scheduler paths contain database operations and
Next.js revalidation, not email, WhatsApp, ManyChat or GDS calls. No public-table
trigger was found invoking an outbound webhook. Four TTL rules are internal
owner/in_app rules. There were zero active cron jobs. Unrelated external
services independently polling this database have not been inventoried.

## Executed database workflow

Executed with SET LOCAL ROLE authenticated and owner JWT claims, not a
service-role business write or a browser login session. This is database-level
workflow verification, not proof of the complete browser flow.

| Record | Identifier |
|---|---|
| Synthetic client | c60a6e96-35e0-4a0c-b376-2af91af4381d |
| Case SIM-TEST99-20261104 | cf38b3d3-448f-47d6-955d-6710e5a4e697 |
| Approved quotation | ea6a898c-b9ea-44ae-859f-241ce7fc5e4c |
| Simulation booking TEST99 | 39f0c159-1ed1-4dfb-8bd7-3cfa2617ed7a |
| Simulation run | 81cfcc93-f09e-45e9-8277-fdd36a8ebdd0 |

Amount: BDT 117,000. Real PNR: NULL. TTL: 2026-11-07T15:37:57.302388Z
(7 November 2026, 21:37:57 Asia/Dhaka). This is a new synthetic deadline,
not the earlier Acme/GDS deadline. Four simulation-labelled internal reminders
were scheduled through the actual schedule_booking_ttl_reminders function.
An identical create request returned the same booking. No payment, ticket,
service case, proposal delivery or reminder dispatch was performed.

Negative database probes rejected anon, unmapped users, a wrong quotation,
wrong amount, real PNR, live execution_mode, external reminder channel,
payment insertion and ticket insertion. Negative probes were rolled back.

## Verification and limits

- 41 local Node tests passed, including actual Server Action orchestration
  tests with a mocked DB boundary and forged client mode/source fields.
- TypeScript passed separately. Next.js build passed; existing build settings
  skip integrated type/lint checks. Webpack cache restoration warnings occurred.
- Eleven authenticated SECURITY DEFINER advisor notices are expected exposure
  warnings for the existing owner-guarded functions; negative owner tests passed.
  This does not prove every valid-input path or every future code change safe.
- Leaked Password Protection is disabled, tracked as an Auth setting item.
- Existing quotation transition is not fully atomic. The new simulation
  booking RPC is atomic, which does not retroactively fix quotation transitions.
- Browser rendering and owner-session workflow on the new preview build remain
  a separate verification step. UI must display the simulation warning.
- Simulation overlay is intentionally staging-only. Production rollout and
  generic multi-environment migrations need separate review.
