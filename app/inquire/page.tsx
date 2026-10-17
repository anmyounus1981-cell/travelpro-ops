"use client";

import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { submitLandingInquiry } from "./actions";
import AirportAutocomplete from "@/components/inquiries/AirportAutocomplete";
import styles from "./page.module.css";
import {
  type InquiryRecoveryRecord,
  type PendingRecoveryRecord,
  createPendingRecoveryRecord,
  readRecoveryStorage,
  persistNewPendingRecovery,
  verifyPendingRecovery,
  clearMatchingRecovery,
  persistPendingOutcome,
  quarantineInvalidRecovery,
} from "@/lib/landing-inquiry-recovery";

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
  const recoveryRecordRef =
    useRef<InquiryRecoveryRecord | null>(null);
  const cleanupMessageRef = useRef("");
  const storageGateRef = useRef<
    "restoring" | "ready" | "unavailable" | "blocked" | "cleanup"
  >("restoring");

  const [storageGate, setStorageGate] = useState<
    "restoring" | "ready" | "unavailable" | "blocked" | "cleanup"
  >("restoring");
  const [recoveryState, setRecoveryState] =
    useState<"unknown" | "conflict" | null>(null);
  const [form, setForm] =
    useState<InquiryFormValues>(INITIAL_FORM);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [isSuccess, setIsSuccess] =
    useState(false);

  function changeStorageGate(
    next: "restoring" | "ready" | "unavailable" | "blocked" | "cleanup",
  ) {
    storageGateRef.current = next;
    setStorageGate(next);
  }
  function restoreLocalRecovery() {
    if (submissionInFlightRef.current) return;

    changeStorageGate("restoring");

    const restored = readRecoveryStorage(
      () => window.sessionStorage,
      Date.now(),
    );

    if (restored.kind === "unavailable") {
      changeStorageGate("unavailable");
      setMessage(
        "Browser recovery storage could not be accessed. " +
          "Submission is paused. Retry local recovery without submitting.",
      );
      return;
    }
    if (
      outcomeUncertainRef.current &&
      recoveryRecordRef.current?.state === "pending" &&
      restored.kind === "valid"
    ) {
      const matching = verifyPendingRecovery(
        () => window.sessionStorage,
        recoveryRecordRef.current,
        Date.now(),
      );

      if (!matching.ok) {
        changeStorageGate("blocked");
        setMessage(
          "Saved recovery no longer matches the earlier unconfirmed " +
            "submission. Submission remains paused. " +
            "Contact TravelPro support before submitting again.",
        );
        return;
      }
    }
    if (restored.kind === "empty") {
            if (outcomeUncertainRef.current) {
        changeStorageGate("blocked");
        setMessage(
          "An earlier submission is still unconfirmed, but its saved " +
            "recovery record is missing. Submission remains paused. " +
            "Contact TravelPro support before submitting again.",
        );
        return;
      }
      recoveryRecordRef.current = null;
      requestIdRef.current = null;
      submissionSnapshotRef.current = null;
      outcomeUncertainRef.current = false;
      setRecoveryState(null);
      setIsSuccess(false);
      setMessage("");
      changeStorageGate("ready");
      return;
    }

    if (restored.kind === "blocked") {
      quarantineInvalidRecovery(
        () => window.sessionStorage,
        Date.now(),
      );

      recoveryRecordRef.current = null;
      changeStorageGate("blocked");
      setIsSuccess(false);
      setMessage(
        "Saved inquiry recovery could not be safely restored. " +
          "Submission is paused. Contact TravelPro support before submitting again.",
      );
      return;
    }

    const record = restored.record;
    recoveryRecordRef.current = record;

    if (record.state === "pending") {
      requestIdRef.current = record.requestId;
      submissionSnapshotRef.current = { ...record.snapshot };
      outcomeUncertainRef.current = true;
      setForm({ ...record.snapshot });
      setRecoveryState("unknown");
      setIsSuccess(false);
      setMessage(
        "A previous submission is unconfirmed. Your saved details are locked. " +
          "Retry the same inquiry without changing your details.",
      );
      changeStorageGate("ready");
      return;
    }

    if (record.state === "accepted") {
      setIsSuccess(false);
      setMessage(
        "Locally saved receipt: " + record.receiptId + ". " +
          "This receipt has not been freshly verified with the server. " +
          "Local recovery cleanup is required before a new inquiry.",
      );
      changeStorageGate("cleanup");
      return;
    }

    if (record.state === "conflict") {
      setRecoveryState("conflict");
      setMessage(
        "A saved submission conflict requires support. " +
          "Contact TravelPro before submitting again.",
      );
    } else {
      setMessage(
        "Saved inquiry recovery is blocked. " +
          "Contact TravelPro support before submitting again.",
      );
    }

    setIsSuccess(false);
    changeStorageGate("blocked");
  }

  useEffect(() => {
    restoreLocalRecovery();
  }, []);
  function retryLocalCleanup() {
    if (
      submissionInFlightRef.current ||
      storageGateRef.current !== "cleanup"
    ) {
      return;
    }

    const record = recoveryRecordRef.current;

    if (record === null) {
      changeStorageGate("blocked");
      setMessage(
        "The recovery cleanup target is unavailable. " +
          "Contact TravelPro support before submitting again.",
      );
      return;
    }

    const resultMessage =
      cleanupMessageRef.current ||
      (record.state === "accepted"
        ? `Locally saved receipt: ${record.receiptId}. ` +
          "This receipt has not been freshly verified with the server."
        : "");

    if (!resultMessage) {
      changeStorageGate("blocked");
      setMessage(
        "The previous outcome cannot be safely determined. " +
          "Contact TravelPro support before submitting again.",
      );
      return;
    }

    const cleared = clearMatchingRecovery(
      () => window.sessionStorage,
      record,
    );

    if (!cleared.ok) {
      setMessage(
        resultMessage +
          " Local cleanup is still incomplete. New submission remains paused.",
      );
      return;
    }

    recoveryRecordRef.current = null;
    requestIdRef.current = null;
    submissionSnapshotRef.current = null;
    outcomeUncertainRef.current = false;
    cleanupMessageRef.current = "";
    setRecoveryState(null);
    setMessage(resultMessage + " Local recovery cleanup completed.");
    changeStorageGate("ready");
  }

  function updateField(
    field: keyof InquiryFormValues,
    value: string,
    ) {
    if (
      storageGateRef.current !== "ready" ||
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
      storageGateRef.current !== "ready" ||
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
      let pendingRecord: PendingRecoveryRecord;

      if (recoveryRecordRef.current === null) {
        const created = createPendingRecoveryRecord(
          requestIdRef.current,
          submissionSnapshotRef.current,
          Date.now(),
        );

        if (created === null) {
          changeStorageGate("blocked");
          setMessage(
            "Recovery information could not be prepared. " +
              "No inquiry was sent by this attempt.",
          );
          return;
        }

        const persisted = persistNewPendingRecovery(
          () => window.sessionStorage,
          created,
          Date.now(),
        );

        if (!persisted.ok) {
          changeStorageGate(
            persisted.reason === "unavailable"
              ? "unavailable"
              : "blocked",
          );
          setMessage(
            "Recovery information could not be safely saved. " +
              "No inquiry was sent by this attempt. Submission is paused.",
          );
          return;
        }

        recoveryRecordRef.current = created;
        pendingRecord = created;
      } else if (recoveryRecordRef.current.state === "pending") {
        pendingRecord = recoveryRecordRef.current;
      } else {
        changeStorageGate("blocked");
        setMessage(
          "An existing recovery record prevents this submission. " +
            "Contact TravelPro support.",
        );
        return;
      }

      const verified = verifyPendingRecovery(
        () => window.sessionStorage,
        pendingRecord,
        Date.now(),
      );

      if (!verified.ok) {
        if (verified.reason !== "unavailable") {
          quarantineInvalidRecovery(
            () => window.sessionStorage,
            Date.now(),
          );
        }
        changeStorageGate(
          verified.reason === "unavailable"
            ? "unavailable"
            : "blocked",
        );
        setMessage(
          "The saved inquiry could not be verified for retry. " +
            "No inquiry was sent by this attempt. Submission is paused.",
        );
        return;
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
        // Preserve confirmed acceptance even if local storage fails.
                cleanupMessageRef.current =
          `${result.message} Reference: ${result.receiptId}`;
        setIsSuccess(true);
        setForm({ ...INITIAL_FORM });
        requestIdRef.current = null;
        submissionSnapshotRef.current = null;
        outcomeUncertainRef.current = false;
        setRecoveryState(null);

        const acceptedRecord: InquiryRecoveryRecord = {
          schemaVersion: 1,
          submissionContractVersion: 1,
          state: "accepted",
          requestId: pendingRecord.requestId,
          receiptId: result.receiptId,
        };

        const marked = persistPendingOutcome(
          () => window.sessionStorage,
          pendingRecord,
          { outcome: "accepted", receiptId: result.receiptId },
          Date.now(),
        );

        const cleanupTarget = marked.ok
          ? acceptedRecord
          : pendingRecord;

        recoveryRecordRef.current = cleanupTarget;

        const cleared = clearMatchingRecovery(
          () => window.sessionStorage,
          cleanupTarget,
        );

        if (cleared.ok) {
          recoveryRecordRef.current = null;
          changeStorageGate("ready");
          setMessage(
            `${result.message} Reference: ${result.receiptId}`,
          );
        } else {
          changeStorageGate("cleanup");
          setMessage(
            `${result.message} Reference: ${result.receiptId}. ` +
              "Your inquiry is confirmed, but local recovery cleanup failed. " +
              "New submission is paused. Do not submit this inquiry again.",
          );
        }

        return;
      }

      if (
        result.success === false &&
        result.outcome === "rejected" &&
        !outcomeUncertainRef.current
      ) {
      cleanupMessageRef.current = result.message;
        const cleared = clearMatchingRecovery(
          () => window.sessionStorage,
          pendingRecord,
        );

        if (cleared.ok) {
          recoveryRecordRef.current = null;
          submissionSnapshotRef.current = null;
          requestIdRef.current = null;
          setRecoveryState(null);
          changeStorageGate("ready");
          setMessage(result.message);
        } else {
          // Keep the known rejection and block editing until cleanup succeeds.
          changeStorageGate("cleanup");
          setMessage(
            `${result.message} ` +
              "This attempt was rejected, but local recovery cleanup failed. " +
              "Retry local cleanup before editing or submitting again.",
          );
        }

        return;
      }

      outcomeUncertainRef.current = true;

      if (
        result.success === false &&
        result.outcome === "conflict"
      ) {
        const marked = persistPendingOutcome(
          () => window.sessionStorage,
          pendingRecord,
          { outcome: "conflict" },
          Date.now(),
        );

        if (marked.ok) {
          recoveryRecordRef.current = {
            schemaVersion: 1,
            submissionContractVersion: 1,
            state: "conflict",
            requestId: pendingRecord.requestId,
            createdAt: pendingRecord.createdAt,
            expiresAt: pendingRecord.expiresAt,
          };
        }

        changeStorageGate("blocked");
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
    storageGate !== "ready" ||
    isSubmitting ||
    recoveryState !== null;

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
          <p className={styles.notice}>
            When you submit, this browser tab stores your submitted
            contact details and requirements to help recover an
            interrupted submission. Recovery expires after 24 hours;
            retries do not extend that time. Closing the tab or clearing
            browser data may remove recovery information. Browser
            session restoration may retain it. Expired details are
            checked for cleanup when this page is opened or used;
            deletion at an exact time is not guaranteed.
            Do not enter passport numbers, payment details, passwords
            or verification codes in this form.
          </p>
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
                    {storageGate === "restoring" && (
            <p className={styles.notice} role="status">
              Checking saved inquiry recovery...
            </p>
          )}

          {storageGate === "unavailable" && (
            <button
              className={styles.submitButton}
              type="button"
              onClick={restoreLocalRecovery}
              disabled={isSubmitting}
            >
              Retry Local Recovery
            </button>
          )}

          {storageGate === "cleanup" && (
            <button
              className={styles.submitButton}
              type="button"
              onClick={retryLocalCleanup}
              disabled={isSubmitting}
            >
              Retry Local Cleanup
            </button>
          )}

          {(storageGate === "blocked" ||
            storageGate === "cleanup" ||
            recoveryState === "conflict") && (
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
            disabled={
              storageGate !== "ready" ||
              isSubmitting ||
              recoveryState === "conflict"
            }
          >
            {isSubmitting
              ? "Submitting..."
              : storageGate === "restoring"
                ? "Checking Recovery..."
                : storageGate !== "ready" ||
                    recoveryState === "conflict"
                  ? "Submission Paused"
                  : recoveryState === "unknown"
                    ? "Retry Same Inquiry"
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