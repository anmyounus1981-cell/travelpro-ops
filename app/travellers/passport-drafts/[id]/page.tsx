import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PassportReviewForm } from "../review-form";
import { PassportExtractionForm } from "../extraction-form";
import { readPassportFields } from "../passport-fields";

export const dynamic = "force-dynamic";

export default async function PassportDraftPage({
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

  const { data: draft, error: draftError } = await db
    .from("passport_extraction_drafts")
    .select("id, client_id, image_path, status, extracted_fields, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (draftError) {
    throw new Error("Unable to load passport draft.");
  }

  if (!draft) {
    notFound();
  }

  const { data: image, error: imageError } = await db.storage
    .from("passports")
    .createSignedUrl(draft.image_path, 300);

  if (imageError || !image) {
    throw new Error("Unable to load private passport image.");
  }

  return (
    <main
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "40px 24px",
      }}
    >
      <Link href="/travellers">← Back to travellers</Link>

      <h1>Passport draft</h1>

      <p>
        Status: {String(draft.status).replaceAll("_", " ")}
      </p>

      <p>
        Compare every field with the passport before confirming a traveller.
      </p>

      <section
        style={{
          padding: "20px",
          border: "1px solid #cbd5e1",
          borderRadius: "16px",
          background: "#ffffff",
        }}
      >
        <h2>Passport image</h2>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.signedUrl}
          alt="Uploaded passport for owner review"
          referrerPolicy="no-referrer"
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: "800px",
            objectFit: "contain",
          }}
        />

        <p>
          Image access expires after five minutes. Refresh to load it again.
        </p>
            </section>

{["uploaded", "extraction_failed"].includes(draft.status) && (
  <section
    style={{
      marginTop: "24px",
      padding: "24px",
      border: "1px solid #cbd5e1",
      borderRadius: "16px",
      background: "#ffffff",
    }}
  >
    <h2 style={{ marginTop: 0 }}>Passport extraction</h2>
    <PassportExtractionForm draftId={draft.id} />
  </section>
)}
      {["uploaded", "awaiting_review", "extraction_failed"].includes(
        draft.status,
      ) ? (
        <section
          style={{
            marginTop: "24px",
            padding: "24px",
            border: "1px solid #cbd5e1",
            borderRadius: "16px",
            background: "#ffffff",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Owner field review</h2>
          <PassportReviewForm draftId={draft.id} />
        </section>
      ) : (
        <p>This draft is {draft.status}. Confirmation is unavailable.</p>
      )}
    </main>
  );
}