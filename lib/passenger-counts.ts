export type PassengerCounts = {
  adult_count: number;
  child_count: number;
  infant_count: number;
  passenger_count: number;
};

export function readPassengerCounts(
  formData: FormData,
): PassengerCounts {
  const readCount = (key: string, label: string): number => {
    const value = String(formData.get(key) ?? "").trim();

    if (!/^\d+$/.test(value)) {
      throw new Error(`${label} must be a whole number of zero or more`);
    }

    const count = Number(value);

    if (!Number.isSafeInteger(count) || count > 2147483647) {
      throw new Error(`${label} is too large`);
    }

    return count;
  };

  const adultCount = readCount("adult_count", "Adult count");
  const childCount = readCount("child_count", "Child count");
  const infantCount = readCount("infant_count", "Infant count");

  const total = adultCount + childCount + infantCount;

  if (total < 1 || total > 2147483647) {
    throw new Error("Total passenger count must be valid and at least one");
  }

  if (infantCount > adultCount) {
    throw new Error("Infant count must not exceed adult count");
  }

  return {
    adult_count: adultCount,
    child_count: childCount,
    infant_count: infantCount,
    passenger_count: total,
  };
}