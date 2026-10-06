import { classifyPassenger } from "./passenger-classification";

export type PassportDateValidation = {
  error: string;
  ageNeedsConfirmation: boolean;
  expiryNeedsConfirmation: boolean;
};

export function dhakaToday(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function tenYearsAfter(value: string): string {
  const year = Number(value.slice(0, 4)) + 10;
  const candidate = `${year}${value.slice(4)}`;

  // Use February 28 if the target year has no February 29.
  return validDate(candidate) ? candidate : `${year}-02-28`;
}

export function validatePassportDates(
  dob: string,
  expiryDate: string,
  referenceDate: string,
): PassportDateValidation {
  const fail = (error: string): PassportDateValidation => ({
    error,
    ageNeedsConfirmation: false,
    expiryNeedsConfirmation: false,
  });

  if (!validDate(referenceDate)) {
    return fail("Unable to validate dates. Refresh the page.");
  }

  if (!validDate(dob) || dob > referenceDate) {
    return fail("Date of birth must be valid and not in the future.");
  }

  const classification = classifyPassenger(dob, referenceDate);

  if (!classification) {
    return fail("Check the date of birth against the passport.");
  }

  if (!validDate(expiryDate) || expiryDate <= dob) {
    return fail(
      "Passport expiry date must be valid and after date of birth.",
    );
  }

  return {
    error: "",
    ageNeedsConfirmation: classification.age > 100,
    expiryNeedsConfirmation:
      expiryDate > tenYearsAfter(referenceDate),
  };
}