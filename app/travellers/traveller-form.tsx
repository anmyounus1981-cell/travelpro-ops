"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { addTravellerWithFeedback } from "@/app/actions";
import {
  dhakaToday,
  validatePassportDates,
} from "@/lib/passport-date-validation";
import {
  ClientSelector,
  type SelectableClient,
} from "./client-selector";
import {
  lookupCorporateTraveller,
  type TravellerLookupResult,
} from "./traveller-lookup-actions";

type Client = SelectableClient;

const fieldStyle = {
  display: "block",
  boxSizing: "border-box" as const,
  width: "100%",
  marginTop: "6px",
  padding: "12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
};

export function TravellerForm({ clients }: { clients: Client[] }) {
  const [state, formAction, pending] = useActionState(
    addTravellerWithFeedback,
    { error: "", success: false },
  );
  const [dob, setDob] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [today, setToday] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [expiryConfirmed, setExpiryConfirmed] = useState(false);
  const [clientId, setClientId] = useState("");
  const [selectedClientType, setSelectedClientType] =
  useState<SelectableClient["client_type"] | null>(null);
  const [passportNumber, setPassportNumber] = useState("");
  const [lookupResult, setLookupResult] =
    useState<TravellerLookupResult | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const lookupVersion = useRef(0);

  const isCorporateClient =
    selectedClientType === "corporate";
  function clearTravellerLookup() {
    lookupVersion.current += 1;
    setLookupResult(null);
    setLookupBusy(false);
  }

  async function findExistingTraveller() {
    if (pending || lookupBusy || !isCorporateClient) {
      return;
    }

    const version = ++lookupVersion.current;
    setLookupBusy(true);
    setLookupResult(null);

    try {
      const result = await lookupCorporateTraveller(
        clientId,
        passportNumber,
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
    today && dob && expiryDate
      ? validatePassportDates(dob, expiryDate, today)
      : null;

  const dateChecksPassed =
    Boolean(dateValidation) &&
    !dateValidation?.error &&
    (!dateValidation?.ageNeedsConfirmation || ageConfirmed) &&
    (!dateValidation?.expiryNeedsConfirmation || expiryConfirmed);
  const corporateLookupPassed =
    selectedClientType === "individual" ||
    (isCorporateClient &&
      lookupResult?.success === true &&
      lookupResult.traveller === null);

  const creationDisabled =
    pending ||
    lookupBusy ||
    !clientId ||
    !dateChecksPassed ||
    !corporateLookupPassed;
    if (state.success || state.blocked) {
    return (
      <div role="status">
        {state.error ? (
          <p style={{ color: "#92400e", marginBottom: "12px" }}>
            {state.error}
          </p>
        ) : (
          <p style={{ marginBottom: "12px" }}>
            Traveller created successfully.
          </p>
        )}

        <Link href="/travellers">View traveller directory</Link>
      </div>
    );
  }

  return (
    <form
  action={formAction}
  onSubmit={(event) => {
    if (creationDisabled) {
      event.preventDefault();
    }
  }}
>
      <fieldset
        disabled={pending}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "18px",
          }}
        >
          <ClientSelector
  clients={clients}
  value={clientId}
  onChange={(nextClientId, nextClientType) => {
  clearTravellerLookup();
  setClientId(nextClientId);
  setSelectedClientType(nextClientType);
}}
  disabled={pending}
/>

          <label>
            Given Name
            <input
              name="given_name"
              maxLength={100}
              style={fieldStyle}
            />
          </label>

          <label>
            Surname / Last Name
            <input
              name="surname"
              maxLength={100}
              style={fieldStyle}
            />
          </label>

          <label>
            Passport number
            <input
  name="passport_number"
  required
  maxLength={30}
  value={passportNumber}
  onChange={(event) => {
    clearTravellerLookup();
    setPassportNumber(event.target.value);
  }}
  style={fieldStyle}
/>
          </label>

                    <label>
            Date of birth
            <input
              name="dob"
              type="date"
              required
              max={today || undefined}
              value={dob}
              onChange={(event) => {
                setDob(event.target.value);
                setAgeConfirmed(false);
                setExpiryConfirmed(false);
              }}
              style={fieldStyle}
            />
          </label>

          <label>
            Passport expiry date
            <input
              name="expiry_date"
              type="date"
              required
              value={expiryDate}
              onChange={(event) => {
                setExpiryDate(event.target.value);
                setExpiryConfirmed(false);
              }}
              style={fieldStyle}
            />
          </label>
          <label>
            Nationality
            <input
              name="nationality"
              maxLength={100}
              style={fieldStyle}
            />
          </label>

          <label>
            Passport image
            <input
              name="passport"
              type="file"
              accept="image/*"
              style={fieldStyle}
            />
          </label>
        </div>
        {isCorporateClient && (
          <section
            aria-label="Returning corporate traveller lookup"
            style={{ marginTop: "20px" }}
          >
            <button
              type="button"
              onClick={findExistingTraveller}
              disabled={pending || lookupBusy || !passportNumber.trim()}
            >
              {lookupBusy ? "Searching..." : "Find existing traveller"}
            </button>

            {lookupResult && !lookupResult.success && (
              <p role="alert" style={{ color: "#b91c1c" }}>
                {lookupResult.error}
              </p>
            )}

            {lookupResult?.success && lookupResult.traveller && (
              <div role="status">
                <p>
                  Existing traveller:{" "}
                  <strong>
                    {[
                      lookupResult.traveller.given_name,
                      lookupResult.traveller.surname,
                    ]
                      .filter(Boolean)
                      .join(" ") || lookupResult.traveller.full_name}
                  </strong>
                </p>

                <p>
                  Use this profile for the next trip. Review its passport
                  details before assigning it to a new case.
                </p>

                <Link
                  href={`/travellers/${lookupResult.traveller.id}/review`}
                >
                  Use existing traveller: open review and case assignment
                </Link>
              </div>
            )}

            {lookupResult?.success && !lookupResult.traveller && (
              <p role="status">
                No matching passport found under this corporate client.
                Review the entered details before creating a new profile.
              </p>
            )}
          </section>
        )}

        {dateValidation?.error && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {dateValidation.error}
          </p>
        )}

        {dateValidation?.ageNeedsConfirmation && (
          <label style={{ display: "block", marginTop: "16px" }}>
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
          <label style={{ display: "block", marginTop: "16px" }}>
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
          disabled={creationDisabled}
          style={{
            marginTop: "20px",
            padding: "13px 20px",
            border: 0,
            borderRadius: "8px",
            background: "#0f766e",
            color: "#ffffff",
            fontWeight: 700,
            opacity: creationDisabled ? 0.55 : 1,
            cursor: creationDisabled ? "not-allowed" : "pointer",
          }}
        >
          {pending ? "Saving..." : "Confirm traveller"}
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