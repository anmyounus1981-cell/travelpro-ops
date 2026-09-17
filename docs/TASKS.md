# Task Plan

## Sprint 1 — Foundation + Case Intake
**Goal:** DB schema live, case CRUD working, dashboard shell renders with seed data — no login required.
- [ ] Create Supabase schema (all core tables, RLS permissive, seed data)
- [ ] Build data-access layer (`lib/data/`) for all tables
- [ ] Case list page (table: case #, client, route, status, owner, deadline)
- [ ] Case create form (client select, route, dates, pax, cabin, notes, source)
- [ ] Case detail page (header + status timeline + edit)
- [ ] Dashboard shell: left sidebar nav, responsive, current section highlight
- [ ] Owner dashboard: alert count, queue counts, recent cases
- [ ] Seed 5 realistic cases + clients + travellers
**DoD:** Anonymous visitor opens app → sees dashboard with seeded cases → creates a new case → it persists and appears in the list.

## Sprint 2 — Quotation Engine + Booking + Payment + Ticket ← v1 Functional
**Goal:** Full case→quotation→booking→payment→ticket lifecycle working end-to-end.
- [ ] Client CRUD (company, contact, phone, email)
- [ ] Traveller CRUD (name, passport fields, verification status)
- [ ] Passport upload + OCR extraction (per-field confidence, editable)
- [ ] Quotation create: manual fare entry (fare, taxes, service fee, baggage, conditions, expiry)
- [ ] GDS itinerary paste → parser extracts segments (editable, confidence-flagged)
- [ ] Quotation approval flow (draft → approved → sent)
- [ ] Booking create: PNR, source, itinerary, TTL, status=unticketed
- [ ] Payment evidence upload → pending_verification
- [ ] Payment verify/reject by owner
- [ ] Ticket recording: ticket #, issue date, amount, e-ticket attachment
- [ ] Booking status → ticketed after ticket recorded
- [ ] Audit log on every status transition
**DoD:** Owner creates case → adds travellers → builds quotation → approves → records PNR with TTL → uploads payment → verifies → records ticket → case shows 'ticketed'. Full audit trail visible.

## Sprint 3 — Reminders + Service Cases + Search
**Goal:** Reminder scheduling, re-issuance/refund/cancel request flow, dashboard search.
- [ ] Reminder create + list (TTL, payment, missing docs, client response)
- [ ] Reminder due status + dashboard alert badges
- [ ] Service-case create (type, request details, link to booking/ticket)
- [ ] Service-case status flow (requested → in_review → completed)
- [ ] Dashboard search across cases, clients, bookings, tickets
- [ ] Audit log viewer page (filter by entity, action, actor)
**DoD:** Booking with TTL shows reminder on dashboard when due. Service case created for a refund request tracks to completion. Search finds a case by client name.

## Sprint 4 — Intelligence Layer
**Goal:** AI extraction and drafting on top of working core.
- [ ] Inquiry triage: paste free text → structured case draft with confidence + escalation flags
- [ ] Passport OCR integration: image → extracted fields with per-field confidence
- [ ] GDS parser: paste text → segments + passenger extraction (multi-format)
- [ ] Quotation drafter: case + fare data → formatted quotation text
- [ ] All AI outputs: editable, confidence-flagged, require human confirm
- [ ] Graceful degradation: AI down → manual entry still works
**DoD:** Paste a WhatsApp inquiry → AI suggests structured case with missing-field flags. Upload passport → fields auto-fill with confidence. Paste GDS text → segments populate. All editable.

## Sprint 5 — Lock It Down
**Goal:** Auth + per-user RLS + role-based access.
- [ ] Enable Supabase Auth (email/password)
- [ ] Login/signup pages
- [ ] Replace permissive RLS with owner-scoped policies (`auth.uid() = user_id`)
- [ ] Owner role: sees all records; consultant: assigned only
- [ ] Session-based data filtering in data-access layer
- [ ] Private storage bucket access via signed URLs only
- [ ] Remove seed data or mark as demo-only
**DoD:** New user signs up → sees only their own cases. Owner sees all. Anonymous access blocked. No data leaks across users.

## Sprint 6 — Later: Messaging + Reporting
- [ ] Email quotation/ticket delivery integration
- [ ] WhatsApp send integration (approved templates)
- [ ] Client portal: secure link to view quotation + confirm + upload docs
- [ ] Owner reporting: revenue, case volume, TTL compliance
- [ ] Re-issuance full workflow (change request → fare diff → acceptance → exchange → docs)
- [ ] Refund full workflow (request → validation → acceptance → submit → confirmation → transfer → credit statement)

## Text Gantt
```
S1: Foundation + Case Intake     [====]
S2: Quotation→Ticket lifecycle  [========] ← v1 functional
S3: Reminders + Service Cases   [====]
S4: Intelligence Layer          [====]
S5: Lock It Down (Auth/RLS)     [====]
S6: Messaging + Reporting       [====]
```
