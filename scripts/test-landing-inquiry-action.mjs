import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const actionPath = new URL("../app/inquire/actions.ts", import.meta.url);
const source = await readFile(actionPath, "utf8");

const compiled = ts.transpileModule(source, {
  fileName: "app/inquire/actions.ts",
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
  reportDiagnostics: true,
});

const diagnostics = compiled.diagnostics ?? [];
assert.equal(
  diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error)
    .length,
  0,
  "Action transpilation failed.",
);

const RECEIPT_ID = "11111111-2222-4333-8444-555555555555";

let rateCalls = 0;
let clientCalls = 0;
let rpcCalls = 0;
let capturedPayload = null;
let rateResult;
let rpcResult;
let rateThrows = false;
let rpcThrows = false;

function resetMocks() {
  rateCalls = 0;
  clientCalls = 0;
  rpcCalls = 0;
  capturedPayload = null;
  rateThrows = false;
  rpcThrows = false;
  rateResult = {
    allowed: true,
    remaining: 4,
    retryAfterSeconds: 0,
  };
  rpcResult = {
    data: {
      id: RECEIPT_ID,
      status: "accepted",
      duplicate: false,
    },
    error: null,
  };
}

resetMocks();

const actionExports = {};
const capturedLogs = [];

const context = vm.createContext({
  exports: actionExports,
  module: { exports: actionExports },
  Buffer,
  FormData,
  Blob,
  TextEncoder,
  TextDecoder,
  console: {
    error: (...args) => capturedLogs.push(args),
    log: () => {},
  },
  fetch: () => {
    throw new Error("Network access is forbidden in this test.");
  },
  require: (name) => {
    if (name === "@/lib/inquiry-rate-limit") {
      return {
        checkLandingInquiryRateLimit: async () => {
          rateCalls += 1;
          if (rateThrows) throw new Error("Synthetic rate-limit failure.");
          return rateResult;
        },
      };
    }

    if (name === "@/lib/supabase/intake") {
      return {
        createIntakeClient: () => {
          clientCalls += 1;
          return {
            rpc: async (functionName, args) => {
              rpcCalls += 1;
              assert.equal(functionName, "submit_inquiry_intake");
              capturedPayload = args.p_payload;
              if (rpcThrows) throw new Error("Synthetic RPC failure.");
              return rpcResult;
            },
          };
        },
      };
    }

    throw new Error(`Unexpected dependency: ${name}`);
  },
});

new vm.Script(compiled.outputText, {
  filename: "landing-inquiry-action.test.cjs",
}).runInContext(context, { timeout: 5000 });

const submitLandingInquiry = actionExports.submitLandingInquiry;
assert.equal(typeof submitLandingInquiry, "function");

function validForm(overrides = {}) {
  const form = new FormData();
  const fields = {
    requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    clientType: "individual",
    serviceType: "consultation",
    corporateClient: "",
    contactName: "SYNTHETIC ACTION TEST",
    contactEmail: "action-test@example.invalid",
    contactPhone: "",
    origin: "",
    destination: "",
    departureDate: "",
    returnDate: "",
    passengerCount: "",
    cabinClass: "",
    notes: "Synthetic local test. No database writes.",
    website: "",
    ...overrides,
  };

  for (const [field, value] of Object.entries(fields)) {
    form.set(field, value);
  }

  return form;
}

async function expectRejected(label, form, expectedMessage) {
  resetMocks();
  const result = await submitLandingInquiry(form);

  assert.equal(result.success, false, label);
  assert.equal(result.receiptId, null, label);
  assert.equal(result.duplicate, false, label);
  assert.match(result.message, expectedMessage, label);
  assert.equal(rateCalls, 0, `${label}: rate limiter was reached`);
  assert.equal(clientCalls, 0, `${label}: database client was created`);
  assert.equal(rpcCalls, 0, `${label}: intake RPC was reached`);
  console.log(`PASS: ${label}`);
}

await expectRejected(
  "missing request ID",
  validForm({ requestId: "" }),
  /valid submission request ID/,
);

await expectRejected(
  "invalid client type",
  validForm({ clientType: "owner" }),
  /valid client type/,
);

await expectRejected(
  "invalid service type",
  validForm({ serviceType: "ticket_issuance" }),
  /valid service type/,
);

await expectRejected(
  "blank name",
  validForm({ contactName: "   " }),
  /Enter your name/,
);

