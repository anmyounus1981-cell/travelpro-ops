import Link from "next/link";
import {
  createQuotation,
  transitionQuotation,
} from "@/app/actions";
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
  itinerary_text: string | null;
  parsed_segments: unknown;
  base_fare: number | null;
  taxes: number | null;
  service_fee: number | null;
  baggage_info: string | null;
  fare_conditions: string | null;
  expiry_date: string | null;
  status: string | null;
  created_at: string;
};

function money(value: number | null) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function segmentCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export default async function QuotationsPage() {
  const db = await createClient();

  const [quotationResult, caseResult] = await Promise.all([
    db
      .from("quotations")
      .select(
        "id, case_id, itinerary_text, parsed_segments, base_fare, taxes, service_fee, baggage_info, fare_conditions, expiry_date, status, created_at",
      )
      .order("created_at", { ascending: false }),

    db
      .from("cases")
      .select("id, case_number, origin, destination")
      .order("created_at", { ascending: false }),
  ]);

  if (quotationResult.error) {
    throw quotationResult.error;
  }

  if (caseResult.error) {
    throw caseResult.error;
  }

  const quotations =
    (quotationResult.data ?? []) as unknown as Quotation[];

  const cases =
    (caseResult.data ?? []) as unknown as TravelCase[];

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
            Quotations
          </h1>

          <p style={{ margin: "8px 0 0", color: "#42546d" }}>
            Parse itinerary text, prepare pricing, and control quotation
            approval before sending.
          </p>
        </div>
      </header>

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
          Create quotation
        </h2>

        <p style={{ margin: "0 0 20px", color: "#52647a" }}>
          Paste the GDS itinerary and enter the verified fare components.
          Approval and sending remain human-controlled.
        </p>

        <form action={createQuotation}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "16px",
            }}
          >
            <label style={{ gridColumn: "span 2" }}>
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
              Base fare
              <input
                name="base_fare"
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
              Taxes
              <input
                name="taxes"
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
              Service fee
              <input
                name="service_fee"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
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
              Quotation expiry
              <input
                name="expiry_date"
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
              Baggage information
              <input
                name="baggage_info"
                placeholder="Example: 30 KG checked baggage"
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
              Fare conditions
              <input
                name="fare_conditions"
                placeholder="Refund/change conditions"
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
          </div>

          <label style={{ display: "block", marginTop: "16px" }}>
            GDS itinerary text
            <textarea
              name="itinerary_text"
              required
              rows={8}
              placeholder="Paste the itinerary segments here"
              style={{
                display: "block",
                width: "100%",
                marginTop: "7px",
                padding: "13px",
                border: "1px solid #c8d3e0",
                borderRadius: "8px",
                resize: "vertical",
                fontFamily: "monospace",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={cases.length === 0}
            style={{
              marginTop: "18px",
              minWidth: "250px",
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
            Parse and create quotation
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
            Quotation directory
          </h2>

          <p style={{ margin: "6px 0 0", color: "#52647a" }}>
            {quotations.length} quotations
          </p>
        </div>

        {quotations.length === 0 ? (
          <div style={{ padding: "32px 24px" }}>
            <h3 style={{ margin: "0 0 8px" }}>
              No quotations yet
            </h3>

            <p style={{ margin: 0, color: "#52647a" }}>
              Create the first quotation using the form above.
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
            {quotations.map((quotation) => {
              const travelCase = casesById.get(quotation.case_id);

              const total =
                (quotation.base_fare ?? 0) +
                (quotation.taxes ?? 0) +
                (quotation.service_fee ?? 0);

              const status = quotation.status ?? "draft";

              return (
                <article
                  key={quotation.id}
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
                          margin: 0,
                          fontSize: "22px",
                          fontWeight: 600,
                        }}
                      >
                        {travelCase?.origin || "TBC"} →{" "}
                        {travelCase?.destination || "TBC"}
                      </h3>
                    </div>

                    <span
                      style={{
                        display: "inline-block",
                        padding: "7px 12px",
                        borderRadius: "999px",
                        background:
                          status === "sent"
                            ? "#dff7e8"
                            : status === "approved"
                              ? "#fff0c7"
                              : "#e8efff",
                        color:
                          status === "sent"
                            ? "#126634"
                            : status === "approved"
                              ? "#855500"
                              : "#244f9a",
                        fontSize: "12px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                      }}
                    >
                      {status}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.3fr 1fr",
                    }}
                  >
                    <div
                      style={{
                        padding: "20px",
                        borderRight: "1px solid #dfe6ee",
                      }}
                    >
                      <h4 style={{ margin: "0 0 10px" }}>
                        Parsed itinerary
                      </h4>

                      <p
                        style={{
                          margin: "0 0 12px",
                          color: "#52647a",
                        }}
                      >
                        {segmentCount(quotation.parsed_segments)} flight
                        segments detected
                      </p>

                      <pre
                        style={{
                          margin: 0,
                          padding: "16px",
                          minHeight: "130px",
                          overflowX: "auto",
                          whiteSpace: "pre-wrap",
                          border: "1px solid #d8e0e9",
                          borderRadius: "10px",
                          background: "#ffffff",
                          color: "#1d304b",
                          fontFamily: "monospace",
                          lineHeight: 1.55,
                        }}
                      >
                        {quotation.itinerary_text ||
                          "No itinerary text stored"}
                      </pre>
                    </div>

                    <div style={{ padding: "20px" }}>
                      <h4 style={{ margin: "0 0 14px" }}>
                        Pricing and controls
                      </h4>

                      <dl
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: "10px 18px",
                          margin: 0,
                        }}
                      >
                        <dt>Base fare</dt>
                        <dd style={{ margin: 0 }}>
                          {money(quotation.base_fare)}
                        </dd>

                        <dt>Taxes</dt>
                        <dd style={{ margin: 0 }}>
                          {money(quotation.taxes)}
                        </dd>

                        <dt>Service fee</dt>
                        <dd style={{ margin: 0 }}>
                          {money(quotation.service_fee)}
                        </dd>

                        <dt
                          style={{
                            paddingTop: "10px",
                            borderTop: "1px solid #dfe6ee",
                            fontWeight: 800,
                          }}
                        >
                          Total
                        </dt>

                        <dd
                          style={{
                            margin: 0,
                            paddingTop: "10px",
                            borderTop: "1px solid #dfe6ee",
                            fontWeight: 800,
                          }}
                        >
                          {money(total)}
                        </dd>
                      </dl>

                      <div
                        style={{
                          marginTop: "18px",
                          padding: "14px",
                          borderRadius: "10px",
                          background: "#f0f4f8",
                        }}
                      >
                        <p style={{ margin: "0 0 6px" }}>
                          <strong>Expiry:</strong>{" "}
                          {quotation.expiry_date || "Not provided"}
                        </p>

                        <p style={{ margin: "0 0 6px" }}>
                          <strong>Baggage:</strong>{" "}
                          {quotation.baggage_info || "Not provided"}
                        </p>

                        <p style={{ margin: 0 }}>
                          <strong>Fare conditions:</strong>{" "}
                          {quotation.fare_conditions || "Not provided"}
                        </p>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          marginTop: "18px",
                        }}
                      >
                        {status === "draft" && (
                          <form action={transitionQuotation}>
                            <input
                              type="hidden"
                              name="id"
                              value={quotation.id}
                            />

                            <input
                              type="hidden"
                              name="status"
                              value="approved"
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
                              Approve quotation
                            </button>
                          </form>
                        )}

                        {status === "approved" && (
                          <form action={transitionQuotation}>
                            <input
                              type="hidden"
                              name="id"
                              value={quotation.id}
                            />

                            <input
                              type="hidden"
                              name="status"
                              value="sent"
                            />

                            <button
                              type="submit"
                              style={{
                                padding: "11px 16px",
                                border: 0,
                                borderRadius: "8px",
                                background: "#12877f",
                                color: "#ffffff",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              Record as sent
                            </button>
                          </form>
                        )}

                        {status === "sent" && (
                          <span
                            style={{
                              padding: "11px 16px",
                              borderRadius: "8px",
                              background: "#dff7e8",
                              color: "#126634",
                              fontWeight: 800,
                            }}
                          >
                            Sent to client
                          </span>
                        )}
                      </div>
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