"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { classifyPassenger } from "@/lib/passenger-classification";

type AssignmentState = {
  error: string;
  success: boolean;
  blocked: boolean;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assignTravellerToCase(
  _previousState: AssignmentState,
  formData: FormData,
): Promise<AssignmentState> {
  const text = (key: string) =>
    String(formData.get(key) ?? "").trim();

  const travellerId = text("traveller_id");
  const caseId = text("case_id");
  const expectedDob = text("expected_dob");
  const adultId = text("accompanying_adult_id");

  const failure = (error: string): AssignmentState => ({
    error,
    success: false,
    blocked: false,
  });

  const unknownOutcome = (): AssignmentState => ({
    error:
      "Assignment outcome is unknown. Refresh the review page and check existing assignments before submitting again.",
    success: false,
    blocked: true,
  });

  if (!uuidPattern.test(travellerId) || !uuidPattern.test(caseId)) {
    return failure("Select a valid traveller and case.");
  }

  if (adultId && !uuidPattern.test(adultId)) {
    return failure("Select a valid accompanying adult.");
  }

  if (!classifyPassenger(expectedDob, expectedDob)) {
    return failure("A valid reviewed date of birth is required.");
  }

  const db = await createClient();

  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();

  if (authError || !user) {
    return failure("Please sign in again.");
  }

  let result;

  try {
    result = await db.rpc("assign_case_traveller", {
      p_case_id: caseId,
      p_traveller_id: travellerId,
      p_expected_dob: expectedDob,
      p_accompanying_adult_id: adultId || null,
    });
  } catch {
    return unknownOutcome();
  }

  const { data: assignmentId, error } = result;

  if (error) {
    const definiteFailure =
      /^[0-9A-Z]{5}$/.test(error.code ?? "") ||
      error.code === "PGRST202";

    if (!definiteFailure) {
      return unknownOutcome();
    }

    const safeMessages = [
      "Owner access required",
      "Case not found",
      "Traveller not found",
      "Booked, ticketed or closed cases require a separate passenger change review",
      "Return date must not precede departure date",
      "Traveller and case must belong to the same client",
      "Traveller DOB changed. Refresh before assigning",
      "Complete owner passport review before assigning",
      "Valid DOB and travel date are required",
      "Age at departure must not exceed 130 years",
      "Passenger type changes during the journey. Airline review required",
      "Traveller is already assigned to this case",
      "Assignment exceeds the planned passenger count for this type",
      "Select an accompanying adult for the infant",
      "Accompanying adult must be an ADT assigned to the same case",
      "Accompanying adult requires verified traveller details",
      "Accompanying adult must be at least 18 at departure",
      "This adult already accompanies an infant",
      "Adult association is only available for infant passengers",
    ];

    if (safeMessages.includes(error.message)) {
      return failure(error.message);
    }

    if (error.code === "23505") {
      return failure(
        "Assignment conflicts with an existing record. Refresh the review page.",
      );
    }

    return failure(
      "Unable to assign traveller. Refresh the page and check the case details.",
    );
  }

  if (
    typeof assignmentId !== "string" ||
    !uuidPattern.test(assignmentId)
  ) {
    return unknownOutcome();
  }

  try {
    revalidatePath("/");
    revalidatePath("/travellers");
    revalidatePath(`/travellers/${travellerId}/review`);
    revalidatePath("/audit-log");
  } catch {
    return {
      error:
        "Passenger assigned. Refresh the review page to see the assignment. Do not submit again.",
      success: true,
      blocked: true,
    };
  }

  return { error: "", success: true, blocked: false };
}