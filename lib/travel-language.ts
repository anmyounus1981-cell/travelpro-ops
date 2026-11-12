export type TravelLanguage = "en" | "bn";

export function travelLanguage(value: unknown): TravelLanguage {
  return value === "bn" ? "bn" : "en";
}

export function travelHref(path: "/travel" | "/inquire", language: TravelLanguage, offer?: string) {
  const params = new URLSearchParams();
  if (language === "bn") params.set("lang", language);
  if (offer) params.set("offer", offer);
  return params.size ? `${path}?${params}` : path;
}

export const travelCopy = {
  en: {
    tagline: "Curated Airfare, Bespoke Holidays & Executive Travel Management.",
    offers: "Offers", whatsapp: "WhatsApp", call: "Call", inquire: "Inquire",
    lead: "Business flights, private holidays and pilgrimage journeys, planned with a Dhaka-based travel specialist.",
    plan: "Plan your journey", browse: "Browse offers", maldives: "Maldives",
    photo: "Overwater villas along a turquoise lagoon in the Maldives",
    trust: ["20+ years of Sabre & Galileo GDS ticketing expertise", "Transparent pricing", "Dedicated executive support"],
    offersTitle: "Find your next journey", offersIntro: "Flights, holidays, Umrah and visa support. Request current availability and a personalised quote.",
    unavailableOffers: "Offers are temporarily unavailable.", emptyOffers: "There are no published offers today.",
    quote: "Quote on request", ask: "Request a personalised quote", send: "Send a travel inquiry",
    category: { flight: "Flight deals", holiday: "Holiday packages", umrah: "Umrah packages", visa: "Visa assistance" },
    offerTitle: "Inquire about this offer", formTitle: "Plan your travel", formIntro: "Send your requirements. Our team will review your inquiry and contact you.",
    selected: "Selected offer", general: "Start a general inquiry",
    offerError: "This offer could not be loaded.", offerUnavailable: "This offer is no longer available.",
    unavailableForm: "Online inquiry submission is temporarily unavailable.",
    form: {
      clientType: "Client type", individual: "Individual / Retail", corporate: "Corporate", service: "Service",
      flight: "Flight booking", visa: "Visa support", package: "Travel package", consultation: "Consultation",
      company: "Company name", person: "Contact person", name: "Full name",
      contact: "Provide an email address or a phone number with country code.", email: "Email", phone: "Phone / WhatsApp",
      origin: "Origin airport code", destination: "Destination airport code", departure: "Departure date", returnDate: "Return date",
      passengers: "Passengers", cabin: "Cabin preference", anyCabin: "No preference", economy: "Economy", premium: "Premium economy",
      business: "Business", first: "First", notes: "Travel requirements",
      privacy: "Leave out passport numbers, payment details, and other identity documents.",
      challenge: "The spam check could not load. Refresh and try again.",
      sending: "Sending…", retry: "Retry this inquiry", submit: "Send inquiry", reference: "Reference",
      received: "Your inquiry was received.", retryNotice: "Retry the same inquiry in this tab.",
      receiptError: "Receipt could not be confirmed.", rejected: "Check your inquiry details and try again.",
    },
  },
  bn: {
    tagline: "বাছাই করা বিমানভাড়া, আপনার মতো করে সাজানো ছুটি ও এক্সিকিউটিভ ভ্রমণ ব্যবস্থাপনা।",
    offers: "অফার", whatsapp: "হোয়াটসঅ্যাপ", call: "ফোন করুন", inquire: "জানতে চাই",
    lead: "ব্যবসায়িক ফ্লাইট, ব্যক্তিগত ছুটি ও ধর্মীয় সফর পরিকল্পনায় ঢাকাভিত্তিক ভ্রমণ বিশেষজ্ঞের সহায়তা নিন।",
    plan: "ভ্রমণের পরিকল্পনা করুন", browse: "অফার দেখুন", maldives: "মালদ্বীপ",
    photo: "মালদ্বীপের নীল জলরাশির ওপর নির্মিত ভিলা",
    trust: ["Sabre ও Galileo GDS টিকিটিংয়ে ২০ বছরের বেশি অভিজ্ঞতা", "স্বচ্ছ মূল্য", "এক্সিকিউটিভ ভ্রমণে নিবেদিত সহায়তা"],
    offersTitle: "পরবর্তী গন্তব্য খুঁজুন", offersIntro: "ফ্লাইট, ছুটির প্যাকেজ, ওমরাহ ও ভিসা সহায়তা। আসন বা প্যাকেজের প্রাপ্যতা ও আপনার জন্য মূল্য জানতে অনুরোধ পাঠান।",
    unavailableOffers: "অফারগুলো সাময়িকভাবে দেখা যাচ্ছে না।", emptyOffers: "আজ কোনো প্রকাশিত অফার নেই।",
    quote: "অনুরোধে মূল্য জানানো হবে", ask: "আপনার জন্য মূল্য জানতে চান?", send: "ভ্রমণের অনুরোধ পাঠান",
    category: { flight: "ফ্লাইট অফার", holiday: "ছুটির প্যাকেজ", umrah: "ওমরাহ প্যাকেজ", visa: "ভিসা সহায়তা" },
    offerTitle: "এই অফার সম্পর্কে জানতে চান?", formTitle: "ভ্রমণের পরিকল্পনা করুন", formIntro: "আপনার ভ্রমণের বিবরণ পাঠান। আমাদের দল তা দেখে আপনার সঙ্গে যোগাযোগ করবে।",
    selected: "নির্বাচিত অফার", general: "সাধারণ অনুরোধ পাঠান",
    offerError: "অফারটি দেখানো যাচ্ছে না।", offerUnavailable: "এই অফারটি এখন আর পাওয়া যাচ্ছে না।",
    unavailableForm: "অনলাইনে অনুরোধ পাঠানোর সুবিধা সাময়িকভাবে বন্ধ আছে।",
    form: {
      clientType: "গ্রাহকের ধরন", individual: "ব্যক্তিগত", corporate: "কর্পোরেট", service: "সেবার ধরন",
      flight: "ফ্লাইট বুকিং", visa: "ভিসা সহায়তা", package: "ভ্রমণ প্যাকেজ", consultation: "পরামর্শ",
      company: "প্রতিষ্ঠানের নাম", person: "যোগাযোগের ব্যক্তির নাম", name: "পুরো নাম",
      contact: "ইমেইল ঠিকানা অথবা দেশের কোডসহ ফোন নম্বর দিন।", email: "ইমেইল", phone: "ফোন / হোয়াটসঅ্যাপ",
      origin: "যাত্রার বিমানবন্দর কোড", destination: "গন্তব্যের বিমানবন্দর কোড", departure: "যাত্রার তারিখ", returnDate: "ফেরার তারিখ",
      passengers: "যাত্রীসংখ্যা", cabin: "পছন্দের কেবিন শ্রেণি", anyCabin: "নির্দিষ্ট পছন্দ নেই", economy: "ইকোনমি", premium: "প্রিমিয়াম ইকোনমি",
      business: "বিজনেস", first: "ফার্স্ট", notes: "ভ্রমণের প্রয়োজনীয় বিবরণ",
      privacy: "পাসপোর্ট নম্বর, পেমেন্টের তথ্য বা পরিচয়পত্র দেবেন না।",
      challenge: "স্প্যাম যাচাই চালু হয়নি। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।",
      sending: "পাঠানো হচ্ছে…", retry: "আবার পাঠান", submit: "অনুরোধ পাঠান", reference: "রেফারেন্স",
      received: "আপনার অনুরোধ গ্রহণ করা হয়েছে।", retryNotice: "এই ট্যাবেই একই অনুরোধ আবার পাঠান।",
      receiptError: "অনুরোধটি গৃহীত হয়েছে কি না নিশ্চিত করা যায়নি।", rejected: "বিবরণ পরীক্ষা করে আবার চেষ্টা করুন।",
    },
  },
};

