import Link from "next/link";
import {
  uploadPayment,
  verifyPayment,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TravelCase = {
  id: string;
  case_number: string;
  origin: string | null;
  destination: string | null;
};

type Booking = {
  id: string;
  case_id: string;
  pnr: string;
  status: string | null;
};

type Payment = {
  id: string;
  booking_id: string;
  amount: number | null;
  evidence_file_path: string | null;
  status: string | null;
  verification_note: string | null;
  created_at: string;
};

function money(value: number | null) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value));
}

export default async function PaymentsPage() {
  const db = await createClient();

  const [paymentResult, bookingResult, caseResult] =
    await Promise.all([
      db
        .from("payments")
        .select(
          "id, booking_id, amount, evidence_file_path, status, verification_note, created_at",
        )
        .order("created_at", { ascending: false }),

      db
        .from("bookings")
        .select("id, case_id, pnr, status")
        .order("created_at", { ascending: false }),

      db
        .from("cases")
        .select("id, case_number, origin, destination")
        .order("created_at", { ascending: false }),
    ]);

  if (paymentResult.error) {
    throw paymentResult.error;
  }

  if (bookingResult.error) {
    throw bookingResult.error;
  }

  if (caseResult.error) {
    throw caseResult.error;
  }

  const payments =
    (paymentResult.data ?? []) as unknown as Payment[];

  const bookings =
    (bookingResult.data ?? []) as unknown as Booking[];

  const cases =
    (caseResult.data ?? []) as unknown as TravelCase[];

  const bookingsById = new Map(
    bookings.map((booking) => [booking.id, booking]),
  );

  const casesById = new Map(
    cases.map((travelCase) => [travelCase.id, travelCase]),
  );

  const evidenceEntries = await Promise.all(
    payments.map(async (payment) => {
      if (!payment.evidence_file_path) {
        return [payment.id, null] as const;
      }

      const { data } = await db.storage
        .from("payment-evidence")
        .createSignedUrl(payment.evidence_file_path, 600);

      return [payment.id, data?.signedUrl ?? null] as const;
    }),
  );

  const evidenceUrls = new Map(evidenceEntries);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 7vw",
        background: "#f5f3ed",
        color: "#10233f",
      }}
    >
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "160px 220px 1fr",
          alignItems: "start",
          gap: "24px",
          marginBottom: "34px",
        }}
      >
        <Link
          href="/"
          style={{
            color: "#10233f",
            textDecoration: "none",
            paddingTop: "14px",
          }}
        >
          ← Back to dashboard
        </Link>

        <p
          style={{
            margin: 0,
            paddingTop: "14px",
            color: "#007f78",
            fontWeight: 800,
            letterSpacing: "0.12em",
          }}
        >
          TRAVELPRO OPERATIONS
        </p>

        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "42px",
              fontWeight: 500,
            }}
          >
            Payments
          </h1>

          <p style={{ margin: "8px 0 0", color: "#42546d" }}>
            Store payment evidence and record a manual verification
            decision.
          </p>
        </div>
      </header>

      <section
        style={{
          padding: "24px",
          marginBottom: "32px",
          background: "#fff0c7",
          border: "1px solid #d6ae46",
          borderRadius: "14px",
        }}
      >
        <strong>Manual financial control required</strong>

        <p style={{ margin: "7px 0 0", color: "#68501a" }}>
          AI must never collect, transfer, approve, or verify money.
          An authorised human operator must inspect the original
          evidence and record the final decision.
        </p>
      </section>

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #c9d5e3",
          borderRadius: "18px",
          padding: "24px",
          marginBottom: "32px",
        }}
      >
        <h2
          style={{
            margin: "0 0 6px",
            fontSize: "18px",
            fontWeight: 600,
          }}
        >
          Submit payment evidence
        </h2>

        <p style={{ margin: "0 0 20px", color: "#52647a" }}>
          Upload the evidence for review. Uploading does not verify the
          payment.
        </p>

        <form action={uploadPayment}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 1.5fr",
              gap: "16px",
            }}
          >
            <label>
              Booking
              <select
                name="booking_id"
                required
                defaultValue=""
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "7px",
                  padding: "13px",
                  border: "1px solid #c8d3e0",
                  borderRadius: "8px",
                  background: "#ffffff",
                }}
              >
                <option value="" disabled>
                  Select a booking
                </option>

                {bookings.map((booking) => {
                  const travelCase = casesById.get(booking.case_id);

                  return (
                    <option value={booking.id} key={booking.id}>
                      {booking.pnr} —{" "}
                      {travelCase?.case_number || "Unknown case"} —{" "}
                      {travelCase?.origin || "TBC"} →{" "}
                      {travelCase?.destination || "TBC"}
                    </option>
                  );
                })}
              </select>
            </label>

            <label>
              Amount
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                required
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "7px",
                  padding: "13px",
                  border: "1px solid #c8d3e0",
                  borderRadius: "8px",
                }}
              />
            </label>

            <label>
              Payment evidence
              <input
                name="evidence"
                type="file"
                accept="image/*,application/pdf"
                required
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "7px",
                  padding: "10px",
                  border: "1px solid #c8d3e0",
                  borderRadius: "8px",
                  background: "#ffffff",
                }}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={bookings.length === 0}
            style={{
              marginTop: "18px",
              minWidth: "250px",
              padding: "14px 22px",
              border: 0,
              borderRadius: "8px",
              background: "#12877f",
              color: "#ffffff",
              fontWeight: 800,
              cursor:
                bookings.length === 0 ? "not-allowed" : "pointer",
              opacity: bookings.length === 0 ? 0.55 : 1,
            }}
          >
            Upload for manual review
          </button>
        </form>
      </section>
            <section
        style={{
          background: "#ffffff",
          border: "1px solid #c9d5e3",
          borderRadius: "18px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "24px",
            borderBottom: "1px solid #e0e7ef",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Payment review queue
          </h2>

          <p style={{ margin: "6px 0 0", color: "#52647a" }}>
            {payments.length} payment records
          </p>
        </div>

        {payments.length === 0 ? (
          <div style={{ padding: "32px 24px" }}>
            <h3 style={{ margin: "0 0 8px" }}>
              No payment evidence submitted
            </h3>

            <p style={{ margin: 0, color: "#52647a" }}>
              Uploaded payment evidence will appear here for manual
              review.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "18px",
              padding: "24px",
            }}
          >
            {payments.map((payment) => {
              const booking = bookingsById.get(payment.booking_id);
              const travelCase = booking
                ? casesById.get(booking.case_id)
                : undefined;

              const status =
                payment.status || "pending_verification";

              const evidenceUrl =
                evidenceUrls.get(payment.id) ?? null;

              return (
                <article
                  key={payment.id}
                  style={{
                    border: "1px solid #d5dee9",
                    borderRadius: "14px",
                    overflow: "hidden",
                    background: "#fbfcfe",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "18px",
                      padding: "20px",
                      background: "#ffffff",
                      borderBottom: "1px solid #dfe6ee",
                    }}
                  >
                    <div>
                      <p
                        style={{
                          margin: "0 0 5px",
                          color: "#007f78",
                          fontSize: "13px",
                          fontWeight: 800,
                          letterSpacing: "0.08em",
                        }}
                      >
                        {travelCase?.case_number || "UNKNOWN CASE"}
                      </p>

                      <h3
                        style={{
                          margin: "0 0 6px",
                          fontSize: "24px",
                          fontWeight: 700,
                        }}
                      >
                        PNR {booking?.pnr || "Not available"}
                      </h3>

                      <p style={{ margin: 0, color: "#52647a" }}>
                        Submitted {formatDateTime(payment.created_at)}
                      </p>
                    </div>

                    <span
                      style={{
                        display: "inline-block",
                        padding: "7px 12px",
                        borderRadius: "999px",
                        background:
                          status === "verified"
                            ? "#dff7e8"
                            : status === "rejected"
                              ? "#ffe0e0"
                              : "#fff0c7",
                        color:
                          status === "verified"
                            ? "#126634"
                            : status === "rejected"
                              ? "#9b1c1c"
                              : "#855500",
                        fontSize: "12px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                      }}
                    >
                      {status.replaceAll("_", " ")}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "0.8fr 1.2fr",
                    }}
                  >
                    <div
                      style={{
                        padding: "20px",
                        borderRight: "1px solid #dfe6ee",
                      }}
                    >
                      <p
                        style={{
                          margin: "0 0 8px",
                          color: "#66768b",
                          fontSize: "12px",
                          fontWeight: 800,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        Submitted amount
                      </p>

                      <p
                        style={{
                          margin: "0 0 18px",
                          fontSize: "28px",
                          fontWeight: 700,
                        }}
                      >
                        {money(payment.amount)}
                      </p>

                      {evidenceUrl ? (
                        <a
                          href={evidenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "inline-block",
                            padding: "11px 15px",
                            borderRadius: "8px",
                            background: "#173f70",
                            color: "#ffffff",
                            textDecoration: "none",
                            fontWeight: 800,
                          }}
                        >
                          Open payment evidence
                        </a>
                      ) : (
                        <p
                          style={{
                            margin: 0,
                            color: "#9b1c1c",
                            fontWeight: 700,
                          }}
                        >
                          Evidence is unavailable
                        </p>
                      )}

                      <p
                        style={{
                          margin: "12px 0 0",
                          color: "#66768b",
                          fontSize: "12px",
                        }}
                      >
                        Evidence links expire after 10 minutes.
                      </p>
                    </div>

                    <div style={{ padding: "20px" }}>
                      {status === "pending_verification" ? (
                        <>
                          <h4 style={{ margin: "0 0 8px" }}>
                            Manual verification decision
                          </h4>

                          <p
                            style={{
                              margin: "0 0 16px",
                              color: "#52647a",
                            }}
                          >
                            Open and verify the original evidence before
                            recording a decision.
                          </p>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "14px",
                            }}
                          >
                            <form action={verifyPayment}>
                              <input
                                type="hidden"
                                name="id"
                                value={payment.id}
                              />

                              <input
                                type="hidden"
                                name="status"
                                value="verified"
                              />

                              <label>
                                Verification note
                                <textarea
                                  name="verification_note"
                                  required
                                  rows={3}
                                  placeholder="Describe the manual checks completed"
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    marginTop: "7px",
                                    padding: "11px",
                                    border: "1px solid #c8d3e0",
                                    borderRadius: "8px",
                                    resize: "vertical",
                                  }}
                                />
                              </label>

                              <button
                                type="submit"
                                style={{
                                  marginTop: "10px",
                                  width: "100%",
                                  padding: "11px 15px",
                                  border: 0,
                                  borderRadius: "8px",
                                  background: "#12877f",
                                  color: "#ffffff",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                Record as verified
                              </button>
                            </form>

                            <form action={verifyPayment}>
                              <input
                                type="hidden"
                                name="id"
                                value={payment.id}
                              />

                              <input
                                type="hidden"
                                name="status"
                                value="rejected"
                              />

                              <label>
                                Rejection reason
                                <textarea
                                  name="verification_note"
                                  required
                                  rows={3}
                                  placeholder="Explain why the evidence was rejected"
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    marginTop: "7px",
                                    padding: "11px",
                                    border: "1px solid #c8d3e0",
                                    borderRadius: "8px",
                                    resize: "vertical",
                                  }}
                                />
                              </label>

                              <button
                                type="submit"
                                style={{
                                  marginTop: "10px",
                                  width: "100%",
                                  padding: "11px 15px",
                                  border: 0,
                                  borderRadius: "8px",
                                  background: "#b33434",
                                  color: "#ffffff",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                Reject evidence
                              </button>
                            </form>
                          </div>
                        </>
                      ) : (
                        <div>
                          <h4 style={{ margin: "0 0 8px" }}>
                            Manual review completed
                          </h4>

                          <p style={{ margin: 0, color: "#52647a" }}>
                            <strong>Operator note:</strong>{" "}
                            {payment.verification_note ||
                              "No note recorded"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}