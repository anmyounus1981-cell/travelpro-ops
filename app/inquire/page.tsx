import Link from "next/link";
import type { Metadata } from "next";
import { LanguageToggle } from "@/app/public-travel/language-toggle";
import { travelCopy, travelHref, travelLanguage } from "@/lib/travel-language";
import InquiryForm from "./inquiry-form";
import { publishedOffers } from "@/lib/data/offers";
import { isOfferId, type PublicOffer } from "@/lib/offers";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Travel inquiry | TravelPro Dhaka", description: travelCopy.en.tagline };

export default async function InquiryPage({ searchParams }: { searchParams: Promise<{ offer?: string | string[]; lang?: string | string[] }> }) {
  const { offer: offerParam, lang } = await searchParams;
  const language = travelLanguage(lang);
  const copy = travelCopy[language];
  const general = travelHref("/inquire", language);
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
    <main className={styles.page} lang={language}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <Link href={travelHref("/travel", language)} className={styles.brand} lang="en">← TravelPro Dhaka</Link>
            <LanguageToggle path="/inquire" language={language} offer={typeof offerParam === "string" && isOfferId(offerParam) ? offerParam : undefined} />
          </div>
          <p className={styles.tagline}>{copy.tagline}</p>
          <h1>{offer ? copy.offerTitle : copy.formTitle}</h1>
          <p>{copy.formIntro}</p>
        </header>
        {offer && <section className={styles.offer} aria-label={copy.selected}>
          <p className={styles.eyebrow}>{copy.category[offer.category]} · {offer.destination}</p>
          <h2>{offer.title}</h2>
          <p>{offer.details}</p>
          {offer.price_label && <p><strong>{offer.price_label}</strong></p>}
          <Link href={general}>{copy.general}</Link>
        </section>}
        {offerParam !== undefined && !offer ? (
          <div role="status" className={styles.noticeBox}>
            <p>{offerError ? copy.offerError : copy.offerUnavailable}</p>
            <Link href={general}>{copy.general}</Link>
          </div>
        ) : configured ? <InquiryForm key={offer?.id ?? "general"} siteKey={siteKey} offer={offer} language={language} /> :
          <p role="status" className={styles.noticeBox}>{copy.unavailableForm}</p>}
      </section>
    </main>
  );
}
