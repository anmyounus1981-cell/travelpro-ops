import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(
  new URL("../app/inquire/page.tsx", import.meta.url),
  "utf8",
);

const compiled = ts.transpileModule(source, {
  fileName: "app/inquire/page.tsx",
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  reportDiagnostics: true,
});

assert.equal(
  (compiled.diagnostics ?? []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
  "Page transpilation failed.",
);
const recoverySource = await readFile(
  new URL("../lib/landing-inquiry-recovery.ts", import.meta.url),
  "utf8",
);

const recoveryCompiled = ts.transpileModule(recoverySource, {
  fileName: "lib/landing-inquiry-recovery.ts",
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
  reportDiagnostics: true,
});

assert.equal(
  (recoveryCompiled.diagnostics ?? []).filter(
    (item) => item.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
  "Recovery module transpilation failed.",
);

const recoveryExports = {};
const recoveryContext = vm.createContext({
  exports: recoveryExports,
  module: { exports: recoveryExports },
  TextEncoder,
  require: (name) => {
    throw new Error(`Unexpected recovery dependency: ${name}`);
  },
  fetch: () => {
    throw new Error("Network access is forbidden.");
  },
});

new vm.Script(recoveryCompiled.outputText, {
  filename: "recovery-storage.component-test.cjs",
}).runInContext(recoveryContext, { timeout: 5000 });
const RECEIPT_ID = "11111111-2222-4333-8444-555555555555";

function AirportStub() {
  throw new Error("Airport component must not execute in this logic test.");
}

function createHarness(options = {}) {
  const storageValues = new Map(
    Object.entries(options.initialStorage ?? {}),
  );
  const storageOperations = [];

  const sessionStorage = {
    getItem(key) {
      storageOperations.push(["get", key]);
      if (options.readThrows) {
        throw new Error("Synthetic storage read failure.");
      }
      return storageValues.has(key) ? storageValues.get(key) : null;
    },
    setItem(key, value) {
      storageOperations.push(["set", key]);
      if (options.writeThrows) {
        throw new Error("Synthetic storage write failure.");
      }
      storageValues.set(key, value);
    },
    removeItem(key) {
      storageOperations.push(["remove", key]);
      if (options.removeThrows) {
        throw new Error("Synthetic storage removal failure.");
      }
      storageValues.delete(key);
    },
  };

  const slots = [];
  const calls = [];
  const responses = [];
  let cursor = 0;
  let tree;
  let generatedIds = 0;

  function useRef(initial) {
    const index = cursor++;
    if (!(index in slots)) {
      slots[index] = { current: initial };
    }
    return slots[index];
  }

  function useState(initial) {
    const index = cursor++;

    if (!(index in slots)) {
      slots[index] =
        typeof initial === "function" ? initial() : initial;
    }

    return [
      slots[index],
      (next) => {
        slots[index] =
          typeof next === "function" ? next(slots[index]) : next;
      },
    ];
  }
  const pendingEffects = [];

  function useEffect(effect, dependencies) {
    const index = cursor++;
    const previous = slots[index];
    const changed =
      previous === undefined ||
      dependencies === undefined ||
      dependencies.some(
        (value, position) => !Object.is(value, previous[position]),
      );

    if (changed) {
      slots[index] = dependencies
        ? [...dependencies]
        : undefined;
      pendingEffects.push(effect);
    }
  }
  const jsx = (type, props, key) => ({ type, props, key });
  const exports = {};

  const context = vm.createContext({
    exports,
    module: { exports },
    FormData,
        window: { sessionStorage },
    crypto: {
      randomUUID: () => {
        generatedIds += 1;
        return (
          "aaaaaaaa-bbbb-4ccc-8ddd-" +
          String(generatedIds).padStart(12, "0")
        );
      },
    },
    fetch: () => {
      throw new Error("Network access is forbidden.");
    },
        require: (name) => {
      if (name === "@/lib/landing-inquiry-recovery") {
        return recoveryExports;
      }

      if (name === "react") {
        return { useRef, useState, useEffect };
      }

      if (name === "react/jsx-runtime") {
        return { jsx, jsxs: jsx, Fragment: Symbol("Fragment") };
      }

      if (name === "./actions") {
        return {
          submitLandingInquiry: async (formData) => {
            calls.push(Object.fromEntries(formData.entries()));
            assert.ok(
              responses.length > 0,
              "Unexpected Server Action invocation.",
            );

            const response = responses.shift();
            return typeof response === "function"
              ? await response()
              : response;
          },
        };
      }

      if (name === "@/components/inquiries/AirportAutocomplete") {
        return { __esModule: true, default: AirportStub };
      }

      if (name === "./page.module.css") {
        return {
          __esModule: true,
          default: new Proxy({}, { get: (_, key) => String(key) }),
        };
      }

      throw new Error(`Unexpected dependency: ${name}`);
    },
  });

  new vm.Script(compiled.outputText, {
    filename: "landing-recovery.test.cjs",
  }).runInContext(context, { timeout: 5000 });

    function render() {
    cursor = 0;
    tree = exports.default();

    if (pendingEffects.length > 0) {
      const effects = pendingEffects.splice(0);
      for (const effect of effects) effect();
      return render();
    }

    return tree;
  }

  function collect(node, predicate, found = []) {
    if (Array.isArray(node)) {
      for (const child of node) collect(child, predicate, found);
      return found;
    }

    if (!node || typeof node !== "object" || !node.props) {
      return found;
    }

    if (predicate(node)) found.push(node);
    collect(node.props.children, predicate, found);
    return found;
  }

  function one(predicate, label) {
    const matches = collect(tree, predicate);
    assert.equal(matches.length, 1, `Expected one ${label}.`);
    return matches[0];
  }

  function field(id) {
    return one((node) => node.props.id === id, `field ${id}`);
  }

  function edit(id, value) {
    field(id).props.onChange({ target: { value } });
    render();
  }

  function submit() {
    const form = one((node) => node.type === "form", "form");
    return form.props.onSubmit({ preventDefault() {} });
  }

  function button() {
    return one(
      (node) =>
        node.type === "button" && node.props.type === "submit",
      "submit button",
    );
  }

  function message() {
    const statuses = collect(
      tree,
      (node) => node.props.role === "status",
    );
    return statuses.map((node) => node.props.children).join(" ");
  }

  render();

  return {
    calls,
    responses,
    render,
    field,
    edit,
    submit,
    button,
    message,
    storageValues,
    storageOperations,
    sessionStorage,
    options,
    localButton(label) {
      return one(
        (node) =>
          node.type === "button" &&
          node.props.type === "button" &&
          node.props.children === label,
        `local button ${label}`,
      );
    },
  };
}
function failure(outcome, message = "Synthetic failure.") {
  return {
    success: false,
    outcome,
    message,
    receiptId: null,
    duplicate: false,
  };
}

function accepted(duplicate = false) {
  return {
    success: true,
    outcome: "accepted",
    message: duplicate
      ? "Your inquiry was already received."
      : "Your inquiry was received successfully.",
    receiptId: RECEIPT_ID,
    duplicate,
  };
}

function prepare() {
  const harness = createHarness();
  harness.edit("serviceType", "consultation");
  harness.edit("contactName", "SYNTHETIC RECOVERY TEST");
  harness.edit("contactEmail", "recovery@example.invalid");
  harness.edit("notes", "Original synthetic details.");
  return harness;
}

function assertLocked(harness, expected) {
  for (const id of [
    "clientType",
    "serviceType",
    "contactName",
    "contactEmail",
    "contactPhone",
    "origin",
    "destination",
    "departureDate",
    "returnDate",
    "notes",
  ]) {
    assert.equal(
      harness.field(id).props.disabled,
      expected,
      `Incorrect lock state for ${id}.`,
    );
  }
}

async function test(label, run) {
  await run();
  console.log(`PASS: ${label}`);
}

await test("confirmed rejection permits editing and a fresh request ID", async () => {
  const h = prepare();
  h.responses.push(failure("rejected", "Correct your details."));

  await h.submit();
  h.render();

  assertLocked(h, false);
  assert.equal(h.message(), "Correct your details.");

  h.edit("notes", "Corrected synthetic details.");
  assert.equal(h.field("notes").props.value, "Corrected synthetic details.");

  h.responses.push(accepted());
  await h.submit();
  h.render();

  assert.equal(h.calls.length, 2);
  assert.notEqual(h.calls[0].requestId, h.calls[1].requestId);
  assert.equal(h.calls[1].notes, "Corrected synthetic details.");
});

await test("unknown outcome blocks edits and retries the exact snapshot", async () => {
  const h = prepare();
  h.responses.push(failure("unknown"));

  await h.submit();
  h.render();

  assertLocked(h, true);
  assert.equal(h.button().props.disabled, false);
  assert.equal(h.button().props.children, "Retry Same Inquiry");

  h.edit("contactName", "CHANGED NAME");
  h.edit("notes", "CHANGED NOTES");
  assert.equal(h.field("contactName").props.value, "SYNTHETIC RECOVERY TEST");
  assert.equal(h.field("notes").props.value, "Original synthetic details.");

  h.responses.push(accepted(true));
  await h.submit();
  h.render();

  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1], h.calls[0]);
  assertLocked(h, false);
  assert.equal(h.field("contactName").props.value, "");
  assert.equal(h.field("notes").props.value, "");
  assert.equal(h.button().props.children, "Submit Inquiry");
  assert.match(h.message(), new RegExp(RECEIPT_ID));

  h.edit("contactName", "SECOND INQUIRY");
  h.edit("contactEmail", "second@example.invalid");
  h.responses.push(accepted());
  await h.submit();
  h.render();

  assert.notEqual(h.calls[2].requestId, h.calls[0].requestId);
});