await expectRejected(
  "missing corporate company",
  validForm({ clientType: "corporate", corporateClient: "" }),
  /Enter the company name/,
);

await expectRejected(
  "both contact methods missing",
  validForm({ contactEmail: "", contactPhone: "" }),
  /email address or phone number/,
);

await expectRejected(
  "invalid email",
  validForm({ contactEmail: "invalid-email" }),
  /valid email address/,
);

await expectRejected(
  "phone without country code",
  validForm({ contactEmail: "", contactPhone: "01700000000" }),
  /phone country code/,
);

await expectRejected(
  "honeypot filled",
  validForm({ website: "https://synthetic.example.invalid" }),
  /Unable to accept/,
);

await expectRejected(
  "invalid airport code syntax",
  validForm({ origin: "D1C" }),
  /three-letter airport code/,
);

await expectRejected(
  "impossible calendar date",
  validForm({ departureDate: "2026-02-30" }),
  /valid travel date/,
);

await expectRejected(
  "return without departure",
  validForm({ returnDate: "2026-11-20" }),
  /departure date before a return date/,
);

await expectRejected(
  "return before departure",
  validForm({
    departureDate: "2026-11-20",
    returnDate: "2026-11-15",
  }),
  /Return date cannot precede/,
);

for (const count of ["0", "-1", "1.5", "1000"]) {
  await expectRejected(
    `invalid flight passenger count ${count}`,
    validForm({ serviceType: "flight_booking", passengerCount: count }),
    /passengerCount exceeds|Passenger count must be/,
  );
}

await expectRejected(
  "invalid flight cabin",
  validForm({ serviceType: "flight_booking", cabinClass: "private_jet" }),
  /valid cabin preference/,
);

await expectRejected(
  "oversized name",
  validForm({ contactName: "X".repeat(201) }),
  /contactName exceeds/,
);

await expectRejected(
  "oversized notes",
  validForm({ notes: "X".repeat(4001) }),
  /notes exceeds/,
);

const duplicateName = validForm();
duplicateName.append("contactName", "SECOND NAME");
await expectRejected(
  "duplicate name field",
  duplicateName,
  /Multiple values are not allowed/,
);

const unknownField = validForm();
unknownField.set("matched_client_id", RECEIPT_ID);
await expectRejected(
  "unknown protected field",
  unknownField,
  /Invalid inquiry form submission/,
);

const fileField = validForm();
fileField.set("notes", new Blob(["synthetic"]), "test.txt");
await expectRejected(
  "file instead of text",
  fileField,
  /Invalid inquiry form submission/,
);

async function expectAccepted(label, form, verifyPayload) {
  resetMocks();
  const result = await submitLandingInquiry(form);

  assert.equal(result.success, true, label);
  assert.equal(result.receiptId, RECEIPT_ID, label);
  assert.equal(result.duplicate, false, label);
  assert.equal(rateCalls, 1, label);
  assert.equal(clientCalls, 1, label);
  assert.equal(rpcCalls, 1, label);

  const payload = JSON.parse(JSON.stringify(capturedPayload));
  assert.equal(payload.source, "landing_page");
  assert.equal(payload.version, 1);
  assert.equal(Object.hasOwn(payload, "matched_client_id"), false);
  assert.equal(Object.hasOwn(payload, "converted_case_id"), false);
  verifyPayload(payload);
  console.log(`PASS: ${label}`);
}

await expectAccepted(
  "email-only consultation payload",
  validForm(),
  (payload) => {
    assert.equal(payload.contact.email, "action-test@example.invalid");
    assert.equal(Object.hasOwn(payload.contact, "phone"), false);
    assert.equal(Object.hasOwn(payload.travel, "passengerCount"), false);
    assert.equal(Object.hasOwn(payload.travel, "cabinClass"), false);
  },
);

await expectAccepted(
  "phone-only payload",
  validForm({ contactEmail: "", contactPhone: "+12025550123" }),
  (payload) => {
    assert.equal(payload.contact.phone, "+12025550123");
    assert.equal(Object.hasOwn(payload.contact, "email"), false);
  },
);

await expectAccepted(
  "corporate company and contact separation",
  validForm({
    clientType: "corporate",
    corporateClient: "SYNTHETIC COMPANY",
    contactName: "SYNTHETIC CONTACT",
  }),
  (payload) => {
    assert.equal(payload.companyName, "SYNTHETIC COMPANY");
    assert.equal(payload.contact.name, "SYNTHETIC CONTACT");
  },
);

