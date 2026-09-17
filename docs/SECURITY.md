# Security

## Secret Handling
- Supabase keys in server-side env vars only; never exposed to client
- AI API keys in Vercel env; accessed only in server routes/actions
- No secrets in frontend bundle, console logs, or committed `.env`

## Permission Model
- **v1 (demo):** Permissive RLS — all tables readable/writable without auth; seed data visible to anonymous visitors
- **Lock-down sprint:** Enable auth; RLS policies enforce `auth.uid() = user_id` on all tables
  - Owner: sees all records (all user_ids)
  - Consultant: sees only records where `user_id = auth.uid()` or assigned cases
  - Client: sees only own case via portal link (scoped token)
- AI agent inherits the acting user's permissions; never operates as a service-role bypass

## Approved Tools Rule
- AI uses only named, registered tools (e.g. `parse_gds_itinerary`, `extract_passport`, `draft_quotation`)
- No raw `run_any` or `send_any` — every AI action is a specific function with scoped inputs
- Send-message tools gated behind explicit owner click, never auto-sent without approval

## Audit Principle
- Every status transition, approval, verification, and document delivery writes to `audit_logs`
- Audit entries include actor, action, entity, timestamp, and diff
- Audit log is append-only; no updates or deletes

## Data Protection
- Passport images stored in private Supabase bucket; access via signed URLs only
- Payment evidence files private; never logged in application logs
- Passport retention policy: configurable TTL on stored images
- Raw passport images excluded from error logs and AI prompt logs
