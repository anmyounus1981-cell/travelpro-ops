import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const PREVIEW_ORIGIN =
  "https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app";

const TEST_NAME = "SYNTHETIC LANDING RETRY TEST";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function bounded(promise, label, milliseconds = 30_000) {
  let timer;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timeout: ${label}`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function loadConfig() {
  const bypass = process.env.TRAVELPRO_PREVIEW_BYPASS?.trim();

  if (!bypass) {
    throw new Error("Missing TRAVELPRO_PREVIEW_BYPASS.");
  }

  const origin = new URL(PREVIEW_ORIGIN);
  assert.equal(origin.protocol, "https:");
    assert.equal(
    origin.hostname,
    "travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app",
  );

  // Retries consume quota. Avoid beginning near a fixed-window boundary.
  const windowMs = 15 * 60 * 1000;
  if (windowMs - (Date.now() % windowMs) < 120_000) {
    throw new Error("INCONCLUSIVE: insufficient fixed-window time.");
  }

  return {
    origin: origin.origin,
    bypass,
    email: `landing-retry-${randomUUID()}@example.invalid`,
  };
}

async function readActionFields(request) {
  const body = request.postDataBuffer();
  assert.ok(body, "Server Action request has no body.");

  const parsed = await new Request(request.url(), {
    method: "POST",
    headers: request.headers(),
    body,
  }).formData();

  const fields = {};
  const names = [
    "requestId",
    "clientType",
    "serviceType",
    "corporateClient",
    "contactName",
    "contactEmail",
    "contactPhone",
    "origin",
    "destination",
    "departureDate",
    "returnDate",
    "passengerCount",
    "cabinClass",
    "notes",
    "website",
  ];

  for (const name of names) {
    const matches = Array.from(parsed.entries()).filter(
      ([key]) => key === name || key.endsWith(`_${name}`),
    );

    assert.equal(
      matches.length,
      1,
      `Expected one serialized action field: ${name}`,
    );
    assert.equal(typeof matches[0][1], "string");
    fields[name] = matches[0][1];
  }

  assert.match(
    fields.requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );

  return fields;
}

async function runTests() {
  const config = loadConfig();
  const browser = await chromium.launch({ headless: true });
  const firstIntercepted = deferred();
  const releaseFirstRequest = deferred();
  const firstProcessed = deferred();

  let actionRequests = 0;
  let firstFields = null;
  let retryFields = null;
  let serverReceipt = null;
  let routeError = null;
    let stopping = false;

  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
    });

    context.setDefaultTimeout(20_000);
    context.setDefaultNavigationTimeout(30_000);

    const setup = await context.request.get(
      `${config.origin}/api/health`,
      {
        headers: {
          "x-vercel-protection-bypass": config.bypass,
          "x-vercel-set-bypass-cookie": "true",
        },
        maxRedirects: 0,
        timeout: 20_000,
      },
    );

    assert.ok([200, 302, 303, 307, 308].includes(setup.status()));
    await setup.dispose();

    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.origin !== config.origin) {
        await route.abort("blockedbyclient");
        return;
      }

      try {
        const isAction =
          request.method() === "POST" &&
          url.pathname === "/inquire" &&
          Boolean(request.headers()["next-action"]);

        if (request.method() !== "GET" && !isAction) {
          throw new Error("Unexpected non-GET request blocked.");
        }

        if (isAction) {
          actionRequests += 1;
          assert.ok(actionRequests <= 2, "More than two action requests.");

          const fields = await readActionFields(request);
          assert.equal(fields.contactName, TEST_NAME);
          assert.equal(fields.contactEmail, config.email);

          if (actionRequests === 1) {
            firstFields = fields;
            firstIntercepted.resolve();
            await bounded(
              releaseFirstRequest.promise,
              "release first request",
              20_000,
            );
        if (stopping) {
              await route.abort("blockedbyclient");
              return;
            }
          } else {
            retryFields = fields;
            assert.deepEqual(
              retryFields,
              firstFields,
              "Retry changed request ID or submitted details.",
            );
          }
        }

        const response = await route.fetch({
          headers: {
            ...request.headers(),
            "x-vercel-protection-bypass": config.bypass,
          },
          maxRedirects: 0,
          maxRetries: 0,
          timeout: 30_000,
        });

        const location = response.headers().location;
        if (
          location &&
          new URL(location, request.url()).origin !== config.origin
        ) {
          throw new Error("External redirect blocked.");
        }

        if (isAction && actionRequests === 1) {
          assert.equal(response.status(), 200);
          const responseText = await response.text();

          assert.match(responseText, /"success":true/);
          assert.match(responseText, /"duplicate":false/);

          const receipt = responseText.match(
            /"receiptId":"([0-9a-f-]{36})"/i,
          );
          assert.ok(receipt, "First server response has no receipt.");
          serverReceipt = receipt[1].toLowerCase();

          // Server accepted the inquiry; simulate losing its response.
          await route.abort("failed");
          firstProcessed.resolve();
          return;
        }

        await route.fulfill({ response });
      } catch (error) {
        routeError = error;
        firstIntercepted.resolve();
        firstProcessed.resolve();
        await route.abort("failed").catch(() => {});
      }
    });

    const page = await context.newPage();

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Owner sign in" }).waitFor();
    console.log("PASS: private Inbox requires owner authentication");

    await page.goto(`${config.origin}/inquire`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Travel Inquiry" }).waitFor();

    console.log(`Synthetic retry email: ${config.email}`);

        await page.locator("#serviceType").selectOption("consultation");
    await page.locator("#passengerCount").waitFor({ state: "hidden" });

    await page.locator("#contactName").fill(TEST_NAME);
    await page.locator("#contactEmail").fill(config.email);
    await page.locator("#notes").fill(
      "Synthetic lost-response retry test. Do not contact.",
    );

    await page.getByRole("button", {
      name: "Submit Inquiry",
      exact: true,
    }).click();

    await bounded(firstIntercepted.promise, "first action interception");
    if (routeError) throw routeError;
    assert.equal(actionRequests, 1);
    assert.ok(firstFields);

    await page.getByRole("button", {
      name: "Submitting...",
      exact: true,
    }).waitFor();

    const lockedFields = [
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
    ];

    for (const id of lockedFields) {
      assert.equal(
        await page.locator(`#${id}`).isDisabled(),
        true,
        `Field remained editable during submission: ${id}`,
      );
    }

    assert.equal(
      await page.locator('button[type="submit"]').isDisabled(),
      true,
    );
    console.log("PASS: visible consultation fields and submit button locked");

    // Exercise handler re-entry while its first request is held.
    await page.locator("form").evaluate((form) => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    assert.equal(actionRequests, 1);
    releaseFirstRequest.resolve();

    await bounded(firstProcessed.promise, "first server acceptance");
    if (routeError) throw routeError;
    assert.ok(serverReceipt);
    console.log(`First server accepted receipt: ${serverReceipt}`);

    await page.getByRole("status").filter({
      hasText: "Unable to confirm receipt. Your details are locked to prevent changes.",
    }).waitFor();

    await page.getByRole("button", {
      name: "Retry Same Inquiry",
      exact: true,
    }).waitFor();

    assert.equal(await page.locator("#contactName").inputValue(), TEST_NAME);
    assert.equal(
      await page.locator("#contactEmail").inputValue(),
      config.email,
    );
    assert.equal(actionRequests, 1);
    console.log("PASS: lost response retains form details and shows safe retry");
        for (const id of lockedFields) {
      assert.equal(
        await page.locator(`#${id}`).isDisabled(),
        true,
        `Field became editable after an unknown outcome: ${id}`,
      );
    }

    assert.equal(
      await page.getByRole("button", {
        name: "Retry Same Inquiry",
        exact: true,
      }).isEnabled(),
      true,
      "Unchanged retry must remain available.",
    );

    console.log(
      "PASS: unknown outcome keeps fields locked and unchanged retry available",
    );

    await page.getByRole("button", {
      name: "Retry Same Inquiry",
      exact: true,
    }).click();

    await page.getByRole("status").filter({
      hasText:
        `Your inquiry was already received. Reference: ${serverReceipt}`,
    }).waitFor({ timeout: 30_000 });

    if (routeError) throw routeError;

    assert.equal(actionRequests, 2);
    assert.ok(retryFields);
    assert.deepEqual(retryFields, firstFields);

    await page.waitForFunction(
      () => {
        const name = document.querySelector("#contactName");
        const button = document.querySelector('button[type="submit"]');
        return (
          name instanceof HTMLInputElement &&
          name.value === "" &&
          button instanceof HTMLButtonElement &&
          !button.disabled
        );
      },
      undefined,
      { timeout: 20_000 },
    );

    console.log("PASS: retry retains request ID and all submitted fields");
    console.log("PASS: duplicate receipt matches original server acceptance");
    console.log("PASS: successful retry resets the form");
    console.log("PASS: repeated in-flight submits created no extra action requests");

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Owner sign in" }).waitFor();
    console.log("PASS: private Inbox remains protected");

    console.log(`Receipt for database verification: ${serverReceipt}`);
    console.log(`Email for database verification: ${config.email}`);
    console.log(
      "PASS: controlled lost-response retry flow. Verify exactly one database inquiry separately.",
    );
    } finally {
    stopping = true;
    releaseFirstRequest.resolve();
    await browser.close();
  }
}

runTests().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Landing retry test failed.",
  );
  process.exitCode = 1;
});