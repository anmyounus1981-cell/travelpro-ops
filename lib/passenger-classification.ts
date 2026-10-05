export type PassengerType = "ADT" | "CHD" | "INF";

export type PassengerClassification = {
  age: number;
  passengerType: PassengerType;
};

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

export function classifyPassenger(
  dob: string | null,
  travelDate: string | null,
): PassengerClassification | null {
  if (
    !dob ||
    !travelDate ||
    !validDate(dob) ||
    !validDate(travelDate) ||
    travelDate < dob
  ) {
    return null;
  }

  const birthYear = Number(dob.slice(0, 4));
  const travelYear = Number(travelDate.slice(0, 4));

  let age = travelYear - birthYear;

  if (travelDate.slice(5) < dob.slice(5)) {
    age -= 1;
  }

  if (age < 0 || age > 130) {
    return null;
  }

  return {
    age,
    passengerType: age < 2 ? "INF" : age < 12 ? "CHD" : "ADT",
  };
}