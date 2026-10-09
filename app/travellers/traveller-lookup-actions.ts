"use server";

import { createClient } from "@/lib/supabase/server";

export type TravellerLookupResult = {
  success: boolean;
  error: string;
  traveller: {
    id: string;
    given_name: string | null;
    surname: string | null;
    full_name: string;
    verification_status: string | null;
  } | null;
};

export async function lookupCorporateTraveller(
  clientId: string,
  passportNumber: string,
): Promise<TravellerLookupResult> {
  const fail = (error: string): TravellerLookupResult => ({
    success: false,
    error,
    traveller: null,
  });

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (typeof clientId !== "string" || !uuidPattern.test(clientId)) {
    return fail("Select a valid corporate client.");
  }

  if (typeof passportNumber !== "string") {
    return fail("Enter a valid passport number.");
  }

  const passport = passportNumber.trim().toUpperCase();

  if (!passport || passport.length > 30) {
    return fail("Passport number must contain 1 to 30 characters.");
  }

  try {
    const db = await createClient();

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();

    if (authError || !user) {
      return fail("Please sign in again.");
    }

    const { data: owner, error: ownerError } = await db
      .from("app_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();

    if (ownerError || !owner) {
      return fail("Owner access required.");
    }
        const { data, error } = await db.rpc(
      "lookup_corporate_traveller",
      {
        p_client_id: clientId,
        p_passport_number: passport,
      },
    );

    if (error) {
      const safeMessages = [
        "Authentication required",
        "Owner access required",
        "Select a valid corporate client",
        "Passport number must contain 1 to 30 characters",
      ];

      return fail(
        safeMessages.includes(error.message)
          ? error.message
          : "Unable to search travellers. Please try again.",
      );
    }

    if (!Array.isArray(data) || data.length > 1) {
      return fail("Unexpected lookup result. Refresh and try again.");
    }

    if (data.length === 0) {
      return {
        success: true,
        error: "",
        traveller: null,
      };
    }

    const match: unknown = data[0];

    if (match === null || typeof match !== "object") {
      return fail("Unexpected traveller result.");
    }

    const row = match as Record<string, unknown>;
    const nullableText = (value: unknown) =>
      value === null || typeof value === "string";

    if (
      typeof row.id !== "string" ||
      !uuidPattern.test(row.id) ||
      typeof row.full_name !== "string" ||
      !nullableText(row.given_name) ||
      !nullableText(row.surname) ||
      !nullableText(row.verification_status)
    ) {
      return fail("Unexpected traveller result.");
    }

    return {
      success: true,
      error: "",
      traveller: {
        id: row.id,
        given_name: row.given_name as string | null,
        surname: row.surname as string | null,
        full_name: row.full_name,
        verification_status: row.verification_status as string | null,
      },
    };
  } catch {
    return fail("Unable to search travellers. Please try again.");
  }
}