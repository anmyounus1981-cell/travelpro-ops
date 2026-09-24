import Link from "next/link";
import { recordTicket } from "@/app/actions";
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
  quoted_amount: number | null;
  status: string | null;
};

type Payment = {
  id: string;
  booking_id: string;
  status: string | null;
};

type Ticket = {
  id: string;
  booking_id: string;
  payment_id: string;
  ticket_number: string;
  issue_date: string;
  final_amount: number | null;
  e_ticket_path: string | null;
  status: string | null;
  created_at: string;
};

function money(value: number | null) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value));
}

export default async function TicketsPage() {
  const db = await createClient();

  const [ticketResult, bookingResult, paymentResult, caseResult] =
    await Promise.all([
      db
        .from("tickets")
        .select(
          "id, booking_id, payment_id, ticket_number, issue_date, final_amount, e_ticket_path, status, created_at",
        )
        .order("created_at", { ascending: false }),

      db
        .from("bookings")
        .select("id, case_id, pnr, quoted_amount, status")
        .order("created_at", { ascending: false }),

      db
        .from("payments")
        .select("id, booking_id, status")
        .eq("status", "verified"),

      db
        .from("cases")
        .select("id, case_number, origin, destination")
        .order("created_at", { ascending: false }),
    ]);

  if (ticketResult.error) {
    throw ticketResult.error;
  }

  if (bookingResult.error) {
    throw bookingResult.error;
  }

  if (paymentResult.error) {
    throw paymentResult.error;
  }

  if (caseResult.error) {
    throw caseResult.error;
  }

  const tickets =
    (ticketResult.data ?? []) as unknown as Ticket[];

  const bookings =
    (bookingResult.data ?? []) as unknown as Booking[];

  const verifiedPayments =
    (paymentResult.data ?? []) as unknown as Payment[];

  const cases =
    (caseResult.data ?? []) as unknown as TravelCase[];

  const bookingsById = new Map(
    bookings.map((booking) => [booking.id, booking]),
  );

  const casesById = new Map(
    cases.map((travelCase) => [travelCase.id, travelCase]),
  );

  const verifiedBookingIds = new Set(
    verifiedPayments.map((payment) => payment.booking_id),
  );

  const ticketedBookingIds = new Set(
    tickets.map((ticket) => ticket.booking_id),
  );

  const eligibleBookings = bookings.filter(
    (booking) =>
      verifiedBookingIds.has(booking.id) &&
      !ticketedBookingIds.has(booking.id),
  );

  const ticketFileEntries = await Promise.all(
    tickets.map(async (ticket) => {
      if (!ticket.e_ticket_path) {
        return [ticket.id, null] as const;
      }

      const { data } = await db.storage
        .from("e-tickets")
        .createSignedUrl(ticket.e_ticket_path, 600);

      return [ticket.id, data?.signedUrl ?? null] as const;
    }),
  );

  const ticketFileUrls = new Map(ticketFileEntries);

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
            Tickets
          </h1>

          <p style={{ margin: "8px 0 0", color: "#42546d" }}>
            Record tickets issued manually after payment verification.
          </p>
        </div>
      </header>

      <section
        style={{
          padding: "24px",
          marginBottom: "32px",
          background: "#ffe8d6",
          border: "1px solid #d99a69",
          borderRadius: "14px",
        }}
      >
        <strong>Manual GDS action required</strong>

        <p style={{ margin: "7px 0 0", color: "#71411f" }}>
          AI must never issue, reissue, void, or refund a ticket.
          Complete the action manually in the GDS, then store the
          resulting ticket record here.
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
          Record issued ticket
        </h2>

        <p style={{ margin: "0 0 20px", color: "#52647a" }}>
          Only bookings with manually verified payment are eligible.
          Recording this form does not issue a ticket in any GDS.
        </p>

        <form action={recordTicket}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "16px",
            }}
          >
            <label>
              Eligible booking
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
                  Select verified booking
                </option>

                {eligibleBookings.map((booking) => {
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
              Ticket number
              <input
                name="ticket_number"
                required
                placeholder="157-1234567890"
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
              Issue date
              <input
                name="issue_date"
                type="date"
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
              Final amount
              <input
                name="final_amount"
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

            <label style={{ gridColumn: "span 2" }}>
              E-ticket document
              <input
                name="e_ticket"
                type="file"
                accept="image/*,application/pdf"
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

          {eligibleBookings.length === 0 && (
            <p
              style={{
                margin: "16px 0 0",
                color: "#9b1c1c",
                fontWeight: 700,
              }}
            >
              No unticketed booking with verified payment is currently
              eligible.
            </p>
          )}

          <button
            type="submit"
            disabled={eligibleBookings.length === 0}
            style={{
              marginTop: "18px",
              minWidth: "240px",
              padding: "14px 22px",
              border: 0,
              borderRadius: "8px",
              background: "#12877f",
              color: "#ffffff",
              fontWeight: 800,
              cursor:
                eligibleBookings.length === 0
                  ? "not-allowed"
                  : "pointer",
              opacity:
                eligibleBookings.length === 0 ? 0.55 : 1,
            }}
          >
            Record manual issuance
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
            Ticket register
          </h2>

          <p style={{ margin: "6px 0 0", color: "#52647a" }}>
            {tickets.length} issued ticket records
          </p>
        </div>

        {tickets.length === 0 ? (
          <div style={{ padding: "32px 24px" }}>
            <h3 style={{ margin: "0 0 8px" }}>
              No issued tickets recorded
            </h3>

            <p style={{ margin: 0, color: "#52647a" }}>
              Tickets issued manually in the GDS will appear here
              after recording.
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
            {tickets.map((ticket) => {
              const booking = bookingsById.get(ticket.booking_id);

              const travelCase = booking
                ? casesById.get(booking.case_id)
                : undefined;

              const ticketFileUrl =
                ticketFileUrls.get(ticket.id) ?? null;

              return (
                <article
                  key={ticket.id}
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
                        fontSize: "21px",
                        fontWeight: 700,
                      }}
                    >
                      {ticket.ticket_number}
                    </h3>

                    <p style={{ margin: "0 0 5px", color: "#52647a" }}>
                      PNR {booking?.pnr || "Not available"}
                    </p>

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
                        color: "#66768b",
                        fontSize: "12px",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Issuance details
                    </p>

                    <p style={{ margin: "0 0 8px" }}>
                      <strong>Issue date:</strong>{" "}
                      {formatDate(ticket.issue_date)}
                    </p>

                    <p style={{ margin: "0 0 8px" }}>
                      <strong>Final amount:</strong>{" "}
                      {money(ticket.final_amount)}
                    </p>

                    <p style={{ margin: 0 }}>
                      <strong>Status:</strong>{" "}
                      <span
                        style={{
                          display: "inline-block",
                          padding: "5px 9px",
                          borderRadius: "999px",
                          background: "#dff7e8",
                          color: "#126634",
                          fontSize: "12px",
                          fontWeight: 800,
                          textTransform: "uppercase",
                        }}
                      >
                        {ticket.status || "issued"}
                      </span>
                    </p>
                  </div>

                  <div style={{ padding: "20px" }}>
                    <p
                      style={{
                        margin: "0 0 12px",
                        color: "#66768b",
                        fontSize: "12px",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      E-ticket document
                    </p>

                    {ticketFileUrl ? (
                      <>
                        <a
                          href={ticketFileUrl}
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
                          Open e-ticket
                        </a>

                        <p
                          style={{
                            margin: "12px 0 0",
                            color: "#66768b",
                            fontSize: "12px",
                          }}
                        >
                          This private link expires after 10 minutes.
                        </p>
                      </>
                    ) : (
                      <p
                        style={{
                          margin: 0,
                          color: "#52647a",
                        }}
                      >
                        No e-ticket document was uploaded.
                      </p>
                    )}
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