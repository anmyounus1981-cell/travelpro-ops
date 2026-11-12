import InquiryForm from "./inquiry-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default function InquiryPage() {
  const siteKey = process.env.INQUIRY_TURNSTILE_SITE_KEY;
  const isTestKey = siteKey && /^[123]x0{10}/.test(siteKey);
  const configured = siteKey && process.env.INQUIRY_WEB_HMAC_SECRET &&
    process.env.INQUIRY_TURNSTILE_SECRET &&
    (!isTestKey || (process.env.NEXT_PUBLIC_OPS_ENV === "staging" && process.env.VERCEL_ENV !== "production"));

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>TravelPro Dhaka</p>
          <h1>Plan your travel</h1>
          <p>Send your requirements. Our team will review your inquiry and contact you.</p>
        </header>
        {configured ? <InquiryForm siteKey={siteKey} /> : <p role="status">Online inquiry submission is temporarily unavailable.</p>}
      </section>
    </main>
  );
}
