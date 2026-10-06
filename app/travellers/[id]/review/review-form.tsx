"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { correctTraveller } from "./actions";
import {
  dhakaToday,
  validatePassportDates,
} from "@/lib/passport-date-validation";

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
  { key: "expiry_date", label: "Passport expiry date", type: "date" },
  {
    key: "nationality",
    label: "Nationality",
    type: "text",
    maxLength: 100,
  },
] as const;

type FieldKey = (typeof fields)[number]["key"];

type ReviewDetails = {
  given_name: string | null;
  surname: string | null;
  full_name: string;
  passport_number: string | null;
  dob: string | null;
  expiry_date: string | null;
  nationality: string | null;
  verification_status: string | null;
};

export function TravellerCorrectionForm({
  travellerId,
  initialDetails,
}: {
  travellerId: string;
  initialDetails: ReviewDetails;
}) {
  const [state, formAction, pending] = useActionState(
    correctTraveller,
    { error: "", success: false },
  );

  const [checked, setChecked] = useState<Record<FieldKey, boolean>>({
    given_name: false,
    surname: false,
    passport_number: false,
    dob: false,
    expiry_date: false,
    nationality: false,
  });
  const [dob, setDob] = useState(initialDetails.dob ?? "");
  const [expiryDate, setExpiryDate] = useState(
    initialDetails.expiry_date ?? "",
  );
  const [today, setToday] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [expiryConfirmed, setExpiryConfirmed] = useState(false);

  useEffect(() => {
    setToday(dhakaToday());
  }, []);

  const dateValidation =
    today && dob && expiryDate
      ? validatePassportDates(dob, expiryDate, today)
      : null;

  const dateChecksPassed =
    Boolean(dateValidation) &&
    !dateValidation?.error &&
    (!dateValidation?.ageNeedsConfirmation || ageConfirmed) &&
    (!dateValidation?.expiryNeedsConfirmation || expiryConfirmed);
  const allChecked = fields.every((field) => checked[field.key]);

  if (state.success) {
    return (
      <div role="status">
        <p>Traveller corrections saved. Owner review recorded.</p>
        <Link href="/travellers">Return to traveller directory</Link>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="traveller_id" value={travellerId} />
      <input
        type="hidden"
        name="expected_fields"
        value={JSON.stringify(initialDetails)}
      />

      <p>
        Compare all six fields with the passport.
        Leave a name field blank only if it is blank on the passport.
        Check each box after reviewing the corresponding field,
        including a blank name field.
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
              htmlFor={`correction_${field.key}`}
              style={{ display: "block", fontWeight: 700 }}
            >
              {field.label}
            </label>

            <input
              id={`correction_${field.key}`}
              name={field.key}
              type={field.type}
                            value={
                field.key === "dob"
                  ? dob
                  : field.key === "expiry_date"
                    ? expiryDate
                    : undefined
              }
              defaultValue={
                field.key === "dob" || field.key === "expiry_date"
                  ? undefined
                  : initialDetails[field.key] ?? ""
              }
              max={
                field.key === "dob" ? today || undefined : undefined
              }
              maxLength={"maxLength" in field ? field.maxLength : undefined}
              required={
                field.key !== "given_name" && field.key !== "surname"
              }

              onChange={(event) => {
                if (field.key === "dob") {
                  setDob(event.target.value);
                  setAgeConfirmed(false);
                  setExpiryConfirmed(false);
                }

                if (field.key === "expiry_date") {
                  setExpiryDate(event.target.value);
                  setExpiryConfirmed(false);
                }

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
              Checked against passport
            </label>
          </div>
        ))}

        <label
          htmlFor="correction_reason"
          style={{ display: "block", fontWeight: 700 }}
        >
          Correction reason
        </label>

        <textarea
          id="correction_reason"
          name="reason"
          required
          maxLength={500}
          rows={3}
          placeholder="Explain why these details need correction"
          style={{
            display: "block",
            boxSizing: "border-box",
            width: "100%",
            margin: "8px 0 20px",
            padding: "12px",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
          }}
        />
        {dateValidation?.error && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {dateValidation.error}
          </p>
        )}

        {dateValidation?.ageNeedsConfirmation && (
          <label style={{ display: "block", margin: "16px 0" }}>
            <input
              type="checkbox"
              name="confirmed_unusual_age"
              checked={ageConfirmed}
              required
              onChange={(event) =>
                setAgeConfirmed(event.target.checked)
              }
            />{" "}
            Age exceeds 100 years. I checked the DOB against the
            passport and confirm it is correct.
          </label>
        )}

        {dateValidation?.expiryNeedsConfirmation && (
          <label style={{ display: "block", margin: "16px 0" }}>
            <input
              type="checkbox"
              name="confirmed_unusual_expiry"
              checked={expiryConfirmed}
              required
              onChange={(event) =>
                setExpiryConfirmed(event.target.checked)
              }
            />{" "}
            Expiry is more than 10 years from today. I checked the
            expiry date against the passport and confirm it is correct.
          </label>
        )}
        <button
          type="submit"
          disabled={!allChecked || !dateChecksPassed || pending}
          style={{
            padding: "13px 20px",
            border: 0,
            borderRadius: "8px",
            background: "#0f766e",
            color: "#ffffff",
            fontWeight: 700,
            opacity: allChecked && !pending ? 1 : 0.55,
            cursor: allChecked && !pending ? "pointer" : "not-allowed",
          }}
        >
          {pending ? "Saving..." : "Save reviewed corrections"}
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