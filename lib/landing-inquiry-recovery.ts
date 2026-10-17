// Client-safe module: no database clients, secrets or browser access at import time.

export const RECOVERY_STORAGE_KEY =
  "travelpro:landing-inquiry-recovery:v1";

export const RECOVERY_STORAGE_KEYS: readonly string[] = [
  RECOVERY_STORAGE_KEY,
];

export const RECOVERY_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const RECOVERY_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
export const RECOVERY_MAX_BYTES = 64 * 1024;

export type InquiryRecoverySnapshot = {
  clientType: "individual" | "corporate";
  serviceType:
    | "flight_booking"
    | "visa_support"
    | "package"
    | "consultation";
  corporateClient: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  passengerCount: string;
  cabinClass: string;
  notes: string;
  website: string;
};

type RecoveryIdentity = {
  schemaVersion: 1;
  submissionContractVersion: 1;
  requestId: string;
};

type RecoveryLifetime = {
  createdAt: number;
  expiresAt: number;
};

export type PendingRecoveryRecord =
  RecoveryIdentity &
  RecoveryLifetime & {
    state: "pending";
    snapshot: InquiryRecoverySnapshot;
  };

export type ConflictRecoveryRecord =
  RecoveryIdentity &
  RecoveryLifetime & {
    state: "conflict";
  };

export type AcceptedRecoveryRecord =
  RecoveryIdentity & {
    state: "accepted";
    receiptId: string;
  };

export type RecoveryBlockReason =
  | "expired"
  | "invalid_record"
  | "incompatible_version"
  | "multiple_records";

export type BlockedRecoveryRecord = {
  schemaVersion: 1;
  state: "blocked";
  reason: RecoveryBlockReason;
  requestId?: string;
};

export type InquiryRecoveryRecord =
  | PendingRecoveryRecord
  | ConflictRecoveryRecord
  | AcceptedRecoveryRecord
  | BlockedRecoveryRecord;

export type RecoveryParseResult =
  | { kind: "empty" }
  | { kind: "valid"; record: InquiryRecoveryRecord }
  | {
      kind: "blocked";
      reason: RecoveryBlockReason;
      requestId?: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SNAPSHOT_LIMITS = {
  clientType: 20,
  serviceType: 30,
  corporateClient: 200,
  contactName: 200,
  contactEmail: 254,
  contactPhone: 16,
  origin: 3,
  destination: 3,
  departureDate: 10,
  returnDate: 10,
  passengerCount: 3,
  cabinClass: 30,
  notes: 4000,
  website: 200,
} as const;

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);

  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}
function isSnapshot(
  value: unknown,
): value is InquiryRecoverySnapshot {
  if (
    !isObject(value) ||
    !hasExactKeys(value, Object.keys(SNAPSHOT_LIMITS))
  ) {
    return false;
  }

  for (const [key, limit] of Object.entries(SNAPSHOT_LIMITS)) {
    const field = value[key];

    if (typeof field !== "string" || field.length > limit) {
      return false;
    }
  }

  return (
    ["individual", "corporate"].includes(value.clientType as string) &&
    [
      "flight_booking",
      "visa_support",
      "package",
      "consultation",
    ].includes(value.serviceType as string)
  );
}

function hasValidLifetime(
  value: Record<string, unknown>,
  now: number,
): boolean {
  if (
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.expiresAt)
  ) {
    return false;
  }

  return (
    Number.isSafeInteger(value.createdAt + RECOVERY_LIFETIME_MS) &&
    value.expiresAt === value.createdAt + RECOVERY_LIFETIME_MS &&
    value.createdAt <= now + RECOVERY_FUTURE_TOLERANCE_MS
  );
}

function blockedResult(
  reason: RecoveryBlockReason,
  value?: Record<string, unknown>,
): RecoveryParseResult {
  return {
    kind: "blocked",
    reason,
    ...(value && isUuid(value.requestId)
      ? { requestId: value.requestId }
      : {}),
  };
}

