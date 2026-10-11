# Multi-Channel Client Query Ingestion — Implementation Contract

Status: planned; branch feature/multi-channel-inquiry-ingestion, based on
production main 2e23db2. PR #16 production verification is complete.

## Pipeline

- Landing Page /inquire -> Next.js Server Action -> shared validated intake
  -> Supabase inquiries -> protected Inbox -> owner review -> atomic case RPC.
- Meta Lead Ads / WhatsApp / email -> provider-authenticated n8n trigger
  -> normalize original event -> authenticated POST /api/webhooks/inquiries
  -> the same intake and Inbox. n8n must preserve original provider event IDs.
- Keep /api/v1/inquiry compatibility using an adapter to shared intake.
  Review existing callers before changing its authentication contract.

Landing Page is public without owner sign-in. Public submission creates only
an unreviewed inquiry and returns a receipt. Matching existing clients and
conversion to a case remain protected owner actions. No automatic client,
traveller, booking, payment or ticket creation.

## Ordered implementation

1. Inspect live schema, RLS, constraints, public form, API callers and case
   conversion. Current source constraint permits web/email/whatsapp only;
   /inquire is currently not in the middleware public allowlist. Migration
   and middleware changes are necessary before the intended public flow.
2. Add a reviewed migration: allow landing_page and meta_lead_ads sources;
   service type; validated submitted fields separate from parsed suggestions;
   provider/account/event identity; stable request UUID; canonical payload
   hash; retry-safe intake and authorized atomic conversion functions.
   Preserve inquiry personal -> client individual compatibility explicitly.
3. Implement shared schema validation and intake. Limit body to 64 KiB,
   reject unsupported fields/enums and invalid contact/date values, allow
   incomplete service-appropriate plans. Do not invent missing flight data.
   Store the inquiry durably before optional AI enrichment; parser/provider
   failure must not lose an accepted inquiry.
4. Implement POST /api/webhooks/inquiries in the Node runtime. This endpoint
   accepts normalized trusted n8n events, not native Meta challenge requests.
   Exempt it from owner-session middleware only because the handler enforces
   its own authentication. Require HMAC SHA-256 over timestamp + '.' + exact
   raw JSON bytes, with headers X-Inquiry-Timestamp and X-Inquiry-Signature
   (sha256=<hex>). Use constant-time comparison, a five-minute time window,
   and a server-only INQUIRY_WEBHOOK_SECRET. Unknown/missing secret fails
   closed. n8n retries use a fresh timestamp and signature, the same event ID
   and unchanged normalized payload. Never put the secret in the browser.
5. Implement /inquire Server Action with server-assigned landing_page source,
   stable request ID, accessible feedback, honeypot and durable rate limiting.
   Select and configure abuse-control backing storage before deployment;
   process-local counters are insufficient. Anonymous intake has no private
   read grants and cannot submit review status or existing client IDs.
6. Implement owner Inbox candidate matching and reviewed conversion. Lock
   inquiry, validate eligibility and reviewed fields, create one case and
   audit atomically; reject dismissed and conflicting retries. Non-flight
   inquiry submission is allowed, but non-flight case conversion stays
   disabled until its case model is defined.
7. Configure n8n using server-side credentials: native provider triggers,
   original event preservation, normalization, HMAC request, bounded retry
   with backoff for 429/5xx and an error queue for permanent failures. Verify
   Meta/WhatsApp callback validation, signature requirements, permissions
   and lead retrieval against current official provider documentation before
   activation. A Meta notification may require authenticated lead retrieval;
   do not assume it contains complete contact fields. No outbound messaging
   is activated without the approved messaging workflow and consent rules.
8. Run meaningful database/route tests and owner-guided preview checks;
   commit and publish scoped changes, review migration, merge and verify
   canonical production domain and channel retries.

## Webhook payload v1

```json
{
  "version": 1,
  "requestId": "UUID",
  "source": "whatsapp",
  "provider": "meta",
  "providerAccountId": "configured-account-id",
  "sourceMessageId": "original-provider-event-id",
  "clientType": "individual",
  "serviceType": "flight_booking",
  "contact": {"name": "Synthetic Test", "phone": "+8801700000000"},
  "travel": {"origin": "DAC", "destination": "BKK"},
  "rawMessage": "Synthetic flight inquiry",
  "metadata": {}
}
```

Allowed webhook sources: web, email, whatsapp, meta_lead_ads. Landing Page
source is assigned by its server action. Service types: flight_booking,
visa_support, package, consultation. Company name and contact person are
required for corporate requests; an individual requires a full name. At
least one valid phone or email is required. Missing trip fields remain null.
Provider account must match configured integration identity. Retain raw
source details with bounded metadata; redact PII/secrets from logs.

Deduplicate by stable request ID and provider/account/event identity. Same
identity plus same canonical payload returns the original receipt; changed
payload returns conflict. Database uniqueness and transactions enforce this
under concurrency, not a pre-insert lookup alone.

Responses: 201 accepted; 200 identical retry; 400 invalid payload; 401 invalid
signature/timestamp; 409 identity conflict; 413 oversized body; 429 rate
limited; 503 temporary intake/configuration failure. Return only receipt ID
and accepted status, never client matches or private records.

## Release evidence required

Anonymous private-data isolation; both client types and all service types;
invalid/missing/tampered/stale signatures; oversized payload; concurrent
identical submissions; conflicting identity reuse; source preservation;
AI unavailable; n8n retry; owner-only matching/conversion; conversion retry,
concurrency and audit rollback; existing channel compatibility; TypeScript,
build, diff checks; preview and production owner workflow.

## Configuration dependencies

Need the n8n workflow URL/environment, chosen Meta Page and lead form,
WhatsApp Business account and phone-number ID, approved provider credentials,
and chosen public rate-limit storage. Implement core database and Landing
Page first; missing provider setup does not justify inventing credentials.
