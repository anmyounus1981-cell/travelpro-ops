"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ReviewState = {
  error: string;
  success: boolean;
};

export async function confirmPassportDraft(
  _previousState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const text = (key: string) =>
    String(formData.get(key) ?? "").trim();

  const draftId = text("draft_id");

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      draftId,
    )
  ) {
    return { error: "Invalid passport draft.", success: false };
  }

  const fields = [
    "full_name",
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

  if (fields.some((field) => !checks[field] || !text(field))) {
    return {
      error: "Complete and check all five passport fields.",
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

  const { data: travellerId, error } = await db.rpc(
    "confirm_passport_draft",
    {
      p_draft_id: draftId,
      p_full_name: text("full_name"),
      p_passport_number: text("passport_number"),
      p_dob: text("dob"),
      p_expiry_date: text("expiry_date"),
      p_nationality: text("nationality"),
      p_field_checks: checks,
    },
  );

  if (error) {
    return { error: error.message, success: false };
  }

  if (!travellerId) {
    return {
      error: "Confirmation did not return a traveller.",
      success: false,
    };
  }

  revalidatePath("/travellers");
  revalidatePath(`/travellers/passport-drafts/${draftId}`);

  return { error: "", success: true };
}