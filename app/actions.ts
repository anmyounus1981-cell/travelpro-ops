"use server";
import { revalidatePath } from "next/cache"; import { redirect } from "next/navigation"; import { createClient } from "@/lib/supabase/server"; import { audit } from "@/lib/data/operations";
import { parseGdsItinerary, triageInquiry } from "@/lib/ai/tools";
const text=(fd:FormData,key:string)=>String(fd.get(key)??"").trim();
export async function createCase(fd:FormData){const clientId=text(fd,"client_id");if(!clientId)throw new Error("Client is required");const db=await createClient();const caseNumber=`TP-${new Date().toISOString().slice(2,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;const {data,error}=await db.from("cases").insert({case_number:caseNumber,client_id:clientId,assigned_to:"00000000-0000-0000-0000-000000000001",origin:text(fd,"origin").toUpperCase(),destination:text(fd,"destination").toUpperCase(),departure_date:text(fd,"departure_date"),return_date:text(fd,"return_date")||null,trip_type:text(fd,"trip_type"),passenger_count:Number(text(fd,"passenger_count")),cabin_class:text(fd,"cabin_class"),notes:text(fd,"notes"),intake_source:text(fd,"intake_source"),next_action:"Prepare fare options",next_action_deadline:new Date(Date.now()+86400000).toISOString()}).select("id").single();if(error)throw error;await audit("case.created","case",data.id,{case_number:caseNumber});revalidatePath("/");redirect(`/?case=${data.id}`)}
export async function updateCaseStatus(fd:FormData){const id=text(fd,"id"),status=text(fd,"status");const db=await createClient();const {error}=await db.from("cases").update({status}).eq("id",id);if(error)throw error;await audit("case.status_changed","case",id,{status});revalidatePath("/")}

async function upload(fd:FormData,key:string,bucket:string){const file=fd.get(key);if(!(file instanceof File)||!file.size)return null;const allowed=bucket==="passports"?file.type.startsWith("image/"):(file.type.startsWith("image/")||file.type==="application/pdf");if(!allowed)throw new Error(bucket==="passports"?"Please upload an image file":"Please upload an image or PDF");const db=await createClient();const path=`${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`;const{error}=await db.storage.from(bucket).upload(path,file,{contentType:file.type});if(error)throw error;return path}
export async function createClientRecord(fd:FormData){const db=await createClient();const{data,error}=await db.from("clients").insert({company_name:text(fd,"company_name"),contact_name:text(fd,"contact_name"),contact_email:text(fd,"contact_email"),contact_phone:text(fd,"contact_phone")}).select("id").single();if(error)throw error;await audit("client.created","client",data.id);revalidatePath("/")}
export async function addTraveller(fd:FormData){const db=await createClient();const path=await upload(fd,"passport","passports");const{data,error}=await db.from("travellers").insert({client_id:text(fd,"client_id"),full_name:text(fd,"full_name"),passport_number:text(fd,"passport_number"),passport_number_confidence:Number(text(fd,"passport_number_confidence")||"1"),passport_number_source:path?"manual_after_upload":"manual",dob:text(fd,"dob")||null,dob_confidence:1,dob_source:"manual",expiry_date:text(fd,"expiry_date")||null,expiry_date_confidence:1,expiry_date_source:"manual",nationality:text(fd,"nationality"),nationality_confidence:1,nationality_source:"manual",verification_status:"client_confirmed"}).select("id").single();if(error)throw error;if(path)await db.from("documents").insert({entity_type:"traveller",entity_id:data.id,file_path:path,file_type:"passport"});await audit("traveller.client_confirmed","traveller",data.id,{passport_uploaded:Boolean(path)});revalidatePath("/")}
export async function createQuotation(fd:FormData){const db=await createClient();const raw=text(fd,"itinerary_text"),segments=parseGdsItinerary(raw);const{data,error}=await db.from("quotations").insert({case_id:text(fd,"case_id"),itinerary_text:raw,parsed_segments:segments,parsed_segments_confidence:segments.length?.9:0,parsed_segments_source:"deterministic_parser",parsed_segments_review_status:"confirmed",base_fare:Number(text(fd,"base_fare")),taxes:Number(text(fd,"taxes")),service_fee:Number(text(fd,"service_fee")),baggage_info:text(fd,"baggage_info"),fare_conditions:text(fd,"fare_conditions"),expiry_date:text(fd,"expiry_date")}).select("id").single();if(error)throw error;await audit("quotation.created","quotation",data.id,{segments:segments.length});revalidatePath("/")}
export async function transitionQuotation(fd:FormData){const db=await createClient(),id=text(fd,"id");const{data:quote}=await db.from("quotations").select("status,case_id").eq("id",id).single();if(!quote)throw new Error("Quotation not found");const requested=text(fd,"status"),status=requested||(quote.status==="draft"?"approved":"sent");if(status==="sent"&&quote.status!=="approved")throw new Error("Quotation must be approved before sending");const{error}=await db.from("quotations").update({status,approved_by:status==="approved"?"00000000-0000-0000-0000-000000000001":undefined}).eq("id",id);if(error)throw error;if(status==="approved")await db.from("cases").update({status:"quoted"}).eq("id",quote.case_id);await audit(`quotation.${status}`,"quotation",id);revalidatePath("/")}
async function requireOwnerId(
  db: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser();

  if (userError || !user) {
    throw new Error("Authentication required");
  }

  const { data: owner, error: ownerError } = await db
    .from("app_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("role", "owner")
    .single();

  if (ownerError || !owner) {
    throw new Error("Owner access required");
  }

  return owner.id;
}

export async function createBooking(fd: FormData) {
  const db = await createClient();
  const ownerId = await requireOwnerId(db);

  const caseId = text(fd, "case_id");
  const quotationId = text(fd, "quotation_id") || null;
  const pnr = text(fd, "pnr").toUpperCase();
  const ttlSource = text(fd, "ttl_source");
  const quotedAmount = Number(text(fd, "quoted_amount"));
  const ttlDate = new Date(text(fd, "ttl"));

  if (!caseId) {
    throw new Error("Case is required");
  }

  if (!pnr) {
    throw new Error("PNR is required");
  }

  if (!ttlSource) {
    throw new Error("TTL source is required");
  }

  if (!Number.isFinite(quotedAmount) || quotedAmount < 0) {
    throw new Error("Quoted amount must be a valid non-negative number");
  }

  if (
    Number.isNaN(ttlDate.getTime()) ||
    ttlDate.getTime() <= Date.now()
  ) {
    throw new Error("TTL must be a valid future date and time");
  }

  if (quotationId) {
    const { data: quotation, error: quotationError } = await db
      .from("quotations")
      .select("id,status")
      .eq("id", quotationId)
      .in("status", ["approved", "sent", "accepted"])
      .maybeSingle();

    if (quotationError) {
      throw quotationError;
    }

    if (!quotation) {
      throw new Error(
        "Quotation must be approved before booking",
      );
    }
  }

  const ttl = ttlDate.toISOString();

  const { data: booking, error: bookingError } = await db
    .from("bookings")
    .insert({
      case_id: caseId,
      quotation_id: quotationId,
      pnr,
      pnr_source: text(fd, "pnr_source"),
      quoted_amount: quotedAmount,
      ttl,
      ttl_source: ttlSource,
      status: "unticketed",
      user_id: ownerId,
    })
    .select("id")
    .single();

  if (bookingError) {
    throw bookingError;
  }

  const { data: reminderCount, error: reminderError } =
    await db.rpc("schedule_booking_ttl_reminders", {
      p_booking_id: booking.id,
    });

  if (reminderError) {
    await db.from("bookings").delete().eq("id", booking.id);
    throw reminderError;
  }

  const { error: caseError } = await db
    .from("cases")
    .update({
      status: "booked",
      next_action: "Monitor payment and ticketing time limit",
      next_action_deadline: ttl,
    })
    .eq("id", caseId);

  if (caseError) {
    throw caseError;
  }

  await audit("booking.created", "booking", booking.id, {
    pnr,
    ttl,
    ttl_source: ttlSource,
    reminder_count: reminderCount,
    manual_gds_action_recorded: true,
  });

  revalidatePath("/");
  revalidatePath("/bookings");
  revalidatePath("/reminders");
}

export async function uploadPayment(fd: FormData) {
  const db = await createClient();
  const ownerId = await requireOwnerId(db);
  const bookingId = text(fd, "booking_id");
  const amount = Number(text(fd, "amount"));

  if (!bookingId) {
    throw new Error("Booking is required");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  const path = await upload(
    fd,
    "evidence",
    "payment-evidence",
  );

  if (!path) {
    throw new Error("No payment evidence on file");
  }

  const { data: payment, error: paymentError } = await db
    .from("payments")
    .insert({
      booking_id: bookingId,
      amount,
      evidence_file_path: path,
      status: "pending_verification",
      user_id: ownerId,
    })
    .select("id")
    .single();

  if (paymentError) {
    throw paymentError;
  }

  const { error: documentError } = await db
    .from("documents")
    .insert({
      entity_type: "payment",
      entity_id: payment.id,
      file_path: path,
      file_type: "payment_evidence",
      user_id: ownerId,
    });

  if (documentError) {
    throw documentError;
  }

  const { error: alertError } = await db
    .from("owner_alerts")
    .insert({
      alert_type: "payment_evidence",
      severity: "urgent",
      entity_type: "payment",
      entity_id: payment.id,
      title: "Payment evidence requires verification",
      message:
        "New payment evidence was submitted. Verify funds outside the application.",
      status: "unread",
      dedupe_key: `payment-evidence:${payment.id}`,
      user_id: ownerId,
    });

  if (alertError) {
    throw alertError;
  }

  await audit(
    "payment.evidence_submitted",
    "payment",
    payment.id,
    {
      booking_id: bookingId,
      amount,
      owner_alert_created: true,
    },
  );

  revalidatePath("/");
  revalidatePath("/payments");
}

export async function verifyPayment(fd: FormData) {
  const db = await createClient();
  const ownerId = await requireOwnerId(db);
  const id = text(fd, "id");
  const status = text(fd, "status") || "verified";
  const verificationNote = text(fd, "verification_note");

  if (!["verified", "rejected"].includes(status)) {
    throw new Error("Invalid payment verification status");
  }

  const { data: payment, error: paymentReadError } = await db
    .from("payments")
    .select("id,evidence_file_path")
    .eq("id", id)
    .single();

  if (paymentReadError) {
    throw paymentReadError;
  }

  if (!payment.evidence_file_path) {
    throw new Error("No payment evidence on file");
  }

  const { error: paymentUpdateError } = await db
    .from("payments")
    .update({
      status,
      verified_by: ownerId,
      verification_note: verificationNote,
    })
    .eq("id", id);

  if (paymentUpdateError) {
    throw paymentUpdateError;
  }

  const { error: alertUpdateError } = await db
    .from("owner_alerts")
    .update({
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("alert_type", "payment_evidence")
    .eq("entity_type", "payment")
    .eq("entity_id", id)
    .in("status", ["unread", "read"]);

  if (alertUpdateError) {
    throw alertUpdateError;
  }

  await audit(`payment.${status}`, "payment", id, {
    note: verificationNote,
    verified_by: ownerId,
  });

  revalidatePath("/");
  revalidatePath("/payments");
}

export async function recordTicket(fd: FormData) {
  const db = await createClient();
  const ownerId = await requireOwnerId(db);
  const bookingId = text(fd, "booking_id");
  const ticketNumber = text(fd, "ticket_number");
  const finalAmount = Number(text(fd, "final_amount"));

  if (!bookingId) {
    throw new Error("Booking is required");
  }

  if (!ticketNumber) {
    throw new Error("Ticket number is required");
  }

  if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
    throw new Error("Final amount must be greater than zero");
  }

  const { data: payment, error: paymentError } = await db
    .from("payments")
    .select("id,status")
    .eq("booking_id", bookingId)
    .eq("status", "verified")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paymentError) {
    throw paymentError;
  }

  if (!payment) {
    throw new Error(
      "Payment must be verified before ticketing",
    );
  }

  const path = await upload(fd, "e_ticket", "e-tickets");

  const { data: ticket, error: ticketError } = await db
    .from("tickets")
    .insert({
      booking_id: bookingId,
      payment_id: payment.id,
      ticket_number: ticketNumber,
      issue_date: text(fd, "issue_date"),
      final_amount: finalAmount,
      e_ticket_path: path,
      status: "issued",
      issued_by: ownerId,
      user_id: ownerId,
    })
    .select("id")
    .single();

  if (ticketError) {
    throw ticketError;
  }

  const { data: booking, error: bookingError } = await db
    .from("bookings")
    .update({
      status: "ticketed",
    })
    .eq("id", bookingId)
    .select("case_id")
    .single();

  if (bookingError || !booking) {
    throw bookingError || new Error("Booking not found");
  }

  const { error: reminderError } = await db.rpc(
    "schedule_booking_ttl_reminders",
    {
      p_booking_id: bookingId,
    },
  );

  if (reminderError) {
    throw reminderError;
  }

  const { error: caseError } = await db
    .from("cases")
    .update({
      status: "ticketed",
      next_action: "Deliver verified ticket documents",
      next_action_deadline: null,
    })
    .eq("id", booking.case_id);

  if (caseError) {
    throw caseError;
  }

  if (path) {
    const { error: documentError } = await db
      .from("documents")
      .insert({
        entity_type: "ticket",
        entity_id: ticket.id,
        file_path: path,
        file_type: "e_ticket",
        user_id: ownerId,
      });

    if (documentError) {
      throw documentError;
    }
  }

  await audit("ticket.issued", "ticket", ticket.id, {
    booking_id: bookingId,
    payment_id: payment.id,
    issued_by: ownerId,
    manual_action_recorded: true,
  });

  revalidatePath("/");
  revalidatePath("/bookings");
  revalidatePath("/tickets");
  revalidatePath("/reminders");
}

export async function createReminder(fd: FormData) {
  const db = await createClient();
  const ownerId = await requireOwnerId(db);
  const dueDate = new Date(text(fd, "due_at"));

  if (
    Number.isNaN(dueDate.getTime()) ||
    dueDate.getTime() <= Date.now()
  ) {
    throw new Error(
      "Reminder due date must be a valid future date and time",
    );
  }

  const { data: reminder, error: reminderError } = await db
    .from("reminders")
    .insert({
      entity_type: text(fd, "entity_type"),
      entity_id: text(fd, "entity_id"),
      reminder_type: text(fd, "reminder_type"),
      due_at: dueDate.toISOString(),
      next_attempt_at: dueDate.toISOString(),
      message: text(fd, "message"),
      status: "scheduled",
      channel: "in_app",
      audience: "owner",
      dedupe_key: `manual:${crypto.randomUUID()}`,
      user_id: ownerId,
    })
    .select("id")
    .single();

  if (reminderError) {
    throw reminderError;
  }

  await audit(
    "reminder.scheduled",
    "reminder",
    reminder.id,
    {
      due_at: dueDate.toISOString(),
      channel: "in_app",
      audience: "owner",
    },
  );

  revalidatePath("/");
  revalidatePath("/reminders");
}
export async function createServiceCase(fd:FormData){const db=await createClient();const bookingId=text(fd,"booking_id");const{data,error}=await db.from("service_cases").insert({booking_id:bookingId||null,case_id:text(fd,"case_id")||null,type:text(fd,"type"),request_details:text(fd,"request_details"),status:"requested"}).select("id").single();if(error)throw error;await audit("service_case.requested","service_case",data.id,{type:text(fd,"type")});revalidatePath("/")}
export async function transitionServiceCase(fd:FormData){const db=await createClient(),id=text(fd,"id");const{data:serviceCase}=await db.from("service_cases").select("status").eq("id",id).single();if(!serviceCase)throw new Error("Service case not found");const status=text(fd,"status")||(serviceCase.status==="requested"?"in_review":"completed");const{error}=await db.from("service_cases").update({status,result_summary:text(fd,"result_summary")||null}).eq("id",id);if(error)throw error;await audit(`service_case.${status}`,"service_case",id);revalidatePath("/")}
export async function createCaseFromInquiry(fd:FormData){const raw=text(fd,"inquiry"),draft=triageInquiry(raw),clientId=text(fd,"client_id");if(draft.missing_fields.includes("route"))throw new Error("Route is missing. Review the inquiry and use manual case entry.");const db=await createClient();const caseNumber=`TP-AI-${crypto.randomUUID().slice(0,6).toUpperCase()}`;const{data,error}=await db.from("cases").insert({case_number:caseNumber,client_id:clientId,assigned_to:"00000000-0000-0000-0000-000000000001",origin:draft.origin,destination:draft.destination,departure_date:text(fd,"departure_date"),trip_type:"oneway",passenger_count:draft.passenger_count,cabin_class:"Economy",notes:`Source inquiry: ${raw}\nMissing: ${draft.missing_fields.join(", ")||"none"}\nConfidence: ${Math.round(draft.confidence*100)}%`,status:"new",intake_source:"whatsapp",escalation_flag:draft.escalation_flags.length>0,escalation_reason:draft.escalation_flags.join(", ")||null,next_action:draft.missing_fields.length?"Collect missing information":"Prepare fare options"}).select("id").single();if(error)throw error;await audit("case.ai_draft_confirmed","case",data.id,{confidence:draft.confidence,flags:draft.escalation_flags});revalidatePath("/")}

export async function convertInquiryToCase(fd: FormData) {
  const inquiryId = text(fd, "inquiry_id");
  const clientId = text(fd, "client_id");

  if (!inquiryId) {
    throw new Error("Inquiry is required");
  }

  if (!clientId) {
    throw new Error("Please select a client");
  }

  const db = await createClient();

  const { data: inquiry, error: inquiryError } = await db
    .from("inquiries")
    .select(
      "id, source, raw_message, parsed_fields, status, converted_case_id"
    )
    .eq("id", inquiryId)
    .single();

  if (inquiryError || !inquiry) {
    throw inquiryError ?? new Error("Inquiry not found");
  }

  if (inquiry.status === "converted" || inquiry.converted_case_id) {
    throw new Error("This inquiry has already been converted");
  }

  const parsed = (inquiry.parsed_fields ?? {}) as Record<string, unknown>;

  const origin = String(parsed.origin ?? "").trim().toUpperCase();
  const destination = String(parsed.destination ?? "").trim().toUpperCase();
  const departureDate = String(parsed.departureDate ?? "").trim();
  const returnDate = String(parsed.returnDate ?? "").trim();
  const passengerCount = Number(parsed.passengerCount ?? 1);
  const cabinClass = String(parsed.cabinClass ?? "economy").toLowerCase();

  if (!origin || !destination || !departureDate) {
    throw new Error(
      "Origin, destination, and departure date must be confirmed before conversion"
    );
  }

  const caseNumber =
    `TP-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-` +
    crypto.randomUUID().slice(0, 4).toUpperCase();

  const { data: newCase, error: caseError } = await db
    .from("cases")
    .insert({
      case_number: caseNumber,
      client_id: clientId,
      assigned_to: "00000000-0000-0000-0000-000000000001",
      origin,
      destination,
      departure_date: departureDate,
      return_date: returnDate || null,
      trip_type: returnDate ? "roundtrip" : "oneway",
      passenger_count:
        Number.isInteger(passengerCount) && passengerCount > 0
          ? passengerCount
          : 1,
      cabin_class: cabinClass,
      notes: `Converted from ${inquiry.source} inquiry.\n\n${inquiry.raw_message}`,
      status: "new",
      intake_source: inquiry.source,
      next_action: "Prepare fare options",
      next_action_deadline: new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString(),
    })
    .select("id")
    .single();

  if (caseError || !newCase) {
    throw caseError ?? new Error("Case could not be created");
  }

  const { error: updateError } = await db
    .from("inquiries")
    .update({
      status: "converted",
      converted_case_id: newCase.id,
    })
    .eq("id", inquiryId);

  if (updateError) {
    throw updateError;
  }

  await audit("inquiry.converted", "inquiry", inquiryId, {
    case_id: newCase.id,
    case_number: caseNumber,
  });

  revalidatePath("/inbox");
  revalidatePath("/");
}export async function updateClientRecord(fd: FormData) {
  const id = text(fd, "id");
  const companyName = text(fd, "company_name");
  const contactName = text(fd, "contact_name");

  if (!id) {
    throw new Error("Client ID is required");
  }

  if (!companyName) {
    throw new Error("Company name is required");
  }

  const db = await createClient();

  const { error } = await db
    .from("clients")
    .update({
      company_name: companyName,
      contact_name: contactName,
      contact_email: text(fd, "contact_email") || null,
      contact_phone: text(fd, "contact_phone") || null,
    })
    .eq("id", id);

  if (error) {
    throw error;
  }

  await audit("client.updated", "client", id, {
    company_name: companyName,
  });

  revalidatePath("/clients");
  revalidatePath("/");
}export async function deleteClientRecord(fd: FormData) {
  const id = text(fd, "id");

  if (!id) {
    throw new Error("Client ID is required");
  }

  const db = await createClient();

  const [
    { count: caseCount, error: caseCheckError },
    { count: travellerCount, error: travellerCheckError },
  ] = await Promise.all([
    db
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id),
    db
      .from("travellers")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id),
  ]);

  if (caseCheckError) {
    throw caseCheckError;
  }

  if (travellerCheckError) {
    throw travellerCheckError;
  }

  if ((caseCount ?? 0) > 0 || (travellerCount ?? 0) > 0) {
    throw new Error(
      "This client cannot be deleted because it has cases or travellers.",
    );
  }

  const { error } = await db
    .from("clients")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }

  await audit("client.deleted", "client", id);

  revalidatePath("/clients");
  revalidatePath("/");
}