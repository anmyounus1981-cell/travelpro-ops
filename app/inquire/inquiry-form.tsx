"use client";

import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { submitLandingInquiry } from "./actions";
import styles from "./page.module.css";

type Widget = {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action: string;
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

export default function InquiryForm({ siteKey }: { siteKey: string }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const requestId = useRef<string | null>(null);
  const pending = useRef<FormData | null>(null);
  const busy = useRef(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState("");
  const [company, setCompany] = useState(false);
  const [service, setService] = useState("flight_booking");
  const [submitting, setSubmitting] = useState(false);
  const [retry, setRetry] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const widget = turnstile();
    if (!scriptReady || !widget || !container.current) return;
    const id = widget.render(container.current, {
      sitekey: siteKey, action: "travel_inquiry", callback: setToken,
      "expired-callback": () => setToken(""),
      "error-callback": () => {
        setToken("");
        setMessage("The spam check could not load. Refresh and try again.");
      },
    });
    widgetId.current = id;
    return () => { widget.remove(id); widgetId.current = null; };
  }, [scriptReady, siteKey]);

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
    setMessage("");
    try {
      const result = await submitLandingInquiry(payload);
      if (result.success) {
        setMessage(`${result.message} Reference: ${result.receiptId}`);
        requestId.current = null;
        pending.current = null;
        setRetry(false);
        setCompany(false);
        setService("flight_booking");
        form.reset();
      } else if (result.outcome === "rejected" && !retry) {
        pending.current = null;
        requestId.current = null;
        setMessage(result.message);
      } else {
        setRetry(true);
        setMessage(result.message + " Retry the same inquiry in this tab.");
      }
    } catch {
      setRetry(true);
      setMessage("Receipt could not be confirmed. Retry the same inquiry in this tab.");
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
          <label className={styles.field}>Client type
            <select name="clientType" onChange={e => setCompany(e.target.value === "corporate")}>
              <option value="individual">Individual / Retail</option><option value="corporate">Corporate</option>
            </select>
          </label>
          <label className={styles.field}>Service
            <select name="serviceType" onChange={e => setService(e.target.value)}>
              <option value="flight_booking">Flight booking</option><option value="visa_support">Visa support</option>
              <option value="package">Travel package</option><option value="consultation">Consultation</option>
            </select>
          </label>
        </div>
        {company && <label className={styles.field}>Company name<input name="corporateClient" maxLength={200} required /></label>}
        <label className={styles.field}>{company ? "Contact person" : "Full name"}<input name="contactName" autoComplete="name" maxLength={200} required /></label>
        <p>Provide an email address or a phone number with country code.</p>
        <div className={styles.grid}>
          <label className={styles.field}>Email<input name="contactEmail" type="email" autoComplete="email" maxLength={254} /></label>
          <label className={styles.field}>Phone / WhatsApp<input name="contactPhone" type="tel" autoComplete="tel" placeholder="+880…" maxLength={16} /></label>
        </div>
        <div className={styles.grid}>
          <label className={styles.field}>Origin airport code<input name="origin" placeholder="DAC" maxLength={3} /></label>
          <label className={styles.field}>Destination airport code<input name="destination" placeholder="SIN" maxLength={3} /></label>
          <label className={styles.field}>Departure date<input name="departureDate" type="date" /></label>
          <label className={styles.field}>Return date<input name="returnDate" type="date" /></label>
          {service === "flight_booking" && <>
            <label className={styles.field}>Passengers<input name="passengerCount" type="number" min={1} max={999} /></label>
            <label className={styles.field}>Cabin preference<select name="cabinClass">
              <option value="">No preference</option><option value="economy">Economy</option><option value="premium_economy">Premium economy</option>
              <option value="business">Business</option><option value="first">First</option>
            </select></label>
          </>}
        </div>
        <label className={styles.field}>Travel requirements<textarea name="notes" rows={4} maxLength={4000} /></label>
        <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      </fieldset>
      <p>Leave out passport numbers, payment details, and other identity documents.</p>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setScriptReady(true)}
        onError={() => setMessage("The spam check could not load. Refresh and try again.")} />
      <div ref={container} />
      <button className={styles.submitButton} disabled={submitting || !token}>
        {submitting ? "Sending…" : retry ? "Retry this inquiry" : "Send inquiry"}
      </button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  );
}
