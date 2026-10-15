import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const helperPath = new URL("../lib/inquiry-rate-limit.ts", import.meta.url);
const source = await readFile(helperPath, "utf8");

const compiled = ts.transpileModule(source, {
  fileName: "lib/inquiry-rate-limit.ts",
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
  "Helper transpilation failed.",
);

const TEST_SECRET = "synthetic-local-rate-limit-secret-".repeat(2);
const testEnv = { INQUIRY_RATE_LIMIT_SECRET: TEST_SECRET };
const helperExports = {};
const calls = [];
const logs = [];
let responseQueue = [];

function allowed(remaining) {
  return {
    data: { allowed: true, remaining, retryAfterSeconds: 0 },
    error: null,
  };
}

function denied(retryAfterSeconds = 30) {
  return {
    data: { allowed: false, remaining: 0, retryAfterSeconds },
    error: null,
  };
}

function resetMocks(responses = []) {
  calls.length = 0;
  logs.length = 0;
  responseQueue = [...responses];
  testEnv.INQUIRY_RATE_LIMIT_SECRET = TEST_SECRET;
}

function expectedKey(scope, category, identity) {
  return createHmac("sha256", TEST_SECRET)
    .update(JSON.stringify(["inquiry-rate-limit-v1", scope, category, identity]))
    .digest("hex");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const context = vm.createContext({
  exports: helperExports,
  module: { exports: helperExports },
  Buffer,
  process: { env: testEnv },
  console: {
    error: (...args) => logs.push(args),
  },
  fetch: () => {
    throw new Error("Network access forbidden in helper tests.");
  },
  require: (name) => {
    if (name === "server-only") return {};

    if (name === "node:crypto") return { createHmac };

    if (name === "@/lib/supabase/intake") {
      return {
        createIntakeClient: () => ({
          rpc: async (functionName, args) => {
            assert.equal(functionName, "consume_inquiry_rate_limit");
            calls.push(plain(args));

            if (responseQueue.length === 0) {
              throw new Error("Unexpected RPC call: no mock response prepared.");
            }

            const response = responseQueue.shift();
            if (response instanceof Error) throw response;
            return response;
          },
        }),
      };
    }

    throw new Error(`Unexpected dependency: ${name}`);
  },
});

new vm.Script(compiled.outputText, {
  filename: "inquiry-rate-limit-helper.test.cjs",
}).runInContext(context, { timeout: 5000 });

const checkLanding = helperExports.checkLandingInquiryRateLimit;
const checkWebhook = helperExports.checkWebhookInquiryRateLimit;

assert.equal(typeof checkLanding, "function");
assert.equal(typeof checkWebhook, "function");

const landingGlobal = {
  p_scope: "landing_page",
  p_bucket_key: expectedKey("landing_page", "global", "all"),
  p_max_requests: 100,
  p_window_seconds: 900,
};

resetMocks([allowed(99), allowed(4)]);
let result = await checkLanding({ email: " FIRST@Example.Invalid " });
assert.deepEqual(calls, [
  landingGlobal,
  {
    p_scope: "landing_page",
    p_bucket_key: expectedKey("landing_page", "email", "first@example.invalid"),
    p_max_requests: 5,
    p_window_seconds: 900,
  },
]);
assert.deepEqual(plain(result), {
  allowed: true,
  remaining: 4,
  retryAfterSeconds: 0,
});
console.log("PASS: Landing global parameters and normalized email bucket");

const firstGlobalKey = calls[0].p_bucket_key;
const firstEmailKey = calls[1].p_bucket_key;

resetMocks([allowed(98), allowed(3)]);
await checkLanding({ email: "first@example.invalid" });
assert.equal(calls[0].p_bucket_key, firstGlobalKey);
assert.equal(calls[1].p_bucket_key, firstEmailKey);
console.log("PASS: email case and surrounding whitespace share a bucket");

resetMocks([allowed(97), allowed(4)]);
await checkLanding({ phone: " +12025550124 " });
assert.deepEqual(calls, [
  landingGlobal,
  {
    p_scope: "landing_page",
    p_bucket_key: expectedKey("landing_page", "phone", "+12025550124"),
    p_max_requests: 5,
    p_window_seconds: 900,
  },
]);
assert.equal(calls[0].p_bucket_key, firstGlobalKey);
console.log("PASS: phone-only contact uses the same Landing global bucket");

resetMocks([allowed(90), allowed(4), allowed(2)]);
result = await checkLanding({
  email: "second@example.invalid",
  phone: "+12025550125",
});
assert.equal(calls.length, 3);
assert.deepEqual(calls[0], landingGlobal);
assert.equal(
  calls[1].p_bucket_key,
  expectedKey("landing_page", "email", "second@example.invalid"),
);
assert.equal(
  calls[2].p_bucket_key,
  expectedKey("landing_page", "phone", "+12025550125"),
);
assert.notEqual(calls[1].p_bucket_key, calls[2].p_bucket_key);
assert.equal(result.remaining, 2);
assert.equal(responseQueue.length, 0);
console.log("PASS: combined contacts use separate buckets and minimum remaining");

resetMocks([denied(45)]);
result = await checkLanding({
  email: "third@example.invalid",
  phone: "+12025550126",
});
assert.deepEqual(calls, [landingGlobal]);
assert.deepEqual(plain(result), {
  allowed: false,
  remaining: 0,
  retryAfterSeconds: 45,
});
console.log("PASS: global denial skips both contact-counter calls");

resetMocks([allowed(0), allowed(3)]);
result = await checkLanding({ email: "last-slot@example.invalid" });
assert.equal(result.allowed, true);
assert.equal(result.remaining, 0);
assert.equal(calls.length, 2);
console.log("PASS: final allowed global slot remains allowed with zero remaining");

resetMocks([allowed(80), denied(60)]);
result = await checkLanding({
  email: "exhausted@example.invalid",
  phone: "+12025550127",
});
assert.equal(result.allowed, false);
assert.equal(result.retryAfterSeconds, 60);
assert.equal(calls.length, 2);
assert.equal(
  calls[1].p_bucket_key,
  expectedKey("landing_page", "email", "exhausted@example.invalid"),
);
console.log("PASS: email denial skips subsequent phone-counter call");

resetMocks([allowed(79), allowed(3), denied(75)]);
result = await checkLanding({
  email: "available@example.invalid",
  phone: "+12025550128",
});
assert.equal(result.allowed, false);
assert.equal(result.retryAfterSeconds, 75);
assert.equal(calls.length, 3);
console.log("PASS: phone denial propagates after allowed global and email checks");

resetMocks();
await assert.rejects(
  () => checkLanding({ email: " ", phone: " " }),
  /Contact details are required/,
);
assert.equal(calls.length, 0);
console.log("PASS: missing contacts reject before any counter RPC");

const webhookAccount = {
  source: "whatsapp",
  provider: "meta",
  accountId: "synthetic-test-account",
};

resetMocks([allowed(499), allowed(59)]);
result = await checkWebhook(webhookAccount);

assert.deepEqual(calls, [
  {
    p_scope: "webhook",
    p_bucket_key: expectedKey("webhook", "global", "all"),
    p_max_requests: 500,
    p_window_seconds: 60,
  },
  {
    p_scope: "webhook",
    p_bucket_key: expectedKey(
      "webhook",
      "account",
      JSON.stringify([
        webhookAccount.source,
        webhookAccount.provider,
        webhookAccount.accountId,
      ]),
    ),
    p_max_requests: 60,
    p_window_seconds: 60,
  },
]);

assert.notEqual(calls[0].p_bucket_key, landingGlobal.p_bucket_key);
assert.equal(result.allowed, true);
assert.equal(result.remaining, 59);
console.log("PASS: webhook parameters and scope-separated global bucket");

resetMocks([denied(20)]);
result = await checkWebhook(webhookAccount);
assert.equal(result.allowed, false);
assert.equal(calls.length, 1);
console.log("PASS: webhook global denial skips account-counter call");

resetMocks();
await assert.rejects(
  () => checkWebhook({ ...webhookAccount, source: "landing_page" }),
  /valid webhook account/,
);
assert.equal(calls.length, 0);
console.log("PASS: invalid webhook source rejects before counter RPC");

for (const secret of [undefined, "", "too-short"]) {
  resetMocks();
  if (secret === undefined) {
    delete testEnv.INQUIRY_RATE_LIMIT_SECRET;
  } else {
    testEnv.INQUIRY_RATE_LIMIT_SECRET = secret;
  }

  await assert.rejects(
    () => checkLanding({ email: "secret-test@example.invalid" }),
    /not configured/,
  );
  assert.equal(calls.length, 0);
}
console.log("PASS: missing or short rate secret fails before counter RPC");

resetMocks([
  { data: null, error: { code: "SYNTHETIC_RPC_ERROR" } },
]);
await assert.rejects(
  () => checkLanding({ email: "rpc-error@example.invalid" }),
  /temporarily unavailable/,
);
assert.equal(calls.length, 1);
assert.equal(logs.length, 1);
assert.equal(logs[0][0], "Inquiry rate-limit RPC failed");
assert.deepEqual(plain(logs[0][1]), { code: "SYNTHETIC_RPC_ERROR" });
assert.equal(JSON.stringify(logs).includes(TEST_SECRET), false);
console.log("PASS: global RPC error fails closed and logs only its code");

resetMocks([new Error("Synthetic transport failure")]);
await assert.rejects(
  () => checkLanding({ email: "transport@example.invalid" }),
  /Synthetic transport failure/,
);
assert.equal(calls.length, 1);
console.log("PASS: thrown global RPC failure stops contact-counter calls");

const malformedResponses = [
  null,
  [],
  {},
  { allowed: "true", remaining: 1, retryAfterSeconds: 0 },
  { allowed: true, remaining: -1, retryAfterSeconds: 0 },
  { allowed: true, remaining: 101, retryAfterSeconds: 0 },
  { allowed: true, remaining: 1.5, retryAfterSeconds: 0 },
  { allowed: true, remaining: 1, retryAfterSeconds: 5 },
  { allowed: false, remaining: 0, retryAfterSeconds: 0 },
  { allowed: false, remaining: 0, retryAfterSeconds: 1.5 },
];

for (const data of malformedResponses) {
  resetMocks([{ data, error: null }]);
  await assert.rejects(
    () => checkLanding({ email: "malformed@example.invalid" }),
    /Invalid inquiry rate-limit response/,
  );
  assert.equal(calls.length, 1);
}
console.log("PASS: malformed global responses reject before contact checks");

resetMocks([allowed(50), allowed(6)]);
await assert.rejects(
  () => checkLanding({ email: "contact-response@example.invalid" }),
  /Invalid inquiry rate-limit response/,
);
assert.equal(calls.length, 2);
console.log("PASS: contact remaining count is checked against its own ceiling");

console.log(
  "All local rate-limit helper wiring checks passed. RPC mocked; no network or real quota changes.",
);