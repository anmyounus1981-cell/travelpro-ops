# Travel Agency AI Operations Platform Product Requirements Document

MVP specification for OnlyAIApp implementation

**Product:** Travel Agency AI Operations Platform

**Development platform:** OnlyAIApp

**Architecture:** GitHub, Supabase, Vercel, and AI Agent

**Primary market:** B2B and managed travel operations in Bangladesh

**Version:** 1.0

**Date:** 17 September 2026

**Document owner:** A N M Younus

**Decision summary**

The MVP will not use a GDS API and will not automate payment collection, payment verification, PNR creation, ticket issuance, ticket re-issuance, voids, cancellations, or refunds. These activities remain under direct human control. The AI Agent will automate client intake, document collection, itinerary parsing, quotation preparation, reminders, notifications, workflow tracking, and approved communications.

# 1 Product overview

This product is a travel operations and client communication platform for an agency that performs reservation and ticketing work manually in approved GDS, airline, NDC, and supplier systems. The application centralizes client requests, passenger records, quotations, PNR information, payment evidence, reminders, documents, and operational status without taking control of financial or ticketing transactions.

## 1.1 Product objective

Reduce repetitive administrative work, prevent missed follow-ups and Ticketing Time Limits, improve visibility for the agency owner, and create a reliable audit trail while preserving human control over every financial and GDS transaction.

## 1.2 Target users

| **User**            | **Primary need**                                                                      | **Access level**               |
|---------------------|---------------------------------------------------------------------------------------|--------------------------------|
| Agency owner        | Full visibility, approvals, manual transaction control, reporting                     | Administrator                  |
| Travel consultant   | Manage assigned inquiries, quotations, bookings, and service cases                    | Operational user               |
| Client or traveller | Submit information, review options, confirm requests, receive reminders and documents | External portal or secure link |

## 1.3 Success outcomes

- Every inquiry is recorded with an owner, status, next action, and communication history.

- Every active unticketed booking has a recorded Ticketing Time Limit and reminder schedule.

- The owner receives immediate notification of payment evidence and ticketing, re-issuance, cancellation, or refund requests.

- No payment or GDS transaction can be executed by the AI Agent.

- Client-facing documents are generated only from verified or owner-approved data.

- The system remains usable even when the AI service is unavailable.

# 2 Product principles and guardrails

## 2.1 Four-pillar architecture

| **Pillar** | **Purpose**                                                                                    |
|------------|------------------------------------------------------------------------------------------------|
| GitHub     | Source-code ownership, version history, controlled changes, and backup                         |
| Supabase   | PostgreSQL database, authentication, private storage, role-based access, and scheduled jobs    |
| Vercel     | Web application hosting, secure server routes, deployment, and runtime monitoring              |
| AI Agent   | Intake assistance, extraction, drafting, parsing, reminders, triage, and workflow coordination |

## 2.2 Manual-control policy

The AI Agent must never perform, approve, or claim completion of a financial or ticketing transaction. Only the agency owner or an authorized travel professional may complete the following actions through the relevant bank, GDS, airline portal, NDC platform, BSP channel, or supplier system:

- Receive, transfer, verify, or refund money

- Create or modify a PNR

- Issue, re-issue, exchange, or void a ticket

- Cancel live flight segments

- Submit or complete a refund

- Approve a final penalty, fare difference, or refund amount

## 2.3 Human handoff rules

The system must escalate a case when AI confidence is below the configured threshold or when the request involves group travel, multi-city itineraries, infants, medical assistance, special service requests, name correction, split PNRs, partially used or no-show tickets, airline waivers, involuntary changes, disputed payments, incomplete fare rules, or uncertain transaction status.

# 3 Scope

## 3.1 MVP in scope

- Web, email, and WhatsApp inquiry intake through available approved integrations

- Client, company, traveller, inquiry, quotation, booking, service-case, and document records

- Passport image upload, OCR extraction, field-level confidence, and client or agent verification

- Manual fare-entry form and pasted GDS itinerary or PNR text parser

- Professional quotation and itinerary generation

- Client option selection and confirmation capture

- Manual PNR reference and Ticketing Time Limit entry

- Payment-evidence upload with Pending Owner Verification status

- Configurable reminders for payment, TTL, missing documents, and client response

- Owner dashboard, alerts, queues, audit history, and search

