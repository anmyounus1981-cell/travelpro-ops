import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/landing-inquiry-recovery.ts", import.meta.url),
  "utf8",
);

const compiled = ts.transpileModule(source, {
  fileName: "lib/landing-inquiry-recovery.ts",
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
  reportDiagnostics: true,
});

assert.equal(
  (compiled.diagnostics ?? []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
  "Recovery module transpilation failed.",
);

const moduleExports = {};

const context = vm.createContext({
  exports: moduleExports,
  module: { exports: moduleExports },
  TextEncoder,
  require: (name) => {
    throw new Error(`Unexpected module dependency: ${name}`);
  },
  fetch: () => {
    throw new Error("Network access is forbidden.");
  },
});

new vm.Script(compiled.outputText, {
  filename: "landing-recovery-storage.test.cjs",
}).runInContext(context, { timeout: 5000 });

const {
  parseRecoveryRecord,
  createPendingRecoveryRecord,
  readRecoveryStorage,
  persistNewPendingRecovery,
  verifyPendingRecovery,
  clearMatchingRecovery,
  persistPendingOutcome,
    quarantineInvalidRecovery,
  RECOVERY_STORAGE_KEY,
  RECOVERY_STORAGE_KEYS,
  RECOVERY_LIFETIME_MS,
  RECOVERY_FUTURE_TOLERANCE_MS,
  RECOVERY_MAX_BYTES,
} = moduleExports;

assert.equal(typeof parseRecoveryRecord, "function");

const NOW = Date.UTC(2026, 9, 17, 10, 0, 0);
const REQUEST_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const RECEIPT_ID = "11111111-2222-4333-8444-555555555555";

function snapshot(overrides = {}) {
  return {
    clientType: "individual",
    serviceType: "consultation",
    corporateClient: "",
    contactName: "  SYNTHETIC RECOVERY TEST  ",
    contactEmail: "Recovery@Example.Invalid",
    contactPhone: "",
    origin: "DAC",
    destination: "",
    departureDate: "",
    returnDate: "",
    passengerCount: "",
    cabinClass: "",
    notes: "  বাংলা notes\nKeep exact whitespace.  ",
    website: "",
    ...overrides,
  };
}

function pending(overrides = {}) {
  return {
    schemaVersion: 1,
    submissionContractVersion: 1,
    state: "pending",
    requestId: REQUEST_ID,
    createdAt: NOW - 1000,
    expiresAt: NOW - 1000 + RECOVERY_LIFETIME_MS,
    snapshot: snapshot(),
    ...overrides,
  };
}

function parse(record, now = NOW) {
  return parseRecoveryRecord(JSON.stringify(record), now);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectBlocked(record, reason = "invalid_record", now = NOW) {
  const result = parse(record, now);
  assert.equal(result.kind, "blocked");
  assert.equal(result.reason, reason);
  assert.equal(Object.hasOwn(result, "snapshot"), false);
  return result;
}
function fakeStorage(initial = {}, options = {}) {
  const values = new Map(Object.entries(initial));
  const operations = [];

  const storage = {
    getItem(key) {
      operations.push(["get", key]);
      if (options.readThrows) throw new Error("Synthetic read failure.");
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      operations.push(["set", key]);
      if (options.writeThrows) throw new Error("Synthetic write failure.");
      values.set(key, value);
    },
    removeItem(key) {
      operations.push(["remove", key]);
      if (options.removeThrows) throw new Error("Synthetic removal failure.");
      values.delete(key);
    },
  };

  return { storage, values, operations };
}
function test(label, run) {
  run();
  console.log(`PASS: ${label}`);
}
test("selected constants and recognized storage key", () => {
  assert.equal(RECOVERY_LIFETIME_MS, 86_400_000);
  assert.equal(RECOVERY_FUTURE_TOLERANCE_MS, 300_000);
  assert.equal(RECOVERY_MAX_BYTES, 65_536);
  assert.equal(
    RECOVERY_STORAGE_KEY,
    "travelpro:landing-inquiry-recovery:v1",
  );
  assert.deepEqual(plain(RECOVERY_STORAGE_KEYS), [RECOVERY_STORAGE_KEY]);
});

test("null storage is empty; malformed storage is blocked", () => {
  assert.equal(parseRecoveryRecord(null, NOW).kind, "empty");

  for (const raw of ["", "{", "null", "[]", "123", '"text"']) {
    const result = parseRecoveryRecord(raw, NOW);
    assert.equal(result.kind, "blocked");
    assert.equal(result.reason, "invalid_record");
  }
});

test("valid pending record preserves exact submitted strings", () => {
  const original = pending();
  const result = parse(original);

  assert.equal(result.kind, "valid");
  assert.deepEqual(plain(result.record), original);
  assert.equal(result.record.snapshot.contactEmail, "Recovery@Example.Invalid");
  assert.equal(result.record.snapshot.contactName, "  SYNTHETIC RECOVERY TEST  ");
  assert.equal(
    result.record.snapshot.notes,
    "  বাংলা notes\nKeep exact whitespace.  ",
  );
});

test("all supported client and service enums restore", () => {
  for (const clientType of ["individual", "corporate"]) {
    for (const serviceType of [
      "flight_booking",
      "visa_support",
      "package",
      "consultation",
    ]) {
      const result = parse(
        pending({ snapshot: snapshot({ clientType, serviceType }) }),
      );
      assert.equal(result.kind, "valid");
    }
  }
});

test("expiry blocks at the exact deadline without a grace period", () => {
  const record = pending();
  assert.equal(parse(record, record.expiresAt - 1).kind, "valid");
  expectBlocked(record, "expired", record.expiresAt);
  expectBlocked(record, "expired", record.expiresAt + 1);
});

test("parsing and retry inspection never extend expiry", () => {
  const record = pending();
  const first = parse(record);
  const later = parse(record, NOW + 60_000);

  assert.equal(first.kind, "valid");
  assert.equal(later.kind, "valid");
  assert.equal(first.record.expiresAt, record.expiresAt);
  assert.equal(later.record.expiresAt, record.expiresAt);
});

test("future-clock tolerance accepts boundary and rejects excess", () => {
  const createdAt = NOW + RECOVERY_FUTURE_TOLERANCE_MS;
  const record = pending({
    createdAt,
    expiresAt: createdAt + RECOVERY_LIFETIME_MS,
  });

  assert.equal(parse(record).kind, "valid");

  expectBlocked(
    pending({
      createdAt: createdAt + 1,
      expiresAt: createdAt + 1 + RECOVERY_LIFETIME_MS,
    }),
  );
});

test("invalid timestamps and altered lifetime are blocked", () => {
  for (const value of [-1, 1.5, "123", null, Number.MAX_SAFE_INTEGER]) {
    expectBlocked(pending({ createdAt: value }));
    expectBlocked(pending({ expiresAt: value }));
  }

  expectBlocked(pending({ expiresAt: pending().expiresAt + 1 }));

  for (const now of [-1, 1.5, NaN, Infinity, "123"]) {
    assert.equal(parseRecoveryRecord(null, now).kind, "blocked");
  }
});

test("invalid UUID and unsupported versions are blocked", () => {
  expectBlocked(pending({ requestId: "bad-id" }));
  expectBlocked(pending({ schemaVersion: 2 }), "incompatible_version");
  expectBlocked(
    pending({ submissionContractVersion: 2 }),
    "incompatible_version",
  );
});

test("missing and unexpected record properties are blocked", () => {
  const missing = pending();
  delete missing.requestId;
  expectBlocked(missing);
  expectBlocked(pending({ unexpected: "not allowed" }));

  const polluted = JSON.parse(JSON.stringify(pending()));
  Object.defineProperty(polluted, "__proto__", {
    value: { injected: true },
    enumerable: true,
  });
  expectBlocked(polluted);
});

test("snapshot requires exact keys and bounded string values", () => {
  for (const invalid of [null, [], "text", 123]) {
    expectBlocked(pending({ snapshot: invalid }));
  }

  const missing = snapshot();
  delete missing.notes;
  expectBlocked(pending({ snapshot: missing }));
  expectBlocked(
    pending({ snapshot: { ...snapshot(), protectedField: "unexpected" } }),
  );

  for (const invalid of [null, 2, {}, []]) {
    expectBlocked(pending({ snapshot: snapshot({ notes: invalid }) }));
  }

  expectBlocked(pending({ snapshot: snapshot({ contactName: "X".repeat(201) }) }));
  expectBlocked(pending({ snapshot: snapshot({ notes: "X".repeat(4001) }) }));
  expectBlocked(pending({ snapshot: snapshot({ origin: "DACX" }) }));
  expectBlocked(pending({ snapshot: snapshot({ clientType: "owner" }) }));
  expectBlocked(pending({ snapshot: snapshot({ serviceType: "ticket_issuance" }) }));

  assert.equal(
    parse(pending({ snapshot: snapshot({ notes: "X".repeat(4000) }) })).kind,
    "valid",
  );
});
test("accepted marker contains only identity and receipt", () => {
  const record = {
    schemaVersion: 1,
    submissionContractVersion: 1,
    state: "accepted",
    requestId: REQUEST_ID,
    receiptId: RECEIPT_ID,
  };

  const result = parse(record);
  assert.equal(result.kind, "valid");
  assert.deepEqual(plain(result.record), record);

  expectBlocked({ ...record, receiptId: "bad-id" });
  expectBlocked({ ...record, snapshot: snapshot() });
});

test("conflict marker has no snapshot and does not silently expire", () => {
  const record = pending({ state: "conflict" });
  delete record.snapshot;

  assert.equal(parse(record).kind, "valid");
  assert.equal(
    parse(record, record.expiresAt + RECOVERY_LIFETIME_MS).kind,
    "valid",
  );
  expectBlocked({ ...record, snapshot: snapshot() });
});

test("blocked markers allow only supported reasons and optional UUID", () => {
  for (const reason of [
    "expired",
    "invalid_record",
    "incompatible_version",
    "multiple_records",
  ]) {
    const record = { schemaVersion: 1, state: "blocked", reason };
    assert.equal(parse(record).kind, "valid");
    assert.equal(parse({ ...record, requestId: REQUEST_ID }).kind, "valid");

    expectBlocked({ ...record, requestId: "bad-id" });
    expectBlocked({ ...record, snapshot: snapshot() });
    expectBlocked({ ...record, contactEmail: "private@example.invalid" });
  }

  expectBlocked({
    schemaVersion: 1,
    state: "blocked",
    reason: "unsupported_reason",
  });
});

test("blocked parse result retains only a valid correlation ID", () => {
  const record = pending({
    snapshot: snapshot({ notes: "X".repeat(4001) }),
  });
  const result = expectBlocked(record);

  assert.deepEqual(plain(result), {
    kind: "blocked",
    reason: "invalid_record",
    requestId: REQUEST_ID,
  });

  const invalidId = expectBlocked(pending({ requestId: "bad-id" }));
  assert.equal(Object.hasOwn(invalidId, "requestId"), false);
});

test("unknown record states cannot restore as valid", () => {
  expectBlocked(pending({ state: "sending" }));
});

test("record size is bounded by characters and UTF-8 bytes", () => {
  const oversizedCharacters = "X".repeat(RECOVERY_MAX_BYTES + 1);
  assert.equal(
    parseRecoveryRecord(oversizedCharacters, NOW).kind,
    "blocked",
  );

  const oversizedUtf8 = JSON.stringify("বাংলা".repeat(5000));
  assert.ok(oversizedUtf8.length < RECOVERY_MAX_BYTES);
  assert.ok(
    new TextEncoder().encode(oversizedUtf8).byteLength > RECOVERY_MAX_BYTES,
  );

  const result = parseRecoveryRecord(oversizedUtf8, NOW);
  assert.equal(result.kind, "blocked");
  assert.equal(result.reason, "invalid_record");
});
test("pending constructor copies the snapshot without changing values", () => {
  const original = snapshot();
  const record = createPendingRecoveryRecord(REQUEST_ID, original, NOW);

  assert.ok(record);
  assert.equal(record.createdAt, NOW);
  assert.equal(record.expiresAt, NOW + RECOVERY_LIFETIME_MS);
  assert.deepEqual(plain(record.snapshot), original);

  original.notes = "Changed after construction.";
  assert.equal(
    record.snapshot.notes,
    "  বাংলা notes\nKeep exact whitespace.  ",
  );
});

test("pending constructor rejects invalid identity, shape and time", () => {
  assert.equal(createPendingRecoveryRecord("bad-id", snapshot(), NOW), null);
  assert.equal(createPendingRecoveryRecord(REQUEST_ID, null, NOW), null);
  assert.equal(createPendingRecoveryRecord(REQUEST_ID, snapshot(), -1), null);
  assert.equal(
    createPendingRecoveryRecord(
      REQUEST_ID,
      snapshot(),
      Number.MAX_SAFE_INTEGER,
    ),
    null,
  );
});

test("empty readable storage returns empty without writes", () => {
  const fake = fakeStorage();
  const result = readRecoveryStorage(() => fake.storage, NOW);

  assert.equal(result.kind, "empty");
  assert.ok(fake.operations.every(([operation]) => operation === "get"));
});

test("reader restores exact pending record from the recognized key", () => {
  const record = pending();
  const fake = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(record),
    unrelated: "leave untouched",
  });

  const result = readRecoveryStorage(() => fake.storage, NOW);
  assert.equal(result.kind, "valid");
  assert.equal(result.key, RECOVERY_STORAGE_KEY);
  assert.deepEqual(plain(result.record), record);
  assert.equal(fake.values.get("unrelated"), "leave untouched");
  assert.ok(fake.operations.every(([operation]) => operation === "get"));
});

