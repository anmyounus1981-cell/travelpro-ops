import Link from "next/link";
import InquiryForm from "./inquiry-form";
import { publishedOffers } from "@/lib/data/offers";
import { isOfferId, offerCategories, type PublicOffer } from "@/lib/offers";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function InquiryPage({ searchParams }: { searchParams: Promise<{ offer?: string | string[] }> }) {
  const { offer: offerParam } = await searchParams;
  let offer: PublicOffer | undefined;
  let offerError = false;
  if (typeof offerParam === "string" && isOfferId(offerParam)) {
    const { data, error } = await publishedOffers().eq("id", offerParam).maybeSingle();
    offer = data ?? undefined;
    offerError = !!error;
  }
  const siteKey = process.env.INQUIRY_TURNSTILE_SITE_KEY;
  const isTestKey = siteKey && /^[123]x0{10}/.test(siteKey);
  const configured = siteKey && process.env.INQUIRY_WEB_HMAC_SECRET &&
    process.env.INQUIRY_TURNSTILE_SECRET &&
    (!isTestKey || (process.env.NEXT_PUBLIC_OPS_ENV === "staging" && process.env.VERCEL_ENV !== "production"));

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <Link href="/travel" className={styles.eyebrow}>← TravelPro Dhaka</Link>
          <h1>{offer ? "Inquire about this offer" : "Plan your travel"}</h1>
          <p>Send your requirements. Our team will review your inquiry and contact you.</p>
        </header>
        {offer && <section className={styles.offer} aria-label="Selected offer">
          <p className={styles.eyebrow}>{offerCategories[offer.category]} · {offer.destination}</p>
          <h2>{offer.title}</h2>
          <p>{offer.details}</p>
          {offer.price_label && <p><strong>{offer.price_label}</strong></p>}
          <Link href="/inquire">Start a general inquiry</Link>
        </section>}
        {offerParam !== undefined && !offer ? (
          <div role="status">
            <p>{offerError ? "This offer could not be loaded." : "This offer is no longer available."}</p>
            <Link href="/inquire">Start a general inquiry</Link>
          </div>
        ) : configured ? <InquiryForm key={offer?.id ?? "general"} siteKey={siteKey} offer={offer} /> :
          <p role="status">Online inquiry submission is temporarily unavailable.</p>}
      </section>
    </main>
  );
}