- Manual status recording for issue, re-issue, void, cancellation, and refund cases

- Approved email and WhatsApp messages and document delivery

## 3.2 MVP out of scope

- Direct GDS, NDC, airline, or supplier API connection

- Automated live fare or seat search

- Automated PNR creation, cancellation, ticket issuance, exchange, void, or refund

- Automatic payment collection, bank verification, payment reconciliation, or money transfer

- Formal accounting, BSP reconciliation, tax accounting, or statutory ledger

- Unverified immigration, visa, terminal, baggage, or fare-rule advice

# 4 User roles and permissions

| **Capability**                  | **Owner** | **Consultant** | **Client**        |
|---------------------------------|-----------|----------------|-------------------|
| View all cases                  | Yes       | Assigned only  | Own only          |
| Edit traveller data             | Yes       | Yes            | Submit or confirm |
| Approve OCR data                | Yes       | Yes            | Confirm own data  |
| Create quotation                | Yes       | Yes            | No                |
| Approve client-facing quotation | Yes       | If permitted   | No                |
| Verify payment                  | Yes       | No by default  | No                |
| Record ticketing result         | Yes       | If permitted   | No                |
| Manage users and settings       | Yes       | No             | No                |
| View audit logs                 | Yes       | Limited        | No                |

# 5 Core workflows

## 5.1 Inquiry intake

1.  Create a unique case from each new web, email, or WhatsApp inquiry.

2.  Capture client, company, route, dates, passenger count, trip type, cabin preference, flexibility, baggage needs, and notes.

3.  Detect missing information and request it using an approved message template.

4.  Assign the case to the owner or a consultant and set a next-action deadline.

5.  Escalate low-confidence or complex requests instead of answering conclusively.

## 5.2 Passport and traveller verification

6.  Accept passport files only through secure upload or approved communication channels.

7.  Store the original image in a private Supabase bucket.

8.  Extract full name, passport number, date of birth, expiry date, nationality, issuing country, gender where required, and MRZ data where available.

9.  Assign confidence per field and flag unreadable or inconsistent values.

10. Require client confirmation and agent approval before marking a traveller profile Verified.

11. Keep raw passport images out of application logs and apply a configurable retention policy.

## 5.3 Fare search and quotation

12. Owner or consultant searches fares manually in an approved GDS or supplier platform.

13. User pastes supported itinerary text or enters itinerary and fare details manually.

14. Parser extracts segments and passenger names without changing the source record.

15. User verifies airline, dates, times, airports, baggage, fare, taxes, service fee, conditions, and quotation expiry.

16. System produces a professional quotation and requires approval before sending.

17. Client selects an option through a secure link or confirmed communication channel.

Mandatory quotation notice: Fares, seats, schedules, baggage allowances, and fare conditions are subject to final verification before booking and ticket issuance.

## 5.4 Reservation and TTL

18. Owner or consultant revalidates the selected option and creates the PNR manually.

19. User records the PNR, source, itinerary, quoted amount, TTL, and source of the TTL.

20. System labels the booking Unticketed and sends an approved booking summary.

21. System schedules configured reminders and notifies the owner as the TTL approaches.

22. System never cancels the PNR automatically. A human records any manual release or cancellation.

## 5.5 Payment evidence and ticket issuance

23. Client uploads payment evidence; system stores it privately and sets Payment Status to Pending Owner Verification.

24. Owner receives an immediate alert and verifies funds outside the application.

25. Owner records payment as Verified or Rejected with a note.

26. Owner issues the ticket manually outside the application.

27. Owner records ticket number, issue date, final amount, and uploads or attaches the verified e-ticket.

28. AI sends the e-ticket and approved documents only after status becomes Issued by an authorized user.

## 5.6 Re-issuance

The AI collects the requested change and alerts the owner. A human retrieves the ticket, checks coupon status and rules, searches the replacement itinerary, calculates the authoritative penalty and fare difference, and approves the client quotation. After client acceptance and manual payment verification, a human completes the exchange and records the result. The system then distributes the approved updated documents.

## 5.7 Refund and cancellation

The AI records the request and alerts the owner. A human distinguishes itinerary cancellation, ticket void, automated refund, manual refund application, and waiver processing. The owner validates the applicable amount, obtains written client acceptance, submits the transaction manually, records supplier confirmation, transfers any client refund manually, and marks the case paid. Only then may the system send a final credit statement.