test("storage provider failure is unavailable rather than empty", () => {
  const result = readRecoveryStorage(() => {
    throw new Error("Synthetic storage access denied.");
  }, NOW);

  assert.equal(result.kind, "unavailable");
});

test("storage read failure is unavailable rather than empty", () => {
  const fake = fakeStorage({}, { readThrows: true });
  const result = readRecoveryStorage(() => fake.storage, NOW);

  assert.equal(result.kind, "unavailable");
  assert.ok(fake.operations.every(([operation]) => operation === "get"));
});

test("reader reports malformed and expired records without rewriting them", () => {
  for (const [raw, now, reason] of [
    ["{", NOW, "invalid_record"],
    [JSON.stringify(pending()), pending().expiresAt, "expired"],
  ]) {
    const fake = fakeStorage({ [RECOVERY_STORAGE_KEY]: raw });
    const result = readRecoveryStorage(() => fake.storage, now);

    assert.equal(result.kind, "blocked");
    assert.equal(result.reason, reason);
    assert.equal(fake.values.get(RECOVERY_STORAGE_KEY), raw);
    assert.ok(fake.operations.every(([operation]) => operation === "get"));
  }
});

test("reader preserves minimal blocked marker", () => {
  const marker = {
    schemaVersion: 1,
    state: "blocked",
    reason: "expired",
    requestId: REQUEST_ID,
  };

  const fake = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(marker),
  });
  const result = readRecoveryStorage(() => fake.storage, NOW);

  assert.equal(result.kind, "valid");
  assert.deepEqual(plain(result.record), marker);
});
test("new pending write is verified and preserves unrelated storage", () => {
  const fake = fakeStorage({ unrelated: "keep me" });
  const record = pending();

  const result = persistNewPendingRecovery(() => fake.storage, record, NOW);
  assert.equal(result.ok, true);
  assert.equal(fake.values.get("unrelated"), "keep me");

  const restored = readRecoveryStorage(() => fake.storage, NOW);
  assert.equal(restored.kind, "valid");
  assert.deepEqual(plain(restored.record), record);

  assert.equal(
    verifyPendingRecovery(() => fake.storage, record, NOW).ok,
    true,
  );
});

