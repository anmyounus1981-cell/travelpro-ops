import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Dhaka",
  }).format(new Date(value));
}

function actionLabel(value: string) {
  return value.replaceAll(".", " ").replaceAll("_", " ");
}

function detailsText(value: Record<string, unknown> | null) {
  if (!value || Object.keys(value).length === 0) {
    return "No additional details";
  }

  return JSON.stringify(value, null, 2);
}

export default async function AuditLogPage() {
  const db = await createClient();

  const { data, error } = await db
    .from("audit_logs")
    .select(
      "id, actor_id, action, entity_type, entity_id, details, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  const logs = (data ?? []) as unknown as AuditLog[];

  const financialEvents = logs.filter(
    (log) =>
      log.entity_type === "payment" ||
      log.entity_type === "ticket",
  ).length;

  const uniqueEntities = new Set(
    logs.map((log) => `${log.entity_type}:${log.entity_id}`),
  ).size;

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
            Audit Log
          </h1>

          <p style={{ margin: "8px 0 0", color: "#42546d" }}>
            Review the immutable history of operational decisions and
            workflow changes.
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
        <strong>Read-only accountability record</strong>

        <p style={{ margin: "7px 0 0", color: "#29466f" }}>
          Audit entries cannot be edited or deleted from this page.
          Payment verification and ticket records show decisions made
          by authorised human operators.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "18px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            padding: "22px",
            background: "#ffffff",
            border: "1px solid #c9d5e3",
            borderRadius: "14px",
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
            Loaded events
          </p>

          <strong style={{ fontSize: "30px" }}>
            {logs.length}
          </strong>
        </div>

        <div
          style={{
            padding: "22px",
            background: "#ffffff",
            border: "1px solid #c9d5e3",
            borderRadius: "14px",
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
            Unique entities
          </p>

          <strong style={{ fontSize: "30px" }}>
            {uniqueEntities}
          </strong>
        </div>

        <div
          style={{
            padding: "22px",
            background: "#ffffff",
            border: "1px solid #c9d5e3",
            borderRadius: "14px",
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
            Payment and ticket events
          </p>

          <strong style={{ fontSize: "30px" }}>
            {financialEvents}
          </strong>
        </div>
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
            Recent activity
          </h2>

          <p style={{ margin: "6px 0 0", color: "#52647a" }}>
            Showing the latest {logs.length} of up to 200 events
          </p>
        </div>
                {logs.length === 0 ? (
          <div style={{ padding: "32px 24px" }}>
            <h3 style={{ margin: "0 0 8px" }}>
              No audit events found
            </h3>

            <p style={{ margin: 0, color: "#52647a" }}>
              Operational changes will be recorded here.
            </p>
          </div>
        ) : (
          <div>
            {logs.map((log, index) => {
              const isFinancial =
                log.entity_type === "payment" ||
                log.entity_type === "ticket";

              return (
                <article
                  key={log.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "190px 1fr 1fr",
                    gap: "22px",
                    padding: "20px 24px",
                    borderBottom:
                      index === logs.length - 1
                        ? "none"
                        : "1px solid #e0e7ef",
                    background:
                      index % 2 === 0 ? "#ffffff" : "#fbfcfe",
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: "0 0 6px",
                        color: "#52647a",
                        fontSize: "13px",
                      }}
                    >
                      {formatDateTime(log.created_at)}
                    </p>

                    <span
                      style={{
                        display: "inline-block",
                        padding: "5px 9px",
                        borderRadius: "999px",
                        background: isFinancial
                          ? "#fff0c7"
                          : "#e8efff",
                        color: isFinancial
                          ? "#855500"
                          : "#244f9a",
                        fontSize: "11px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                      }}
                    >
                      {log.entity_type.replaceAll("_", " ")}
                    </span>
                  </div>

                  <div>
                    <h3
                      style={{
                        margin: "0 0 8px",
                        fontSize: "18px",
                        fontWeight: 700,
                        textTransform: "capitalize",
                      }}
                    >
                      {actionLabel(log.action)}
                    </h3>

                    <p
                      style={{
                        margin: "0 0 6px",
                        color: "#52647a",
                        overflowWrap: "anywhere",
                      }}
                    >
                      <strong>Entity ID:</strong> {log.entity_id}
                    </p>

                    <p
                      style={{
                        margin: 0,
                        color: "#52647a",
                        overflowWrap: "anywhere",
                      }}
                    >
                      <strong>Actor:</strong>{" "}
                      {log.actor_id ||
                        "System or unavailable actor"}
                    </p>
                  </div>

                  <div>
                    <p
                      style={{
                        margin: "0 0 7px",
                        color: "#66768b",
                        fontSize: "12px",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Event details
                    </p>

                    <pre
                      style={{
                        margin: 0,
                        padding: "12px",
                        maxHeight: "160px",
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        border: "1px solid #d8e0e9",
                        borderRadius: "9px",
                        background: "#f5f7fa",
                        color: "#263b58",
                        fontSize: "12px",
                        lineHeight: 1.45,
                      }}
                    >
                      {detailsText(log.details)}
                    </pre>
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