export function parseRecoveryRecord(
  raw: string | null,
  now: number,
): RecoveryParseResult {
  if (!isTimestamp(now)) {
    return blockedResult("invalid_record");
  }

  if (raw === null) {
    return { kind: "empty" };
  }

  // Check string length first to avoid encoding an arbitrarily large value.
  if (
    raw.length > RECOVERY_MAX_BYTES ||
    new TextEncoder().encode(raw).byteLength > RECOVERY_MAX_BYTES
  ) {
    return blockedResult("invalid_record");
  }

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return blockedResult("invalid_record");
  }

  if (!isObject(value)) {
    return blockedResult("invalid_record");
  }

  if (value.schemaVersion !== 1) {
    return blockedResult("incompatible_version", value);
  }

  if (value.state === "blocked") {
    if (
      !hasExactKeys(
        value,
        ["schemaVersion", "state", "reason"],
        ["requestId"],
      ) ||
      ![
        "expired",
        "invalid_record",
        "incompatible_version",
        "multiple_records",
      ].includes(value.reason as string) ||
      (Object.hasOwn(value, "requestId") && !isUuid(value.requestId))
    ) {
      return blockedResult("invalid_record", value);
    }

    return {
      kind: "valid",
      record: value as BlockedRecoveryRecord,
    };
  }

  if (value.submissionContractVersion !== 1) {
    return blockedResult("incompatible_version", value);
  }

  if (!isUuid(value.requestId)) {
    return blockedResult("invalid_record");
  }

  const identityKeys = [
    "schemaVersion",
    "submissionContractVersion",
    "requestId",
    "state",
  ];

  if (value.state === "accepted") {
    if (
      !hasExactKeys(value, [...identityKeys, "receiptId"]) ||
      !isUuid(value.receiptId)
    ) {
      return blockedResult("invalid_record", value);
    }

    return {
      kind: "valid",
      record: value as AcceptedRecoveryRecord,
    };
  }

  if (value.state === "pending" || value.state === "conflict") {
    const required = [
      ...identityKeys,
      "createdAt",
      "expiresAt",
      ...(value.state === "pending" ? ["snapshot"] : []),
    ];

    if (
      !hasExactKeys(value, required) ||
      !hasValidLifetime(value, now) ||
      (value.state === "pending" && !isSnapshot(value.snapshot))
    ) {
      return blockedResult("invalid_record", value);
    }

    if (value.state === "pending" && now >= (value.expiresAt as number)) {
      return blockedResult("expired", value);
    }

    return {
      kind: "valid",
      record: value as PendingRecoveryRecord | ConflictRecoveryRecord,
    };
  }

  return blockedResult("invalid_record", value);
}
export type RecoveryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type RecoveryStorageProvider = () => RecoveryStorage;

export type RecoveryReadResult =
  | { kind: "empty" }
  | {
      kind: "valid";
      key: string;
      record: InquiryRecoveryRecord;
    }
  | {
      kind: "blocked";
      reason: RecoveryBlockReason;
      requestId?: string;
    }
  | { kind: "unavailable" };

export function createPendingRecoveryRecord(
  requestId: string,
  snapshot: InquiryRecoverySnapshot,
  now: number,
): PendingRecoveryRecord | null {
  if (
    !isUuid(requestId) ||
    !isSnapshot(snapshot) ||
    !isTimestamp(now) ||
    !Number.isSafeInteger(now + RECOVERY_LIFETIME_MS)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    submissionContractVersion: 1,
    state: "pending",
    requestId,
    createdAt: now,
    expiresAt: now + RECOVERY_LIFETIME_MS,
    snapshot: { ...snapshot },
  };
}

