import Link from "next/link";
import { dhakaDate, offerCategories, offerFields, type ManagedOffer } from "@/lib/offers";
import { requireOwnerId } from "@/lib/supabase/owner";
import { createClient } from "@/lib/supabase/server";
import { deleteOffer, saveOffer } from "./actions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  saved: "Offer saved.",
  deleted: "Offer deleted. Existing inquiries retain its details.",
  invalid: "Check the offer fields and expiry date, then try again.",
  stale: "This offer changed since you opened it. Review the current details and retry.",
  error: "The offer could not be saved. Try again.",
};

function OfferForm({ offer }: { offer?: ManagedOffer }) {
  return (
    <form action={saveOffer} className={styles.form}>
      {offer && <>
        <input type="hidden" name="id" value={offer.id} />
        <input type="hidden" name="revision" value={offer.updated_at} />
      </>}
      <label>Title<input name="title" defaultValue={offer?.title} minLength={3} maxLength={100} required /></label>
      <label>Category<select name="category" defaultValue={offer?.category ?? "flight"}>
        {Object.entries(offerCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Destination<input name="destination" defaultValue={offer?.destination} minLength={2} maxLength={80} required /></label>
      <label>Price label (optional)<input name="price_label" defaultValue={offer?.price_label ?? ""} placeholder="From BDT 85,000 per person" maxLength={60} /></label>
      <label className={styles.wide}>Public details<textarea name="details" rows={4} defaultValue={offer?.details} minLength={10} maxLength={1200} required /></label>
      <label>Expiry date (optional, Dhaka time)<input name="expires_at" type="date" defaultValue={offer?.expires_at ?? ""} /></label>
      <label className={styles.check}><input type="checkbox" name="is_published" defaultChecked={offer?.is_published} /> Publish on storefront</label>
      <button className={styles.primary}>{offer ? "Save changes" : "Create offer"}</button>
    </form>
  );
}

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const db = await createClient();
  await requireOwnerId(db);
  const [{ data, error }, { result }] = await Promise.all([
    db.from("offers").select(`${offerFields},is_published,updated_at`).order("created_at", { ascending: false }),
    searchParams,
  ]);
  const today = dhakaDate();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><Link href="/">← Back to dashboard</Link><h1>Manage travel offers</h1></div>
        <Link href="/travel">View storefront ↗</Link>
      </header>
      {result && Object.hasOwn(messages, result) && <p role="status">{messages[result]}</p>}
      <section className={styles.card}><h2>New offer</h2><OfferForm /></section>
      <section className={styles.list}>
        <h2>Existing offers</h2>
        {error ? <p role="alert">Offers could not be loaded.</p> : !data?.length && <p>No offers yet.</p>}
        {(data as ManagedOffer[] | null)?.map(offer => (
          <details className={styles.card} key={offer.id}>
            <summary>
              <strong>{offer.title}</strong>
              <span>{!offer.is_published ? "Draft" : offer.expires_at && offer.expires_at < today ? "Expired" : "Published"}</span>
            </summary>
            <OfferForm offer={offer} />
            <form className={styles.delete} action={deleteOffer}>
              <input type="hidden" name="id" value={offer.id} />
              <input type="hidden" name="revision" value={offer.updated_at} />
              <label className={styles.check}><input type="checkbox" name="confirm" required /> Confirm permanent deletion</label>
              <button>Delete offer</button>
            </form>
          </details>
        ))}
      </section>
    </main>
  );
}
