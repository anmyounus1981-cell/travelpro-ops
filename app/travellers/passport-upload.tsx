"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerPassportDraft } from "./passport-upload-actions";
import {
  ClientSelector,
  type SelectableClient,
} from "./client-selector";

type Client = SelectableClient;

export function PassportUpload({ clients }: { clients: Client[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [clientId, setClientId] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked) {
  return;
}
    setMessage("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const clientId = String(data.get("client_id") ?? "");
    const file = data.get("passport");

    if (!clientId || !(file instanceof File) || file.size === 0) {
      setMessage("Select a client and passport image.");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setMessage("Upload a JPG, PNG, or WebP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage("Passport image must be 5 MB or smaller.");
      return;
    }

    setBusy(true);

    try {
      const db = createClient();

      const { data: auth, error: authError } = await db.auth.getUser();

      if (authError || !auth.user) {
        throw new Error("Sign in as owner before uploading.");
      }

      const { data: owner, error: ownerError } = await db
        .from("app_users")
        .select("id")
        .eq("auth_user_id", auth.user.id)
        .eq("role", "owner")
        .single();

      if (ownerError || !owner) {
        throw new Error("Owner access required.");
      }

      const extension =
        file.type === "image/jpeg"
          ? "jpg"
          : file.type === "image/png"
            ? "png"
            : "webp";

      const imagePath = `drafts/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await db.storage
        .from("passports")
        .upload(imagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

const registration = await registerPassportDraft(
  clientId,
  imagePath,
).catch(() => {
  setBlocked(true);
  throw new Error(
    "Draft registration outcome is unknown. Refresh the draft queue before uploading again.",
  );
});

if (!registration.success) {
  if (registration.outcomeUnknown) {
  setBlocked(true);
}
  if (!registration.outcomeUnknown) {
    const { error: cleanupError } = await db.storage
      .from("passports")
      .remove([imagePath]);

    if (cleanupError) {
      console.error("Unable to remove unused passport upload.");
    }
  }

  throw new Error(registration.error);
}

form.reset();
setClientId("");
setMessage(
  registration.error ||
    "Passport draft uploaded. Owner review is still required.",
);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Upload failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
            <ClientSelector
        clients={clients}
        value={clientId}
        onChange={setClientId}
        disabled={busy || blocked}
      />

      <label>
        Passport image
        <input
          name="passport"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
        />
      </label>

      <button type="submit" disabled={busy || blocked || !clientId}>
        {busy ? "Uploading..." : "Upload for owner review"}
      </button>

      {message && <p role="status">{message}</p>}
    </form>
  );
}