"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ClientType = "corporate" | "individual";

type CreatedClient = {
  id: string;
  client_type: ClientType;
  company_name: string;
  contact_name: string;
};

type ClientCreationResult = {
  success: boolean;
  error: string;
  outcomeUnknown: boolean;
  client: CreatedClient | null;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function quickCreateClient(
  formData: FormData,
): Promise<ClientCreationResult> {
  const fail = (
    error: string,
    outcomeUnknown = false,
  ): ClientCreationResult => ({
    success: false,
    error,
    outcomeUnknown,
    client: null,
  });

  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  const normalizeName = (value: string) =>
    value.replace(/\s+/g, " ");

  const requestId = text("creation_request_id");
  const clientType = text("client_type");
  const contactName = normalizeName(text("contact_name"));
  const companyName =
    clientType === "individual"
      ? contactName
      : normalizeName(text("company_name"));
  const email = text("contact_email").toLowerCase();
  const phone = text("contact_phone");

  if (!uuidPattern.test(requestId)) {
    return fail("Refresh the client creation form and try again.");
  }

  if (clientType !== "corporate" && clientType !== "individual") {
    return fail("Select a valid client type.");
  }

  if (!contactName || [...contactName].length > 200) {
    return fail("Contact name must contain 1 to 200 characters.");
  }

  if (!companyName || [...companyName].length > 200) {
    return fail("Company name must contain 1 to 200 characters.");
  }

  if (email.length > 254) {
    return fail("Email must be at most 254 characters.");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Enter a valid email address.");
  }

  if ([...phone].length > 50) {
    return fail("Phone must be at most 50 characters.");
  }

  const unknownMessage =
    "Client creation outcome is unknown. Refresh and check the client list before creating another account.";

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

    const { data: clientId, error } = await db.rpc(
      "create_client_with_review",
      {
        p_request_id: requestId,
        p_client_type: clientType,
        p_company_name: companyName,
        p_contact_name: contactName,
        p_contact_email: email || null,
        p_contact_phone: phone || null,
      },
    );

    if (error) {
      const safeMessages = [
        "Authentication required",
        "Owner access required",
        "Client creation request ID required",
        "Select a valid client type",
        "Contact name must contain 1 to 200 characters",
        "Company name must contain 1 to 200 characters",
        "Email must be at most 254 characters",
        "Enter a valid email address",
        "Phone must be at most 50 characters",
        "Company already exists. Select the existing corporate client",
      ];

      if (
        error.message ===
        "Client creation request conflicts with an existing submission"
      ) {
        return fail(
          "This submission ID is already associated with another client creation. Refresh and check the client list.",
          true,
        );
      }

      if (safeMessages.includes(error.message)) {
        return fail(error.message);
      }

      // SQL errors mean this RPC transaction did not commit.
      if (
        /^[0-9A-Z]{5}$/.test(error.code ?? "") ||
        error.code === "PGRST202"
      ) {
        return fail("Unable to create the client. Please try again.");
      }

      return fail(unknownMessage, true);
    }

    if (typeof clientId !== "string" || !uuidPattern.test(clientId)) {
      return fail(unknownMessage, true);
    }

    let refreshMessage = "";

    try {
      revalidatePath("/travellers");
      revalidatePath("/clients");
      revalidatePath("/audit-log");
      revalidatePath("/");
    } catch {
      refreshMessage =
        "Client created. Refresh other pages to see the update.";
    }

    return {
      success: true,
      error: refreshMessage,
      outcomeUnknown: false,
      client: {
        id: clientId,
        client_type: clientType,
        company_name: companyName,
        contact_name: contactName,
      },
    };
  } catch {
    return fail(unknownMessage, true);
  }
}