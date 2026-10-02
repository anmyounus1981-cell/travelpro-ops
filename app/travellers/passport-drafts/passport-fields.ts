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