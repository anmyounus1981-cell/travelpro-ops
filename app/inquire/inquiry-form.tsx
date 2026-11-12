"use client";

import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { offerService, type PublicOffer } from "@/lib/offers";
import { inquiryMessage, travelCopy, type TravelLanguage } from "@/lib/travel-language";
import { submitLandingInquiry } from "./actions";
import styles from "./page.module.css";

type Widget = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action: string;
    language: TravelLanguage;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

function turnstile() {
  return (window as Window & { turnstile?: Widget }).turnstile;
}

export default function InquiryForm({ siteKey, offer, language }: { siteKey: string; offer?: PublicOffer; language: TravelLanguage }) {
  const copy = travelCopy[language].form;
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const requestId = useRef<string | null>(null);
  const pending = useRef<FormData | null>(null);
  const busy = useRef(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState("");
  const [company, setCompany] = useState(false);
  const initialService = offer ? offerService(offer.category) : "flight_booking";
  const [service, setService] = useState(initialService);
  const [submitting, setSubmitting] = useState(false);
  const [retry, setRetry] = useState(false);
  const [status, setStatus] = useState<{ kind: "challenge" | "success" | "failure" | "retry"; message?: string; receipt?: string } | null>(null);

  useEffect(() => {
    const widget = turnstile();
    if (!scriptReady || !widget || !container.current) return;
    const id = widget.render(container.current, {
      sitekey: siteKey, action: "travel_inquiry", language, callback: setToken,
      "expired-callback": () => setToken(""),
      "error-callback": () => {
        setToken("");
        setStatus({ kind: "challenge" });
      },
    });
    widgetId.current = id;
    return () => { widget.remove(id); widgetId.current = null; setToken(""); };
  }, [scriptReady, siteKey, language]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !token) return;
    const form = event.currentTarget;
    const payload = pending.current ?? new FormData(form);
    const id = requestId.current ?? crypto.randomUUID();
    requestId.current = id;
    pending.current = payload;
    payload.set("requestId", id);
    payload.set("challenge", token);
    busy.current = true;
    setSubmitting(true);
    setStatus(null);
    try {
      const result = await submitLandingInquiry(payload);
      if (result.success && result.receiptId) {
        setStatus({ kind: "success", message: result.message, receipt: result.receiptId });
        requestId.current = null;
        pending.current = null;
        setRetry(false);
        setCompany(false);
        setService(initialService);
        form.reset();
      } else if (result.outcome === "rejected" && !retry) {
        pending.current = null;
        requestId.current = null;
        setStatus({ kind: "failure", message: result.message });
      } else {
        setRetry(true);
        setStatus({ kind: "retry", message: result.message });
      }
    } catch {
      setRetry(true);
      setStatus({ kind: "retry" });
    } finally {
      setToken("");
      if (widgetId.current) turnstile()?.reset(widgetId.current);
      setSubmitting(false);
      busy.current = false;
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <fieldset disabled={submitting || retry} style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: "1rem", minWidth: 0 }}>
        <div className={styles.grid}>
          <label className={styles.field}>{copy.clientType}
            <select name="clientType" onChange={e => setCompany(e.target.value === "corporate")}>
              <option value="individual">{copy.individual}</option><option value="corporate">{copy.corporate}</option>
            </select>
          </label>
          {offer ? <>
            <input type="hidden" name="offerId" value={offer.id} />
            <input type="hidden" name="serviceType" value={initialService} />
          </> : <label className={styles.field}>{copy.service}
            <select name="serviceType" onChange={e => setService(e.target.value)}>
              <option value="flight_booking">{copy.flight}</option><option value="visa_support">{copy.visa}</option>
              <option value="package">{copy.package}</option><option value="consultation">{copy.consultation}</option>
            </select>
          </label>}
        </div>
        {company && <label className={styles.field}>{copy.company}<input name="corporateClient" maxLength={200} required /></label>}
        <label className={styles.field}>{company ? copy.person : copy.name}<input name="contactName" autoComplete="name" maxLength={200} required /></label>
        <p>{copy.contact}</p>
        <div className={styles.grid}>
          <label className={styles.field}>{copy.email}<input name="contactEmail" type="email" autoComplete="email" maxLength={254} /></label>
          <label className={styles.field}>{copy.phone}<input name="contactPhone" type="tel" autoComplete="tel" placeholder="+880…" maxLength={16} /></label>
        </div>
        <div className={styles.grid}>
          <label className={styles.field}>{copy.origin}<input name="origin" placeholder="DAC" maxLength={3} /></label>
          <label className={styles.field}>{copy.destination}<input name="destination" placeholder="SIN" maxLength={3} /></label>
          <label className={styles.field}>{copy.departure}<input name="departureDate" type="date" /></label>
          <label className={styles.field}>{copy.returnDate}<input name="returnDate" type="date" /></label>
          {service === "flight_booking" && <>
            <label className={styles.field}>{copy.passengers}<input name="passengerCount" type="number" min={1} max={999} /></label>
            <label className={styles.field}>{copy.cabin}<select name="cabinClass">
              <option value="">{copy.anyCabin}</option><option value="economy">{copy.economy}</option><option value="premium_economy">{copy.premium}</option>
              <option value="business">{copy.business}</option><option value="first">{copy.first}</option>
            </select></label>
          </>}
        </div>
        <label className={styles.field}>{copy.notes}<textarea name="notes" rows={4} maxLength={4000} /></label>
        <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      </fieldset>
      <p>{copy.privacy}</p>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setScriptReady(true)}
        onError={() => setStatus({ kind: "challenge" })} />
      <div ref={container} />
      <button className={styles.submitButton} disabled={submitting || !token}>
        {submitting ? copy.sending : retry ? copy.retry : copy.submit}
      </button>
      <p role="status" aria-live="polite">{status?.kind === "challenge" && copy.challenge}
        {status?.kind === "success" && `${language === "en" ? status.message : copy.received} ${copy.reference}: ${status.receipt}`}
        {status?.kind === "failure" && inquiryMessage(language, status.message ?? "")}
        {status?.kind === "retry" && `${status.message ? inquiryMessage(language, status.message) : copy.receiptError} ${copy.retryNotice}`}
      </p>
    </form>
  );
}
