import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing test configuration: ${name}`);
  }

  return value;
}

function loadConfig() {
  const endpoint = new URL(requiredEnv("TRAVELPRO_RATE_TEST_URL"));

  if (
    endpoint.protocol !== "https:" ||
    !endpoint.hostname.endsWith(".vercel.app") ||
    endpoint.hostname === "travelpro-ops.vercel.app" ||
    endpoint.pathname !== "/api/webhooks/inquiries"
  ) {
    throw new Error("Use the intended protected Preview webhook URL.");
  }

  const body = requiredEnv("TRAVELPRO_RATE_TEST_BODY");
  const payload = JSON.parse(body);

  if (
    payload.source !== "whatsapp" ||
    payload.provider !== "meta" ||
    payload.providerAccountId !== "synthetic-test-account" ||
    payload.contact?.name !== "SYNTHETIC RATE LIMIT TEST"
  ) {
    throw new Error("Only the prepared synthetic account payload is allowed.");
  }

  const secret = requiredEnv("TRAVELPRO_WEBHOOK_TEST_SECRET");

  if (!/^[0-9a-f]{64}$/.test(secret)) {
    throw new Error("Webhook test secret has an invalid format.");
  }

  return {
    endpoint: endpoint.toString(),
    body,
    secret,
    bypass: requiredEnv("TRAVELPRO_PREVIEW_BYPASS"),
    expectedId: requiredEnv("TRAVELPRO_RATE_TEST_RECEIPT_ID"),
  };
}
async function sendRetry(config) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", config.secret)
    .update(timestamp)
    .update(".")
    .update(config.body)
    .digest("hex");

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-protection-bypass": config.bypass,
      "x-inquiry-timestamp": timestamp,
      "x-inquiry-signature": `sha256=${signature}`,
    },
    body: config.body,
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });

  const result = await response.json();

  if (response.status === 200) {
    assert.equal(result.id, config.expectedId, "Retry changed inquiry ID.");
    assert.equal(result.status, "accepted");
    assert.equal(result.duplicate, true, "Retry was not recognized.");

    return { status: 200 };
  }

  if (response.status === 429) {
    assert.equal(
      result.error,
      "Too many inquiry requests. Try again later.",
    );

    const retryAfter = response.headers.get("retry-after");

    assert.match(retryAfter ?? "", /^[0-9]+$/);
    assert.ok(
      Number(retryAfter) >= 1 && Number(retryAfter) <= 60,
      "Invalid Retry-After value.",
    );

    return { status: 429 };
  }

  throw new Error(
    `Unexpected HTTP status ${response.status}; rate test did not pass.`,
  );
}
async function runTests() {
  const config = loadConfig();

  // Start in a fresh minute so earlier requests do not consume this quota.
  const startAt = (Math.floor(Date.now() / 60000) + 1) * 60000 + 1000;

  console.log("Waiting for a fresh minute window; keep this terminal open.");

  while (Date.now() < startAt) {
    await delay(Math.min(1000, startAt - Date.now()));
  }

  const windowNumber = Math.floor(Date.now() / 60000);
  const results = [];
  let nextRequest = 0;

  console.log("Sending 65 retries with 10 concurrent workers.");

  const workers = Array.from({ length: 10 }, async () => {
    while (nextRequest < 65) {
      const requestNumber = nextRequest++;
      results[requestNumber] = await sendRetry(config);
    }
  });

  const outcomes = await Promise.allSettled(workers);

  if (Math.floor(Date.now() / 60000) !== windowNumber) {
    throw new Error(
      "INCONCLUSIVE: requests crossed a minute boundary; no pass recorded.",
    );
  }

  const failedWorker = outcomes.find((outcome) => outcome.status === "rejected");

  if (failedWorker) {
    throw failedWorker.reason;
  }

  assert.equal(results.length, 65, "Not all requests completed.");

  const accepted = results.filter((result) => result.status === 200).length;
  const limited = results.filter((result) => result.status === 429).length;

  console.log(`Accepted duplicate retries: ${accepted}`);
  console.log(`Rate-limited responses: ${limited}`);

  assert.equal(accepted, 60, "Expected exactly 60 allowed account requests.");
  assert.equal(limited, 5, "Expected exactly five rate-limited responses.");

  console.log(
    "PASS: concurrent account limit, Retry-After and unchanged inquiry receipt.",
  );
}

runTests().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});