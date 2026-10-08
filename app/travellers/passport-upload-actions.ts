"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type DraftRegistrationResult = {
  success: boolean;
  error: string;
  outcomeUnknown: boolean;
};

export async function registerPassportDraft(
  clientId: string,
  imagePath: string,
): Promise<DraftRegistrationResult> {
  const fail = (
    error: string,
    outcomeUnknown = false,
  ): DraftRegistrationResult => ({
    success: false,
    error,
    outcomeUnknown,
  });

  if (
    typeof clientId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      clientId,
    )
  ) {
    return fail("Select a valid client.");
  }

  if (
    typeof imagePath !== "string" ||
    !/^drafts\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(imagePath)
  ) {
    return fail("Invalid passport image path.");
  }

  const unknownMessage =
    "Draft registration outcome is unknown. Refresh the draft queue before uploading again.";

  try {
    const db = await createClient();

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();

    if (authError || !user) {
      return fail("Please sign in again.");
    }

    const { data, error } = await db.rpc(
      "create_passport_review_draft",
      {
        p_client_id: clientId,
        p_image_path: imagePath,
      },
    );

    if (error) {
      if (error.message === "Passport image is already registered") {
  return fail(
    "Passport image is already registered. Refresh and inspect the draft queue before uploading again.",
    true,
  );
}
      const safeMessages = [
        "Authentication required",
        "Owner access required",
        "Client not found",
        "Invalid passport image path",
        "Passport image not found or inaccessible",
      ];

      if (safeMessages.includes(error.message)) {
        return fail(error.message);
      }

      // SQLSTATE errors indicate the transaction failed.
      // Transport/API errors may have an uncertain outcome.
      if (/^[0-9A-Z]{5}$/.test(error.code ?? "")) {
        return fail("Unable to register the passport draft.");
      }

      return fail(unknownMessage, true);
    }

    if (
      typeof data !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        data,
      )
    ) {
      return fail(unknownMessage, true);
    }

    try {
      revalidatePath("/travellers");
      revalidatePath("/audit-log");
    } catch {
      return {
        success: true,
        error: "Draft created. Refresh the draft queue to see it.",
        outcomeUnknown: false,
      };
    }

    return {
      success: true,
      error: "",
      outcomeUnknown: false,
    };
  } catch {
    return fail(unknownMessage, true);
  }
}