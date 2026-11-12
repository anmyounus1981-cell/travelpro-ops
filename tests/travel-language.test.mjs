import assert from "node:assert/strict";
import test from "node:test";
import { inquiryMessage, travelCopy, travelHref, travelLanguage } from "../lib/travel-language.ts";

test("public travel language is allowlisted and defaults to English", () => {
  assert.equal(travelLanguage("bn"), "bn");
  for (const value of ["en", "fr", ["bn", "en"], undefined]) assert.equal(travelLanguage(value), "en");
});

test("the inquiry language toggle preserves the selected offer", () => {
  const id = "bc0983e7-3120-4ac8-b328-0479a84e71c2";
  assert.equal(travelHref("/inquire", "bn", id), `/inquire?lang=bn&offer=${id}`);
  assert.equal(travelHref("/inquire", "en", id), `/inquire?offer=${id}`);
  assert.equal(travelHref("/travel", "en"), "/travel");
  assert.equal(travelHref("/travel", "bn"), "/travel?lang=bn");
});

test("both languages have matching form labels and localized validation", () => {
  assert.deepEqual(Object.keys(travelCopy.en.form), Object.keys(travelCopy.bn.form));
  assert.equal(travelCopy.en.tagline, "Curated Airfare, Bespoke Holidays & Executive Travel Management.");
  assert.equal(travelCopy.bn.form.submit, "অনুরোধ পাঠান");
  assert.match(inquiryMessage("bn", "Enter a valid email address."), /ইমেইল/);
});