# 6 Functional requirements

| **ID** | **Area**           | **Requirement**                                                                         | **Priority** |
|--------|--------------------|-----------------------------------------------------------------------------------------|--------------|
| FR-001 | Authentication     | Support secure sign-in and role-based access for owner and consultants.                 | Must         |
| FR-002 | Inquiry intake     | Create cases from web forms and supported communication integrations.                   | Must         |
| FR-003 | Client records     | Maintain company, contact, traveller, consent, and communication records.               | Must         |
| FR-004 | Passport OCR       | Extract passport fields with per-field confidence and verification states.              | Must         |
| FR-005 | Private documents  | Store passport and payment files privately with controlled access.                      | Must         |
| FR-006 | PNR parser         | Parse pasted supported GDS text into editable itinerary and passenger fields.           | Must         |
| FR-007 | Manual fare entry  | Allow structured entry of fare, taxes, service fee, baggage, conditions, and expiry.    | Must         |
| FR-008 | Quotation          | Generate owner-approved quotation and itinerary documents.                              | Must         |
| FR-009 | Client response    | Capture selection, acceptance, rejection, and clarification requests.                   | Must         |
| FR-010 | Booking register   | Store PNR, source, TTL, itinerary, and ticketing status without executing GDS actions.  | Must         |
| FR-011 | Reminder engine    | Schedule configurable TTL, payment, document, and response reminders.                   | Must         |
| FR-012 | Owner alerts       | Immediately alert the owner about payment evidence and controlled-action requests.      | Must         |
| FR-013 | Manual approvals   | Restrict payment verification and controlled status changes to authorized users.        | Must         |
| FR-014 | Service cases      | Track re-issue, cancellation, void, and refund requests with separate statuses.         | Must         |
| FR-015 | Audit history      | Record actor, timestamp, previous value, new value, and reason for sensitive changes.   | Must         |
| FR-016 | Templates          | Manage approved email and WhatsApp templates with variable substitution.                | Should       |
| FR-017 | Search             | Search by client, company, PNR, ticket number, route, status, or date.                  | Must         |
| FR-018 | Reporting          | Show workload, TTL risk, pending payments, pending documents, and service-case status.  | Should       |
| FR-019 | Fallback operation | Permit manual workflow when AI extraction or drafting is unavailable.                   | Must         |
| FR-020 | Export             | Export operational records without exposing restricted documents to unauthorized users. | Should       |

# 7 Data model

| **Entity**       | **Purpose**                         | **Key fields**                                                     |
|------------------|-------------------------------------|--------------------------------------------------------------------|
| organizations    | Corporate client or account         | name, type, billing profile, contacts, status                      |
| profiles         | Internal users                      | user_id, role, active, permissions                                 |
| clients          | Primary client contacts             | organization_id, name, email, phone, consent                       |
| travellers       | Passenger profiles                  | client_id, verified name, DOB, nationality, document status        |
| travel_documents | Passport and document metadata      | traveller_id, private file path, fields, confidence, verification  |
| inquiries        | Travel requests                     | channel, route, dates, passenger count, owner, status, next action |
| quotations       | Quote header and totals             | inquiry_id, version, currency, fees, expiry, approval, status      |
| quote_options    | Comparable flight options           | quotation_id, itinerary, baggage, fare, conditions                 |
| bookings         | Manual PNR register                 | inquiry_id, PNR, source, TTL, status, owner                        |
| segments         | Flight segments                     | booking_id, airline, flight, airports, times, class, status        |
| payments         | Evidence and owner verification     | booking_id, amount, currency, private receipt, status, verified_by |
| tickets          | Manually recorded ticket results    | booking_id, traveller_id, ticket number, issue date, status        |
| service_cases    | Reissue, void, cancellation, refund | ticket_id, type, request, estimate, approval, status               |
| messages         | Communication history               | case reference, channel, direction, template, delivery status      |
| reminders        | Scheduled follow-ups                | reference, type, due_at, state, attempt count                      |
| documents        | Generated and uploaded files        | reference, type, private path, approved_by                         |
| audit_logs       | Sensitive change history            | actor, action, entity, before, after, timestamp                    |

# 8 Status model