test("existing recovery record is never overwritten by a new submission", () => {
  for (const existing of [JSON.stringify(pending()), "{", ""]) {
    const fake = fakeStorage({ [RECOVERY_STORAGE_KEY]: existing });

    const result = persistNewPendingRecovery(
      () => fake.storage,
      pending(),
      NOW,
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "existing_record");
    assert.equal(fake.values.get(RECOVERY_STORAGE_KEY), existing);
    assert.equal(
      fake.operations.some(([operation]) => operation === "set"),
      false,
    );
  }
});

test("expired or malformed new pending record is not written", () => {
  for (const record of [
    pending({ requestId: "bad-id" }),
    pending({ expiresAt: NOW }),
    { ...pending(), unexpected: true },
  ]) {
    const fake = fakeStorage();
    const result = persistNewPendingRecovery(
      () => fake.storage,
      record,
      NOW,
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_record");
    assert.equal(fake.operations.length, 0);
  }
});

test("storage access, read and write failures prevent verified persistence", () => {
  const denied = persistNewPendingRecovery(() => {
    throw new Error("Access denied.");
  }, pending(), NOW);

  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "unavailable");

  for (const options of [
    { readThrows: true },
    { writeThrows: true },
  ]) {
    const fake = fakeStorage({}, options);
    const result = persistNewPendingRecovery(
      () => fake.storage,
      pending(),
      NOW,
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "unavailable");
  }
});

