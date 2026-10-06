"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { passportReviewFieldKeys } from "./passport-fields";
import {
  dhakaToday,
  validatePassportDates,
} from "@/lib/passport-date-validation";
type ReviewState = {
  error: string;
  success: boolean;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );

export async function confirmPassportDraft(
  _previousState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const fail = (error: string): ReviewState => ({
    error,
    success: false,
  });

  const text = (key: string) =>
    String(formData.get(key) ?? "").trim();

  const draftId = text("draft_id");

  if (!isUuid(draftId)) {
    return fail("Invalid passport draft.");
  }

  const checks = Object.fromEntries(
    passportReviewFieldKeys.map((key) => [
      key,
      formData.get(`checked_${key}`) === "on",
    ]),
  );

  if (passportReviewFieldKeys.some((key) => !checks[key])) {
    return fail("Review and confirm all six passport fields.");
  }

  const givenName = text("given_name").toUpperCase();
  const surname = text("surname").toUpperCase();
  const passportNumber = text("passport_number").toUpperCase();
  const nationality = text("nationality").toUpperCase();
  const dob = text("dob");
  const expiryDate = text("expiry_date");

  if (!givenName && !surname) {
    return fail("Enter the passport given name or surname.");
  }

  if (givenName.length > 100 || surname.length > 100) {
    return fail("Each name field must be at most 100 characters.");
  }

  const fullName = [givenName, surname].filter(Boolean).join(" ");

  if (fullName.length > 200) {
    return fail("Combined name must be at most 200 characters.");
  }

  if (!passportNumber || passportNumber.length > 30) {
    return fail("Passport number must contain 1 to 30 characters.");
  }

  if (!nationality || nationality.length > 100) {
    return fail("Nationality must contain 1 to 100 characters.");
  }

    const dateValidation = validatePassportDates(
    dob,
    expiryDate,
    dhakaToday(),
  );

  if (dateValidation.error) {
    return fail(dateValidation.error);
  }

  if (
    dateValidation.ageNeedsConfirmation &&
    formData.get("confirmed_unusual_age") !== "on"
  ) {
    return fail(
      "Confirm the DOB against the passport because age exceeds 100 years.",
    );
  }

  if (
    dateValidation.expiryNeedsConfirmation &&
    formData.get("confirmed_unusual_expiry") !== "on"
  ) {
    return fail(
      "Confirm the expiry against the passport because it is more than 10 years from today.",
    );
  }

  const db = await createClient();

  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();

  if (authError || !user) {
    return fail("Please sign in again.");
  }

  let travellerId: unknown;

  try {
    const { data, error } = await db.rpc(
      "confirm_passport_draft_with_date_review",
      {
        p_draft_id: draftId,
        p_given_name: givenName || null,
        p_surname: surname || null,
        p_passport_number: passportNumber,
        p_dob: dob,
        p_expiry_date: expiryDate,
        p_nationality: nationality,
        p_field_checks: checks,
                p_age_confirmed:
          formData.get("confirmed_unusual_age") === "on",
        p_expiry_confirmed:
          formData.get("confirmed_unusual_expiry") === "on",
      },
    );

    if (error) {
      if (
        error.code === "23505" &&
        error.message.includes("travellers_client_passport_unique")
      ) {
        return fail(
          "This passport already exists for the selected client. Review the existing traveller instead.",
        );
      }

      const safeMessages = [
        "Owner access required",
        "Passport draft not found",
        "Passport draft is already confirmed",
        "Passport draft is not available for review",
        "Review and confirm all six passport fields",
        "Enter the passport given name or surname",
        "Each name field must be at most 100 characters",
        "Combined name must be at most 200 characters",
        "Passport number must contain 1 to 30 characters",
        "Nationality must contain 1 to 100 characters",
        "Date of birth must not be in the future",
        "Passport expiry date must be after date of birth",
        "Date of birth must be valid and not in the future.",
        "Passport expiry date must be valid and after date of birth.",
        "Age at departure must not exceed 130 years",
        "Confirm the DOB against the passport because age exceeds 100 years.",
        "Confirm the expiry against the passport because it is more than 10 years from today.",
      ];

      return fail(
        safeMessages.includes(error.message)
          ? error.message
          : "Unable to confirm the draft. Refresh and check its status before submitting again.",
      );
    }

    travellerId = data;
  } catch {
    return fail(
      "Confirmation outcome is unknown. Refresh and check the draft status before submitting again.",
    );
  }

  if (typeof travellerId !== "string" || !isUuid(travellerId)) {
    return fail(
      "Confirmation outcome is unknown. Refresh and check the draft status.",
    );
  }

  try {
    revalidatePath("/travellers");
    revalidatePath(`/travellers/passport-drafts/${draftId}`);
    revalidatePath("/audit-log");
  } catch {
    return {
      error:
        "Traveller created successfully. Refresh the traveller directory to see it.",
      success: true,
    };
  }

  return { error: "", success: true };
}