export function inquiryMessage(language: TravelLanguage, english: string) {
  if (language === "en") return english;
  const translations: Record<string, string> = {
    "Enter your name or contact person name.": "আপনার বা যোগাযোগের ব্যক্তির নাম দিন।",
    "Enter the company name.": "প্রতিষ্ঠানের নাম দিন।",
    "Enter an email address or phone number.": "ইমেইল ঠিকানা অথবা ফোন নম্বর দিন।",
    "Enter a valid email address.": "সঠিক ইমেইল ঠিকানা দিন।",
    "Include the phone country code, for example +8801700000000.": "দেশের কোডসহ ফোন নম্বর দিন, যেমন +8801700000000।",
    "Origin must be a three-letter airport code.": "যাত্রার বিমানবন্দরের তিন অক্ষরের কোড দিন।",
    "Destination must be a three-letter airport code.": "গন্তব্যের বিমানবন্দরের তিন অক্ষরের কোড দিন।",
    "Return date cannot precede departure.": "ফেরার তারিখ যাত্রার তারিখের আগে হতে পারে না।",
    "Enter a departure date before a return date.": "ফেরার তারিখের আগে যাত্রার তারিখ দিন।",
    "Passenger count must be an integer from 1 to 999.": "যাত্রীসংখ্যা ১ থেকে ৯৯৯-এর মধ্যে পূর্ণসংখ্যা দিন।",
    "Complete the spam check and try again.": "স্প্যাম যাচাই শেষ করে আবার চেষ্টা করুন।",
    "Too many attempts. Please wait and try again.": "বেশি বার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    "This offer is no longer available. Open a general inquiry to continue.": "অফারটি আর পাওয়া যাচ্ছে না। সাধারণ অনুরোধ ফর্ম ব্যবহার করুন।",
    "Inquiry submission is temporarily unavailable.": travelCopy.bn.unavailableForm,
    "Inquiry submission is temporarily unavailable. Please try again later.": travelCopy.bn.unavailableForm,
    "Unable to confirm receipt. Retry without changing your details.": travelCopy.bn.form.receiptError,
  };
  return translations[english] ?? travelCopy.bn.form.rejected;
}
