import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { publishedOffers } from "@/lib/data/offers";
import { offerCategories, type PublicOffer } from "@/lib/offers";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "TravelPro Dhaka | Flights, Holidays & Visa Assistance",
  description: "Plan business travel, private holidays, Umrah and visa assistance with TravelPro Dhaka.",
};

function contactNumber(value: string | undefined) {
  return value && /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

export default async function TravelPage() {
  const { data, error } = await publishedOffers().order("created_at", { ascending: false }).limit(48);
  const offers: PublicOffer[] = data ?? [];
  const whatsapp = contactNumber(process.env.TRAVEL_WHATSAPP_NUMBER);
  const phone = contactNumber(process.env.TRAVEL_CALL_NUMBER);

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link href="/travel" className={styles.brand}>TravelPro <span>Dhaka</span></Link>
        <nav aria-label="Travel navigation">
          <a href="#offers">Offers</a>
          {whatsapp && <a href={`https://wa.me/${whatsapp.slice(1)}`}>WhatsApp</a>}
          {phone && <a href={`tel:${phone}`}>Call</a>}
          <Link className={styles.navAction} href="/inquire">Inquire</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.kicker}>Corporate &amp; private travel</p>
          <h1>Travel, thoughtfully arranged.</h1>
          <p className={styles.intro}>Business flights, private holidays and pilgrimage journeys, planned with a Dhaka-based travel specialist.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/inquire">Plan your journey <span aria-hidden="true">↗</span></Link>
            <a className={styles.secondary} href="#offers">Browse offers <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <div className={styles.photo}>
          <Image src="/travel/maldives.webp" alt="Overwater villas along a turquoise lagoon in the Maldives" fill priority sizes="(max-width: 800px) 100vw, 55vw" />
          <span>Maldives</span>
        </div>
      </section>

      <div className={styles.trust} aria-label="Travel expertise">
        <span>Dhaka-based travel desk</span>
        <span>Sabre &amp; Galileo GDS expertise</span>
        <span>Corporate &amp; group itineraries</span>
      </div>

      <section id="offers" className={styles.offers}>
        <header>
          <div><p className={styles.kicker}>Travel offers</p><h2>Find your next journey</h2></div>
          <p>Flights, holidays, Umrah and visa support. Request current availability and a personalised quote.</p>
        </header>
        {error ? <p role="status">Offers are temporarily unavailable. <Link href="/inquire">Ask us about your trip</Link>.</p> :
          offers.length ? <div className={styles.grid}>{offers.map(offer => (
            <article key={offer.id} className={styles.offer} data-category={offer.category}>
              <p className={styles.kicker}>{offerCategories[offer.category]}</p>
              <p className={styles.destination}>{offer.destination}</p>
              <h3>{offer.title}</h3>
              <p className={styles.details}>{offer.details}</p>
              <div className={styles.offerFooter}>
                <span>{offer.price_label || "Quote on request"}</span>
                <Link href={`/inquire?offer=${offer.id}`}>Inquire <span aria-hidden="true">↗</span><span className={styles.srOnly}> about {offer.title}</span></Link>
              </div>
            </article>
          ))}</div> : <div className={styles.empty}><p>There are no published offers today.</p><Link href="/inquire">Request a personalised quote ↗</Link></div>}
      </section>
      <footer className={styles.footer}>
        <Link className={styles.brand} href="/travel">TravelPro <span>Dhaka</span></Link>
        <Link href="/inquire">Send a travel inquiry ↗</Link>
      </footer>
    </main>
  );
}
