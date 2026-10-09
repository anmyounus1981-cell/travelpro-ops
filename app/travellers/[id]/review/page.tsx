import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TravellerCorrectionForm } from "./review-form";
import { travellerDisplayName } from "../../passport-drafts/passport-fields";
import { PassengerAssignmentForm } from "./passenger-form";
import { loadPassengerAssignmentData } from "./passenger-data";

export const dynamic = "force-dynamic";

export default async function TravellerReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    notFound();
  }

  const db = await createClient();

  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: owner, error: ownerError } = await db
    .from("app_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (ownerError) {
    throw new Error("Unable to verify owner access.");
  }

  if (!owner) {
    notFound();
  }

  const { data: traveller, error: travellerError } = await db
    .from("travellers")
    .select(
      "id, client_id, given_name, surname, full_name, passport_number, dob, expiry_date, nationality, verification_status",
    )
    .eq("id", id)
    .maybeSingle();

  if (travellerError) {
    throw new Error("Unable to load traveller.");
  }

  if (!traveller) {
    notFound();
  }

  const { data: client, error: clientError } = await db
    .from("clients")
    .select("company_name")
    .eq("id", traveller.client_id)
    .maybeSingle();

  if (clientError) {
    throw new Error("Unable to load traveller client.");
  }
  const passengerData = await loadPassengerAssignmentData(
    db,
    traveller.client_id,
    traveller.id,
  );

    const details: [string, string | null][] = [
    ["Full name", travellerDisplayName(traveller)],
    ["Given Name", traveller.given_name],
    ["Surname / Last Name", traveller.surname],
    ["Passport number", traveller.passport_number],
    ["Date of birth", traveller.dob],
    ["Passport expiry date", traveller.expiry_date],
    ["Nationality", traveller.nationality],
    ["Status", traveller.verification_status],
  ];

  return (
    <main
      style={{
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "40px 24px",
      }}
    >
      <Link href="/travellers">← Back to travellers</Link>

      <h1>Traveller review</h1>

      <p>
        Client: {client?.company_name || "Unnamed client"}
      </p>

      <section
        style={{
          padding: "24px",
          border: "1px solid #cbd5e1",
          borderRadius: "16px",
          background: "#ffffff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Current details</h2>

        <dl>
          {details.map(([label, value]) => (
            <div key={label} style={{ marginBottom: "16px" }}>
              <dt style={{ fontWeight: 700 }}>{label}</dt>
              <dd style={{ margin: "6px 0 0" }}>
                {value || "Not provided"}
              </dd>
            </div>
          ))}
        </dl>

        <p>
          Compare these details with the passport before making corrections.
        </p>
      </section>
            <section
        style={{
          marginTop: "24px",
          padding: "24px",
          border: "1px solid #cbd5e1",
          borderRadius: "16px",
          background: "#ffffff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Owner correction review</h2>

        <TravellerCorrectionForm
          travellerId={traveller.id}
          initialDetails={{
            given_name: traveller.given_name,
            surname: traveller.surname,
            full_name: traveller.full_name,
            passport_number: traveller.passport_number,
            dob: traveller.dob,
            expiry_date: traveller.expiry_date,
            nationality: traveller.nationality,
            verification_status: traveller.verification_status,
          }}
        />
      </section>
            <section
        style={{
          marginTop: "24px",
          padding: "24px",
          border: "1px solid #cbd5e1",
          borderRadius: "16px",
          background: "#ffffff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Case passenger assignment</h2>

        <p style={{ marginBottom: "20px" }}>
          Passenger type is calculated from the reviewed date of birth
          and the selected case departure date.
        </p>

        <PassengerAssignmentForm
          travellerId={traveller.id}
          dob={traveller.dob}
          verified={traveller.verification_status === "verified"}
          cases={passengerData.cases}
        />

        <h3 style={{ marginTop: "28px" }}>Trip History</h3>

        <p>
          Cases linked to this traveller profile, including upcoming trips.
          A case assignment does not confirm ticket issuance or completed travel.
        </p>

        {passengerData.assignments.length === 0 ? (
          <p>This traveller has no case assignments.</p>
        ) : (
          <ul style={{ paddingLeft: "20px" }}>
            {passengerData.assignments.map((assignment) => (
              <li
                key={assignment.id}
                style={{ marginBottom: "16px" }}
              >
                <strong>{assignment.caseNumber}</strong>
                <p>
  Case route: {assignment.origin || "Not recorded"}
  {" → "}
  {assignment.destination || "Not recorded"}
</p>
                <p>Departure: {assignment.departureDate}</p>
                <p>
  Return: {assignment.returnDate || "Not recorded"}
</p>
<p>
  Case status: {assignment.caseStatus.replaceAll("_", " ")}
</p>
                <p>
                  Passenger type: {assignment.passengerType}
                  {" · "}Age at departure:{" "}
                  {assignment.ageAtDeparture ?? "Not recorded"}
                </p>

                {assignment.passengerType === "INF" && (
                  <p>
                    Accompanying adult:{" "}
                    {assignment.accompanyingAdultName || "Not recorded"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}