await expectAccepted(
  "individual omits company",
  validForm({ corporateClient: "STALE COMPANY VALUE" }),
  (payload) => {
    assert.equal(Object.hasOwn(payload, "companyName"), false);
  },
);

await expectAccepted(
  "clean uppercase flight codes and numeric count",
  validForm({
    serviceType: "flight_booking",
    origin: " dac ",
    destination: " bkk ",
    departureDate: "2030-11-15",
    returnDate: "2030-11-20",
    passengerCount: "2",
    cabinClass: "economy",
  }),
  (payload) => {
    assert.equal(payload.travel.origin, "DAC");
    assert.equal(payload.travel.destination, "BKK");
    assert.equal(payload.travel.passengerCount, 2);
    assert.equal(payload.travel.cabinClass, "economy");
    assert.equal(payload.travel.departureDate, "2030-11-15");
    assert.match(payload.rawMessage, /origin: DAC/);
  },
);

await expectAccepted(
  "unknown flight details remain omitted",
  validForm({ serviceType: "flight_booking" }),
  (payload) => {
    assert.equal(Object.hasOwn(payload.travel, "passengerCount"), false);
    assert.equal(Object.hasOwn(payload.travel, "cabinClass"), false);
    assert.equal(Object.hasOwn(payload.travel, "departureDate"), false);
  },
);

for (const serviceType of ["visa_support", "package", "consultation"]) {
  await expectAccepted(
    `${serviceType} omits stale flight-only fields`,
    validForm({ serviceType, passengerCount: "2", cabinClass: "economy" }),
    (payload) => {
      assert.equal(payload.serviceType, serviceType);
      assert.equal(Object.hasOwn(payload.travel, "passengerCount"), false);
      assert.equal(Object.hasOwn(payload.travel, "cabinClass"), false);
    },
  );
}

resetMocks();
rateResult = { allowed: false, remaining: 0, retryAfterSeconds: 30 };
let result = await submitLandingInquiry(validForm());
assert.equal(result.success, false);
assert.match(result.message, /Try again in 30 seconds/);
assert.equal(clientCalls, 0);
assert.equal(rpcCalls, 0);
console.log("PASS: rate-limit denial prevents intake RPC");

resetMocks();
rateThrows = true;
result = await submitLandingInquiry(validForm());
assert.equal(result.success, false);
assert.equal(clientCalls, 0);
assert.equal(rpcCalls, 0);
console.log("PASS: rate-limit failure prevents intake RPC");

resetMocks();
rpcResult.data.duplicate = true;
result = await submitLandingInquiry(validForm());
assert.equal(result.success, true);
assert.equal(result.duplicate, true);
assert.equal(result.receiptId, RECEIPT_ID);
assert.match(result.message, /already received/);
console.log("PASS: duplicate RPC receipt handling");

for (const [code, message] of [
  ["23505", /already used with different details/],
  ["22023", /Check your inquiry details/],
  ["PGRST202", /Retry without changing your details/],
]) {
  resetMocks();
  rpcResult = { data: null, error: { code } };
  result = await submitLandingInquiry(validForm());
  assert.equal(result.success, false);
  assert.equal(result.receiptId, null);
  assert.match(result.message, message);
  console.log(`PASS: safe RPC error handling ${code}`);
}

for (const invalidReceipt of [
  null,
  [],
  { id: "bad-id", status: "accepted", duplicate: false },
  { id: RECEIPT_ID, status: "new", duplicate: false },
  { id: RECEIPT_ID, status: "accepted", duplicate: "false" },
]) {
  resetMocks();
  rpcResult = { data: invalidReceipt, error: null };
  result = await submitLandingInquiry(validForm());
  assert.equal(result.success, false);
  assert.equal(result.receiptId, null);
  assert.match(result.message, /Retry without changing your details/);
}
console.log("PASS: malformed receipts never report success");

resetMocks();
rpcThrows = true;
result = await submitLandingInquiry(validForm());
assert.equal(result.success, false);
assert.equal(result.receiptId, null);
console.log("PASS: thrown RPC failure returns safe failure");

console.log(
  "All local Landing Server Action checks passed. Dependencies mocked; no network or database writes.",
);