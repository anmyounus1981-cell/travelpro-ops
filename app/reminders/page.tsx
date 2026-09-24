import Link from "next/link";
import { createReminder } from "@/app/actions";
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

type Reminder = {
  id: string;
  entity_type: string;
  entity_id: string;
  reminder_type: string;
  due_at: string;
  message: string;
  status: string | null;
  created_at: string;
};

const fieldStyle = {
  display: "block",
  width: "100%",
  marginTop: "7px",
  padding: "13px",
  border: "1px solid #c8d3e0",
  borderRadius: "8px",
  background: "#ffffff",
} as const;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value));
}

function reminderState(value: string) {
  const difference = new Date(value).getTime() - Date.now();
  const hours = difference / 3_600_000;

  if (hours <= 0) {
    return {
      label: "Overdue",
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
    label: "Scheduled",
    background: "#dff7e8",
    color: "#126634",
  };
}

export default async function RemindersPage() {
  const db = await createClient();

  const [reminderResult, caseResult, bookingResult] =
    await Promise.all([
      db
        .from("reminders")
        .select(
          "id, entity_type, entity_id, reminder_type, due_at, message, status, created_at",
        )
        .order("due_at", { ascending: true }),

      db
        .from("cases")
        .select("id, case_number, origin, destination")
        .order("created_at", { ascending: false }),

      db
        .from("bookings")
        .select("id, case_id, pnr, status")
        .order("created_at", { ascending: false }),
    ]);

  if (reminderResult.error) {
    throw reminderResult.error;
  }

  if (caseResult.error) {
    throw caseResult.error;
  }

  if (bookingResult.error) {
    throw bookingResult.error;
  }

  const reminders =
    (reminderResult.data ?? []) as unknown as Reminder[];

  const cases =
    (caseResult.data ?? []) as unknown as TravelCase[];

  const bookings =
    (bookingResult.data ?? []) as unknown as Booking[];

  const casesById = new Map(
    cases.map((travelCase) => [travelCase.id, travelCase]),
  );

  const bookingsById = new Map(
    bookings.map((booking) => [booking.id, booking]),
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
            Reminders
          </h1>

          <p style={{ margin: "8px 0 0", color: "#42546d" }}>
            Schedule operational follow-ups without automating
            financial or GDS actions.
          </p>
        </div>
      </header>

      <section
        style={{
          padding: "24px",
          marginBottom: "32px",
          background: "#e8efff",
          border: "1px solid #aebfdf",
          borderRadius: "14px",
        }}
      >
        <strong>Reminder-only automation</strong>

        <p style={{ margin: "7px 0 0", color: "#29466f" }}>
          Reminders may notify clients or operators. They must never
          trigger payment approval, ticket issuance, reissue, void, or
          refund automatically.
        </p>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginBottom: "32px",
        }}
      >
        <section
          style={{
            padding: "24px",
            background: "#ffffff",
            border: "1px solid #c9d5e3",
            borderRadius: "18px",
          }}
        >
          <h2
            style={{
              margin: "0 0 6px",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Case follow-up
          </h2>

          <p style={{ margin: "0 0 20px", color: "#52647a" }}>
            Schedule document, quotation, or client follow-up.
          </p>

          <form action={createReminder}>
            <input
              type="hidden"
              name="entity_type"
              value="case"
            />

            <label>
              Case
              <select
                name="entity_id"
                required
                defaultValue=""
                style={fieldStyle}
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

            <label style={{ display: "block", marginTop: "14px" }}>
              Reminder type
              <select
                name="reminder_type"
                required
                defaultValue="client_follow_up"
                style={fieldStyle}
              >
                <option value="client_follow_up">
                  Client follow-up
                </option>
                <option value="document_collection">
                  Document collection
                </option>
                <option value="quotation_follow_up">
                  Quotation follow-up
                </option>
                <option value="payment_follow_up">
                  Payment follow-up
                </option>
              </select>
            </label>

            <label style={{ display: "block", marginTop: "14px" }}>
              Due date and time
              <input
                name="due_at"
                type="datetime-local"
                required
                style={fieldStyle}
              />
            </label>

            <label style={{ display: "block", marginTop: "14px" }}>
              Reminder message
              <textarea
                name="message"
                required
                rows={4}
                placeholder="Describe the follow-up required"
                style={{
                  ...fieldStyle,
                  resize: "vertical",
                }}
              />
            </label>

            <button
              type="submit"
              disabled={cases.length === 0}
              style={{
                marginTop: "16px",
                width: "100%",
                padding: "13px 18px",
                border: 0,
                borderRadius: "8px",
                background: "#12877f",
                color: "#ffffff",
                fontWeight: 800,
                cursor:
                  cases.length === 0
                    ? "not-allowed"
                    : "pointer",
                opacity: cases.length === 0 ? 0.55 : 1,
              }}
            >
              Schedule case reminder
            </button>
          </form>
        </section>
                <section
          style={{
            padding: "24px",
            background: "#ffffff",
            border: "1px solid #c9d5e3",
            borderRadius: "18px",
          }}
        >
          <h2
            style={{
              margin: "0 0 6px",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Booking and TTL reminder
          </h2>

          <p style={{ margin: "0 0 20px", color: "#52647a" }}>
            Schedule ticketing-time-limit or booking follow-up.
          </p>

          <form action={createReminder}>
            <input
              type="hidden"
              name="entity_type"
              value="booking"
            />

            <label>
              Booking
              <select
                name="entity_id"
                required
                defaultValue=""
                style={fieldStyle}
              >
                <option value="" disabled>
                  Select a booking
                </option>

                {bookings.map((booking) => {
                  const travelCase = casesById.get(booking.case_id);

                  return (
                    <option value={booking.id} key={booking.id}>
                      {booking.pnr} —{" "}
                      {travelCase?.case_number || "Unknown case"}
                    </option>
                  );
                })}
              </select>
            </label>

            <label style={{ display: "block", marginTop: "14px" }}>
              Reminder type
              <select
                name="reminder_type"
                required
                defaultValue="ttl"
                style={fieldStyle}
              >
                <option value="ttl">
                  Ticketing time limit
                </option>
                <option value="payment_follow_up">
                  Payment follow-up
                </option>
                <option value="ticket_delivery">
                  Ticket delivery
                </option>
                <option value="travel_reminder">
                  Travel reminder
                </option>
              </select>
            </label>

            <label style={{ display: "block", marginTop: "14px" }}>
              Due date and time
              <input
                name="due_at"
                type="datetime-local"
                required
                style={fieldStyle}
              />
            </label>

            <label style={{ display: "block", marginTop: "14px" }}>
              Reminder message
              <textarea
                name="message"
                required
                rows={4}
                placeholder="Describe the booking follow-up required"
                style={{
                  ...fieldStyle,
                  resize: "vertical",
                }}
              />
            </label>

            <button
              type="submit"
              disabled={bookings.length === 0}
              style={{
                marginTop: "16px",
                width: "100%",
                padding: "13px 18px",
                border: 0,
                borderRadius: "8px",
                background: "#173f70",
                color: "#ffffff",
                fontWeight: 800,
                cursor:
                  bookings.length === 0
                    ? "not-allowed"
                    : "pointer",
                opacity: bookings.length === 0 ? 0.55 : 1,
              }}
            >
              Schedule booking reminder
            </button>
          </form>
        </section>
      </div>

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
            Reminder schedule
          </h2>

          <p style={{ margin: "6px 0 0", color: "#52647a" }}>
            {reminders.length} reminders
          </p>
        </div>

        {reminders.length === 0 ? (
          <div style={{ padding: "32px 24px" }}>
            <h3 style={{ margin: "0 0 8px" }}>
              No reminders scheduled
            </h3>

            <p style={{ margin: 0, color: "#52647a" }}>
              New operational reminders will appear here.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "14px",
              padding: "24px",
            }}
          >
            {reminders.map((reminder) => {
              const state = reminderState(reminder.due_at);

              const linkedCase =
                reminder.entity_type === "case"
                  ? casesById.get(reminder.entity_id)
                  : undefined;

              const linkedBooking =
                reminder.entity_type === "booking"
                  ? bookingsById.get(reminder.entity_id)
                  : undefined;

              const bookingCase = linkedBooking
                ? casesById.get(linkedBooking.case_id)
                : undefined;

              const reference =
                reminder.entity_type === "case"
                  ? linkedCase?.case_number || "Unknown case"
                  : linkedBooking
                    ? `PNR ${linkedBooking.pnr} · ${
                        bookingCase?.case_number || "Unknown case"
                      }`
                    : "Unknown booking";

              return (
                <article
                  key={reminder.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.5fr auto",
                    alignItems: "center",
                    gap: "20px",
                    padding: "18px 20px",
                    border: "1px solid #d5dee9",
                    borderRadius: "12px",
                    background: "#fbfcfe",
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: "0 0 5px",
                        color: "#007f78",
                        fontSize: "12px",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {reminder.reminder_type.replaceAll("_", " ")}
                    </p>

                    <h3
                      style={{
                        margin: "0 0 5px",
                        fontSize: "18px",
                        fontWeight: 700,
                      }}
                    >
                      {reference}
                    </h3>

                    <p style={{ margin: 0, color: "#52647a" }}>
                      Due {formatDateTime(reminder.due_at)}
                    </p>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {reminder.message}
                  </p>

                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: state.background,
                        color: state.color,
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      {state.label}
                    </span>

                    <p
                      style={{
                        margin: "8px 0 0",
                        color: "#66768b",
                        fontSize: "12px",
                        textTransform: "uppercase",
                      }}
                    >
                      {reminder.status || "pending"}
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