test("silently dropped write fails read-back verification", () => {
  const fake = fakeStorage();
  fake.storage.setItem = () => {};

  const result = persistNewPendingRecovery(
    () => fake.storage,
    pending(),
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "verification_failed");
});

test("read-back failure never reports verified persistence", () => {
  const fake = fakeStorage();
  const originalSet = fake.storage.setItem;

  fake.storage.setItem = (key, value) => {
    originalSet(key, value);
    fake.storage.getItem = () => {
      throw new Error("Read-back failed after write.");
    };
  };

  const result = persistNewPendingRecovery(
    () => fake.storage,
    pending(),
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unavailable");
  assert.equal(fake.values.has(RECOVERY_STORAGE_KEY), true);
});

test("retry verification ignores object key order but preserves string values", () => {
  const record = pending();
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  reordered.snapshot = Object.fromEntries(
    Object.entries(record.snapshot).reverse(),
  );

  const fake = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(reordered),
  });

  assert.equal(
    verifyPendingRecovery(() => fake.storage, record, NOW).ok,
    true,
  );
});

test("missing or changed stored submission blocks retry", () => {
  for (const stored of [
    null,
    pending({ requestId: RECEIPT_ID }),
    pending({ snapshot: snapshot({ notes: "Changed notes." }) }),
  ]) {
    const fake = fakeStorage(
      stored === null
        ? {}
        : { [RECOVERY_STORAGE_KEY]: JSON.stringify(stored) },
    );

    const result = verifyPendingRecovery(
      () => fake.storage,
      pending(),
      NOW,
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "record_changed");
    assert.ok(fake.operations.every(([operation]) => operation === "get"));
  }
});

