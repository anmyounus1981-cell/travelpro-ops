# Phase 2 execution plan

Baseline: main at `6ef6b5903e497c79dbd69afff65fe44c8c328564`. Validate each module on its own branch against staging `zkrpbcxukbtbsakcepxv`. Production `zhqdssbysdebgeijscvm` requires a separate rollout.

| Module | Integration | Staging acceptance |
| --- | --- | --- |
| 1. Web intake | Next.js `/inquire`, Cloudflare Turnstile Siteverify and signed Supabase intake RPC. Owner reviews in `/inbox` and selects a client before atomic flight case conversion. | Public submission, CAPTCHA rejection, throttling, retries, protected reads/writes, Owner-only conversion and audit, no remaining fixtures. |
| 2. Email | Resend API on a verified transactional subdomain. Use signed inbound and delivery webhooks and store delivery intents in a DB outbox. Map inbound replies into the intake inbox. | Test inbox only. Signed-event verification, dedupe, bounded retries, delivery/failure visibility, Owner alerts and Owner-approved client sends. |
| 3. WhatsApp | Meta WhatsApp Cloud API for delivery and a signed n8n bridge for routing if multiple channels need orchestration. Keep validation, provider event dedupe and intake authorization in TravelPro Ops. | Test sender and recipients, approved templates and opt-in, duplicate-event replay, TTL alert and booking delivery, Owner-reviewed incoming leads. |
| 4. Facebook | Update the existing [Travel Pro Dhaka Page](https://www.facebook.com/share/19qQ4oGFBy/) after approval of its name, luxury logo, cover, bio and CTA. Connect Messenger through the same signed ingress pattern. | Verify Page identity and permissions before editing. Test Messenger event replay and source attribution. Treat Lead Ads as a separate event source if enabled later. |

## Reuse points and constraints

- `clients` and `cases` stay behind Owner access. A case requires a linked client and reviewed travel fields. A submission creates an inquiry. For a new client, use the existing Owner client creation form. Hotel, visa and package requests remain reviewable in the inbox until a suitable case workflow is defined.
- `dispatch_due_ttl_reminders` runs every five minutes in production and creates in-app Owner alerts. Keep dispatch and provider delivery separate. Reuse `owner_alerts`, `reminder_attempts` and `proposal_deliveries` where their contracts fit. Use idempotent outbox claims and record provider outcome separately from business state. Keep payment decisions and GDS actions with authorized humans.
- Prefer Resend over personal Gmail/SMTP for a dedicated transactional sender and signed event callbacks. DNS and sender setup are prerequisites. A direct provider integration has fewer components. Use n8n when reusable routing justifies operating another service. Give the bridge a scoped ingress credential and keep DB service credentials in TravelPro Ops.
- Module 1 replaces the legacy inquiry POST route. Inventory clients of that route and coordinate their switch before promotion. Compare production migration history and function definitions before deployment. The intake and rate-limit routines already exist in production; do not replay their DDL blindly.
- Configure `INQUIRY_TURNSTILE_SITE_KEY`, `INQUIRY_TURNSTILE_SECRET` and `INQUIRY_WEB_HMAC_SECRET` on the relevant deployment. Match the HMAC value to the `travelpro_web_intake_hmac_v1` Vault entry in the same environment. Preview test keys are staging-only. Production requires a real widget restricted to its domain.

## Public storefront

- The storefront is at `/travel`. The Ops dashboard stays at `/`. `/offers` is Owner-only. Its form saves drafts by default, publishes explicitly, and uses the Dhaka calendar for expiry. Use the optional server environment variables `TRAVEL_WHATSAPP_NUMBER` and `TRAVEL_CALL_NUMBER` (E.164 format) to display the matching contact links.
- The public offer page and form read published, unexpired rows using the anonymous client. The form sends an offer UUID. The database validates category and publication, and stores a snapshot on the inquiry when it is first accepted. Editing or deleting an offer preserves the original inquiry snapshot and does not invalidate its identical retry.
- Holiday and Umrah use the package inquiry service. Visa uses visa support. These requests stay in the inbox because the existing case schema requires reviewed flight details.
- Storefront photograph: [Maldives aerial photograph on Unsplash](https://unsplash.com/photos/aerial-view-of-green-trees-and-body-of-water-u94aG1t4xPE). Font license files are shipped alongside the local font assets.

## Module 1 production promotion

1. Complete hosted Preview acceptance with the staging Owner, test Turnstile, and a synthetic flight offer. Verify both public locales and the signed receipt-to-case flow. Remove the synthetic operational rows and preserve immutable audit records.
2. Inventory scheduled and external HTTP callers of `/api/v1/inquiry`, including n8n, ManyChat and third-party website jobs. Production's old web form uses this route. The new storefront and form use the signed RPC through a server action. Migrate any remaining callers before retiring the old route.
3. Verify the production ref is `zhqdssbysdebgeijscvm`. Confirm `20261011144826` and `20261012191447` are already applied and compare the current intake function contracts with the migration guards. Capture a fresh restore point before schema changes.
4. Configure a real Cloudflare Turnstile widget for the exact production hostname in `NEXT_PUBLIC_APP_URL`. Set `INQUIRY_TURNSTILE_SITE_KEY` and server-only `INQUIRY_TURNSTILE_SECRET` on Vercel Production. Generate a separate production HMAC secret and match `INQUIRY_WEB_HMAC_SECRET` to `travelpro_web_intake_hmac_v1` in the production Vault. Verify the existing Production contact environment values.
5. Apply pending migrations in order: `20261018184518_reviewed_atomic_inquiry_conversion.sql`, `20261112100000_gate_public_web_intake.sql`, and `20261112120000_public_travel_offers.sql`. Verify the Owner conversion grant, anonymous signed ingress, removal of anonymous direct intake insert, and published-offer RLS before deploying. Coordinate the signed intake migration and deployment in one cutover window because the old form inserts through the legacy anonymous path.
6. After approval, merge and verify Vercel Production for the exact commit. Check both language variants, signed intake configuration, Owner route protection, official contact links and the planned legacy response. Test production writes only in a separately approved smoke test.
