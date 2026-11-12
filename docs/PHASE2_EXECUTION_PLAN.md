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
