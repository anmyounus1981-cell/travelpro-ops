"use client";

import {
  type FormEvent,
  useState,
} from "react";

import styles from "./page.module.css";

type FormData = {
  clientType: "personal" | "corporate";
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
};

const INITIAL_FORM: FormData = {
  clientType: "personal",
  corporateClient: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  origin: "",
  destination: "",
  departureDate: "",
  returnDate: "",
  passengerCount: "1",
  cabinClass: "economy",
  notes: "",
};

export default function InquiryPage() {
  const [form, setForm] =
    useState<FormData>(INITIAL_FORM);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [isSuccess, setIsSuccess] =
    useState(false);  function updateField(
    field: keyof FormData,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setIsSubmitting(true);
    setMessage("");
    setIsSuccess(false);

    try {
      const response = await fetch(
        "/api/v1/inquiry",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...form,
            source: "web",
            corporateClient:
              form.clientType === "corporate"
                ? form.corporateClient
                : null,
            passengerCount: Number(
              form.passengerCount,
            ),
            returnDate:
              form.returnDate || null,
          }),
        },
      );

      const result = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            "Unable to submit inquiry.",
        );
      }

      setIsSuccess(true);
      setMessage(
        result.message ??
          "Your inquiry was submitted successfully.",
      );
      setForm(INITIAL_FORM);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit inquiry.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>
            TravelPro Ops
          </p>

          <h1>Flight Inquiry</h1>

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
          <div className={styles.field}>
            <label htmlFor="clientType">
              Client type
            </label>

            <select
              id="clientType"
              value={form.clientType}
              onChange={(event) =>
                updateField(
                  "clientType",
                  event.target.value,
                )
              }
            >
              <option value="personal">
                Personal
              </option>

              <option value="corporate">
                Corporate Client
              </option>
            </select>
          </div>

          {form.clientType === "corporate" && (
            <div className={styles.field}>
              <label htmlFor="corporateClient">
                Company name
              </label>

              <input
                id="corporateClient"
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
                Full name
              </label>

              <input
                id="contactName"
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
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="contactPhone">
              Phone or WhatsApp number
            </label>

            <input
              id="contactPhone"
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
            />
          </div>          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="origin">
                Origin
              </label>

              <input
                id="origin"
                type="text"
                value={form.origin}
                onChange={(event) =>
                  updateField(
                    "origin",
                    event.target.value,
                  )
                }
                placeholder="DAC or Dhaka"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="destination">
                Destination
              </label>

              <input
                id="destination"
                type="text"
                value={form.destination}
                onChange={(event) =>
                  updateField(
                    "destination",
                    event.target.value,
                  )
                }
                placeholder="BKK or Bangkok"
                required
              />
            </div>
          </div>

          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="departureDate">
                Departure date
              </label>

              <input
                id="departureDate"
                type="date"
                value={form.departureDate}
                onChange={(event) =>
                  updateField(
                    "departureDate",
                    event.target.value,
                  )
                }
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="returnDate">
                Return date
              </label>

              <input
                id="returnDate"
                type="date"
                value={form.returnDate}
                min={form.departureDate || undefined}
                onChange={(event) =>
                  updateField(
                    "returnDate",
                    event.target.value,
                  )
                }
              />
            </div>
          </div>          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="passengerCount">
                Number of passengers
              </label>

              <input
                id="passengerCount"
                type="number"
                min="1"
                max="100"
                value={form.passengerCount}
                onChange={(event) =>
                  updateField(
                    "passengerCount",
                    event.target.value,
                  )
                }
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="cabinClass">
                Cabin class
              </label>

              <select
                id="cabinClass"
                value={form.cabinClass}
                onChange={(event) =>
                  updateField(
                    "cabinClass",
                    event.target.value,
                  )
                }
              >
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

          <div className={styles.field}>
            <label htmlFor="notes">
              Additional requirements
            </label>

            <textarea
              id="notes"
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

          <button
            className={styles.submitButton}
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Submitting..."
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