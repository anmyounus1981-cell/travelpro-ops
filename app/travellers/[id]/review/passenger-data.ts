import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyPassenger } from "@/lib/passenger-classification";
import { travellerDisplayName } from "../../passport-drafts/passport-fields";
import type {
  CaseAssignmentOption,
  ExistingPassengerAssignment,
} from "./passenger-types";
import type { PassengerType } from "@/lib/passenger-classification";

type CaseRow = {
  id: string;
  case_number: string;
  origin: string | null;
  destination: string | null;
  departure_date: string;
  return_date: string | null;
  status: string;
  adult_count: number;
  child_count: number;
  infant_count: number;
};

type AssignmentRow = {
  id: string;
  case_id: string;
  traveller_id: string;
  passenger_type: PassengerType;
  age_at_departure: number | null;
  accompanying_adult_id: string | null;
};

type TravellerRow = {
  id: string;
  given_name: string | null;
  surname: string | null;
  full_name: string;
  dob: string | null;
  verification_status: string | null;
};

export async function loadPassengerAssignmentData(
  db: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  travellerId: string,
): Promise<{
  cases: CaseAssignmentOption[];
  assignments: ExistingPassengerAssignment[];
}> {
  const { data: caseData, error: caseError } = await db
    .from("cases")
    .select(
      "id, case_number, origin, destination, departure_date, return_date, status, adult_count, child_count, infant_count",
    )
    .eq("client_id", clientId)
    .order("departure_date", { ascending: true });

  if (caseError) {
    throw new Error("Unable to load passenger cases.");
  }

  const caseRows = (caseData ?? []) as unknown as CaseRow[];

  if (caseRows.length === 0) {
    return { cases: [], assignments: [] };
  }

  const { data: assignmentData, error: assignmentError } = await db
    .from("case_travellers")
    .select(
      "id, case_id, traveller_id, passenger_type, age_at_departure, accompanying_adult_id",
    )
    .in("case_id", caseRows.map((item) => item.id));

  if (assignmentError) {
    throw new Error("Unable to load passenger assignments.");
  }

  const assignmentRows =
    (assignmentData ?? []) as unknown as AssignmentRow[];

  const travellerIds = [
    ...new Set(assignmentRows.map((item) => item.traveller_id)),
  ];

  let travellerRows: TravellerRow[] = [];

  if (travellerIds.length > 0) {
    const { data, error } = await db
      .from("travellers")
      .select(
        "id, given_name, surname, full_name, dob, verification_status",
      )
      .eq("client_id", clientId)
      .in("id", travellerIds);

    if (error) {
      throw new Error("Unable to load accompanying adult details.");
    }

    travellerRows = (data ?? []) as unknown as TravellerRow[];
  }

  const travellersById = new Map(
    travellerRows.map((item) => [item.id, item]),
  );

  const casesById = new Map(
    caseRows.map((item) => [item.id, item]),
  );

  const assignmentsById = new Map(
    assignmentRows.map((item) => [item.id, item]),
  );

  const cases: CaseAssignmentOption[] = caseRows
    .filter((item) => !["booked", "ticketed", "closed"].includes(item.status))
    .map((item) => {
      const linked = assignmentRows.filter(
        (assignment) => assignment.case_id === item.id,
      );

      const assignedCounts: Record<PassengerType, number> = {
        ADT: 0,
        CHD: 0,
        INF: 0,
      };

      for (const assignment of linked) {
        assignedCounts[assignment.passenger_type] += 1;
      }

      const accompanyingAdults = linked
        .filter((assignment) => {
          if (assignment.passenger_type !== "ADT") {
            return false;
          }

          const adult = travellersById.get(assignment.traveller_id);

          if (!adult || adult.verification_status !== "verified") {
            return false;
          }

          const classification = classifyPassenger(
            adult.dob,
            item.departure_date,
          );

          return Boolean(
            classification &&
              classification.age >= 18 &&
              !linked.some(
                (other) =>
                  other.passenger_type === "INF" &&
                  other.accompanying_adult_id === assignment.id,
              ),
          );
        })
        .map((assignment) => ({
          assignmentId: assignment.id,
          displayName: travellerDisplayName(
            travellersById.get(assignment.traveller_id)!,
          ),
        }));

      return {
        id: item.id,
        caseNumber: item.case_number,
        departureDate: item.departure_date,
        returnDate: item.return_date,
        plannedCounts: {
          ADT: item.adult_count,
          CHD: item.child_count,
          INF: item.infant_count,
        },
        assignedCounts,
        travellerAlreadyAssigned: linked.some(
          (assignment) => assignment.traveller_id === travellerId,
        ),
        accompanyingAdults,
      };
    });

  const assignments: ExistingPassengerAssignment[] = assignmentRows
    .filter((item) => item.traveller_id === travellerId)
    .sort((a, b) => {
      const aDate = casesById.get(a.case_id)!.departure_date;
      const bDate = casesById.get(b.case_id)!.departure_date;

      return bDate.localeCompare(aDate) || a.id.localeCompare(b.id);
    })
    .map((item) => {
      const travelCase = casesById.get(item.case_id)!;
      const adultAssignment = item.accompanying_adult_id
        ? assignmentsById.get(item.accompanying_adult_id)
        : undefined;

      const adult = adultAssignment
        ? travellersById.get(adultAssignment.traveller_id)
        : undefined;

      return {
        id: item.id,
        caseId: item.case_id,
        caseNumber: travelCase.case_number,
        origin: travelCase.origin,
        destination: travelCase.destination,
        departureDate: travelCase.departure_date,
        returnDate: travelCase.return_date,
        caseStatus: travelCase.status,
        passengerType: item.passenger_type,
        ageAtDeparture: item.age_at_departure,
        accompanyingAdultName: adult
          ? travellerDisplayName(adult)
          : null,
      };
    });

  return { cases, assignments };
}