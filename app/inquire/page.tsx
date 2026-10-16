"use client";

import {
  type FormEvent,
  useRef,
  useState,
} from "react";

import { submitLandingInquiry } from "./actions";
import AirportAutocomplete from "@/components/inquiries/AirportAutocomplete";
import styles from "./page.module.css";

type InquiryFormValues = {
  clientType: "individual" | "corporate";
  serviceType:
    | "flight_booking"
    | "visa_support"
    | "package"
    | "consultation";
  corporateClient: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  passengerCount: string;
  cabinClass: string;
  notes: string;
  website: string;
};

const INITIAL_FORM: InquiryFormValues = {
  clientType: "individual",
  serviceType: "flight_booking",
  corporateClient: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  origin: "",
  destination: "",
  departureDate: "",
  returnDate: "",
  passengerCount: "",
  cabinClass: "",
  notes: "",
  website: "",
};

export default function InquiryPage() {
  const requestIdRef = useRef<string | null>(null);
  const submissionInFlightRef = useRef(false);
  const submissionSnapshotRef =
    useRef<InquiryFormValues | null>(null);
  const outcomeUncertainRef = useRef(false);
  const [recoveryState, setRecoveryState] =
    useState<"unknown" | "conflict" | null>(null);
  const [form, setForm] =
    useState<InquiryFormValues>(INITIAL_FORM);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [isSuccess, setIsSuccess] =
    useState(false);  function updateField(
    field: keyof InquiryFormValues,
    value: string,
    ) {
    if (
      submissionInFlightRef.current ||
      submissionSnapshotRef.current !== null
    ) {
      return;
    }

    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

   async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      submissionInFlightRef.current ||
      recoveryState === "conflict"
    ) {
      return;
    }

    submissionInFlightRef.current = true;
    setIsSubmitting(true);
    setMessage("");
    setIsSuccess(false);

    try {
      if (!requestIdRef.current) {
        requestIdRef.current = crypto.randomUUID();
      }

      if (!submissionSnapshotRef.current) {
        submissionSnapshotRef.current = { ...form };
      }

      const submission = new FormData();
      submission.set("requestId", requestIdRef.current);

      for (const [field, value] of Object.entries(
        submissionSnapshotRef.current,
      )) {
        submission.set(field, value);
      }

      const result = await submitLandingInquiry(submission);

      if (
        result.success === true &&
        result.outcome === "accepted" &&
        typeof result.receiptId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          result.receiptId,
        )
      ) {
        setIsSuccess(true);
        setMessage(`${result.message} Reference: ${result.receiptId}`);
        setForm({ ...INITIAL_FORM });
        requestIdRef.current = null;
        submissionSnapshotRef.current = null;
        outcomeUncertainRef.current = false;
        setRecoveryState(null);
        return;
      }

      if (
        result.success === false &&
        result.outcome === "rejected" &&
        !outcomeUncertainRef.current
      ) {
        submissionSnapshotRef.current = null;
        requestIdRef.current = null;
        setRecoveryState(null);
        setMessage(result.message);
        return;
      }

      outcomeUncertainRef.current = true;

      if (
        result.success === false &&
        result.outcome === "conflict"
      ) {
        setRecoveryState("conflict");
        setMessage(
          "This submission reference conflicts with existing details. " +
            "Receipt cannot be confirmed. Contact TravelPro before submitting again.",
        );
        return;
      }

      setRecoveryState("unknown");
      setMessage(
        result.success === false &&
          result.outcome === "rejected"
          ? `${result.message} An earlier attempt is still unconfirmed. ` +
              "Keep these details unchanged and retry when allowed."
          : "Unable to confirm receipt. Your details are locked to prevent changes. " +
              "Retry this submission without changing your details.",
      );
    } catch {
      outcomeUncertainRef.current = true;
      setRecoveryState("unknown");
      setMessage(
        "Unable to confirm receipt. Your details are locked to prevent changes. " +
          "Retry this submission without changing your details.",
      );
    } finally {
      submissionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  const fieldsLocked =
    isSubmitting || recoveryState !== null;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>
            TravelPro Ops
          </p>

          <h1>Travel Inquiry</h1>

          <p>
            Share your travel requirements.
            Our team will review your request and
            contact you with the available options.
          </p>
        </header>

        <form
          className={styles.form}
          onSubmit={handleSubmit}
        >
                    <div hidden aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              type="text"
              value={form.website}
              onChange={(event) =>
                updateField("website", event.target.value)
              }
              autoComplete="off"
              tabIndex={-1}
              maxLength={200}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="clientType">
              Client type
            </label>

            <select
              id="clientType"
              disabled={fieldsLocked}
              value={form.clientType}
              onChange={(event) =>
                updateField(
                  "clientType",
                  event.target.value,
                )
              }
            >
              <option value="individual">
  Individual / Retail
</option>

              <option value="corporate">
                Corporate Client
              </option>
            </select>
          </div>
<div className={styles.field}>
  <label htmlFor="serviceType">Service type</label>

  <select
    id="serviceType"
    disabled={fieldsLocked}
    value={form.serviceType}
    onChange={(event) =>
      updateField("serviceType", event.target.value)
    }
    required
  >
    <option value="flight_booking">Flight Booking</option>
    <option value="visa_support">Visa Support</option>
    <option value="package">Package</option>
    <option value="consultation">Consultation</option>
  </select>
</div>
          {form.clientType === "corporate" && (
            <div className={styles.field}>
              <label htmlFor="corporateClient">
                Company name
              </label>

              <input
                id="corporateClient"
                disabled={fieldsLocked}
                maxLength={200}
                type="text"
                value={form.corporateClient}
                onChange={(event) =>
                  updateField(
                    "corporateClient",
                    event.target.value,
                  )
                }
                placeholder="Example: ABC Garments Ltd."
                required
              />
            </div>
          )}          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="contactName">
  {form.clientType === "corporate"
    ? "Contact person name"
    : "Full name"}
</label>

              <input
                id="contactName"
                disabled={fieldsLocked}
                maxLength={200}
                type="text"
                value={form.contactName}
                onChange={(event) =>
                  updateField(
                    "contactName",
                    event.target.value,
                  )
                }
                placeholder="Your full name"
                autoComplete="name"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="contactEmail">
                Email address
              </label>

              <input
                id="contactEmail"
                disabled={fieldsLocked}
                maxLength={254}
                type="email"
                value={form.contactEmail}
                onChange={(event) =>
                  updateField(
                    "contactEmail",
                    event.target.value,
                  )
                }
                placeholder="name@company.com"
                autoComplete="email"
                required={!form.contactPhone.trim()}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="contactPhone">
              Phone or WhatsApp number
            </label>

            <input
              id="contactPhone"
              disabled={fieldsLocked}
              type="tel"
              value={form.contactPhone}
              onChange={(event) =>
                updateField(
                  "contactPhone",
                  event.target.value,
                )
              }
              placeholder="+8801XXXXXXXXX"
              autoComplete="tel"
              required={!form.contactEmail.trim()}
maxLength={16}
pattern="\+[1-9][0-9]{7,14}"
            />
          </div>
                    <div className={styles.grid}>
                        <AirportAutocomplete
              id="origin"
              label="Origin"
              value={form.origin}
              onChange={(iata) => updateField("origin", iata)}
              disabled={fieldsLocked}
            />

                        <AirportAutocomplete
              id="destination"
              label="Destination"
              value={form.destination}
              onChange={(iata) => updateField("destination", iata)}
              disabled={fieldsLocked}
            />

            <div className={styles.field}>
              <label htmlFor="departureDate">Departure date</label>
              <input
                id="departureDate"
                disabled={fieldsLocked}
                type="date"
                value={form.departureDate}
                onChange={(event) =>
                  updateField("departureDate", event.target.value)
                }
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="returnDate">Return date</label>
              <input
                id="returnDate"
                disabled={fieldsLocked}
                type="date"
                value={form.returnDate}
                min={form.departureDate || undefined}
                onChange={(event) =>
                  updateField("returnDate", event.target.value)
                }
              />
            </div>
          </div>
          {form.serviceType === "flight_booking" && (
            <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="passengerCount">
                Number of passengers
              </label>

                            <input
                id="passengerCount"
                disabled={fieldsLocked}
                type="number"
                min="1"
                max="999"
                step="1"
                value={form.passengerCount}
                onChange={(event) =>
                  updateField("passengerCount", event.target.value)
                }
                placeholder="Optional"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="cabinClass">
                Cabin class
              </label>

              <select
                id="cabinClass"
                disabled={fieldsLocked}
                value={form.cabinClass}
                onChange={(event) =>
                  updateField(
                    "cabinClass",
                    event.target.value,
                  )
                }
              >
                <option value="">Not selected</option>
                <option value="economy">
                  Economy
                </option>

                <option value="premium_economy">
                  Premium Economy
                </option>

                <option value="business">
                  Business
                </option>

                <option value="first">
                  First Class
                </option>
              </select>
            </div>
          </div>
          )}

          <div className={styles.field}>
            <label htmlFor="notes">
              Additional requirements
            </label>

            <textarea
              id="notes"
              disabled={fieldsLocked}
              maxLength={4000}
              rows={5}
              value={form.notes}
              onChange={(event) =>
                updateField(
                  "notes",
                  event.target.value,
                )
              }
              placeholder="Preferred airline, baggage, flexible dates, or other requirements"
            />
          </div>

          {message && (
            <p
              className={
                isSuccess
                  ? styles.success
                  : styles.error
              }
              role="status"
            >
              {message}
            </p>
          )}
          {recoveryState === "conflict" && (
            <div className={styles.recoverySupport}>
              <p>
                For help confirming your inquiry, contact TravelPro
                customer support on WhatsApp.
              </p>

              <a
                className={styles.supportLink}
                href="https://wa.me/8801842737654"
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                WhatsApp Support: +880 1842737654 (opens in a new tab)
              </a>

              <p className={styles.supportPrivacy}>
                No inquiry details are included in this link.
                Do not send passport images, payment details,
                passwords or verification codes.
              </p>
            </div>
          )}
          <button
            className={styles.submitButton}
            type="submit"
            disabled={isSubmitting || recoveryState === "conflict"}
          >
            {isSubmitting
              ? "Submitting..."
              : recoveryState === "unknown"
                ? "Retry Same Inquiry"
                : recoveryState === "conflict"
                  ? "Submission Paused"
                  : "Submit Inquiry"}
          </button>

          <p className={styles.notice}>
            Submitting an inquiry does not confirm
            a booking or issue a ticket. A TravelPro
            representative will review and contact you.
          </p>
        </form>
      </section>
    </main>
  );
}