await test("rejection after an unknown outcome does not unlock or rotate ID", async () => {
  const h = prepare();
  h.responses.push(failure("unknown"));
  await h.submit();
  h.render();

  h.responses.push(
    failure("rejected", "Too many attempts. Try again in 30 seconds."),
  );
  await h.submit();
  h.render();

  assertLocked(h, true);
  assert.equal(h.button().props.children, "Retry Same Inquiry");
  assert.match(h.message(), /earlier attempt is still unconfirmed/);

  h.edit("contactEmail", "changed@example.invalid");
  assert.equal(h.field("contactEmail").props.value, "recovery@example.invalid");

  h.responses.push(accepted(true));
  await h.submit();
  h.render();

  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.calls[1], h.calls[0]);
  assert.deepEqual(h.calls[2], h.calls[0]);
  assertLocked(h, false);
});

await test("conflict locks details and blocks further submission", async () => {
  const h = prepare();
  h.responses.push(failure("conflict"));

  await h.submit();
  h.render();

  assertLocked(h, true);
  assert.equal(h.button().props.disabled, true);
    assert.equal(h.button().props.children, "Submission Paused");
  assert.match(h.message(), /Contact TravelPro/);

  h.edit("notes", "CHANGED NOTES");
  assert.equal(h.field("notes").props.value, "Original synthetic details.");

  await h.submit();
  h.render();
  assert.equal(h.calls.length, 1);
});
await test("thrown action failure preserves details for an unchanged retry", async () => {
  const h = prepare();

  h.responses.push(() => {
    throw new Error("Synthetic lost response.");
  });

  await h.submit();
  h.render();

  assertLocked(h, true);
  assert.equal(h.field("notes").props.value, "Original synthetic details.");
  assert.equal(h.button().props.children, "Retry Same Inquiry");

  h.responses.push(accepted(true));
  await h.submit();
  h.render();

  assert.deepEqual(h.calls[1], h.calls[0]);
  assertLocked(h, false);
});

