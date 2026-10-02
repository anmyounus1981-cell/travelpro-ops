"use client";

import { useActionState } from "react";
import { extractPassportDraft } from "./ocr-actions";

export function PassportExtractionForm({
  draftId,
}: {
  draftId: string;
}) {
  const [state, formAction, pending] = useActionState(
    extractPassportDraft,
    { error: "", success: false },
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="draft_id" value={draftId} />

      <p>
        Send this passport image to OpenAI to extract draft fields.
        API usage charges may apply. Owner review remains required.
      </p>

      <button
        type="submit"
        disabled={pending || state.success}
        style={{
          padding: "13px 20px",
          border: 0,
          borderRadius: "8px",
          background: "#173f70",
          color: "#ffffff",
          fontWeight: 700,
          opacity: pending || state.success ? 0.55 : 1,
          cursor: pending || state.success ? "not-allowed" : "pointer",
        }}
      >
        {pending ? "Extracting..." : "Extract passport fields"}
      </button>

      {state.error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {state.error}
        </p>
      )}

      {state.success && (
        <p role="status">
          Extraction saved. Compare every field with the passport.
        </p>
      )}
    </form>
  );
}