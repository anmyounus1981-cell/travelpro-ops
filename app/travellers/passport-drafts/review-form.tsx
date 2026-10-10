"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { confirmPassportDraft } from "./actions";
import {
  lookupCorporateTraveller,
  type TravellerLookupResult,
} from "../traveller-lookup-actions";
import {
  dhakaToday,
  validatePassportDates,
} from "@/lib/passport-date-validation";
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
  clientId,
  clientType,
  initialFields,
}: {
  draftId: string;
  clientId: string;
  clientType: "corporate" | "individual";
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
  const [today, setToday] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [expiryConfirmed, setExpiryConfirmed] = useState(false);
  const [lookupResult, setLookupResult] =
    useState<TravellerLookupResult | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [reuseConfirmed, setReuseConfirmed] = useState(false);
  const lookupVersion = useRef(0);

  const isCorporateClient = clientType === "corporate";

  function clearTravellerLookup() {
    lookupVersion.current += 1;
    setLookupResult(null);
    setLookupBusy(false);
    setReuseConfirmed(false);
  }

  async function findExistingTraveller() {
    if (
      pending ||
      state.blocked ||
      lookupBusy ||
      !isCorporateClient ||
      !values.passport_number.trim()
    ) {
      return;
    }

    const version = ++lookupVersion.current;
    setLookupBusy(true);
    setLookupResult(null);
    setReuseConfirmed(false);

    try {
      const result = await lookupCorporateTraveller(
        clientId,
        values.passport_number,
      );

      if (lookupVersion.current === version) {
        setLookupResult(result);
      }
    } catch {
      if (lookupVersion.current === version) {
        setLookupResult({
          success: false,
          error: "Unable to search travellers. Please try again.",
          traveller: null,
        });
      }
    } finally {
      if (lookupVersion.current === version) {
        setLookupBusy(false);
      }
    }
  }

  useEffect(() => {
    setToday(dhakaToday());
  }, []);

  const dateValidation =
    today && values.dob && values.expiry_date
      ? validatePassportDates(
          values.dob,
          values.expiry_date,
          today,
        )
      : null;

  const dateChecksPassed =
    Boolean(dateValidation) &&
    !dateValidation?.error &&
    (!dateValidation?.ageNeedsConfirmation || ageConfirmed) &&
    (!dateValidation?.expiryNeedsConfirmation || expiryConfirmed);
  const allChecked = fields.every((field) => checked[field.key]);
  const hasName = Boolean(
    values.given_name.trim() || values.surname.trim(),
  );
  const existingTraveller =
    lookupResult?.success ? lookupResult.traveller : null;

  const corporateLookupPassed =
    !isCorporateClient ||
    (lookupResult?.success === true &&
      (existingTraveller === null ||
        (existingTraveller.verification_status === "verified" &&
          reuseConfirmed)));

  const canSubmit =
    allChecked &&
    hasName &&
    dateChecksPassed &&
    !pending &&
    !state.blocked &&
    !lookupBusy &&
    corporateLookupPassed;

    if (state.success || state.blocked) {
    return (
      <div role="status">
        {state.success && (
          <p>
            {state.profileReused
              ? "Passport review saved. Existing traveller profile reused."
              : "Passport review saved. Traveller created successfully."}
          </p>
        )}

        {state.error && (
          <p style={{ color: "#92400e" }}>
            {state.error}
          </p>
        )}

        {state.success && state.travellerId && (
          <p>
            <Link href={`/travellers/${state.travellerId}/review`}>
              Open traveller review, case assignment and trip history
            </Link>
          </p>
        )}

        <Link href="/travellers">
          Return to traveller directory
        </Link>
      </div>
    );
  }

  return (
        <form
      action={formAction}
      onSubmit={(event) => {
        if (!canSubmit) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="draft_id" value={draftId} />
      <input
        type="hidden"
        name="existing_traveller_id"
        value={
          isCorporateClient && reuseConfirmed && existingTraveller
            ? existingTraveller.id
            : ""
        }
      />

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
                max={field.key === "dob" ? today || undefined : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                                    setReuseConfirmed(false);

                  if (field.key === "passport_number") {
                    clearTravellerLookup();
                  }

                  if (field.key === "dob") {
                    setAgeConfirmed(false);
                    setExpiryConfirmed(false);
                  }

                  if (field.key === "expiry_date") {
                    setExpiryConfirmed(false);
                  }
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

        {isCorporateClient && (
          <section
            aria-label="Returning corporate traveller lookup"
            style={{ margin: "20px 0" }}
          >
            <button
              type="button"
              onClick={findExistingTraveller}
              disabled={
                pending ||
                lookupBusy ||
                !values.passport_number.trim()
              }
            >
              {lookupBusy
                ? "Searching..."
                : "Find existing traveller"}
            </button>

            {lookupResult && !lookupResult.success && (
              <p role="alert" style={{ color: "#b91c1c" }}>
                {lookupResult.error}
              </p>
            )}

            {lookupResult?.success && !existingTraveller && (
              <p role="status">
                No matching passport found under this corporate client.
                Confirming will create a new traveller profile.
              </p>
            )}

            {existingTraveller && (
              <div>
                <p role="status">
                  Existing traveller:{" "}
                  <strong>
                    {[
                      existingTraveller.given_name,
                      existingTraveller.surname,
                    ]
                      .filter(Boolean)
                      .join(" ") || existingTraveller.full_name}
                  </strong>
                </p>

                <p>
                  <Link
                    href={`/travellers/${existingTraveller.id}/review`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open existing profile for review or correction
                  </Link>
                </p>

                {existingTraveller.verification_status !== "verified" ? (
                  <p>
                    Review and verify this profile first, then search again.
                  </p>
                ) : (
                  <label>
                    <input
                      type="checkbox"
                      checked={reuseConfirmed}
                      onChange={(event) =>
                        setReuseConfirmed(event.target.checked)
                      }
                    />{" "}
                    I checked this existing profile against the passport
                    and confirm that all six reviewed fields match.
                    Link this draft without changing the profile.
                  </label>
                )}
              </div>
            )}
          </section>
        )}
        {!hasName && (
          <p style={{ marginBottom: "12px" }}>
            Enter at least one passport name field.
          </p>
        )}
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
          {pending
            ? "Saving..."
            : existingTraveller
              ? "Confirm and link existing traveller"
              : "Confirm new traveller"}
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