export function readRecoveryStorage(
  getStorage: RecoveryStorageProvider,
  now: number,
): RecoveryReadResult {
  try {
    const storage = getStorage();
    const found: Array<{ key: string; raw: string }> = [];

    for (const key of RECOVERY_STORAGE_KEYS) {
      const raw = storage.getItem(key);

      if (raw !== null) {
        found.push({ key, raw });
      }
    }

    if (found.length > 1) {
      return {
        kind: "blocked",
        reason: "multiple_records",
      };
    }

    if (found.length === 0) {
      const result = parseRecoveryRecord(null, now);
      return result.kind === "empty"
        ? result
        : { kind: "blocked", reason: "invalid_record" };
    }

    const saved = found[0];
    const result = parseRecoveryRecord(saved.raw, now);

    if (result.kind === "valid") {
      return {
        kind: "valid",
        key: saved.key,
        record: result.record,
      };
    }

    if (result.kind === "blocked") {
      return result;
    }

    return { kind: "blocked", reason: "invalid_record" };
  } catch {
    return { kind: "unavailable" };
  }
}
export type RecoveryOperationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "invalid_record"
        | "existing_record"
        | "record_changed"
        | "verification_failed"
        | "unavailable";
    };

function canonicalRecord(record: InquiryRecoveryRecord): string {
  return JSON.stringify(record, (_key, value: unknown) => {
    if (!isObject(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, value[key]]),
    );
  });
}

function serializeValidRecord(
  record: InquiryRecoveryRecord,
  now: number,
): string | null {
  try {
    const raw = canonicalRecord(record);
    const result = parseRecoveryRecord(raw, now);

    return result.kind === "valid" ? raw : null;
  } catch {
    return null;
  }
}

