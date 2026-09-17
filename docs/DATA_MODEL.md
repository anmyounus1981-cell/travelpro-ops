# Data Model

## app_users
- id: uuid (PK)
- name: text
- email: text unique
- role: text ('owner' | 'consultant')
- user_id: uuid nullable (links to auth.users later)
- created_at: timestamptz

## clients
- id: uuid (PK)
- company_name: text
- contact_name: text
- contact_email: text
- contact_phone: text
- user_id: uuid nullable
- created_at: timestamptz

## travellers
- id: uuid (PK)
- client_id: uuid (FK → clients)
- full_name: text
- passport_number: text
- passport_number_confidence: numeric
- passport_number_source: text
- dob: date
- dob_confidence: numeric
- dob_source: text
- expiry_date: date
- expiry_date_confidence: numeric
- expiry_date_source: text
- nationality: text
- nationality_confidence: numeric
- nationality_source: text
- mrz_data: text
- mrz_confidence: numeric
- mrz_source: text
- verification_status: text ('unreviewed' | 'client_confirmed' | 'verified' | 'rejected')
- review_status: text default 'unreviewed'
- user_id: uuid nullable
- created_at: timestamptz

## cases
- id: uuid (PK)
- case_number: text unique
- client_id: uuid (FK → clients)
- assigned_to: uuid (FK → app_users)
- origin: text
- destination: text
- departure_date: date
- return_date: date nullable
- trip_type: text ('oneway' | 'roundtrip' | 'multicity')
- passenger_count: int
- cabin_class: text
- notes: text
- status: text ('new' | 'in_progress' | 'quoted' | 'confirmed' | 'booked' | 'ticketed' | 'closed')
- intake_source: text ('web' | 'email' | 'whatsapp' | 'manual')
- escalation_flag: boolean default false
- escalation_reason: text nullable
- next_action: text nullable
- next_action_deadline: timestamptz nullable
- user_id: uuid nullable
- created_at: timestamptz

## quotations
- id: uuid (PK)
- case_id: uuid (FK → cases)
- itinerary_text: text (raw paste)
- parsed_segments: jsonb (AI-extracted, editable)
- parsed_segments_confidence: numeric
- parsed_segments_source: text
- parsed_segments_review_status: text default 'unreviewed'
- base_fare: numeric
- taxes: numeric
- service_fee: numeric
- total_amount: numeric
- baggage_info: text
- fare_conditions: text
- expiry_date: timestamptz
- status: text ('draft' | 'approved' | 'sent' | 'accepted' | 'rejected')
- approved_by: uuid nullable (FK → app_users)
- user_id: uuid nullable
- created_at: timestamptz

## bookings
- id: uuid (PK)
- case_id: uuid (FK → cases)
- quotation_id: uuid nullable (FK → quotations)
- pnr: text
- pnr_source: text ('gds' | 'airline' | 'supplier')
- itinerary: jsonb
- quoted_amount: numeric
- ttl: timestamptz
- ttl_source: text
- status: text ('unticketed' | 'ticketed' | 'cancelled' | 'expired')
- user_id: uuid nullable
- created_at: timestamptz

## payments
- id: uuid (PK)
- booking_id: uuid (FK → bookings)
- amount: numeric
- evidence_file_path: text
- status: text ('pending_verification' | 'verified' | 'rejected')
- verified_by: uuid nullable (FK → app_users)
- verification_note: text nullable
- user_id: uuid nullable
- created_at: timestamptz

## tickets
- id: uuid (PK)
- booking_id: uuid (FK → bookings)
- payment_id: uuid nullable (FK → payments)
- ticket_number: text
- issue_date: date
- final_amount: numeric
- e_ticket_path: text nullable
- status: text ('issued' | 'voided' | 'exchanged')
- issued_by: uuid nullable (FK → app_users)
- user_id: uuid nullable
- created_at: timestamptz

## service_cases
- id: uuid (PK)
- booking_id: uuid nullable (FK → bookings)
- ticket_id: uuid nullable (FK → tickets)
- case_id: uuid nullable (FK → cases)
- type: text ('reissuance' | 'refund' | 'cancellation' | 'void' | 'waiver')
- request_details: text
- status: text ('requested' | 'in_review' | 'accepted' | 'completed' | 'rejected')
- result_summary: text nullable
- user_id: uuid nullable
- created_at: timestamptz

## documents
- id: uuid (PK)
- entity_type: text ('traveller' | 'payment' | 'ticket' | 'quotation')
- entity_id: uuid
- file_path: text
- file_type: text ('passport' | 'payment_evidence' | 'e_ticket' | 'quotation')
- user_id: uuid nullable
- created_at: timestamptz

## reminders
- id: uuid (PK)
- entity_type: text ('booking' | 'payment' | 'case' | 'traveller')
- entity_id: uuid
- reminder_type: text ('ttl' | 'payment' | 'missing_docs' | 'client_response')
- due_at: timestamptz
- status: text ('scheduled' | 'sent' | 'dismissed')
- message: text
- user_id: uuid nullable
- created_at: timestamptz

## audit_logs
- id: uuid (PK)
- actor_id: uuid nullable (FK → app_users)
- action: text (e.g. 'case.created', 'quotation.approved', 'payment.verified', 'ticket.issued')
- entity_type: text
- entity_id: uuid
- details: jsonb
- user_id: uuid nullable
- created_at: timestamptz

## Relationships
- client → travellers (1:N)
- client → cases (1:N)
- case → quotations (1:N)
- case → bookings (1:N)
- booking → payments (1:N)
- booking → tickets (1:N)
- booking/ticket → service_cases (N:1)
- All → documents (polymorphic via entity_type/entity_id)
- All → reminders (polymorphic)
- All → audit_logs (polymorphic)

## RLS Notes
v1: permissive read/write for demo. Lock-down sprint: `auth.uid() = user_id` on all tables. Owner sees all; consultant sees assigned cases + related records. AI fields carry confidence + source + review_status.
