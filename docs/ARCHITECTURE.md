# Architecture

## Stack
- **Next.js** (App Router, TypeScript) — frontend + server routes
- **Supabase** — PostgreSQL, Auth (later), Storage (private buckets), Edge Functions (reminders)
- **Vercel** — hosting + deployment
- **AI Agent** — OCR, PNR parsing, quotation drafting, intake triage, confidence scoring

## Build Now vs Later
**Now (v1):** Case CRUD, client/traveller records, passport upload + OCR, manual fare entry, GDS paste parser, quotation + approval, booking + TTL, payment evidence + verification, ticket recording, owner dashboard, reminder scheduling, service-case creation.

**Later:** Email/WhatsApp send integrations, client portal links, re-issuance/refund full workflows, reporting, BSP reconciliation.

## Key User Action Flow (Case → Ticket)
1. Owner/consultant creates Case (route, dates, pax, cabin, notes)
2. Add travellers; upload passport → OCR extracts fields with confidence → client confirms → agent approves
3. Manual fare search in GDS → paste itinerary text → parser extracts segments → enter fare/taxes/fees
4. Generate quotation → owner approves → mark sent
5. Client confirms option → record PNR + TTL → booking = Unticketed
6. Reminder fires as TTL approaches
7. Client uploads payment evidence → status Pending Owner Verification
8. Owner verifies outside app → marks Verified → issues ticket manually → records ticket # + amount
9. System sends e-ticket after status = Issued
10. Every step logged to audit trail

## Responsive Nav Shell
Left sidebar (desktop) with sections: Dashboard, Cases, Clients, Travellers, Quotations, Bookings, Payments, Tickets, Service Cases, Reminders. Collapses to hamburger on mobile. Current section highlighted.

## Layer Plan
1. **Data layer** — Supabase tables, RLS policies (permissive v1), seed data
2. **App logic** — Next.js server actions for CRUD, status transitions, file uploads
3. **Smart features** — AI module: OCR extraction, PNR parser, quotation drafter, confidence scoring, triage

## Why Core Works Without AI
All status transitions (Case → Quotation → Booking → Payment → Ticket) are manual user actions writing to DB. AI only assists extraction and drafting; if AI is down, user types data manually. System degrades to a structured operations tracker.

## Repo Structure
```
src/
  features/
    cases/          # Case list, detail, create/edit
    clients/        # Client + company records
    travellers/     # Passenger profiles + passport
    quotations/     # Fare entry, parser, generation, approval
    bookings/       # PNR + TTL + unticketed
    payments/       # Evidence upload + verification
    tickets/        # Issue recording + e-ticket
    service-cases/  # Re-issuance / refund / cancel
    dashboard/      # Owner overview, alerts, queues
    reminders/      # Schedule + list
    audit/          # Audit log viewer
  lib/
    data/           # All DB reads/writes (Supabase queries)
    ai/             # OCR, PNR parser, quotation drafter, confidence
    utils/          # Shared helpers
  components/       # Shared UI (shell, table, form, upload)
  server/           # Server actions, API routes
```

## Module Map
| Module | Responsibility | Data owned | Build order |
|--------|---------------|------------|-------------|
| `cases` | Case intake + lifecycle tracking | cases | 1st |
| `clients` | Client/company/contact records | clients | 2nd |
| `travellers` | Passenger + passport verification | travellers, documents | 3rd |
| `quotations` | Fare entry + parser + approval + generation | quotations | 4th |
| `bookings` | PNR + TTL + unticketed status | bookings | 5th |
| `payments` | Evidence upload + owner verification | payments, documents | 6th |
| `tickets` | Ticket issuance recording | tickets | 7th |
| `service-cases` | Re-issuance/refund/cancel requests | service_cases | 8th |
| `reminders` | TTL/payment/missing-doc scheduling | reminders | 9th |
| `dashboard` | Owner overview + alerts + audit | audit_logs (read) | 10th |
| `lib/ai` | OCR + PNR parse + quotation draft + confidence | (writes to above tables) | After core CRUD |
