import { createClient } from "@/lib/supabase/server";
import { convertInquiryToCase } from "@/app/actions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type ParsedFields = {
  corporateClient: string | null;
  origin: string | null;
  destination: string | null;
  departureDate: string | null;
  returnDate: string | null;
  passengerCount: number | null;
  cabinClass: string | null;
  confidence: number;
};

type Inquiry = {
  id: string;
  source: "web" | "email" | "whatsapp";
  client_type: "personal" | "corporate";
  corporate_client_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  raw_message: string;
  parsed_fields: ParsedFields;
  parsing_status: string;
  status: "new" | "converted" | "dismissed";
  created_at: string;
};

type Client = {
  id: string;
  company_name: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}export default async function InboxPage() {
  const supabase = await createClient();

  const [
    { data: inquiryData, error: inquiryError },
    { data: clientData, error: clientError },
  ] = await Promise.all([
    supabase
      .from("inquiries")
      .select(
        [
          "id",
          "source",
          "client_type",
          "corporate_client_name",
          "contact_name",
          "contact_email",
          "contact_phone",
          "raw_message",
          "parsed_fields",
          "parsing_status",
          "status",
          "created_at",
        ].join(","),
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(50),

    supabase
      .from("clients")
      .select("id, company_name")
      .order("company_name"),
  ]);

  if (inquiryError || clientError) {
    console.error(
      "Inbox loading failed:",
      inquiryError?.message ??
        clientError?.message,
    );

    return (
      <main className={styles.page}>
        <section className={styles.empty}>
          <h1>Unable to load inbox</h1>
          <p>
            Check the Supabase access policies and
            try again.
          </p>
        </section>
      </main>
    );
  }

  const inquiries =
    (inquiryData ?? []) as unknown as Inquiry[];

  const clients =
    (clientData ?? []) as Client[];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            TravelPro Operations
          </p>

          <h1>Unified Inbox</h1>

          <p>
            Review WhatsApp, email, and public web
            inquiries before converting them into
            active cases.
          </p>
        </div>

        <span className={styles.count}>
          {inquiries.length} inquiries
        </span>
      </header>      {inquiries.length === 0 ? (
        <section className={styles.emptyState}>
          <h2>No inquiries yet</h2>
          <p>
            New inquiries submitted from the public form, WhatsApp, or email
            will appear here.
          </p>
        </section>
      ) : (
        <section className={styles.inquiries}>
          {inquiries.map((inquiry) => {
            const parsed = inquiry.parsed_fields ?? {};
            const clientName =
              inquiry.corporate_client_name ||
              inquiry.contact_name ||
              "Unknown client";

            return (
              <article className={styles.inquiryCard} key={inquiry.id}>
                <div className={styles.cardHeader}>
                  <div>
                    <span className={styles.sourceBadge}>
                      {inquiry.source.toUpperCase()}
                    </span>

                    <h2>{clientName}</h2>

                    <p className={styles.receivedTime}>
                      Received {formatDate(inquiry.created_at)}
                    </p>
                  </div>

                  <span className={styles.statusBadge}>
                    {inquiry.status}
                  </span>
                </div>

                <div className={styles.comparisonGrid}>
                  <section className={styles.rawMessagePanel}>
                    <h3>Raw message</h3>

                    <p className={styles.rawMessage}>
                      {inquiry.raw_message || "No raw message was provided."}
                    </p>

                    <div className={styles.contactDetails}>
                      <p>
                        <strong>Name:</strong>{" "}
                        {inquiry.contact_name || "Not provided"}
                      </p>

                      <p>
                        <strong>Email:</strong>{" "}
                        {inquiry.contact_email || "Not provided"}
                      </p>

                      <p>
                        <strong>Phone:</strong>{" "}
                        {inquiry.contact_phone || "Not provided"}
                      </p>
                    </div>
                  </section>

                  <section className={styles.parsedPanel}>
                    <div className={styles.panelTitle}>
                      <h3>AI-parsed details</h3>

                      <span className={styles.parsingBadge}>
                        {inquiry.parsing_status}
                      </span>
                    </div>

                    <dl className={styles.parsedFields}>
                      <div>
                        <dt>Corporate client</dt>
                        <dd>
                          {parsed.corporateClient ||
                            inquiry.corporate_client_name ||
                            "Not matched"}
                        </dd>
                      </div>

                      <div>
                        <dt>Origin</dt>
                        <dd>{parsed.origin || "Not detected"}</dd>
                      </div>

                      <div>
                        <dt>Destination</dt>
                        <dd>{parsed.destination || "Not detected"}</dd>
                      </div>

                      <div>
                        <dt>Departure date</dt>
                        <dd>{parsed.departureDate || "Not detected"}</dd>
                      </div>

                      <div>
                        <dt>Return date</dt>
                        <dd>{parsed.returnDate || "One-way / not detected"}</dd>
                      </div>

                      <div>
                        <dt>Passengers</dt>
                        <dd>{parsed.passengerCount ?? "Not detected"}</dd>
                      </div>

                      <div>
                        <dt>Cabin class</dt>
                        <dd>{parsed.cabinClass || "Not detected"}</dd>
                      </div>

                      <div>
                        <dt>Confidence</dt>
                        <dd>
                          {typeof parsed.confidence === "number"
                            ? `${Math.round(parsed.confidence * 100)}%`
                            : "Not available"}
                        </dd>
                      </div>
                    </dl>
                  </section>
                </div>

                <form
  action={convertInquiryToCase}
  className={styles.cardFooter}
>
  <input
    type="hidden"
    name="inquiry_id"
    value={inquiry.id}
  />

  <label className={styles.clientSelector}>
    Client for active case

    <select
      name="client_id"
      defaultValue=""
      required
      disabled={inquiry.status === "converted"}
    >
      <option value="">Select a client</option>

      {clients.map((client) => (
        <option value={client.id} key={client.id}>
          {client.company_name || "Unnamed client"}
        </option>
      ))}
    </select>
  </label>

  <button
    className={styles.convertButton}
    type="submit"
    disabled={
      inquiry.status === "converted" ||
      clients.length === 0
    }
  >
    {inquiry.status === "converted"
      ? "Converted"
      : "Convert to Active Case"}
  </button>
</form>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}