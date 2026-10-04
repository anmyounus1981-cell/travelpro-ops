import Link from "next/link";

import { TravellerForm } from "./traveller-form";
import { createClient } from "@/lib/supabase/server";
import { PassportUpload } from "./passport-upload";

export const dynamic = "force-dynamic";

type Client = {
  id: string;
  company_name: string | null;
};

type Traveller = {
  id: string;
  client_id: string;
  full_name: string;
  passport_number: string | null;
  dob: string | null;
  expiry_date: string | null;
  nationality: string | null;
  verification_status: string | null;
};

const fieldStyle = {
  display: "block",
  width: "100%",
  marginTop: "6px",
  padding: "12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
};

export default async function TravellersPage() {
  const db = await createClient();

  const [
    { data: clientData, error: clientError },
    { data: travellerData, error: travellerError },
  ] = await Promise.all([
    db
      .from("clients")
      .select("id, company_name")
      .order("company_name", { ascending: true }),
    db
      .from("travellers")
      .select(
        "id, client_id, full_name, passport_number, dob, expiry_date, nationality, verification_status",
      )
      .order("full_name", { ascending: true }),
  ]);

  if (clientError) {
    throw new Error(`Unable to load clients: ${clientError.message}`);
  }

  if (travellerError) {
    throw new Error(
      `Unable to load travellers: ${travellerError.message}`,
    );
  }

  const clients = (clientData ?? []) as unknown as Client[];
  const travellers =
    (travellerData ?? []) as unknown as Traveller[];

  const { data: draftData, error: draftError } = await db
    .from("passport_extraction_drafts")
    .select("id, client_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (draftError) {
    throw new Error(`Unable to load passport drafts: ${draftError.message}`);
  }

  const drafts = (draftData ?? []) as unknown as {
    id: string;
    client_id: string;
    status: string;
    created_at: string;
  }[];
  const clientNames = new Map(
    clients.map((client) => [
      client.id,
      client.company_name || "Unnamed client",
    ]),
  );

  return (
    <main
      style={{
        maxWidth: "1180px",
        margin: "0 auto",
        padding: "40px 24px 80px",
      }}
    >
      <header style={{ marginBottom: "32px" }}>
        <Link href="/">← Back to dashboard</Link>

        <p
          style={{
            marginTop: "28px",
            marginBottom: "8px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "#0f766e",
          }}
        >
          TRAVELPRO OPERATIONS
        </p>

        <h1 style={{ margin: 0, fontSize: "42px" }}>
          Travellers
        </h1>

        <p style={{ color: "#475569" }}>
          Add traveller records and review passport details before
          confirmation.
        </p>
      </header>

      <section
        style={{
          padding: "24px",
          marginBottom: "32px",
          border: "1px solid #cbd5e1",
          borderRadius: "16px",
          background: "#ffffff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Passport draft queue</h2>

        <p>{drafts.length} recent drafts, showing up to 50</p>

        {drafts.length === 0 ? (
          <p>No passport drafts uploaded.</p>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {drafts.map((draft) => (
              <article
                key={draft.id}
                style={{
                  padding: "16px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              >
                <strong>
                  {clientNames.get(draft.client_id) || "Unknown client"}
                </strong>

                <p>
                  Status: {draft.status.replaceAll("_", " ")}
                </p>

                <small>
                  Uploaded:{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Dhaka",
                  }).format(new Date(draft.created_at))}
                </small>
                <p style={{ marginBottom: 0 }}>
                  <Link
                    href={`/travellers/passport-drafts/${draft.id}`}
                  >
                    Open draft
                  </Link>
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
      <section
        style={{
          padding: "24px",
          marginBottom: "32px",
          border: "1px solid #cbd5e1",
          borderRadius: "16px",
          background: "#ffffff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Passport upload</h2>

        <p style={{ color: "#475569" }}>
          Upload a passport image to start a draft.
          Every extracted field requires owner review before confirmation.
        </p>

        <PassportUpload clients={clients} />
      </section>

      <section
        style={{
          padding: "24px",
          marginBottom: "32px",
          border: "1px solid #cbd5e1",
          borderRadius: "16px",
          background: "#ffffff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Add traveller</h2>

        <p style={{ color: "#475569" }}>
          Passport extraction is assistive only. A human must check every
          field before saving.
        </p>

      <TravellerForm clients={clients} />
      </section>

      <section
        style={{
          overflowX: "auto",
          border: "1px solid #cbd5e1",
          borderRadius: "16px",
          background: "#ffffff",
        }}
      >
        <div style={{ padding: "20px 24px" }}>
          <h2 style={{ margin: 0 }}>Traveller directory</h2>

          <p style={{ marginBottom: 0, color: "#475569" }}>
            {travellers.length} traveller
            {travellers.length === 1 ? "" : "s"}
          </p>
        </div>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            textAlign: "left",
          }}
        >
          <thead style={{ background: "#f1f5f9" }}>
            <tr>
              <th style={{ padding: "14px 20px" }}>Traveller</th>
              <th style={{ padding: "14px 20px" }}>Client</th>
              <th style={{ padding: "14px 20px" }}>Passport</th>
              <th style={{ padding: "14px 20px" }}>
                Date of birth
              </th>
              <th style={{ padding: "14px 20px" }}>Expiry</th>
              <th style={{ padding: "14px 20px" }}>
                Nationality
              </th>
              <th style={{ padding: "14px 20px" }}>Status</th>
              <th style={{ padding: "14px 20px" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {travellers.map((traveller) => (
              <tr
                key={traveller.id}
                style={{ borderTop: "1px solid #e2e8f0" }}
              >
                <td
                  style={{
                    padding: "16px 20px",
                    fontWeight: 700,
                  }}
                >
                  {traveller.full_name}
                </td>

                <td style={{ padding: "16px 20px" }}>
                  {clientNames.get(traveller.client_id) ||
                    "Unknown client"}
                </td>

                <td style={{ padding: "16px 20px" }}>
                  {traveller.passport_number || "Not provided"}
                </td>

                <td style={{ padding: "16px 20px" }}>
                  {traveller.dob || "Not provided"}
                </td>

                <td style={{ padding: "16px 20px" }}>
                  {traveller.expiry_date || "Not provided"}
                </td>

                <td style={{ padding: "16px 20px" }}>
                  {traveller.nationality || "Not provided"}
                </td>

                                <td style={{ padding: "16px 20px" }}>
                  {traveller.verification_status ||
                    "Pending review"}
                </td>

                <td style={{ padding: "16px 20px" }}>
                  <Link href={`/travellers/${traveller.id}/review`}>
                    Review / Edit
                  </Link>
                </td>
              </tr>
            ))}

            {travellers.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: "32px 20px",
                    textAlign: "center",
                  }}
                >
                  No travellers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}