import "server-only";
import { createClient } from "./server";

export async function requireOwnerId(
  db: Awaited<ReturnType<typeof createClient>>,
) {
  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser();

  if (userError || !user) {
    throw new Error("Authentication required");
  }

  const { data: owner, error: ownerError } = await db
    .from("app_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("role", "owner")
    .single();

  if (ownerError || !owner) {
    throw new Error("Owner access required");
  }

  return owner.id;
}