test("expired expected record and unreadable storage block retry", () => {
  const record = pending();
  const fake = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(record),
  });

  assert.equal(
    verifyPendingRecovery(
      () => fake.storage,
      record,
      record.expiresAt,
    ).reason,
    "invalid_record",
  );

  const denied = fakeStorage({}, { readThrows: true });
  assert.equal(
    verifyPendingRecovery(() => denied.storage, record, NOW).reason,
    "unavailable",
  );
});
test("cleanup removes the exact pending record and preserves unrelated data", () => {
  const record = pending();
  const fake = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(record),
    unrelated: "keep me",
  });

  const result = clearMatchingRecovery(() => fake.storage, record);

  assert.equal(result.ok, true);
  assert.equal(fake.values.has(RECOVERY_STORAGE_KEY), false);
  assert.equal(fake.values.get("unrelated"), "keep me");
  assert.deepEqual(
    fake.operations.filter(([operation]) => operation === "remove"),
    [["remove", RECOVERY_STORAGE_KEY]],
  );
});

test("cleanup verifies already-empty storage without removing anything", () => {
  const fake = fakeStorage({ unrelated: "keep me" });
  const result = clearMatchingRecovery(() => fake.storage, pending());

  assert.equal(result.ok, true);
  assert.equal(
    fake.operations.some(([operation]) => operation === "remove"),
    false,
  );
  assert.equal(fake.values.get("unrelated"), "keep me");
});

test("cleanup refuses changed, malformed and oversized stored records", () => {
  for (const raw of [
    JSON.stringify(pending({ requestId: RECEIPT_ID })),
    JSON.stringify(pending({ snapshot: snapshot({ notes: "Changed." }) })),
    "{",
    "X".repeat(RECOVERY_MAX_BYTES + 1),
    JSON.stringify("বাংলা".repeat(5000)),
  ]) {
    const fake = fakeStorage({ [RECOVERY_STORAGE_KEY]: raw });
    const result = clearMatchingRecovery(() => fake.storage, pending());

    assert.equal(result.ok, false);
    assert.equal(result.reason, "record_changed");
    assert.equal(fake.values.get(RECOVERY_STORAGE_KEY), raw);
    assert.equal(
      fake.operations.some(([operation]) => operation === "remove"),
      false,
    );
  }
});

test("expired pending record remains eligible for exact cleanup", () => {
  const createdAt = 0;
  const record = pending({
    createdAt,
    expiresAt: createdAt + RECOVERY_LIFETIME_MS,
  });

  assert.equal(parse(record, NOW).reason, "expired");

  const fake = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(record),
  });

  assert.equal(clearMatchingRecovery(() => fake.storage, record).ok, true);
  assert.equal(fake.values.has(RECOVERY_STORAGE_KEY), false);
});

test("cleanup rejects an invalid expected record before accessing storage", () => {
  const fake = fakeStorage();
  const result = clearMatchingRecovery(
    () => fake.storage,
    pending({ requestId: "bad-id" }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_record");
  assert.equal(fake.operations.length, 0);
});

test("cleanup read or removal failure never reports success", () => {
  for (const options of [
    { readThrows: true },
    { removeThrows: true },
  ]) {
    const record = pending();
    const fake = fakeStorage({
      [RECOVERY_STORAGE_KEY]: JSON.stringify(record),
    }, options);

    const result = clearMatchingRecovery(() => fake.storage, record);

    assert.equal(result.ok, false);
    assert.equal(result.reason, "unavailable");
    assert.equal(fake.values.has(RECOVERY_STORAGE_KEY), true);
  }
});

test("silently ignored removal fails absence verification", () => {
  const record = pending();
  const fake = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(record),
  });
  fake.storage.removeItem = () => {};

  const result = clearMatchingRecovery(() => fake.storage, record);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "verification_failed");
  assert.equal(fake.values.has(RECOVERY_STORAGE_KEY), true);
});

