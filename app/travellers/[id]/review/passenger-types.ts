import type { PassengerType } from "@/lib/passenger-classification";

export type AccompanyingAdultOption = {
  // This is a case_travellers ID, not a travellers ID.
  assignmentId: string;
  displayName: string;
};

export type CaseAssignmentOption = {
  id: string;
  caseNumber: string;
  departureDate: string;
  returnDate: string | null;
  plannedCounts: Record<PassengerType, number>;
  assignedCounts: Record<PassengerType, number>;
  travellerAlreadyAssigned: boolean;
  accompanyingAdults: AccompanyingAdultOption[];
};

export type ExistingPassengerAssignment = {
  id: string;
  caseId: string;
  caseNumber: string;
  departureDate: string;
  passengerType: PassengerType;
  ageAtDeparture: number | null;
  accompanyingAdultName: string | null;
};