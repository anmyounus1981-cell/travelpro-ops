"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dhakaDate, isOfferId, offerCategories } from "@/lib/offers";
import { requireOwnerId } from "@/lib/supabase/owner";
import { createClient } from "@/lib/supabase/server";

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function finish(status: string): never {
  revalidatePath("/travel");
  revalidatePath("/inquire");
  revalidatePath("/offers");
  redirect(`/offers?result=${status}`);
}

export async function saveOffer(form: FormData) {
  const db = await createClient();
  await requireOwnerId(db);
  const id = field(form, "id");
  const revision = field(form, "revision");
  const category = field(form, "category");
  const title = field(form, "title");
  const destination = field(form, "destination");
  const details = field(form, "details");
  const price = field(form, "price_label");
  const expiry = field(form, "expires_at");
  const published = form.get("is_published") === "on";

  if (!Object.hasOwn(offerCategories, category) || (id && (!isOfferId(id) || !revision))
    || title.length < 3 || title.length > 100 || destination.length < 2 || destination.length > 80
    || details.length < 10 || details.length > 1200 || price.length > 60
    || (expiry && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || (published && expiry < dhakaDate())))) {
    finish("invalid");
  }

  const values = {
    category, title, destination, details,
    price_label: price || null, expires_at: expiry || null, is_published: published,
  };
  const result = id
    ? await db.from("offers").update(values).eq("id", id).eq("updated_at", revision).select("id").maybeSingle()
    : await db.from("offers").insert(values).select("id").single();

  finish(result.error ? "error" : result.data ? "saved" : "stale");
}

export async function deleteOffer(form: FormData) {
  const db = await createClient();
  await requireOwnerId(db);
  const id = field(form, "id");
  const revision = field(form, "revision");
  if (!isOfferId(id) || !revision || form.get("confirm") !== "on") finish("invalid");
  const { data, error } = await db.from("offers").delete().eq("id", id).eq("updated_at", revision).select("id").maybeSingle();
  finish(error ? "error" : data ? "deleted" : "stale");
}
