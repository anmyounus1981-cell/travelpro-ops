"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { confirmPassportDraft } from "./actions";
import type {
  PassportReviewFields,
} from "./passport-fields";

const fields = [
  {
    key: "given_name",
    label: "Given Name",
    type: "text",
    maxLength: 100,
  },
  {
    key: "surname",
    label: "Surname / Last Name",
    type: "text",
    maxLength: 100,
  },
  {
    key: "passport_number",
    label: "Passport number",
    type: "text",
    maxLength: 30,
  },
  { key: "dob", label: "Date of birth", type: "date" },
  {
    key: "expiry_date",
    label: "Passport expiry date",
    type: "date",
  },
  {
    key: "nationality",
    label: "Nationality",
    type: "text",
    maxLength: 100,
  },
] as const;

type FieldKey = (typeof fields)[number]["key"];

export function PassportReviewForm({
  draftId,
  initialFields,
}: {
  draftId: string;
  initialFields?: PassportReviewFields;
}) {
  const [state, formAction, pending] = useActionState(
    confirmPassportDraft,
    { error: "", success: false },
  );

  const [values, setValues] = useState<Record<FieldKey, string>>({
    given_name: initialFields?.given_name ?? "",
    surname: initialFields?.surname ?? "",
    passport_number: initialFields?.passport_number ?? "",
    dob: initialFields?.dob ?? "",
    expiry_date: initialFields?.expiry_date ?? "",
    nationality: initialFields?.nationality ?? "",
  });

  const [checked, setChecked] = useState<Record<FieldKey, boolean>>({
    given_name: false,
    surname: false,
    passport_number: false,
    dob: false,
    expiry_date: false,
    nationality: false,
  });

  const allChecked = fields.every((field) => checked[field.key]);
  const hasName = Boolean(
    values.given_name.trim() || values.surname.trim(),
  );
  const canSubmit = allChecked && hasName && !pending;

  if (state.success) {
    return (
      <div role="status">
        <p>Passport review saved. Traveller created successfully.</p>
        <Link href="/travellers">
          Return to traveller directory
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="draft_id" value={draftId} />

      <p style={{ marginBottom: "16px" }}>
        Enter the given names and surname exactly as shown on the
        passport. Leave a name field blank only if it is blank on
        the passport. Check all six fields after reviewing them.
      </p>

      <fieldset
        disabled={pending}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        {fields.map((field) => {
          const isName =
            field.key === "given_name" || field.key === "surname";

          return (
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
                value={values[field.key]}
                type={field.type}
                maxLength={
                  "maxLength" in field ? field.maxLength : undefined
                }
                required={!isName}
                onChange={(event) => {
                  const value = event.target.value;

                  setValues((previous) => ({
                    ...previous,
                    [field.key]: value,
                  }));

                  setChecked((previous) => ({
                    ...previous,
                    [field.key]: false,
                  }));
                }}
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
                {isName
                  ? "Checked against passport, including if blank"
                  : "Checked against passport"}
              </label>
            </div>
          );
        })}

        {!hasName && (
          <p style={{ marginBottom: "12px" }}>
            Enter at least one passport name field.
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: "13px 20px",
            border: 0,
            borderRadius: "8px",
            background: "#0f766e",
            color: "#ffffff",
            fontWeight: 700,
            opacity: canSubmit ? 1 : 0.55,
          }}
        >
          {pending ? "Saving..." : "Confirm reviewed traveller"}
        </button>
      </fieldset>

      {state.error && (
        <p
          role="alert"
          style={{ color: "#b91c1c", marginTop: "12px" }}
        >
          {state.error}
        </p>
      )}
    </form>
  );
}