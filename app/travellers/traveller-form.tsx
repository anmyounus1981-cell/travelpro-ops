"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { addTravellerWithFeedback } from "@/app/actions";
import {
  dhakaToday,
  validatePassportDates,
} from "@/lib/passport-date-validation";
type Client = {
  id: string;
  company_name: string | null;
};

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
    <form action={formAction}>
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
          <label>
            Corporate client
            <select
              name="client_id"
              required
              defaultValue=""
              style={fieldStyle}
            >
              <option value="" disabled>
                Select client
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company_name || "Unnamed client"}
                </option>
              ))}
            </select>
          </label>

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
          disabled={pending || clients.length === 0 || !dateChecksPassed}
          style={{
            marginTop: "20px",
            padding: "13px 20px",
            border: 0,
            borderRadius: "8px",
            background: "#0f766e",
            color: "#ffffff",
            fontWeight: 700,
            opacity: pending || clients.length === 0 ? 0.55 : 1,
            cursor:
              pending || clients.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {pending ? "Saving..." : "Confirm traveller"}
        </button>
      </fieldset>

      {clients.length === 0 && (
        <p role="status" style={{ marginTop: "12px" }}>
          Add a corporate client before creating a traveller.
        </p>
      )}

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