import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LanguageToggle } from "@/app/public-travel/language-toggle";
import { publishedOffers } from "@/lib/data/offers";
import type { PublicOffer } from "@/lib/offers";
import { travelCopy, travelHref, travelLanguage } from "@/lib/travel-language";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "TravelPro Dhaka | Flights, Holidays & Executive Travel",
  description: travelCopy.en.tagline,
};

function contactNumber(value: string | undefined) {
  return value && /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

export default async function TravelPage({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  const language = travelLanguage((await searchParams).lang);
  const copy = travelCopy[language];
  const inquiry = travelHref("/inquire", language);
  const { data, error } = await publishedOffers().order("created_at", { ascending: false }).limit(48);
  const offers: PublicOffer[] = data ?? [];
  const whatsapp = contactNumber(process.env.TRAVEL_WHATSAPP_NUMBER);
  const phone = contactNumber(process.env.TRAVEL_CALL_NUMBER);

  return (
    <main className={styles.page} lang={language}>
      <header className={styles.nav}>
        <Link href={travelHref("/travel", language)} className={styles.brand} lang="en">TravelPro Dhaka</Link>
        <LanguageToggle path="/travel" language={language} />
      </header>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1>{copy.tagline}</h1>
          <p className={styles.intro}>{copy.lead}</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={inquiry}>{copy.plan} <span aria-hidden="true">↗</span></Link>
            <a className={styles.secondary} href="#offers">{copy.browse} <span aria-hidden="true">↓</span></a>
          </div>
          {(whatsapp || phone) && <div className={styles.contact}>
            {whatsapp && <a href={`https://wa.me/${whatsapp.slice(1)}`}>{copy.whatsapp} <span aria-hidden="true">↗</span></a>}
            {phone && <a href={`tel:${phone}`}>{copy.call} <span aria-hidden="true">↗</span></a>}
          </div>}
        </div>
        <div className={styles.photo}>
          <Image src="/travel/maldives.webp" alt={copy.photo} fill priority sizes="(max-width: 800px) 100vw, 54vw" />
          <span>{copy.maldives}</span>
        </div>
      </section>

      <ul className={styles.trust}>
        {copy.trust.map(item => <li key={item}>{item}</li>)}
      </ul>

      <section id="offers" className={styles.offers}>
        <header>
          <div><p className={styles.kicker}>{copy.offers}</p><h2>{copy.offersTitle}</h2></div>
          <p>{copy.offersIntro}</p>
        </header>
        {error ? <p role="status">{copy.unavailableOffers} <Link href={inquiry}>{copy.ask}</Link></p> :
          offers.length ? <div className={styles.grid}>{offers.map(offer => (
            <article key={offer.id} className={styles.offer}>
              <p className={styles.kicker}>{copy.category[offer.category]}</p>
              <p className={styles.destination} dir="auto">{offer.destination}</p>
              <h3 dir="auto">{offer.title}</h3>
              <p className={styles.details} dir="auto">{offer.details}</p>
              <div className={styles.offerFooter}>
                <span dir="auto">{offer.price_label || copy.quote}</span>
                <Link aria-label={`${copy.inquire} · ${offer.title}`} href={travelHref("/inquire", language, offer.id)}>{copy.inquire} <span aria-hidden="true">↗</span></Link>
              </div>
            </article>
          ))}</div> : <div className={styles.empty}><p>{copy.emptyOffers}</p><Link href={inquiry}>{copy.ask} ↗</Link></div>}
      </section>
      <footer className={styles.footer}>
        <Link className={styles.brand} href={travelHref("/travel", language)} lang="en">TravelPro Dhaka</Link>
        <Link href={inquiry}>{copy.send} ↗</Link>
      </footer>
    </main>
  );
}
