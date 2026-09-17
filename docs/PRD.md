# Travel Agency AI Operations Platform — PRD

## Problem
B2B travel agencies in Bangladesh run reservations, ticketing, and after-sales manually across GDS/airline/supplier systems. Inquiries arrive via web, email, WhatsApp with inconsistent data. Quotations, PNRs, TTLs, payment evidence, and ticket records live in chat threads and spreadsheets. Result: missed TTLs, lost audit trails, no owner visibility, no structured handoff.

## Target User
Agency owner (full control + approvals), travel consultant (assigned cases), client/traveller (submit info, review, confirm via portal).

## Core Objects
- **Case** — inquiry intake record (client, route, dates, pax, cabin, status, owner)
- **Client** — company + contacts
- **Traveller** — passenger profile with passport verification
- **Quotation** — fare breakdown + itinerary + approval state
- **Booking** — PNR record + TTL + unticketed status
- **Payment** — evidence upload + owner verification
- **Ticket** — issue record (ticket #, date, amount)
- **Service Case** — re-issuance / refund / cancellation
- **Document** — private files (passport, payment, e-ticket)
- **Reminder** — TTL, payment, missing-doc nudges
- **Audit Log** — every meaningful action

## MVP (v1) — Checklist
- [ ] Case intake from manual entry + web form; auto-detect missing info
- [ ] Client + traveller records with passport upload + OCR extraction + per-field confidence
- [ ] Manual fare entry (fare, taxes, service fee, baggage, conditions, expiry)
- [ ] Paste GDS itinerary → parser extracts segments/pax (editable, confidence-flagged)
- [ ] Quotation generation + approval-before-send flow
- [ ] Booking record: PNR, source, itinerary, TTL, unticketed label
- [ ] Payment evidence upload → Pending Owner Verification → Verified/Rejected
- [ ] Ticket recording: ticket #, issue date, final amount, e-ticket attachment
- [ ] Reminder scheduling (TTL, payment, missing docs)
- [ ] Owner dashboard: alerts, queues, search, audit history
- [ ] Service-case creation for re-issuance / refund / cancellation (request → alert → human action → record)

## Non-goals (v1)
- Direct GDS/NDC/airline API; automated fare/seat search
- Auto PNR creation/cancel/ticket/exchange/void/refund
- Auto payment collection/verification/reconciliation
- Formal accounting / BSP reconciliation / tax ledger
- Unverified immigration/visa/baggage/fare-rule advice

## Success Criteria
**End-to-end:** An owner creates a case from a Dhaka→Dubai inquiry, adds 2 travellers with passport OCR, builds a quotation (manual fare + parsed itinerary), approves and sends it, records the PNR with a 72h TTL, client uploads payment evidence, owner verifies, records the ticket number, and the system sends the e-ticket — all visible on the owner dashboard with full audit trail.

## Definition of Done
An anonymous visitor can open the app, see seeded cases/quotations/bookings on the dashboard, create a new case, build a quotation, record a booking with TTL, upload payment evidence, and record a ticket — every action persists to the database and the UI reflects it. No dead buttons. No login wall in v1 preview.
