import Link from "next/link";
import { travelHref, type TravelLanguage } from "@/lib/travel-language";
import styles from "./language-toggle.module.css";

export function LanguageToggle({ path, language, offer }: {
  path: "/travel" | "/inquire";
  language: TravelLanguage;
  offer?: string;
}) {
  return (
    <div className={styles.toggle} aria-label={language === "bn" ? "ভাষা" : "Language"}>
      <Link href={travelHref(path, "en", offer)} lang="en" hrefLang="en" aria-current={language === "en" ? "page" : undefined}>EN</Link>
      <Link href={travelHref(path, "bn", offer)} lang="bn" hrefLang="bn" aria-current={language === "bn" ? "page" : undefined}>বাংলা</Link>
    </div>
  );
}
