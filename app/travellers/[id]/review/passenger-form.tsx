"use client";

import { useActionState, useState } from "react";
import { classifyPassenger } from "@/lib/passenger-classification";
import { assignTravellerToCase } from "./passenger-actions";
import type { CaseAssignmentOption } from "./passenger-types";

export function PassengerAssignmentForm({
  travellerId,
  dob,
  verified,
  cases,
}: {
  travellerId: string;
  dob: string | null;
  verified: boolean;
  cases: CaseAssignmentOption[];
}) {
  const [caseId, setCaseId] = useState("");
  const [adultId, setAdultId] = useState("");

  const [state, formAction, pending] = useActionState(
    assignTravellerToCase,
    { error: "", success: false, blocked: false },
  );

  const selectedCase = cases.find((item) => item.id === caseId);

  const classification = classifyPassenger(
    dob,
    selectedCase?.departureDate ?? null,
  );

  const returnClassification = selectedCase?.returnDate
    ? classifyPassenger(dob, selectedCase.returnDate)
    : null;

  const journeyNeedsReview = Boolean(
    selectedCase?.returnDate &&
      (
        selectedCase.returnDate < selectedCase.departureDate ||
        !returnClassification ||
        returnClassification.passengerType !== classification?.passengerType
      ),
  );

  const passengerType = classification?.passengerType;
  const isInfant = passengerType === "INF";

  const capacityAvailable = Boolean(
    selectedCase &&
      passengerType &&
      selectedCase.assignedCounts[passengerType] <
        selectedCase.plannedCounts[passengerType],
  );

  const adultSelected = Boolean(
    selectedCase?.accompanyingAdults.some(
      (adult) => adult.assignmentId === adultId,
    ),
  );

  const canSubmit = Boolean(
    verified &&
      classification &&
      selectedCase &&
      !selectedCase.travellerAlreadyAssigned &&
      !journeyNeedsReview &&
      capacityAvailable &&
      (!isInfant || adultSelected),
  );

  if (state.success || state.blocked) {
    return (
      <div>
        <p role={state.success ? "status" : "alert"}>
          {state.error || "Passenger assigned successfully."}
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Refresh review page
        </button>
      </div>
    );
  }

  if (!verified || !dob) {
    return (
      <p role="status">
        Complete and save owner passport review before assigning this
        traveller to a case.
      </p>
    );
  }

  if (cases.length === 0) {
    return (
      <p role="status">
        No eligible cases are available for this client.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="traveller_id" value={travellerId} />
      <input type="hidden" name="expected_dob" value={dob} />

      <fieldset
        disabled={pending}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <label>
          Travel case
          <select
            name="case_id"
            required
            value={caseId}
            onChange={(event) => {
              setCaseId(event.target.value);
              setAdultId("");
            }}
            style={{ display: "block", marginTop: "8px" }}
          >
            <option value="">Select case</option>
            {cases.map((item) => (
              <option
                key={item.id}
                value={item.id}
                disabled={item.travellerAlreadyAssigned}
              >
                {item.caseNumber} · {item.departureDate}
                {item.travellerAlreadyAssigned ? " · Already assigned" : ""}
              </option>
            ))}
          </select>
        </label>

        {classification && selectedCase && (
          <div style={{ marginTop: "16px" }}>
            <p>
              Age at departure: <strong>{classification.age}</strong>
            </p>
            <p>
              Calculated passenger type: <strong>{passengerType}</strong>
            </p>
            <p>
              Assigned / planned:{" "}
              {selectedCase.assignedCounts[classification.passengerType]}
              {" / "}
              {selectedCase.plannedCounts[classification.passengerType]}
            </p>
          </div>
        )}

        {selectedCase && !classification && (
          <p role="alert" style={{ marginTop: "12px" }}>
            DOB and departure date cannot produce a valid classification.
          </p>
        )}

        {journeyNeedsReview && (
          <p role="alert" style={{ marginTop: "12px" }}>
            Travel dates or a passenger type change during the journey
            require review before assignment.
          </p>
        )}

        {classification && !capacityAvailable && (
          <p role="alert" style={{ marginTop: "12px" }}>
            The planned passenger count for this type has been reached.
          </p>
        )}

        {isInfant && selectedCase && (
          <div style={{ marginTop: "16px" }}>
            <label>
              Accompanying adult
              <select
                name="accompanying_adult_id"
                required
                value={adultId}
                onChange={(event) => setAdultId(event.target.value)}
                style={{ display: "block", marginTop: "8px" }}
              >
                <option value="">Select accompanying adult</option>
                {selectedCase.accompanyingAdults.map((adult) => (
                  <option
                    key={adult.assignmentId}
                    value={adult.assignmentId}
                  >
                    {adult.displayName}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ marginTop: "8px" }}>
              The adult must already be assigned to this case, be at least
              18 at departure, and have no other linked infant.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={pending || !canSubmit}
          style={{ marginTop: "20px", padding: "12px 18px" }}
        >
          {pending ? "Assigning..." : "Assign passenger to case"}
        </button>
      </fieldset>

      {state.error && (
        <p role="alert" style={{ color: "#b91c1c", marginTop: "12px" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}