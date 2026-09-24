import Link from "next/link";
import { createBooking } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TravelCase = {
  id: string;
  case_number: string;
  origin: string | null;
  destination: string | null;
};

type Quotation = {
  id: string;
  case_id: string;
  base_fare: number | null;
  taxes: number | null;
  service_fee: number | null;
  status: string | null;
};

type Booking = {
  id: string;
  case_id: string;
  quotation_id: string | null;
  pnr: string;
  pnr_source: string | null;
  quoted_amount: number | null;
  ttl: string;
  ttl_source: string | null;
  status: string | null;
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

function ttlState(value: string) {
  const difference = new Date(value).getTime() - Date.now();
  const hours = difference / 3_600_000;

  if (hours <= 0) {
    return {
      label: "Expired",
      background: "#ffe0e0",
      color: "#9b1c1c",
    };
  }

  if (hours <= 24) {
    return {
      label: "Due within 24 hours",
      background: "#fff0c7",
      color: "#855500",
    };
  }

  return {
    label: "Active",
    background: "#dff7e8",
    color: "#126634",
  };
}

export default async function BookingsPage() {
  const db = await createClient();

  const [bookingResult, caseResult, quotationResult] =
    await Promise.all([
      db
        .from("bookings")
        .select(
          "id, case_id, quotation_id, pnr, pnr_source, quoted_amount, ttl, ttl_source, status, created_at",
        )
        .order("created_at", { ascending: false }),

      db
        .from("cases")
        .select("id, case_number, origin, destination")
        .order("created_at", { ascending: false }),

      db
        .from("quotations")
        .select(
          "id, case_id, base_fare, taxes, service_fee, status",
        )
        .order("created_at", { ascending: false }),
    ]);

  if (bookingResult.error) {
    throw bookingResult.error;
  }

  if (caseResult.error) {
    throw caseResult.error;
  }

  if (quotationResult.error) {
    throw quotationResult.error;
  }

  const bookings =
    (bookingResult.data ?? []) as unknown as Booking[];

  const cases =
    (caseResult.data ?? []) as unknown as TravelCase[];

  const quotations =
    (quotationResult.data ?? []) as unknown as Quotation[];

  const casesById = new Map(
    cases.map((travelCase) => [travelCase.id, travelCase]),
  );

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
            Bookings
          </h1>

          <p style={{ margin: "8px 0 0", color: "#42546d" }}>
            Record manually created PNRs and monitor ticketing time
            limits.
          </p>
        </div>
      </header>

      <section
        style={{
          padding: "24px",
          marginBottom: "32px",
          background: "#fff8e6",
          border: "1px solid #e2c46d",
          borderRadius: "14px",
        }}
      >
        <strong>Human-control guardrail</strong>

        <p style={{ margin: "7px 0 0", color: "#68501a" }}>
          The AI may monitor the booking and send reminders, but PNR
          creation, payment verification, and ticket issuance must be
          completed manually by an authorised operator.
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
          Record booking
        </h2>

        <p style={{ margin: "0 0 20px", color: "#52647a" }}>
          Enter the PNR only after it has been created manually in the
          GDS or approved supplier system.
        </p>

        <form action={createBooking}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "16px",
            }}
          >
            <label>
              Case
              <select
                name="case_id"
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
                  Select a case
                </option>

                {cases.map((travelCase) => (
                  <option value={travelCase.id} key={travelCase.id}>
                    {travelCase.case_number} —{" "}
                    {travelCase.origin || "TBC"} →{" "}
                    {travelCase.destination || "TBC"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Approved quotation
              <select
                name="quotation_id"
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
                <option value="">
                  No linked quotation
                </option>

                {quotations.map((quotation) => {
                  const travelCase =
                    casesById.get(quotation.case_id);

                  const total =
                    (quotation.base_fare ?? 0) +
                    (quotation.taxes ?? 0) +
                    (quotation.service_fee ?? 0);

                  return (
                    <option
                      value={quotation.id}
                      key={quotation.id}
                    >
                      {travelCase?.case_number || "Unknown case"} —{" "}
                      {quotation.status || "draft"} — {money(total)}
                    </option>
                  );
                })}
              </select>
            </label>

            <label>
              PNR
              <input
                name="pnr"
                required
                minLength={5}
                maxLength={10}
                placeholder="ABC123"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: "7px",
                  padding: "13px",
                  border: "1px solid #c8d3e0",
                  borderRadius: "8px",
                  textTransform: "uppercase",
                }}
              />
            </label>

            <label>
              PNR source
              <select
                name="pnr_source"
                required
                defaultValue="manual_gds"
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
                <option value="manual_gds">Manual GDS entry</option>
                <option value="manual_supplier">
                  Manual supplier entry
                </option>
                <option value="manual_lcc">
                  Manual LCC entry
                </option>
              </select>
            </label>

            <label>
              Quoted amount
              <input
                name="quoted_amount"
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
              Ticketing time limit
              <input
                name="ttl"
                type="datetime-local"
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
              TTL source
              <select
                name="ttl_source"
                required
                defaultValue="manual_gds"
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
                <option value="manual_gds">
                  Manually verified from GDS
                </option>
                <option value="manual_supplier">
                  Manually verified from supplier
                </option>
              </select>
            </label>
          </div>

          <button
            type="submit"
            disabled={cases.length === 0}
            style={{
              marginTop: "18px",
              minWidth: "230px",
              padding: "14px 22px",
              border: 0,
              borderRadius: "8px",
              background: "#12877f",
              color: "#ffffff",
              fontWeight: 800,
              cursor: cases.length === 0 ? "not-allowed" : "pointer",
              opacity: cases.length === 0 ? 0.55 : 1,
            }}
          >
            Record manual booking
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
            Booking directory
          </h2>

          <p style={{ margin: "6px 0 0", color: "#52647a" }}>
            {bookings.length} bookings
          </p>
        </div>

        {bookings.length === 0 ? (
          <div style={{ padding: "32px 24px" }}>
            <h3 style={{ margin: "0 0 8px" }}>
              No bookings yet
            </h3>

            <p style={{ margin: 0, color: "#52647a" }}>
              Record the first manually created PNR using the form
              above.
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
            {bookings.map((booking) => {
              const travelCase = casesById.get(booking.case_id);
              const ttl = ttlState(booking.ttl);
              const status = booking.status || "unticketed";

              return (
                <article
                  key={booking.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.1fr 1fr 1fr",
                    border: "1px solid #d5dee9",
                    borderRadius: "14px",
                    overflow: "hidden",
                    background: "#fbfcfe",
                  }}
                >
                  <div
                    style={{
                      padding: "20px",
                      background: "#ffffff",
                      borderRight: "1px solid #dfe6ee",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 6px",
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
                        margin: "0 0 8px",
                        fontSize: "25px",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {booking.pnr}
                    </h3>

                    <p style={{ margin: 0, color: "#52647a" }}>
                      {travelCase?.origin || "TBC"} →{" "}
                      {travelCase?.destination || "TBC"}
                    </p>
                  </div>

                  <div
                    style={{
                      padding: "20px",
                      borderRight: "1px solid #dfe6ee",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 12px",
                        fontSize: "12px",
                        color: "#66768b",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Booking details
                    </p>

                    <p style={{ margin: "0 0 8px" }}>
                      <strong>Amount:</strong>{" "}
                      {money(booking.quoted_amount)}
                    </p>

                    <p style={{ margin: "0 0 8px" }}>
                      <strong>PNR source:</strong>{" "}
                      {(booking.pnr_source || "Not provided").replaceAll(
                        "_",
                        " ",
                      )}
                    </p>

                    <p style={{ margin: 0 }}>
                      <strong>Status:</strong>{" "}
                      <span
                        style={{
                          display: "inline-block",
                          padding: "5px 9px",
                          borderRadius: "999px",
                          background:
                            status === "ticketed"
                              ? "#dff7e8"
                              : "#e8efff",
                          color:
                            status === "ticketed"
                              ? "#126634"
                              : "#244f9a",
                          fontSize: "12px",
                          fontWeight: 800,
                          textTransform: "uppercase",
                        }}
                      >
                        {status}
                      </span>
                    </p>
                  </div>

                  <div style={{ padding: "20px" }}>
                    <p
                      style={{
                        margin: "0 0 12px",
                        fontSize: "12px",
                        color: "#66768b",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Ticketing time limit
                    </p>

                    <p
                      style={{
                        margin: "0 0 10px",
                        fontSize: "17px",
                        fontWeight: 700,
                      }}
                    >
                      {formatDateTime(booking.ttl)}
                    </p>

                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: ttl.background,
                        color: ttl.color,
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      {ttl.label}
                    </span>

                    <p
                      style={{
                        margin: "12px 0 0",
                        color: "#52647a",
                        fontSize: "13px",
                      }}
                    >
                      Source:{" "}
                      {(booking.ttl_source || "Not provided").replaceAll(
                        "_",
                        " ",
                      )}
                    </p>
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