for (const response of [
  null,
  {
    success: false,
    message: "Old response without an outcome.",
    receiptId: null,
    duplicate: false,
  },
  {
    ...accepted(),
    receiptId: "invalid-receipt",
  },
  {
    ...accepted(),
    outcome: "rejected",
  },
]) {
  await test("unconfirmed or inconsistent response keeps recovery locked", async () => {
    const h = prepare();
    h.responses.push(response);

    await h.submit();
    h.render();

    assertLocked(h, true);
    assert.equal(h.button().props.children, "Retry Same Inquiry");
    assert.equal(h.field("contactName").props.value, "SYNTHETIC RECOVERY TEST");
    assert.doesNotMatch(h.message(), /Reference:/);

    h.responses.push(accepted(true));
    await h.submit();
    h.render();

    assert.deepEqual(h.calls[1], h.calls[0]);
  });
}

await test("in-flight guard blocks edits and repeated submit calls", async () => {
  const h = prepare();
  let release;

  const held = new Promise((resolve) => {
    release = resolve;
  });

  h.responses.push(() => held);

  const pending = h.submit();
  h.render();

  assert.equal(h.calls.length, 1);
  assertLocked(h, true);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.button().props.children, "Submitting...");

  try {
    h.edit("notes", "CHANGED WHILE SUBMITTING");
    assert.equal(h.field("notes").props.value, "Original synthetic details.");

    await h.submit();
    await h.submit();

    assert.equal(h.calls.length, 1);
  } finally {
    release(accepted());
    await pending;
  }

  h.render();
  assertLocked(h, false);
  assert.equal(h.field("contactName").props.value, "");
  assert.equal(h.button().props.disabled, false);
});
await test("reload restores an unknown submission and retries the same identity", async () => {
  const first = createHarness();

  first.edit("serviceType", "consultation");
  first.edit("contactName", "SYNTHETIC RELOAD TEST");
  first.edit("contactEmail", "reload@example.invalid");
  first.edit("notes", "Exact original reload details.");

  first.responses.push(failure("unknown"));
  await first.submit();
  first.render();

  assert.equal(first.calls.length, 1);

  // Simulate a fresh page instance using the same saved tab storage.
  const restored = createHarness({
    initialStorage: Object.fromEntries(first.storageValues),
  });

  assert.equal(restored.calls.length, 0);
  assert.equal(
    restored.field("contactEmail").props.value,
    "reload@example.invalid",
  );
  assert.equal(restored.field("notes").props.disabled, true);
  assert.equal(restored.button().props.children, "Retry Same Inquiry");

  restored.edit("notes", "Attempted change");
  assert.equal(
    restored.field("notes").props.value,
    "Exact original reload details.",
  );

  restored.responses.push(accepted(true));
  await restored.submit();
  restored.render();

  assert.equal(restored.calls.length, 1);
  assert.deepEqual(restored.calls[0], first.calls[0]);
  assert.equal(restored.storageValues.size, 0);
  assert.equal(restored.field("notes").props.disabled, false);
  assert.equal(restored.field("notes").props.value, "");
});
await test("failed recovery persistence prevents action dispatch", async () => {
  const h = createHarness({ writeThrows: true });

  h.edit("serviceType", "consultation");
  h.edit("contactName", "SYNTHETIC STORAGE FAILURE TEST");
  h.edit("contactEmail", "storage-failure@example.invalid");

  await h.submit();
  h.render();

  assert.equal(h.calls.length, 0);
  assert.equal(h.storageValues.size, 0);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.button().props.children, "Submission Paused");
  assert.equal(h.field("contactEmail").props.disabled, true);
  assert.match(h.message(), /No inquiry was sent by this attempt/);

  // Local recovery retry must not submit an inquiry.
  h.options.writeThrows = false;
  h.localButton("Retry Local Recovery").props.onClick();
  h.render();

  assert.equal(h.calls.length, 0);
  assert.equal(h.field("contactEmail").props.disabled, false);
  assert.equal(h.button().props.children, "Submit Inquiry");
});
await test("confirmed acceptance survives cleanup failure without another action", async () => {
  const h = createHarness({ removeThrows: true });

  h.edit("serviceType", "consultation");
  h.edit("contactName", "SYNTHETIC ACCEPTED CLEANUP TEST");
  h.edit("contactEmail", "accepted-cleanup@example.invalid");

  h.responses.push(accepted());
  await h.submit();
  h.render();

  assert.equal(h.calls.length, 1);
  assert.match(h.message(), new RegExp(RECEIPT_ID));
  assert.match(h.message(), /Your inquiry is confirmed/);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.field("contactEmail").props.value, "");

  const saved = JSON.parse(
    h.storageValues.get(recoveryExports.RECOVERY_STORAGE_KEY),
  );

  assert.equal(saved.state, "accepted");
  assert.equal("snapshot" in saved, false);

  await h.submit();
  assert.equal(h.calls.length, 1);

  h.options.removeThrows = false;
  h.localButton("Retry Local Cleanup").props.onClick();
  h.render();

  assert.equal(h.calls.length, 1);
  assert.equal(h.storageValues.size, 0);
  assert.match(h.message(), new RegExp(RECEIPT_ID));
  assert.match(h.message(), /Local recovery cleanup completed/);
  assert.equal(h.button().props.disabled, false);
});
await test("missing storage never unlocks an earlier unknown submission", async () => {
  const h = createHarness();

  h.edit("serviceType", "consultation");
  h.edit("contactName", "SYNTHETIC MISSING RECOVERY TEST");
  h.edit("contactEmail", "missing-recovery@example.invalid");

  h.responses.push(failure("unknown"));
  await h.submit();
  h.render();

  assert.equal(h.calls.length, 1);

  h.options.readThrows = true;
  await h.submit();
  h.render();

  assert.equal(h.calls.length, 1);
  assert.equal(h.button().props.disabled, true);

  h.storageValues.clear();
  h.options.readThrows = false;
  h.localButton("Retry Local Recovery").props.onClick();
  h.render();

  assert.equal(h.calls.length, 1);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.field("contactEmail").props.disabled, true);
  assert.match(h.message(), /recovery record is missing/);
});
await test("local recovery refuses a changed record after an unknown outcome", async () => {
  const h = createHarness();

  h.edit("serviceType", "consultation");
  h.edit("contactName", "SYNTHETIC CHANGED RECOVERY TEST");
  h.edit("contactEmail", "changed-recovery@example.invalid");
  h.edit("notes", "Original unresolved details.");

  h.responses.push(failure("unknown"));
  await h.submit();
  h.render();

  const key = recoveryExports.RECOVERY_STORAGE_KEY;
  const changed = JSON.parse(h.storageValues.get(key));
  changed.snapshot.notes = "Different stored details.";

  h.options.readThrows = true;
  await h.submit();
  h.render();

  h.storageValues.set(key, JSON.stringify(changed));
  h.options.readThrows = false;
  h.localButton("Retry Local Recovery").props.onClick();
  h.render();

  assert.equal(h.calls.length, 1);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.field("notes").props.disabled, true);
  assert.equal(
    h.field("notes").props.value,
    "Original unresolved details.",
  );
  assert.match(h.message(), /no longer matches/);
  assert.equal(
    JSON.parse(h.storageValues.get(key)).snapshot.notes,
    "Different stored details.",
  );
});
await test("confirmed rejection stays locked until local cleanup succeeds", async () => {
  const h = createHarness({ removeThrows: true });

  h.edit("serviceType", "consultation");
  h.edit("contactName", "SYNTHETIC REJECTED CLEANUP TEST");
  h.edit("contactEmail", "rejected-cleanup@example.invalid");
  h.edit("notes", "Original rejected details.");

  h.responses.push(failure("rejected", "Correct the inquiry details."));
  await h.submit();
  h.render();

  assert.equal(h.calls.length, 1);
  assert.equal(h.button().props.disabled, true);
  assert.equal(h.field("notes").props.disabled, true);

  h.edit("notes", "Blocked edit");
  assert.equal(
    h.field("notes").props.value,
    "Original rejected details.",
  );

  h.options.removeThrows = false;
  h.localButton("Retry Local Cleanup").props.onClick();
  h.render();

  assert.equal(h.calls.length, 1);
  assert.equal(h.storageValues.size, 0);
  assert.equal(h.field("notes").props.disabled, false);
  assert.match(h.message(), /Correct the inquiry details/);

  h.edit("notes", "Corrected details.");
  h.responses.push(accepted());
  await h.submit();
  h.render();

  assert.equal(h.calls.length, 2);
  assert.notEqual(h.calls[1].requestId, h.calls[0].requestId);
  assert.equal(h.calls[1].notes, "Corrected details.");
});
await test("expired recovery is blocked and its stored snapshot is removed", async () => {
  const first = createHarness();

  first.edit("serviceType", "consultation");
  first.edit("contactName", "SYNTHETIC EXPIRED RECOVERY TEST");
  first.edit("contactEmail", "expired-recovery@example.invalid");

  first.responses.push(failure("unknown"));
  await first.submit();
  first.render();

  const key = recoveryExports.RECOVERY_STORAGE_KEY;
  const expired = JSON.parse(first.storageValues.get(key));

  expired.createdAt =
    Date.now() - recoveryExports.RECOVERY_LIFETIME_MS - 1000;
  expired.expiresAt =
    expired.createdAt + recoveryExports.RECOVERY_LIFETIME_MS;

  const restored = createHarness({
    initialStorage: {
      [key]: JSON.stringify(expired),
      "unrelated:key": "keep",
    },
  });

  assert.equal(restored.calls.length, 0);
  assert.equal(restored.button().props.disabled, true);
  assert.equal(restored.field("contactEmail").props.value, "");
  assert.equal(restored.field("contactEmail").props.disabled, true);

  const saved = JSON.parse(restored.storageValues.get(key));

  assert.equal(saved.state, "blocked");
  assert.equal(saved.reason, "expired");
  assert.equal("snapshot" in saved, false);
  assert.equal(restored.storageValues.get("unrelated:key"), "keep");

  await restored.submit();
  assert.equal(restored.calls.length, 0);
});
await test("restored accepted marker is labeled local and cleanup sends no action", async () => {
  const key = recoveryExports.RECOVERY_STORAGE_KEY;
  const h = createHarness({
    initialStorage: {
      [key]: JSON.stringify({
        schemaVersion: 1,
        submissionContractVersion: 1,
        state: "accepted",
        requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        receiptId: RECEIPT_ID,
      }),
    },
  });

  assert.equal(h.calls.length, 0);
  assert.equal(h.button().props.disabled, true);
  assert.match(h.message(), /Locally saved receipt/);
  assert.match(h.message(), /not been freshly verified/);
  assert.match(h.message(), new RegExp(RECEIPT_ID));

  h.localButton("Retry Local Cleanup").props.onClick();
  h.render();

  assert.equal(h.calls.length, 0);
  assert.equal(h.storageValues.size, 0);
  assert.equal(h.button().props.disabled, false);
  assert.match(h.message(), /not been freshly verified/);
});

console.log(
  "All local Landing recovery logic checks passed. React hooks and Server Action mocked; no browser, network or database writes.",
);