test("accepted, conflict and blocked markers support exact cleanup", () => {
  const conflict = pending({ state: "conflict" });
  delete conflict.snapshot;

  for (const record of [
    {
      schemaVersion: 1,
      submissionContractVersion: 1,
      state: "accepted",
      requestId: REQUEST_ID,
      receiptId: RECEIPT_ID,
    },
    conflict,
    {
      schemaVersion: 1,
      state: "blocked",
      reason: "expired",
      requestId: REQUEST_ID,
    },
  ]) {
    const fake = fakeStorage({
      [RECOVERY_STORAGE_KEY]: JSON.stringify(record),
    });

    assert.equal(clearMatchingRecovery(() => fake.storage, record).ok, true);
    assert.equal(fake.values.has(RECOVERY_STORAGE_KEY), false);
  }
});
test("accepted outcome replaces the snapshot with a minimal receipt marker", () => {
  const expected = pending();
  const h = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(expected),
    "unrelated:key": "keep",
  });

  const result = persistPendingOutcome(
    () => h.storage,
    expected,
    { outcome: "accepted", receiptId: RECEIPT_ID },
    NOW,
  );

  assert.equal(result.ok, true);

  const saved = JSON.parse(h.values.get(RECOVERY_STORAGE_KEY));

  assert.deepEqual(saved, {
    schemaVersion: 1,
    submissionContractVersion: 1,
    state: "accepted",
    requestId: REQUEST_ID,
    receiptId: RECEIPT_ID,
  });

  assert.equal(h.values.get("unrelated:key"), "keep");
  assert.equal(
    h.operations.some(([operation]) => operation === "remove"),
    false,
  );
});
test("conflict outcome removes the snapshot and preserves identity and lifetime", () => {
  const expected = pending();
  const h = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(expected),
    "unrelated:key": "keep",
  });

  const result = persistPendingOutcome(
    () => h.storage,
    expected,
    { outcome: "conflict" },
    NOW,
  );

  assert.equal(result.ok, true);

  const saved = JSON.parse(h.values.get(RECOVERY_STORAGE_KEY));

  assert.deepEqual(saved, {
    schemaVersion: 1,
    submissionContractVersion: 1,
    state: "conflict",
    requestId: REQUEST_ID,
    createdAt: expected.createdAt,
    expiresAt: expected.expiresAt,
  });

  assert.equal(h.values.get("unrelated:key"), "keep");
});
test("expired marker is written only at or after the original deadline", () => {
  const expected = pending();
  const original = JSON.stringify(expected);
  const h = fakeStorage({
    [RECOVERY_STORAGE_KEY]: original,
    "unrelated:key": "keep",
  });

  const early = persistPendingOutcome(
    () => h.storage,
    expected,
    { outcome: "expired" },
    expected.expiresAt - 1,
  );

  assert.equal(early.ok, false);
  assert.equal(early.reason, "invalid_record");
  assert.equal(h.values.get(RECOVERY_STORAGE_KEY), original);
  assert.equal(
    h.operations.some(([operation]) => operation === "set"),
    false,
  );

  const expired = persistPendingOutcome(
    () => h.storage,
    expected,
    { outcome: "expired" },
    expected.expiresAt,
  );

  assert.equal(expired.ok, true);

  const saved = JSON.parse(h.values.get(RECOVERY_STORAGE_KEY));

  assert.deepEqual(saved, {
    schemaVersion: 1,
    state: "blocked",
    reason: "expired",
    requestId: REQUEST_ID,
  });

  assert.equal(h.values.get("unrelated:key"), "keep");
});
test("outcome marker refuses missing or changed pending records", () => {
  const expected = pending();

  const changed = {
    ...expected,
    snapshot: {
      ...expected.snapshot,
      notes: "Changed stored notes",
    },
  };

  for (const initial of [
    {},
    { [RECOVERY_STORAGE_KEY]: JSON.stringify(changed) },
  ]) {
    const h = fakeStorage(initial);
    const before = [...h.values.entries()];

    const result = persistPendingOutcome(
      () => h.storage,
      expected,
      { outcome: "accepted", receiptId: RECEIPT_ID },
      NOW,
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "record_changed");
    assert.deepEqual([...h.values.entries()], before);
    assert.equal(
      h.operations.some(([operation]) => operation === "set"),
      false,
    );
  }
});
test("outcome marker write failure preserves the pending record", () => {
  const expected = pending();
  const original = JSON.stringify(expected);
  const h = fakeStorage(
    { [RECOVERY_STORAGE_KEY]: original },
    { writeThrows: true },
  );

  const result = persistPendingOutcome(
    () => h.storage,
    expected,
    { outcome: "accepted", receiptId: RECEIPT_ID },
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unavailable");
  assert.equal(h.values.get(RECOVERY_STORAGE_KEY), original);
});
test("silently ignored outcome write fails read-back verification", () => {
  const expected = pending();
  const original = JSON.stringify(expected);
  const h = fakeStorage({
    [RECOVERY_STORAGE_KEY]: original,
  });

  h.storage.setItem = (key) => {
    h.operations.push(["set", key]);
    // Simulate a write that returns without saving anything.
  };

  const result = persistPendingOutcome(
    () => h.storage,
    expected,
    { outcome: "accepted", receiptId: RECEIPT_ID },
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "verification_failed");
  assert.equal(h.values.get(RECOVERY_STORAGE_KEY), original);
});
test("confirmed acceptance can replace a pending record after expiry", () => {
  const expected = pending();
  const h = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(expected),
  });

  const result = persistPendingOutcome(
    () => h.storage,
    expected,
    { outcome: "accepted", receiptId: RECEIPT_ID },
    expected.expiresAt + 1,
  );

  assert.equal(result.ok, true);

  const saved = JSON.parse(h.values.get(RECOVERY_STORAGE_KEY));

  assert.equal(saved.state, "accepted");
  assert.equal(saved.requestId, REQUEST_ID);
  assert.equal(saved.receiptId, RECEIPT_ID);
  assert.equal("snapshot" in saved, false);
});
test("invalid accepted receipt is rejected before storage access", () => {
  const expected = pending();
  let storageAccesses = 0;

  const result = persistPendingOutcome(
    () => {
      storageAccesses += 1;
      throw new Error("Storage must not be accessed.");
    },
    expected,
    { outcome: "accepted", receiptId: "invalid-receipt" },
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_record");
  assert.equal(storageAccesses, 0);
});
test("malformed recovery is replaced with a minimal blocked marker", () => {
  const h = fakeStorage({
    [RECOVERY_STORAGE_KEY]: '{"snapshot":"PRIVATE TEST DATA"',
    "unrelated:key": "keep",
  });

  const result = quarantineInvalidRecovery(
    () => h.storage,
    NOW,
  );

  assert.equal(result.ok, true);

  const saved = JSON.parse(h.values.get(RECOVERY_STORAGE_KEY));

  assert.deepEqual(saved, {
    schemaVersion: 1,
    state: "blocked",
    reason: "invalid_record",
  });

  assert.equal(h.values.get("unrelated:key"), "keep");
  assert.equal(
    h.operations.some(([operation]) => operation === "remove"),
    false,
  );
});
test("incompatible recovery retains only blocked metadata and valid identity", () => {
  const incompatible = {
    ...pending(),
    submissionContractVersion: 2,
  };

  const h = fakeStorage({
    [RECOVERY_STORAGE_KEY]: JSON.stringify(incompatible),
    "unrelated:key": "keep",
  });

  const result = quarantineInvalidRecovery(
    () => h.storage,
    NOW,
  );

  assert.equal(result.ok, true);

  const saved = JSON.parse(h.values.get(RECOVERY_STORAGE_KEY));

  assert.deepEqual(saved, {
    schemaVersion: 1,
    state: "blocked",
    reason: "incompatible_version",
    requestId: REQUEST_ID,
  });

  assert.equal(h.values.get("unrelated:key"), "keep");
});
test("privacy cleanup never replaces a valid pending submission", () => {
  const original = JSON.stringify(pending());
  const h = fakeStorage({
    [RECOVERY_STORAGE_KEY]: original,
  });

  const result = quarantineInvalidRecovery(
    () => h.storage,
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_record");
  assert.equal(h.values.get(RECOVERY_STORAGE_KEY), original);
  assert.equal(
    h.operations.some(([operation]) => operation === "set"),
    false,
  );
});
test("privacy cleanup refuses a record changed after inspection", () => {
  const h = fakeStorage({
    [RECOVERY_STORAGE_KEY]: "{malformed",
  });

  const replacement = JSON.stringify(pending());
  const originalGet = h.storage.getItem;
  let reads = 0;

  h.storage.getItem = (key) => {
    if (key === RECOVERY_STORAGE_KEY) {
      reads += 1;

      if (reads === 2) {
        h.values.set(key, replacement);
      }
    }

    return originalGet(key);
  };

  const result = quarantineInvalidRecovery(
    () => h.storage,
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "record_changed");
  assert.equal(h.values.get(RECOVERY_STORAGE_KEY), replacement);
  assert.equal(
    h.operations.some(([operation]) => operation === "set"),
    false,
  );
});
test("privacy cleanup write failure preserves the original data", () => {
  const original = "{malformed";
  const h = fakeStorage(
    { [RECOVERY_STORAGE_KEY]: original },
    { writeThrows: true },
  );

  const result = quarantineInvalidRecovery(() => h.storage, NOW);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unavailable");
  assert.equal(h.values.get(RECOVERY_STORAGE_KEY), original);
});

test("privacy cleanup detects a silently ignored write", () => {
  const original = "{malformed";
  const h = fakeStorage({
    [RECOVERY_STORAGE_KEY]: original,
  });

  h.storage.setItem = (key) => {
    h.operations.push(["set", key]);
  };

  const result = quarantineInvalidRecovery(() => h.storage, NOW);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "verification_failed");
  assert.equal(h.values.get(RECOVERY_STORAGE_KEY), original);
});
test("recognized historical record blocks a new submission", () => {
  const historicalKey = "travelpro:test-only:historical-recovery";
  const originalKeys = [...RECOVERY_STORAGE_KEYS];

  try {
    // Extend only this test VM's registry, not production source.
    RECOVERY_STORAGE_KEYS.push(historicalKey);

    const original = JSON.stringify(pending());
    const h = fakeStorage({
      [historicalKey]: original,
      "unrelated:key": "keep",
    });

    const restored = readRecoveryStorage(() => h.storage, NOW);

    assert.equal(restored.kind, "valid");
    assert.equal(restored.key, historicalKey);
    assert.equal(restored.record.requestId, REQUEST_ID);

    const result = persistNewPendingRecovery(
      () => h.storage,
      pending(),
      NOW,
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "existing_record");
    assert.equal(h.values.get(historicalKey), original);
    assert.equal(h.values.has(RECOVERY_STORAGE_KEY), false);
    assert.equal(h.values.get("unrelated:key"), "keep");
  } finally {
    RECOVERY_STORAGE_KEYS.splice(
      0,
      RECOVERY_STORAGE_KEYS.length,
      ...originalKeys,
    );
  }
});
test("multiple recognized records block recovery without changing either", () => {
  const historicalKey = "travelpro:test-only:historical-recovery";
  const originalKeys = [...RECOVERY_STORAGE_KEYS];

  try {
    RECOVERY_STORAGE_KEYS.push(historicalKey);

    const expected = pending();
    const h = fakeStorage({
      [RECOVERY_STORAGE_KEY]: JSON.stringify(expected),
      [historicalKey]: "{malformed historical record",
      "unrelated:key": "keep",
    });
    const before = [...h.values.entries()];

    const restored = readRecoveryStorage(() => h.storage, NOW);

    assert.equal(restored.kind, "blocked");
    assert.equal(restored.reason, "multiple_records");
    assert.equal("requestId" in restored, false);

    const results = [
      persistNewPendingRecovery(() => h.storage, pending(), NOW),
      verifyPendingRecovery(() => h.storage, expected, NOW),
      clearMatchingRecovery(() => h.storage, expected),
      persistPendingOutcome(
        () => h.storage,
        expected,
        { outcome: "accepted", receiptId: RECEIPT_ID },
        NOW,
      ),
      quarantineInvalidRecovery(() => h.storage, NOW),
    ];

    for (const result of results) {
      assert.equal(result.ok, false);
    }

    assert.deepEqual([...h.values.entries()], before);
    assert.equal(
      h.operations.some(
        ([operation]) => operation === "set" || operation === "remove",
      ),
      false,
    );
  } finally {
    RECOVERY_STORAGE_KEYS.splice(
      0,
      RECOVERY_STORAGE_KEYS.length,
      ...originalKeys,
    );
  }
});
console.log(
  "All recovery record validation checks passed. No browser storage, network or database writes.",
);