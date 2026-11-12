import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { convertInquiryToCase } from "@/app/actions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Inquiry = {
  id: string;
  source: string;
  client_type: "personal" | "corporate";
  service_type: string | null;
  corporate_client_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  raw_message: string;
  submitted_fields: { travel?: Record<string, string | number> } | null;
  parsed_fields: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

type Client = {
  id: string;
  client_type: string;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

function email(value: string | null) {
  return value?.trim().toLowerCase() || "";
}

function phone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return /^01\d{9}$/.test(digits) ? "88" + digits : digits;
}

const cabins = [["economy", "Economy"], ["premium_economy", "Premium economy"], ["business", "Business"], ["first", "First"]];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ review?: string }> }) {
  const db = await createClient();
  const { review } = await searchParams;
  const [inquiries, clients] = await Promise.all([
    db.from("inquiries").select("id,source,client_type,service_type,corporate_client_name,contact_name,contact_email,contact_phone,raw_message,submitted_fields,parsed_fields,status,created_at").order("created_at", { ascending: false }).limit(50),
    db.from("clients").select("id,client_type,company_name,contact_name,contact_email,contact_phone").order("company_name"),
  ]);

  if (inquiries.error || clients.error) return <main className={styles.page}><h1>Unable to load inbox</h1><Link href="/">Back to dashboard</Link></main>;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><Link href="/">← Back to dashboard</Link><h1>Unified Inbox</h1>
          <p>Review requests and confirm the client and flight details before creating a case.</p></div>
        <Link href="/clients">Manage clients</Link>
      </header>
      {review === "converted" && <p role="status">Reviewed case created.</p>}
      {review === "invalid" && <p role="alert">Case conversion could not be confirmed. Check the inquiry status, selected client and reviewed details before retrying.</p>}
      {!inquiries.data?.length && <p>No inquiries yet.</p>}
      <section className={styles.inquiries}>
        {(inquiries.data as Inquiry[]).map(inquiry => {
          const travel = inquiry.submitted_fields?.travel ?? inquiry.parsed_fields ?? {};
          const get = (key: string) => typeof travel[key] === "string" ? travel[key] : "";
          const compatible = (clients.data as Client[]).filter(c => c.client_type === (inquiry.client_type === "personal" ? "individual" : "corporate"));
          const matches = compatible.filter(c =>
            (email(inquiry.contact_email) && email(inquiry.contact_email) === email(c.contact_email)) ||
            (phone(inquiry.contact_phone) && phone(inquiry.contact_phone) === phone(c.contact_phone))
          );
          const flight = !inquiry.service_type || inquiry.service_type === "flight_booking";
          return (
            <article className={styles.inquiryCard} key={inquiry.id}>
              <header className={styles.cardHeader}>
                <div><span className={styles.sourceBadge}>{inquiry.source}</span>
                  <h2>{inquiry.corporate_client_name || inquiry.contact_name || "Unnamed inquiry"}</h2></div>
                <span className={styles.statusBadge}>{inquiry.status}</span>
              </header>
              <p>{inquiry.service_type?.replaceAll("_", " ") || "Legacy inquiry"} · {new Date(inquiry.created_at).toLocaleString("en-BD", {timeZone:"Asia/Dhaka"})}</p>
              <p>{inquiry.contact_email} {inquiry.contact_phone}</p>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{inquiry.raw_message}</pre>
              {inquiry.status === "new" && !flight && <p>Review this request here. Case conversion is available for flight inquiries.</p>}
              {inquiry.status === "new" && flight && <form action={convertInquiryToCase} className={styles.convertForm}>
                <input type="hidden" name="inquiry_id" value={inquiry.id} />
                <p>{matches.length ? `${matches.length} possible contact match(es). Confirm the account before selecting it.` : "No contact match. Select the correct account or create one in Clients."}</p>
                <label>Confirmed client <select name="client_id" required defaultValue="">
                  <option value="">Select a client</option>
                  {compatible.map(c => <option key={c.id} value={c.id}>{c.company_name || c.contact_name || "Client"} ({c.id.slice(0, 8)}){matches.includes(c) ? " · possible match" : ""}</option>)}
                </select></label>
                <label>Origin <input name="origin" defaultValue={get("origin")} maxLength={3} required /></label>
                <label>Destination <input name="destination" defaultValue={get("destination")} maxLength={3} required /></label>
                <label>Departure <input type="date" name="departure_date" defaultValue={get("departureDate")} required /></label>
                <label>Return <input type="date" name="return_date" defaultValue={get("returnDate")} /></label>
                <label>Adults <input type="number" name="adult_count" min={0} required /></label>
                <label>Children <input type="number" name="child_count" min={0} defaultValue={0} required /></label>
                <label>Infants <input type="number" name="infant_count" min={0} defaultValue={0} required /></label>
                <label>Cabin <select name="cabin_class" defaultValue={get("cabinClass")} required>
                  <option value="">Confirm cabin</option>{cabins.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select></label>
                <label>Reviewed notes <textarea name="notes" maxLength={4000} defaultValue={get("notes")} /></label>
                <label><input type="checkbox" name="review_confirmed" required /> I confirmed the client and flight details</label>
                <button className={styles.convertButton} disabled={!compatible.length}>Create reviewed case</button>
              </form>}
            </article>
          );
        })}
      </section>
    </main>
  );
}
