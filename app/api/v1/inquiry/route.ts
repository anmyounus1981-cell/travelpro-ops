import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  parseInquiry,
  type CabinClass,
  type InquiryInput,
  type InquirySource,
} from "@/lib/inquiries";
import { createClient } from "@/lib/supabase/server";

type InquiryPayload = {
  source?: InquirySource;
  sourceMessageId?: string;
  clientType?: "corporate" | "personal";
  corporateClient?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  rawMessage?: string;
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  passengerCount?: number;
  cabinClass?: CabinClass;
  notes?: string;
  channelMetadata?: Record<string, unknown>;
};

const ALLOWED_SOURCES: InquirySource[] = [
  "web",
  "email",
  "whatsapp",
];

function isValidSource(value: unknown): value is InquirySource {
  return (
    typeof value === "string" &&
    ALLOWED_SOURCES.includes(value as InquirySource)
  );
}

function cleanOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function buildRawMessage(payload: InquiryPayload): string {
  const suppliedMessage = cleanOptionalText(payload.rawMessage);

  if (suppliedMessage) {
    return suppliedMessage;
  }

  return [
    payload.corporateClient
      ? `Corporate client: ${payload.corporateClient}`
      : null,
    payload.origin ? `Origin: ${payload.origin}` : null,
    payload.destination
      ? `Destination: ${payload.destination}`
      : null,
    payload.departureDate
      ? `Departure date: ${payload.departureDate}`
      : null,
    payload.returnDate
      ? `Return date: ${payload.returnDate}`
      : null,
    payload.passengerCount
      ? `Passengers: ${payload.passengerCount}`
      : null,
    payload.cabinClass
      ? `Cabin class: ${payload.cabinClass}`
      : null,
    payload.notes ? `Notes: ${payload.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  let payload: InquiryPayload;

  try {
    payload = (await request.json()) as InquiryPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const source = isValidSource(payload.source)
    ? payload.source
    : "web";

  const rawMessage = buildRawMessage(payload);

  if (!rawMessage) {
    return NextResponse.json(
      { error: "Inquiry details are required." },
      { status: 400 },
    );
  }

  const inquiryInput: InquiryInput = {
    source,
    rawMessage,
    senderName: cleanOptionalText(payload.contactName),
    senderEmail: cleanOptionalText(payload.contactEmail),
    senderPhone: cleanOptionalText(payload.contactPhone),
    corporateClient: cleanOptionalText(payload.corporateClient),
    origin: cleanOptionalText(payload.origin),
    destination: cleanOptionalText(payload.destination),
    departureDate: cleanOptionalText(payload.departureDate),
    returnDate: cleanOptionalText(payload.returnDate),
    passengerCount: payload.passengerCount ?? null,
    cabinClass: payload.cabinClass ?? null,
    notes: cleanOptionalText(payload.notes),
  };

  const parsed = await parseInquiry(inquiryInput);

    const supabase = await createClient();

    const parsingStatus =
    parsed.confidence >= 0.6 ? "parsed" : "needs_review";

  const inquiryId = randomUUID();
  const createdAt = new Date().toISOString();

  const { error } = await supabase
    .from("inquiries")
    .insert({
      id: inquiryId,
      source,
      source_message_id: cleanOptionalText(
        payload.sourceMessageId,
      ),
      client_type:
        payload.clientType === "corporate"
          ? "corporate"
          : "personal",
      corporate_client_name:
        parsed.corporateClient ??
        cleanOptionalText(payload.corporateClient),
      contact_name: cleanOptionalText(payload.contactName),
      contact_email: cleanOptionalText(payload.contactEmail),
      contact_phone: cleanOptionalText(payload.contactPhone),
      raw_message: rawMessage,
      parsed_fields: parsed,
      parsing_status: parsingStatus,
      parser_source:
        process.env.OPENAI_API_KEY &&
        process.env.OPENAI_MODEL
          ? "openai_or_fallback"
          : "deterministic",
      parser_confidence: parsed.confidence,
      channel_metadata: payload.channelMetadata ?? {},
      status: "new",
      created_at: createdAt,
    });

  if (error) {
    console.error(
      "Inquiry insert failed:",
      error.message,
    );

    return NextResponse.json(
      { error: "Unable to save inquiry." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      message: "Inquiry received successfully.",
      inquiry: {
        id: inquiryId,
        source,
        status: "new",
        parsed_fields: parsed,
        created_at: createdAt,
      },
    },
    { status: 201 },
  );
}