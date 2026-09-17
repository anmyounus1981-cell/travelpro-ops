# Intelligence Layer

## Messy Inputs
- WhatsApp/email inquiry text (free-form, mixed EN/BN)
- Pasted GDS itinerary (Sabre/Amadeus/Galileo formats)
- Passport photo (variable lighting, MRZ partial)
- Payment screenshot (bank transfer, bKash, cash)

## Auto-Structure Schema (inquiry example)
```json
{
  "origin": "Dhaka", "destination": "Dubai",
  "departure_date": "2026-10-15", "return_date": null,
  "trip_type": "oneway", "passenger_count": 2,
  "cabin_class": "economy",
  "notes": "One infant, need halal meal",
  "missing_fields": ["return_date"],
  "escalation_flags": ["infant"],
  "confidence": 0.72
}
```

## Passport OCR Schema (per-field)
```json
{
  "full_name": {"value": "MOHAMMAD RAHIM", "confidence": 0.95, "source": "mrz"},
  "passport_number": {"value": "BR0123456", "confidence": 0.88, "source": "visual"},
  "dob": {"value": "1985-03-12", "confidence": 0.92, "source": "mrz"},
  "expiry_date": {"value": "2028-06-15", "confidence": 0.90, "source": "visual"},
  "nationality": {"value": "BANGLADESHI", "confidence": 0.97, "source": "mrz"},
  "mrz": {"value": "P<BGDUDDIN<<MOHAMMAD...