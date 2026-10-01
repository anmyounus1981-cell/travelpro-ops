"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { confirmPassportDraft } from "./actions";

const fields = [
  { key: "full_name", label: "Full name", type: "text", maxLength: 200 },
  {
    key: "passport_number",
    label: "Passport number",
    type: "text",
    maxLength: 30,
  },
  { key: "dob", label: "Date of birth", type: "date" },
  { key: "expiry_date", label: "Passport expiry date", type: "date" },
  { key: "nationality", label: "Nationality", type: "text", maxLength: 100 },
] as const;

type FieldKey = (typeof fields)[number]["key"];

export function PassportReviewForm({ draftId }: { draftId: string }) {
  const [state, formAction, pending] = useActionState(
    confirmPassportDraft,
    { error: "", success: false },
  );

  const [checked, setChecked] = useState<Record<FieldKey, boolean>>({
    full_name: false,
    passport_number: false,
    dob: false,
    expiry_date: false,
    nationality: false,
  });

  const allChecked = fields.every((field) => checked[field.key]);

  if (state.success) {
    return (
      <div role="status">
        <p>Passport review saved. Traveller created successfully.</p>
        <Link href="/travellers">Return to traveller directory</Link>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="draft_id" value={draftId} />

      <p>
        Enter each field exactly as shown on the passport.
        Check each box only after comparing it with the image.
      </p>

      <fieldset
        disabled={pending}
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        {fields.map((field) => (
          <div
            key={field.key}
            style={{
              marginBottom: "20px",
              padding: "16px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
            }}
          >
            <label
              htmlFor={`review_${field.key}`}
              style={{ display: "block", fontWeight: 700 }}
            >
              {field.label}
            </label>

            <input
              id={`review_${field.key}`}
              name={field.key}
              type={field.type}
              maxLength={"maxLength" in field ? field.maxLength : undefined}
              required
              onChange={() =>
                setChecked((previous) => ({
                  ...previous,
                  [field.key]: false,
                }))
              }
              style={{
                display: "block",
                boxSizing: "border-box",
                width: "100%",
                margin: "8px 0 12px",
                padding: "12px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
              }}
            />

            <label>
              <input
                type="checkbox"
                name={`checked_${field.key}`}
                checked={checked[field.key]}
                required
                onChange={(event) =>
                  setChecked((previous) => ({
                    ...previous,
                    [field.key]: event.target.checked,
                  }))
                }
              />{" "}
              Checked against passport
            </label>
          </div>
        ))}

        <button
          type="submit"
          disabled={!allChecked || pending}
          style={{
            padding: "13px 20px",
            border: 0,
            borderRadius: "8px",
            background: "#0f766e",
            color: "#ffffff",
            fontWeight: 700,
            opacity: allChecked && !pending ? 1 : 0.55,
          }}
        >
          {pending ? "Saving..." : "Confirm reviewed traveller"}
        </button>
      </fieldset>

      {state.error && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}