"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractPassportFields } from "./extract-passport";

type ExtractionState = {
  error: string;
  success: boolean;
};

export async function extractPassportDraft(
  _previousState: ExtractionState,
  formData: FormData,
): Promise<ExtractionState> {
  const draftId = String(formData.get("draft_id") ?? "").trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      draftId,
    )
  ) {
    return { error: "Invalid passport draft.", success: false };
  }

    if (process.env.PASSPORT_OCR_ENABLED !== "true") {
    return {
      error: "Automatic extraction is disabled. Use manual field review.",
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

  const { data: owner, error: ownerError } = await db
    .from("app_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (ownerError || !owner) {
    return { error: "Owner access required.", success: false };
  }

  const { data: draft, error: draftError } = await db
    .from("passport_extraction_drafts")
    .select("id, image_path, status, updated_at")
    .eq("id", draftId)
    .maybeSingle();

  if (draftError || !draft) {
    return { error: "Passport draft not found.", success: false };
  }

  if (!["uploaded", "extraction_failed"].includes(draft.status)) {
    return {
      error: "This draft is not available for extraction.",
      success: false,
    };
  }

  const { data: image, error: imageError } = await db.storage
    .from("passports")
    .download(draft.image_path);

  if (imageError || !image) {
    return {
      error: "Unable to read the private passport image.",
      success: false,
    };
  }

  const mimeType = image.type.toLowerCase();

  if (
    !["image/jpeg", "image/png", "image/webp"].includes(mimeType) ||
    image.size === 0 ||
    image.size > 5 * 1024 * 1024
  ) {
    return {
      error: "Use a JPEG, PNG or WebP image up to 5 MB.",
      success: false,
    };
  }

  try {
    const bytes = Buffer.from(await image.arrayBuffer());
    const imageDataUrl =
      `data:${mimeType};base64,${bytes.toString("base64")}`;

    const fields = await extractPassportFields(imageDataUrl);

    const { data: saved, error: saveError } = await db.rpc(
  "save_passport_draft_extraction",
  {
    p_draft_id: draftId,
    p_expected_status: draft.status,
    p_expected_updated_at: draft.updated_at,
    p_extracted_fields: fields,
  },
);

   if (saveError) {
  const safeMessages = [
    "Authentication required",
    "Owner access required",
    "Invalid extracted passport fields",
    "Passport draft not found",
    "The draft changed. Refresh before continuing.",
    "This draft is not available for extraction.",
  ];

  return {
    error: safeMessages.includes(saveError.message)
      ? saveError.message
      : "Unable to confirm extraction save. Refresh and check the draft before trying again.",
    success: false,
  };
}

if (saved !== draftId) {
  return {
    error: "Extraction save outcome is unknown. Refresh and check the draft.",
    success: false,
  };
}

revalidatePath("/travellers");
revalidatePath(`/travellers/passport-drafts/${draftId}`);
revalidatePath("/audit-log");

    return { error: "", success: true };
    } catch (error: unknown) {
    const details =
      error !== null && typeof error === "object"
        ? (error as Record<string, unknown>)
        : {};

    const status =
      typeof details.status === "number"
        ? details.status
        : null;

    const knownCodes = [
      "insufficient_quota",
      "invalid_api_key",
      "model_not_found",
      "rate_limit_exceeded",
      "permission_denied",
      "invalid_image",
      "invalid_image_format",
      "invalid_request_error",
    ];

    let code =
      typeof details.code === "string" &&
      knownCodes.includes(details.code)
        ? details.code
        : "extraction_failed";

    if (
      error instanceof Error &&
      error.message === "OCR provider is not configured."
    ) {
      code = "provider_not_configured";
    }

    console.error("Passport OCR failed", {
      code,
      status,
    });

    return {
      error: `OCR failed: ${code}${
        status === null ? "" : ` (HTTP ${status})`
      }. Manual review remains available.`,
      success: false,
    };
  }
}