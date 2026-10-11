import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const secret = randomBytes(32).toString("hex");

const allowedAccounts = [
  {
    source: "whatsapp",
    provider: "meta",
    accountId: "synthetic-test-account",
  },
];

async function getAvailablePort() {
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const port = address.port;

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  return port;
}

function signedHeaders(body, timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("hex");

  return {
    "Content-Type": "application/json",
    "X-Inquiry-Timestamp": timestamp,
    "X-Inquiry-Signature": `sha256=${signature}`,
  };
}
async function startTestServer(port) {
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        INQUIRY_WEBHOOK_SECRET: secret,
        INQUIRY_WEBHOOK_ALLOWED_ACCOUNTS: JSON.stringify(allowedAccounts),
        SUPABASE_SECRET_KEY: "",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );

  let startupError;
  child.on("error", (error) => {
    startupError = error;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;

  try {
    while (Date.now() < deadline) {
      if (startupError) throw startupError;

      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error("Local test server exited during startup.");
      }

      try {
        await fetch(`${baseUrl}/api/health`, {
          signal: AbortSignal.timeout(1000),
        });

        return { child, baseUrl };
      } catch {
        await delay(250);
      }
    }

    throw new Error("Local test server did not start within 30 seconds.");
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function expectStatus(baseUrl, label, body, headers, expectedStatus) {
  const response = await fetch(`${baseUrl}/api/webhooks/inquiries`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10000),
  });

  assert.equal(
    response.status,
    expectedStatus,
    `${label}: expected ${expectedStatus}, received ${response.status}`,
  );

  console.log(`PASS: ${label}`);
}
async function runTests() {
  const port = await getAvailablePort();
  const { child, baseUrl } = await startTestServer(port);

  const body = JSON.stringify({
    version: 1,
    requestId: "11111111-1111-4111-8111-111111111111",
    source: "whatsapp",
    provider: "meta",
    providerAccountId: "synthetic-test-account",
    sourceMessageId: "synthetic-event-1",
    clientType: "individual",
    serviceType: "consultation",
    contact: {
      name: "SYNTHETIC WEBHOOK TEST",
      email: "webhook@example.invalid",
    },
    rawMessage: "Synthetic webhook test",
  });

  try {
    await expectStatus(
      baseUrl, "missing signature", body,
      { "Content-Type": "application/json" }, 401,
    );

    await expectStatus(
      baseUrl, "incorrect signature", body,
      {
        ...signedHeaders(body),
        "X-Inquiry-Signature": `sha256=${"0".repeat(64)}`,
      }, 401,
    );

    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
    await expectStatus(
      baseUrl, "expired timestamp", body,
      signedHeaders(body, staleTimestamp), 401,
    );

    await expectStatus(
      baseUrl, "tampered body", `${body} `,
      signedHeaders(body), 401,
    );

    const unauthorizedBody = body.replace(
      "synthetic-test-account", "unauthorized-account",
    );
    await expectStatus(
      baseUrl, "unauthorized account", unauthorizedBody,
      signedHeaders(unauthorizedBody), 403,
    );

    await expectStatus(
      baseUrl, "invalid JSON", "{",
      signedHeaders("{"), 400,
    );

    const oversizedBody = "x".repeat(64 * 1024 + 1);
    await expectStatus(
      baseUrl, "oversized body", oversizedBody,
      signedHeaders(oversizedBody), 413,
    );

    await expectStatus(
      baseUrl, "unsupported content type", body,
      { ...signedHeaders(body), "Content-Type": "text/plain" }, 415,
    );

    await expectStatus(
      baseUrl, "valid authentication reaches disabled database client", body,
      signedHeaders(body), 503,
    );

    console.log("All local webhook checks passed. No intake database writes.");
  } finally {
    child.kill();
  }
}

runTests().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});