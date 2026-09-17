# Test Plan

## v1 Success Scenario (manual)
1. Open app (no login) → dashboard renders with seeded cases, alert badges, queue counts
2. Click 'New Case' → select client 'Sky Trade BD' → enter route DAC→DXB, dates, 2 pax, economy → save → case appears in list with status 'new'
3. Open case → 'Add Traveller' → enter name, upload passport image → OCR auto-fills fields with confidence indicators → click 'Confirm' → status = client_confirmed
4. Click 'New Quotation' → paste GDS itinerary text → parser extracts 1 segment DAC→DXB → enter base fare 45000 BDT, taxes 8500, service fee 2000 → total = 55500 → set expiry → save as draft
5. Click 'Approve' on quotation → status = approved → click 'Send' → status = sent
6. Click 'New Booking' → enter PNR 'ABC123', source 'gds', TTL = now+72h → save → booking status = unticketed → TTL reminder appears on dashboard
7. Click 'Upload Payment' → attach screenshot → status = pending_verification
8. Click 'Verify' → enter note 'Bank transfer confirmed' → status = verified
9. Click 'Record Ticket' → enter ticket number '176-1234567890', issue date, final amount 55500 → save → booking status = ticketed
10. Verify case status = ticketed; audit log shows all 10 transitions with actor + timestamp

## Empty State Tests
- No cases: dashboard shows 'No cases yet. Create your first case.' with button
- No bookings: bookings page shows empty state with guidance
- No quotations on case: case detail shows 'No quotations yet' section
- Search with no results: shows 'No matches for "xyz"'

## Error State Tests
- Submit case without client → validation error: 'Client is required'
- Upload non-image passport → error: 'Please upload an image file'
- Verify payment without evidence file → error: 'No payment evidence on file'
- Record ticket without verified payment → error: 'Payment must be verified before ticketing'
- AI OCR timeout → form shows 'OCR unavailable — enter fields manually' (manual entry still works)
- GDS parse failure → raw text preserved, manual segment entry available

## Loading State Tests
- Case list shows skeleton rows while fetching
- OCR processing shows spinner on upload with 'Extracting passport data...'
- Quotation generation shows 'Preparing quotation...'

## Permission Tests (post lock-down)
- Consultant logs in → sees only assigned cases
- Consultant tries to verify payment → button hidden/disabled
- Owner sees all cases regardless of assignment
- Anonymous visit → redirect to login
