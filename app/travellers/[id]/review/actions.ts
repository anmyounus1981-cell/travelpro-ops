"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type CorrectionState = {
  error: string;
  success: boolean;
};

export async function correctTraveller(
  _previousState: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const text = (key: string) =>
    String(formData.get(key) ?? "").trim();

  const travellerId = text("traveller_id");

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      travellerId,
    )
  ) {
    return { error: "Invalid traveller.", success: false };
  }

    const fields = [
    "given_name",
    "surname",
    "passport_number",
    "dob",
    "expiry_date",
    "nationality",
  ] as const;

  const checks = Object.fromEntries(
    fields.map((field) => [
      field,
      formData.get(`checked_${field}`) === "on",
    ]),
  );

  if (fields.some((field) => !checks[field])) {
    return {
      error: "Review and confirm all six passport fields.",
      success: false,
    };
  }

  const givenName = text("given_name").toUpperCase();
  const surname = text("surname").toUpperCase();

  if (!givenName && !surname) {
    return {
      error: "Enter the passport given name or surname.",
      success: false,
    };
  }

  if (givenName.length > 100 || surname.length > 100) {
    return {
      error: "Each name field must be at most 100 characters.",
      success: false,
    };
  }

  if ([givenName, surname].filter(Boolean).join(" ").length > 200) {
    return {
      error: "Combined name must be at most 200 characters.",
      success: false,
    };
  }

  if (
    ["passport_number", "dob", "expiry_date", "nationality"].some(
      (field) => !text(field),
    )
  ) {
    return {
      error: "Complete all remaining passport fields.",
      success: false,
    };
  }

  const reason = text("reason");

  if (!reason || reason.length > 500) {
    return {
      error: "Enter a correction reason of up to 500 characters.",
      success: false,
    };
  }

  let expectedFields: Record<string, unknown>;

  try {
    const parsed: unknown = JSON.parse(text("expected_fields"));

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {
        error: "Invalid review data. Refresh the page.",
        success: false,
      };
    }

    expectedFields = parsed as Record<string, unknown>;
  } catch {
    return {
      error: "Invalid review data. Refresh the page.",
      success: false,
    };
  }

  const db = await createClient();

  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();

  if (authError || !user) {
    return { error: "Please sign in again.", success: false };
  }

  const { data: savedId, error } = await db.rpc(
    "correct_traveller_details",
    {
      p_traveller_id: travellerId,
      p_expected_fields: expectedFields,
      p_given_name: givenName || null,
      p_surname: surname || null,
      p_passport_number: text("passport_number"),
      p_dob: text("dob"),
      p_expiry_date: text("expiry_date"),
      p_nationality: text("nationality"),
      p_field_checks: checks,
      p_reason: reason,
    },
  );

  if (error) {
    if (
      error.code === "23505" &&
      error.message.includes("travellers_client_passport_unique")
    ) {
      return {
        error: "This passport already exists for the selected client.",
        success: false,
      };
    }

    const safeMessages = [
      "Owner access required",
      "Review and confirm all six passport fields",
      "Enter the passport given name or surname",
      "Each name field must be at most 100 characters",
      "Combined name must be at most 200 characters",
      "Passport number must contain 1 to 30 characters",
      "Nationality must contain 1 to 100 characters",
      "Date of birth must not be in the future",
      "Passport expiry date must be after date of birth",
      "Correction reason must contain 1 to 500 characters",
      "Traveller not found",
      "Traveller changed. Refresh before saving",
      "No changes to save",
    ];

    return {
      error: safeMessages.includes(error.message)
        ? error.message
        : "Unable to save traveller corrections. Please try again.",
      success: false,
    };
  }

  if (savedId !== travellerId) {
    return {
      error: "Correction did not return the expected traveller.",
      success: false,
    };
  }

  revalidatePath("/travellers");
  revalidatePath(`/travellers/${travellerId}/review`);
  revalidatePath("/audit-log");
  revalidatePath("/");

  return { error: "", success: true };
}