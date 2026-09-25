"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=missing_credentials");
  }

  const supabase = await createClient();

  const { error: signInError } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (signInError) {
    redirect("/login?error=invalid_credentials");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    await supabase.auth.signOut();
    redirect("/login?error=session_verification_failed");
  }

  const { data: operator, error: operatorError } = await supabase
    .from("app_users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (operatorError || !operator) {
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized");
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}