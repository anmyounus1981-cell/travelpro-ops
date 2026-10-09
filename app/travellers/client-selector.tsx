"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { quickCreateClient } from "./client-selection-actions";

export type SelectableClient = {
  id: string;
  client_type: "corporate" | "individual";
  company_name: string | null;
  contact_name: string;
};

type ClientSelectorProps = {
  clients: SelectableClient[];
  value: string;
  onChange: (
  clientId: string,
  clientType: SelectableClient["client_type"],
) => void;
  disabled?: boolean;
};

const inputStyle = {
  display: "block",
  boxSizing: "border-box" as const,
  width: "100%",
  marginTop: "6px",
  padding: "12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
};

export function ClientSelector({
  clients,
  value,
  onChange,
  disabled = false,
}: ClientSelectorProps) {
  const selectId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);

  const [mounted, setMounted] = useState(false);
  const [clientType, setClientType] =
    useState<SelectableClient["client_type"]>("corporate");
  const [addedClients, setAddedClients] =
    useState<SelectableClient[]>([]);
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && mounted && dialogRef.current) {
      if (!dialogRef.current.open) {
        dialogRef.current.showModal();
      }
    }
  }, [open, mounted]);

  const options = useMemo(() => {
    const byId = new Map<string, SelectableClient>();

    for (const client of [...clients, ...addedClients]) {
      byId.set(client.id, client);
    }

    const uniqueCompanies = new Set<string>();

    return [...byId.values()]
      .filter((client) => {
        if (client.client_type !== clientType) {
          return false;
        }

        // Personal accounts with the same name remain separate.
        if (clientType === "individual") {
          return true;
        }

        const name = client.company_name
          ?.trim()
          .replace(/\s+/g, " ")
          .normalize("NFKC")
          .toLowerCase();

        const key = name || client.id;

        if (uniqueCompanies.has(key)) {
          return false;
        }

        uniqueCompanies.add(key);
        return true;
      })
      .sort((a, b) => {
        const aName =
          clientType === "corporate"
            ? a.company_name ?? ""
            : a.contact_name;
        const bName =
          clientType === "corporate"
            ? b.company_name ?? ""
            : b.contact_name;

        return aName.localeCompare(bName, "en", {
          sensitivity: "base",
        });
      });
  }, [clients, addedClients, clientType]);

  function openCreation() {
    if (disabled || busy || blocked) {
      return;
    }

    setError("");
    setMessage("");
    setRequestId(crypto.randomUUID());
    setOpen(true);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (submittingRef.current || disabled || blocked) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    submittingRef.current = true;
    setBusy(true);
    setError("");

    try {
      const result = await quickCreateClient(formData);

      if (!result.success || !result.client) {
        setError(result.error || "Unable to create the client.");

        if (result.outcomeUnknown) {
          setBlocked(true);
        }

        return;
      }

      const createdClient = result.client;

      setAddedClients((previous) => [
        ...previous.filter((client) => client.id !== createdClient.id),
        createdClient,
      ]);

      onChange(createdClient.id, createdClient.client_type);
      setMessage(result.error || "Client created and selected.");
      dialogRef.current?.close();
      setOpen(false);
    } catch {
      setBlocked(true);
      setError(
        "Client creation outcome is unknown. Refresh and check the client list before creating another account.",
      );
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }
    return (
    <div>
      <fieldset
        disabled={disabled || busy || blocked}
        style={{ border: 0, padding: 0, margin: "0 0 12px" }}
      >
        <legend style={{ marginBottom: "8px", fontWeight: 700 }}>
          Client type
        </legend>

        <label style={{ marginRight: "16px" }}>
          <input
            type="radio"
            name={`client_type_${selectId}`}
            checked={clientType === "corporate"}
            onChange={() => {
              setClientType("corporate");
              onChange("", "corporate");
              setMessage("");
            }}
          />{" "}
          Corporate
        </label>

        <label>
          <input
            type="radio"
            name={`client_type_${selectId}`}
            checked={clientType === "individual"}
            onChange={() => {
              setClientType("individual");
              onChange("", "individual");
              setMessage("");
            }}
          />{" "}
          Individual / Retail
        </label>
      </fieldset>

      <label htmlFor={selectId}>
        {clientType === "corporate"
          ? "Corporate client"
          : "Individual client"}
      </label>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <select
          id={selectId}
          name="client_id"
          required
          value={value}
          disabled={disabled || busy || blocked}
          onChange={(event) =>
            onChange(event.target.value, clientType)
        }
          style={{ ...inputStyle, flex: "1 1 220px" }}
        >
          <option value="">Select client</option>

          {options.map((client) => (
            <option key={client.id} value={client.id}>
              {clientType === "corporate"
                ? client.company_name || "Unnamed company"
                : `${client.contact_name} (${client.id.slice(0, 8)})`}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={disabled || busy || blocked}
          onClick={openCreation}
          style={{ padding: "12px", marginTop: "6px" }}
        >
          {clientType === "corporate"
            ? "+ Add New Corporate Client"
            : "+ Add Individual Client"}
        </button>
      </div>

      {options.length === 0 && (
        <p role="status">
          No {clientType === "corporate" ? "corporate" : "individual"}{" "}
          clients available. Add a client to continue.
        </p>
      )}

      {message && <p role="status">{message}</p>}

      {blocked && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          Refresh the page and check the client list before continuing.
        </p>
      )}

      {mounted &&
        open &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            onCancel={(event) => {
              if (submittingRef.current) {
                event.preventDefault();
              }
            }}
            onClose={() => setOpen(false)}
            style={{
              width: "min(480px, calc(100vw - 48px))",
              maxHeight: "85vh",
              overflowY: "auto",
              boxSizing: "border-box",
              padding: "24px",
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
            }}
          >
            <h2 id={titleId} style={{ marginTop: 0 }}>
              {clientType === "corporate"
                ? "Add Corporate Client"
                : "Add Individual Client"}
            </h2>

            <form onSubmit={handleCreate}>
              <input
                type="hidden"
                name="creation_request_id"
                value={requestId}
              />
              <input
                type="hidden"
                name="client_type"
                value={clientType}
              />

              <fieldset
                disabled={busy || blocked || disabled}
                style={{
                  display: "grid",
                  gap: "16px",
                  border: 0,
                  padding: 0,
                  margin: 0,
                  minWidth: 0,
                }}
              >
                {clientType === "corporate" && (
                  <label>
                    Company name
                    <input
                      name="company_name"
                      required
                      maxLength={200}
                      autoFocus
                      style={inputStyle}
                    />
                  </label>
                )}

                <label>
                  {clientType === "corporate"
                    ? "Contact person"
                    : "Client full name"}
                  <input
                    name="contact_name"
                    required
                    maxLength={200}
                    autoFocus={clientType === "individual"}
                    style={inputStyle}
                  />
                </label>

                <label>
                  Email (optional)
                  <input
                    name="contact_email"
                    type="email"
                    maxLength={254}
                    style={inputStyle}
                  />
                </label>

                <label>
                  Phone (optional)
                  <input
                    name="contact_phone"
                    type="tel"
                    maxLength={50}
                    style={inputStyle}
                  />
                </label>

                <button type="submit" style={{ padding: "12px" }}>
                  {busy ? "Creating..." : "Create and select client"}
                </button>
              </fieldset>

              {error && (
                <p role="alert" style={{ color: "#b91c1c" }}>
                  {error}
                </p>
              )}
            </form>

            <button
              type="button"
              disabled={busy}
              onClick={() => dialogRef.current?.close()}
              style={{ marginTop: "12px", padding: "10px" }}
            >
              Close
            </button>
          </dialog>,
          document.body,
        )}
    </div>
  );
}