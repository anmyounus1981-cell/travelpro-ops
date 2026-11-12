export const offerCategories = {
  flight: "Flight deals",
  holiday: "Holiday packages",
  umrah: "Umrah packages",
  visa: "Visa assistance",
} as const;

export type OfferCategory = keyof typeof offerCategories;

export type PublicOffer = {
  id: string;
  category: OfferCategory;
  title: string;
  destination: string;
  details: string;
  price_label: string | null;
  expires_at: string | null;
};

export type ManagedOffer = PublicOffer & {
  is_published: boolean;
  updated_at: string;
};

export const offerFields = "id,category,title,destination,details,price_label,expires_at";

export function offerService(category: OfferCategory) {
  if (category === "flight") return "flight_booking";
  if (category === "visa") return "visa_support";
  return "package";
}

export function isOfferId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function dhakaDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
