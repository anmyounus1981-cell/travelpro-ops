export const passportFieldKeys = [
  "full_name",
  "passport_number",
  "dob",
  "expiry_date",
  "nationality",
] as const;

export type PassportFieldKey =
  (typeof passportFieldKeys)[number];

export type PassportFields = Record<
  PassportFieldKey,
  string | null
>;

export function readPassportFields(
  value: unknown,
): PassportFields {
  const source =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    passportFieldKeys.map((key) => [
      key,
      typeof source[key] === "string"
        ? source[key].trim() || null
        : null,
    ]),
  ) as PassportFields;
}
export const passportReviewFieldKeys = [
  "given_name",
  "surname",
  "passport_number",
  "dob",
  "expiry_date",
  "nationality",
] as const;

export type PassportReviewFieldKey =
  (typeof passportReviewFieldKeys)[number];

export type PassportReviewFields = Record<
  PassportReviewFieldKey,
  string | null
>;

export function readPassportReviewFields(
  value: unknown,
): PassportReviewFields {
  const source =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    passportReviewFieldKeys.map((key) => [
      key,
      typeof source[key] === "string"
        ? source[key].trim() || null
        : null,
    ]),
  ) as PassportReviewFields;
}

export function travellerDisplayName(value: {
  given_name?: string | null;
  surname?: string | null;
  full_name?: string | null;
}): string {
  const separateName = [
    value.given_name?.trim(),
    value.surname?.trim(),
  ]
    .filter(Boolean)
    .join(" ");

  return separateName || value.full_name?.trim() || "Unnamed traveller";
}