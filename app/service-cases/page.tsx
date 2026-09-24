import Link from "next/link";
import {
  createServiceCase,
  transitionServiceCase,
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

type ServiceCase = {
  id: string;
  booking_id: string | null;
  case_id: string | null;
  type: string;
  request_details: string;
  status: string | null;
  result_summary: string | null;
  created_at: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value));
}

export default async function ServiceCasesPage() {
  const db = await createClient();

  const [serviceResult, bookingResult, caseResult] =
    await Promise.all([
      db
        .from("service_cases")
        .select(
          "id, booking_id, case_id, type, request_details, status, result_summary, created_at",
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

  if (serviceResult.error) {
    throw serviceResult.error;
  }

  if (bookingResult.error) {
    throw bookingResult.error;
  }

  if (caseResult.error) {
    throw caseResult.error;
  }

  const serviceCases =
    (serviceResult.data ?? []) as unknown as ServiceCase[];

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
            Service Cases
          </h1>

          <p style={{ margin: "8px 0 0", color: "#42546d" }}>
            Track post-booking requests from intake through manual
            completion.
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
        <strong>Human-controlled fulfilment</strong>

        <p style={{ margin: "7px 0 0", color: "#71411f" }}>
          AI may collect request details and send reminders. Reissue,
          refund, cancellation, ticketing, and financial decisions must
          be completed manually by an authorised operator.
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
          Create service request
        </h2>

        <p style={{ margin: "0 0 20px", color: "#52647a" }}>
          Record the client request before reviewing fare conditions or
          performing any supplier action.
        </p>

        <form action={createServiceCase}>
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
              Related booking
              <select
                name="booking_id"
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
                  No linked booking
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

            <label>
              Request type
              <select
                name="type"
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
                  Select request type
                </option>

                <option value="reissue">Reissue request</option>
                <option value="refund">Refund request</option>
                <option value="cancellation">
                  Cancellation request
                </option>
                <option value="schedule_change">
                  Schedule change
                </option>
                <option value="seat">Seat request</option>
                <option value="meal">Meal request</option>
                <option value="baggage">Baggage request</option>
                <option value="other">Other support</option>
              </select>
            </label>
          </div>

          <label style={{ display: "block", marginTop: "16px" }}>
            Request details
            <textarea
              name="request_details"
              required
              rows={5}
              placeholder="Record the client's exact request and any important deadline"
              style={{
                display: "block",
                width: "100%",
                marginTop: "7px",
                padding: "13px",
                border: "1px solid #c8d3e0",
                borderRadius: "8px",
                resize: "vertical",
              }}
            />
          </label>

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
            Create service request
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
            Service request queue
          </h2>

          <p style={{ margin: "6px 0 0", color: "#52647a" }}>
            {serviceCases.length} service cases
          </p>
        </div>

        {serviceCases.length === 0 ? (
          <div style={{ padding: "32px 24px" }}>
            <h3 style={{ margin: "0 0 8px" }}>
              No service requests
            </h3>

            <p style={{ margin: 0, color: "#52647a" }}>
              New post-booking requests will appear here.
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
            {serviceCases.map((serviceCase) => {
              const booking = serviceCase.booking_id
                ? bookingsById.get(serviceCase.booking_id)
                : undefined;

              const linkedCase =
                (serviceCase.case_id
                  ? casesById.get(serviceCase.case_id)
                  : undefined) ||
                (booking
                  ? casesById.get(booking.case_id)
                  : undefined);

              const status =
                serviceCase.status || "requested";

              return (
                <article
                  key={serviceCase.id}
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
                        {linkedCase?.case_number || "UNKNOWN CASE"}
                      </p>

                      <h3
                        style={{
                          margin: "0 0 6px",
                          fontSize: "23px",
                          fontWeight: 700,
                          textTransform: "capitalize",
                        }}
                      >
                        {serviceCase.type.replaceAll("_", " ")}
                      </h3>

                      <p style={{ margin: 0, color: "#52647a" }}>
                        {booking
                          ? `PNR ${booking.pnr} · `
                          : ""}
                        Received{" "}
                        {formatDateTime(serviceCase.created_at)}
                      </p>
                    </div>

                    <span
                      style={{
                        display: "inline-block",
                        padding: "7px 12px",
                        borderRadius: "999px",
                        background:
                          status === "completed"
                            ? "#dff7e8"
                            : status === "in_review"
                              ? "#fff0c7"
                              : "#e8efff",
                        color:
                          status === "completed"
                            ? "#126634"
                            : status === "in_review"
                              ? "#855500"
                              : "#244f9a",
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
                      gridTemplateColumns: "1fr 1fr",
                    }}
                  >
                    <div
                      style={{
                        padding: "20px",
                        borderRight: "1px solid #dfe6ee",
                      }}
                    >
                      <h4 style={{ margin: "0 0 10px" }}>
                        Client request
                      </h4>

                      <p
                        style={{
                          margin: 0,
                          padding: "15px",
                          border: "1px solid #d8e0e9",
                          borderRadius: "10px",
                          background: "#ffffff",
                          lineHeight: 1.55,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {serviceCase.request_details}
                      </p>
                    </div>

                    <div style={{ padding: "20px" }}>
                      {status === "requested" && (
                        <>
                          <h4 style={{ margin: "0 0 8px" }}>
                            Operator review required
                          </h4>

                          <p
                            style={{
                              margin: "0 0 16px",
                              color: "#52647a",
                            }}
                          >
                            Review applicable policy and supplier
                            conditions before performing any action.
                          </p>

                          <form action={transitionServiceCase}>
                            <input
                              type="hidden"
                              name="id"
                              value={serviceCase.id}
                            />

                            <input
                              type="hidden"
                              name="status"
                              value="in_review"
                            />

                            <button
                              type="submit"
                              style={{
                                padding: "11px 16px",
                                border: 0,
                                borderRadius: "8px",
                                background: "#c99718",
                                color: "#ffffff",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              Start manual review
                            </button>
                          </form>
                        </>
                      )}

                      {status === "in_review" && (
                        <>
                          <h4 style={{ margin: "0 0 8px" }}>
                            Record manual outcome
                          </h4>

                          <p
                            style={{
                              margin: "0 0 16px",
                              color: "#52647a",
                            }}
                          >
                            Complete the external action manually before
                            closing this service case.
                          </p>

                          <form action={transitionServiceCase}>
                            <input
                              type="hidden"
                              name="id"
                              value={serviceCase.id}
                            />

                            <input
                              type="hidden"
                              name="status"
                              value="completed"
                            />

                            <label>
                              Result summary
                              <textarea
                                name="result_summary"
                                required
                                rows={4}
                                placeholder="Record what was completed, by whom, and the final result"
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
                                padding: "11px 16px",
                                border: 0,
                                borderRadius: "8px",
                                background: "#12877f",
                                color: "#ffffff",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              Record as completed
                            </button>
                          </form>
                        </>
                      )}

                      {status === "completed" && (
                        <div>
                          <h4 style={{ margin: "0 0 8px" }}>
                            Service completed
                          </h4>

                          <p
                            style={{
                              margin: 0,
                              padding: "15px",
                              borderRadius: "10px",
                              background: "#e8f7ed",
                              color: "#174f2d",
                              lineHeight: 1.55,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {serviceCase.result_summary ||
                              "No result summary recorded"}
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