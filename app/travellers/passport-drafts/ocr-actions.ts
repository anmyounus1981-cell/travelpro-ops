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

    const { data: saved, error: saveError } = await db
      .from("passport_extraction_drafts")
      .update({
        extracted_fields: fields,
        provider_name: "openai:gpt-4.1-mini",
        confidence_by_field: {},
        evidence_by_field: {},
        extraction_error_code: null,
        status: "awaiting_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId)
      .eq("status", draft.status)
      .eq("updated_at", draft.updated_at)
      .select("id")
      .maybeSingle();

    if (saveError) {
      return {
        error: "Unable to save extracted fields.",
        success: false,
      };
    }

    if (!saved) {
      return {
        error: "The draft changed. Refresh before continuing.",
        success: false,
      };
    }

    revalidatePath("/travellers");
    revalidatePath(`/travellers/passport-drafts/${draftId}`);

    return { error: "", success: true };
  } catch {
    return {
      error:
        "OCR failed. Check provider configuration, API access and billing, or enter the fields manually.",
      success: false,
    };
  }
}