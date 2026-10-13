"use server";

import { createIntakeClient } from "@/lib/supabase/intake";
import { checkLandingInquiryRateLimit } from "@/lib/inquiry-rate-limit";
export type InquirySubmissionResult = {
  success: boolean;
  message: string;
  receiptId: string | null;
  duplicate: boolean;
};

const SERVICE_TYPES = [
  "flight_booking",
  "visa_support",
  "package",
  "consultation",
] as const;

function readText(
  formData: FormData,
  field: string,
  maxLength: number,
): string {
  const values = formData.getAll(field);

  if (values.length > 1) {
    throw new Error(`Multiple values are not allowed for ${field}.`);
  }

  const value = values[0];

  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid value for ${field}.`);
  }

  const cleaned = value.trim();

  if (cleaned.length > maxLength) {
    throw new Error(`${field} exceeds the allowed length.`);
  }

  return cleaned;
}
function buildLandingPayload(formData: FormData) {
  const requestId = readText(formData, "requestId", 36);
  const clientType = readText(formData, "clientType", 20);
  const serviceType = readText(formData, "serviceType", 30);

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  ) {
    throw new Error("A valid submission request ID is required.");
  }

  if (!["corporate", "individual"].includes(clientType)) {
    throw new Error("Select a valid client type.");
  }

  if (
    !SERVICE_TYPES.includes(
      serviceType as (typeof SERVICE_TYPES)[number],
    )
  ) {
    throw new Error("Select a valid service type.");
  }

  const companyName = readText(formData, "corporateClient", 200);
  const contactName = readText(formData, "contactName", 200);
  const contactEmail = readText(formData, "contactEmail", 254);
  const contactPhone = readText(formData, "contactPhone", 16);

  if (!contactName) {
    throw new Error("Enter your name or contact person name.");
  }

  if (clientType === "corporate" && !companyName) {
    throw new Error("Enter the company name.");
  }

  if (!contactEmail && !contactPhone) {
    throw new Error("Enter an email address or phone number.");
  }

  if (
    contactEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
  ) {
    throw new Error("Enter a valid email address.");
  }

  if (contactPhone && !/^\+[1-9][0-9]{7,14}$/.test(contactPhone)) {
    throw new Error(
      "Include the phone country code, for example +8801700000000.",
    );
  }

  return {
    version: 1,
    requestId: requestId.toLowerCase(),
    source: "landing_page",
    clientType,
    serviceType,
    ...(clientType === "corporate" ? { companyName } : {}),
    contact: {
      name: contactName,
      ...(contactEmail ? { email: contactEmail } : {}),
      ...(contactPhone ? { phone: contactPhone } : {}),
    },
  };
}
function readTravelFields(formData: FormData, serviceType: string) {
  const origin = readText(formData, "origin", 3).toUpperCase();
  const destination = readText(formData, "destination", 3).toUpperCase();
  const departureDate = readText(formData, "departureDate", 10);
  const returnDate = readText(formData, "returnDate", 10);
  const notes = readText(formData, "notes", 4000);

  for (const [label, code] of [
    ["Origin", origin],
    ["Destination", destination],
  ]) {
    if (code && !/^[A-Z]{3}$/.test(code)) {
      throw new Error(`${label} must be a three-letter airport code.`);
    }
  }

  for (const value of [departureDate, returnDate]) {
    if (!value) continue;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error("Travel dates must use YYYY-MM-DD.");
    }

    const parsedDate = new Date(`${value}T00:00:00.000Z`);

    if (
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== value
    ) {
      throw new Error("Enter a valid travel date.");
    }
  }

  if (returnDate && !departureDate) {
    throw new Error("Enter a departure date before a return date.");
  }

  if (returnDate && returnDate < departureDate) {
    throw new Error("Return date cannot precede departure.");
  }

  const travel: Record<string, string | number> = {};

  if (origin) travel.origin = origin;
  if (destination) travel.destination = destination;
  if (departureDate) travel.departureDate = departureDate;
  if (returnDate) travel.returnDate = returnDate;
  if (notes) travel.notes = notes;

  if (serviceType === "flight_booking") {
    const countText = readText(formData, "passengerCount", 3);
    const cabin = readText(formData, "cabinClass", 30);

    if (countText) {
      if (!/^[1-9]\d{0,2}$/.test(countText)) {
        throw new Error("Passenger count must be an integer from 1 to 999.");
      }

      travel.passengerCount = Number(countText);
    }

    if (cabin) {
      if (
        !["economy", "premium_economy", "business", "first"].includes(cabin)
      ) {
        throw new Error("Select a valid cabin preference.");
      }

      travel.cabinClass = cabin;
    }
  }

  return travel;
}
function buildCompleteLandingPayload(formData: FormData) {
  const allowedFields = new Set([
    "requestId",
    "clientType",
    "serviceType",
    "corporateClient",
    "contactName",
    "contactEmail",
    "contactPhone",
    "origin",
    "destination",
    "departureDate",
    "returnDate",
    "passengerCount",
    "cabinClass",
    "notes",
    "website",
  ]);

  for (const [field, value] of formData.entries()) {
    if (!allowedFields.has(field) || typeof value !== "string") {
      throw new Error("Invalid inquiry form submission.");
    }
  }

  // Honeypot: legitimate visitors leave this field empty.
  if (readText(formData, "website", 200)) {
    throw new Error("Unable to accept this submission.");
  }

  const base = buildLandingPayload(formData);
  const travel = readTravelFields(formData, base.serviceType);

  const rawMessage = [
    `Service: ${base.serviceType}`,
    `Client type: ${base.clientType}`,
    ...Object.entries(travel).map(([field, value]) => `${field}: ${value}`),
  ].join("\n");

  const payload = {
    ...base,
    travel,
    rawMessage,
  };

  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 64 * 1024) {
    throw new Error("Inquiry submission is too large.");
  }

  return payload;
}
export async function submitLandingInquiry(
  formData: FormData,
): Promise<InquirySubmissionResult> {
  const fail = (message: string): InquirySubmissionResult => ({
    success: false,
    message,
    receiptId: null,
    duplicate: false,
  });

  let payload: ReturnType<typeof buildCompleteLandingPayload>;

  try {
    payload = buildCompleteLandingPayload(formData);
  } catch (error) {
    return fail(
      error instanceof Error
        ? error.message
        : "Invalid inquiry submission.",
    );
  }

  try {
    const rateLimit = await checkLandingInquiryRateLimit(payload.contact);

    if (!rateLimit.allowed) {
      return fail(
        `Too many attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
      );
    }

    const db = createIntakeClient();
    const { data, error } = await db.rpc("submit_inquiry_intake", {
      p_payload: payload,
    });

    if (error) {
      console.error("Landing inquiry intake RPC failed", {
        code: error.code,
      });

      if (error.code === "23505") {
        return fail(
          "This submission reference was already used with different details.",
        );
      }

      if (
        ["22023", "22P02", "22007", "22008", "22003", "22001"].includes(
          error.code,
        )
      ) {
        return fail("Check your inquiry details and travel dates.");
      }

      return fail(
        "Unable to confirm receipt. Retry without changing your details.",
      );
    }

    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        data.id,
      ) ||
      data.status !== "accepted" ||
      typeof data.duplicate !== "boolean"
    ) {
      return fail(
        "Unable to confirm receipt. Retry without changing your details.",
      );
    }

    return {
      success: true,
      message: data.duplicate
        ? "Your inquiry was already received."
        : "Your inquiry was received successfully.",
      receiptId: data.id,
      duplicate: data.duplicate,
    };
  } catch {
    return fail(
      "Inquiry submission is temporarily unavailable. Please try again later.",
    );
  }
}