export function persistNewPendingRecovery(
  getStorage: RecoveryStorageProvider,
  record: PendingRecoveryRecord,
  now: number,
): RecoveryOperationResult {
  const raw = serializeValidRecord(record, now);

  if (raw === null || record.state !== "pending") {
    return { ok: false, reason: "invalid_record" };
  }

  try {
    const storage = getStorage();

    for (const key of RECOVERY_STORAGE_KEYS) {
      if (storage.getItem(key) !== null) {
        return { ok: false, reason: "existing_record" };
      }
    }

    storage.setItem(RECOVERY_STORAGE_KEY, raw);

    if (storage.getItem(RECOVERY_STORAGE_KEY) !== raw) {
      return { ok: false, reason: "verification_failed" };
    }

    for (const key of RECOVERY_STORAGE_KEYS) {
      if (
        key !== RECOVERY_STORAGE_KEY &&
        storage.getItem(key) !== null
      ) {
        return { ok: false, reason: "record_changed" };
      }
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function verifyPendingRecovery(
  getStorage: RecoveryStorageProvider,
  expected: PendingRecoveryRecord,
  now: number,
): RecoveryOperationResult {
  const expectedRaw = serializeValidRecord(expected, now);

  if (expectedRaw === null || expected.state !== "pending") {
    return { ok: false, reason: "invalid_record" };
  }

  const saved = readRecoveryStorage(getStorage, now);

  if (saved.kind === "unavailable") {
    return { ok: false, reason: "unavailable" };
  }

  if (
    saved.kind !== "valid" ||
    saved.record.state !== "pending" ||
    canonicalRecord(saved.record) !== expectedRaw
  ) {
    return { ok: false, reason: "record_changed" };
  }

  return { ok: true };
}
function serializeRecordForComparison(
  record: InquiryRecoveryRecord,
): string | null {
  // Expiry blocks replay, but must not prevent cleanup of the exact record.
  const validationTime =
    record.state === "pending" || record.state === "conflict"
      ? record.createdAt
      : 0;

  return serializeValidRecord(record, validationTime);
}

function findMatchingStoredRecord(
  storage: RecoveryStorage,
  expectedRaw: string,
): { kind: "empty" | "changed" } | { kind: "match"; key: string } {
  const found: Array<{ key: string; raw: string }> = [];

  for (const key of RECOVERY_STORAGE_KEYS) {
    const raw = storage.getItem(key);
    if (raw !== null) found.push({ key, raw });
  }

  if (found.length === 0) {
    return { kind: "empty" };
  }

  if (found.length !== 1) {
    return { kind: "changed" };
  }
  if (
    found[0].raw.length > RECOVERY_MAX_BYTES ||
    new TextEncoder().encode(found[0].raw).byteLength >
      RECOVERY_MAX_BYTES
  ) {
    return { kind: "changed" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(found[0].raw);
  } catch {
    return { kind: "changed" };
  }

  if (!isObject(parsed)) {
    return { kind: "changed" };
  }

  // Bound and validate stored data before canonical comparison.
  const validationTime =
    parsed.state === "pending" || parsed.state === "conflict"
      ? parsed.createdAt
      : 0;

  if (!isTimestamp(validationTime)) {
    return { kind: "changed" };
  }

  const result = parseRecoveryRecord(found[0].raw, validationTime);

  if (
    result.kind !== "valid" ||
    canonicalRecord(result.record) !== expectedRaw
  ) {
    return { kind: "changed" };
  }

  return { kind: "match", key: found[0].key };
}

export function clearMatchingRecovery(
  getStorage: RecoveryStorageProvider,
  expected: InquiryRecoveryRecord,
): RecoveryOperationResult {
  const expectedRaw = serializeRecordForComparison(expected);

  if (expectedRaw === null) {
    return { ok: false, reason: "invalid_record" };
  }

  try {
    const storage = getStorage();
    const found = findMatchingStoredRecord(storage, expectedRaw);

    if (found.kind === "changed") {
      return { ok: false, reason: "record_changed" };
    }

    if (found.kind === "match") {
      storage.removeItem(found.key);
    }

    for (const key of RECOVERY_STORAGE_KEYS) {
      if (storage.getItem(key) !== null) {
        return { ok: false, reason: "verification_failed" };
      }
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
export type RecoveryOutcome =
  | { outcome: "accepted"; receiptId: string }
  | { outcome: "conflict" }
  | { outcome: "expired" };

export function persistPendingOutcome(
  getStorage: RecoveryStorageProvider,
  expected: PendingRecoveryRecord,
  outcome: RecoveryOutcome,
  now: number,
): RecoveryOperationResult {
  const expectedRaw = serializeRecordForComparison(expected);

  if (
    expectedRaw === null ||
    expected.state !== "pending" ||
    !isTimestamp(now)
  ) {
    return { ok: false, reason: "invalid_record" };
  }

  let marker: InquiryRecoveryRecord;

  if (outcome.outcome === "accepted") {
    if (!isUuid(outcome.receiptId)) {
      return { ok: false, reason: "invalid_record" };
    }

    marker = {
      schemaVersion: 1,
      submissionContractVersion: 1,
      state: "accepted",
      requestId: expected.requestId,
      receiptId: outcome.receiptId,
    };
  } else if (outcome.outcome === "conflict") {
    marker = {
      schemaVersion: 1,
      submissionContractVersion: 1,
      state: "conflict",
      requestId: expected.requestId,
      createdAt: expected.createdAt,
      expiresAt: expected.expiresAt,
    };
  } else if (outcome.outcome === "expired") {
    if (now < expected.expiresAt) {
      return { ok: false, reason: "invalid_record" };
    }

    marker = {
      schemaVersion: 1,
      state: "blocked",
      reason: "expired",
      requestId: expected.requestId,
    };
  } else {
    return { ok: false, reason: "invalid_record" };
  }

  const markerRaw = serializeValidRecord(marker, now);

  if (markerRaw === null) {
    return { ok: false, reason: "invalid_record" };
  }

  try {
    const storage = getStorage();
    const found = findMatchingStoredRecord(storage, expectedRaw);

    if (found.kind !== "match") {
      return { ok: false, reason: "record_changed" };
    }

    storage.setItem(found.key, markerRaw);

    if (storage.getItem(found.key) !== markerRaw) {
      return { ok: false, reason: "verification_failed" };
    }

    for (const key of RECOVERY_STORAGE_KEYS) {
      if (key !== found.key && storage.getItem(key) !== null) {
        return { ok: false, reason: "record_changed" };
      }
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}