| **Object**         | **Allowed statuses**                                                                                                                                 |
|--------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| Inquiry            | New, Gathering Information, Ready for Fare Search, Quoted, Awaiting Client, Selected, Closed, Escalated                                              |
| Traveller document | Uploaded, OCR Processing, Needs Review, Client Confirmed, Agent Verified, Rejected, Expired                                                          |
| Quotation          | Draft, Pending Approval, Approved, Sent, Viewed, Selected, Expired, Rejected, Superseded                                                             |
| Booking            | Pending Manual Booking, Unticketed, Payment Pending, Payment Under Review, Ready for Manual Issue, Issued, Released, Cancelled, Expired              |
| Payment            | Not Submitted, Evidence Submitted, Pending Owner Verification, Verified, Rejected                                                                    |
| Service case       | New, Under Review, Quote Pending, Awaiting Client, Awaiting Payment Verification, Ready for Manual Action, Completed, Rejected, Cancelled, Escalated |
| Reminder           | Scheduled, Sent, Delivered, Failed, Cancelled, Acknowledged                                                                                          |

# 9 Notification requirements

| **Trigger**                | **Recipient**                | **Required action**               |
|----------------------------|------------------------------|-----------------------------------|
| New inquiry                | Owner or assigned consultant | Review and assign next action     |
| Low AI confidence          | Owner                        | Take over the conversation        |
| Passport needs review      | Consultant                   | Correct and verify fields         |
| Client selects quote       | Owner or consultant          | Revalidate and book manually      |
| Payment evidence submitted | Owner                        | Verify funds manually             |
| TTL threshold reached      | Client and owner             | Follow up or take manual action   |
| Issue request              | Owner                        | Review payment and issue manually |
| Reissue or refund request  | Owner                        | Review ticket manually            |
| Delivery failure           | Owner or consultant          | Use another approved channel      |

# 10 Nonfunctional requirements

**Security:** Use Supabase Row Level Security, private storage buckets, least-privilege service credentials, server-side secret handling, multi-factor authentication where supported, and audit logging for sensitive actions.

**Privacy:** Collect explicit consent for passport processing, restrict access to personal data, use short-lived signed file URLs, avoid sensitive data in logs, and support retention and deletion policies.

**Reliability:** Reminder and notification jobs must be retryable and idempotent. A failed AI request must not block manual case processing.

**Performance:** Standard dashboard pages should load within three seconds under normal operating load, excluding external messaging or AI processing delays.

**Accessibility:** Use keyboard-accessible controls, clear labels, adequate contrast, readable validation errors, and responsive layouts.

**Observability:** Capture application errors, job failures, message-delivery failures, and security-relevant events without logging passport numbers or private documents.

**Ownership:** Repository, Supabase project, Vercel project, domains, API credentials, and business data must remain in accounts controlled by the agency owner.

# 11 AI behavior specification

## 11.1 Permitted AI actions

- Classify inquiry intent

- Extract and structure submitted information

- Draft approved communications

- Parse supported itinerary text

- Identify missing data

- Recommend next administrative action

- Schedule permitted reminders

- Summarize client updates

- Escalate uncertainty

## 11.2 Prohibited AI actions

- Claim payment is verified

- Create or alter a PNR

- Issue, void, exchange, or refund a ticket

- Cancel a live booking

- Invent a fare, baggage allowance, penalty, visa rule, terminal, or refund amount

- Send an unapproved financial or ticketing commitment

- Expose one client’s information to another client or unauthorized user

## 11.3 Confidence and approval

Each extraction or classification affecting a client record must retain confidence and source context. Low-confidence critical fields require human review. Client-facing quotations, ticketing-related messages, refund calculations, and policy statements require owner or authorized-consultant approval before sending unless the owner has explicitly approved the exact template and data source.

# 12 Acceptance criteria

