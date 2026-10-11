"use client";

import { useState } from "react";
import {
  ClientSelector,
  type SelectableClient,
} from "./travellers/client-selector";

export function CaseClientSelector({ clients }: { clients: SelectableClient[] }) {
  const [clientId, setClientId] = useState("");
  const [clientType, setClientType] =
    useState<SelectableClient["client_type"]>("corporate");

  return (
    <div className="wide">
      <input type="hidden" name="client_type" value={clientType} />
      <ClientSelector
        clients={clients}
        value={clientId}
        onChange={(id, type) => {
          setClientId(id);
          setClientType(type);
        }}
      />
    </div>
  );
}
