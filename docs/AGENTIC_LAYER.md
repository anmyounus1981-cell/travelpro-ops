# Agentic Layer

## Risk Levels
- **Low (auto):** Summarize inquiry, tag escalation flags, score confidence, parse itinerary, draft quotation text, extract passport fields
- **Medium (light approval):** Create case from inquiry, update case status, schedule reminder, set escalation flag, create service-case record
- **High (always approval):** Send quotation to client, send e-ticket, send reminder message, mark payment verified, update booking status
- **Critical (human-only):** Record ticket issuance, record void/exchange, record refund result, cancel PNR, verify payment, approve fare diff/penalty, approve refund amount

## Draftable Actions (AI prepares, human reviews)
- Inquiry → structured case draft (low → user edits/confirms)
- GDS paste → parsed segments + fare breakdown draft (low → user verifies)
- Passport image → extracted fields with confidence (low → client confirms, agent approves)
- Quotation document text (low → owner approves before send)
- Reminder messages text (low → system sends on schedule if enabled)

## Executable After Approval
- Create case record (medium → auto on user confirm)
- Set escalation flag + alert owner (medium → auto on detection)
- Schedule TTL reminder (medium → auto on booking creation)
- Update case status to 'quoted' (medium → auto on quotation approval)
- Send quotation to client (high → owner clicks 'Send')
- Send e-ticket to client (high → owner clicks 'Send' after status=Issued)

## Human-Only Actions
- Record ticket number + issue date + final amount
- Mark payment Verified/Rejected
- Record re-issuance result
- Record refund/supplier confirmation
- Cancel PNR (manual release)
- Approve penalty/fare diff/refund amount

## Named Tools
- `parse_gds_itinerary(text) → segments[]`
- `extract_passport(image) → {fields, confidence}`
- `draft_quotation(case, fare_data) → document_text`
- `triage_inquiry(text) → {structured, missing_fields, escalation_flags, confidence}`
- `score_confidence(data) → numeric`

## Audit Log Fields
`actor_id, action, entity_type, entity_id, details(jsonb), created_at`

## v1 vs Later
- **v1:** parse_gds_itinerary, extract_passport, draft_quotation, triage_inquiry (all draft-only, human confirms)
- **Later:** send_email, send_whatsapp, auto-schedule reminders to external channels
