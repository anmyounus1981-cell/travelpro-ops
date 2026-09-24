import Link from "next/link";

import {
  createClientRecord,
  deleteClientRecord,
  updateClientRecord,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Client = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

export default async function ClientsPage() {
  const db = await createClient();

  const { data, error } = await db
    .from("clients")
    .select(
      "id, company_name, contact_name, contact_email, contact_phone",
    )
    .order("company_name", { ascending: true });

  if (error) {
    throw new Error(`Unable to load clients: ${error.message}`);
  }

  const clients = (data ?? []) as unknown as Client[];

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
          Corporate Clients
        </h1>

        <p style={{ color: "#475569" }}>
          Create and review the corporate client accounts used for travel
          cases.
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
        <h2 style={{ marginTop: 0 }}>Add client</h2>

        <form
          action={createClientRecord}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          <label>
            Company name
            <input
              name="company_name"
              required
              style={{
                display: "block",
                width: "100%",
                padding: "12px",
                marginTop: "6px",
              }}
            />
          </label>

          <label>
            Contact person
            <input
              name="contact_name"
              required
              style={{
                display: "block",
                width: "100%",
                padding: "12px",
                marginTop: "6px",
              }}
            />
          </label>

          <label>
            Email
            <input
              name="contact_email"
              type="email"
              style={{
                display: "block",
                width: "100%",
                padding: "12px",
                marginTop: "6px",
              }}
            />
          </label>

          <label>
            Phone
            <input
              name="contact_phone"
              type="tel"
              style={{
                display: "block",
                width: "100%",
                padding: "12px",
                marginTop: "6px",
              }}
            />
          </label>

          <div style={{ alignSelf: "end" }}>
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "13px 20px",
                border: 0,
                borderRadius: "8px",
                background: "#0f766e",
                color: "#ffffff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save client
            </button>
          </div>
        </form>
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
          <h2 style={{ margin: 0 }}>Client directory</h2>
          <p style={{ marginBottom: 0, color: "#475569" }}>
            {clients.length} client{clients.length === 1 ? "" : "s"}
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
              <th style={{ padding: "14px 24px" }}>Company</th>
              <th style={{ padding: "14px 24px" }}>Contact</th>
              <th style={{ padding: "14px 24px" }}>Email</th>
              <th style={{ padding: "14px 24px" }}>Phone</th>
              <th style={{ padding: "14px 24px" }}>Update</th>
            </tr>
          </thead>

          <tbody>
            {clients.map((client) => {
  const formId = `client-${client.id}`;

  const inputStyle = {
    width: "100%",
    minWidth: "170px",
    padding: "10px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
  };

  return (
    <tr
      key={client.id}
      style={{ borderTop: "1px solid #e2e8f0" }}
    >
      <td style={{ padding: "16px 24px" }}>
        <form id={formId} action={updateClientRecord}>
          <input type="hidden" name="id" value={client.id} />

          <input
            name="company_name"
            defaultValue={client.company_name ?? ""}
            required
            aria-label="Company name"
            style={{ ...inputStyle, fontWeight: 700 }}
          />
        </form>
      </td>

      <td style={{ padding: "16px 24px" }}>
        <input
          form={formId}
          name="contact_name"
          defaultValue={client.contact_name ?? ""}
          aria-label="Contact person"
          style={inputStyle}
        />
      </td>

      <td style={{ padding: "16px 24px" }}>
        <input
          form={formId}
          name="contact_email"
          type="email"
          defaultValue={client.contact_email ?? ""}
          aria-label="Email"
          style={inputStyle}
        />
      </td>

      <td style={{ padding: "16px 24px" }}>
        <input
          form={formId}
          name="contact_phone"
          type="tel"
          defaultValue={client.contact_phone ?? ""}
          aria-label="Phone"
          style={inputStyle}
        />
      </td>

      <td style={{ padding: "16px 24px" }}>
  <div
    style={{
      display: "flex",
      gap: "8px",
      alignItems: "center",
    }}
  >
    <button
      form={formId}
      type="submit"
      style={{
        padding: "10px 18px",
        border: 0,
        borderRadius: "6px",
        background: "#1d4ed8",
        color: "#ffffff",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Save
    </button>

    <form action={deleteClientRecord}>
      <input type="hidden" name="id" value={client.id} />

      <button
        type="submit"
        style={{
          padding: "10px 18px",
          border: "1px solid #dc2626",
          borderRadius: "6px",
          background: "#ffffff",
          color: "#dc2626",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Delete
      </button>
    </form>
  </div>
</td>
    </tr>
  );
})}

            {clients.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: "32px 24px", textAlign: "center" }}
                >
                  No clients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}