| **ID** | **Acceptance criterion**                                                                                                        |
|--------|---------------------------------------------------------------------------------------------------------------------------------|
| AC-01  | A client submits an inquiry and a case appears with source, status, assignee, and next action.                                  |
| AC-02  | A passport upload remains private; extracted fields show individual confidence and cannot become Verified without confirmation. |
| AC-03  | A consultant pastes a supported itinerary, reviews extracted fields, and creates a quotation without any GDS API call.          |
| AC-04  | A quotation cannot be sent while Draft or Pending Approval.                                                                     |
| AC-05  | A selected option creates an owner task for manual fare revalidation and PNR creation.                                          |
| AC-06  | An unticketed booking with TTL schedules reminders and displays in the TTL risk queue.                                          |
| AC-07  | Payment evidence sets Pending Owner Verification and immediately alerts the owner; it never sets Verified automatically.        |
| AC-08  | Only an authorized user can mark a payment Verified or record Issued, Reissued, Voided, Cancelled, or Refunded.                 |
| AC-09  | The application contains no endpoint or automated job capable of executing a GDS or financial transaction.                      |
| AC-10  | Every sensitive status change is captured in the audit log with actor and timestamp.                                            |
| AC-11  | If AI processing fails, an agent can still complete the case through manual forms and approved templates.                       |
| AC-12  | A refund case cannot reach Refund Paid until an authorized user records the manual client payment.                              |

# 13 MVP screens

- Sign in and password recovery

- Owner dashboard with queues and alerts

- Inquiry list and inquiry detail

- Client, company, and traveller profiles

- Passport review and verification

- Manual fare entry and GDS text parser

- Quotation editor, preview, approval, and send

- Booking and TTL detail

- Payment-evidence review

- Ticket and document record

- Re-issuance, cancellation, void, and refund case detail

- Message history and reminder timeline

- Templates and notification settings

- Users, roles, permissions, and audit log

# 14 Implementation phases

| **Phase**               | **Deliverable**                                                                           | **Exit condition**                                             |
|-------------------------|-------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| 1 Foundation            | Repository, environments, authentication, RLS, core schema, roles, audit framework        | Owner can sign in and data access is role-restricted           |
| 2 Intake and CRM        | Inquiry, client, traveller, uploads, assignment, communication history                    | New inquiry can be managed end to end to fare-search readiness |
| 3 OCR and quotation     | Passport extraction, verification, parser, fare entry, quotation generation               | Approved quotation can be delivered without GDS API            |
| 4 Booking and reminders | Manual PNR and TTL register, payment evidence, reminder engine, owner alerts              | Unticketed booking is tracked with reliable reminders          |
| 5 Post-booking services | Ticket records, reissue, cancellation, void, refund cases, document delivery              | Manual actions can be recorded and communicated safely         |
| 6 Hardening             | Security review, retry logic, monitoring, accessibility, backups, user acceptance testing | All MVP acceptance criteria pass                               |

# 15 Risks and mitigations

| **Risk**                         | **Mitigation**                                                                                    |
|----------------------------------|---------------------------------------------------------------------------------------------------|
| Incorrect AI extraction          | Field-level confidence, source display, client confirmation, and agent verification               |
| Missed TTL                       | Required TTL field, multiple reminders, risk queue, owner alerts, and delivery-failure escalation |
| Unauthorized sensitive action    | Role checks, server-side enforcement, audit logs, and no transactional GDS endpoints              |
| Sensitive document exposure      | Private storage, RLS, signed URLs, restricted logs, and retention controls                        |
| Duplicate or conflicting records | Duplicate checks using contact, passport metadata, PNR, and ticket number                         |
| AI or messaging outage           | Manual forms, visible failed-job queue, retry controls, and alternate contact process             |
| Unclear operational status       | Explicit status models, required owner updates, timestamps, and next actions                      |
| Vendor lock-in                   | Agency-controlled GitHub, Supabase, Vercel, domains, credentials, and exportable data             |

# 16 Future considerations

Direct GDS or supplier API integration is not part of the MVP. It may be considered only after the agency obtains authorized access, required agreements, PCC or office permissions, certification, security controls, transaction monitoring, reconciliation, and operational support. Read-only capabilities such as live PNR retrieval or schedule updates should be evaluated before any transactional integration.

# 17 Definition of done

- All Must requirements and acceptance criteria pass in user acceptance testing.

- No automated payment or GDS transaction capability exists in production.

- Role-based permissions and Supabase RLS policies are tested.

- Private documents are inaccessible without authorization.

- Reminder retries and failure escalation are tested.

- The owner can manage the complete MVP workflow from inquiry to case closure.

- Source code, database, deployment, domains, and credentials are controlled by the agency owner.

- Operational documentation and backup procedures are delivered.
