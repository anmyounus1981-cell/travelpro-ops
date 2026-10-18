import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const ORIGIN =
  "https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app";
const RECOVERY_KEY = "travelpro:landing-inquiry-recovery:v1";
const TEST_NAME = "SYNTHETIC REJECTED CLEANUP TEST";
const ORIGINAL_NOTES = "Synthetic rejected cleanup test. Do not contact.";
const CORRECTED_NOTES =
  "Synthetic corrected inquiry after local cleanup. Do not contact.";

function loadConfig() {
  const bypass = process.env.TRAVELPRO_PREVIEW_BYPASS?.trim();
  assert.ok(bypass, "Missing TRAVELPRO_PREVIEW_BYPASS.");

  const url = new URL(ORIGIN);
  assert.equal(url.protocol, "https:");
  assert.equal(
    url.hostname,
    "travelpro-db0u20j5b-anmyounus1981-8496.vercel.app",
  );

  const windowMs = 15 * 60 * 1000;
  if (windowMs - (Date.now() % windowMs) < 120_000) {
    throw new Error("INCONCLUSIVE: insufficient fixed-window time.");
  }

  return {
    origin: url.origin,
    bypass,
    email: `rejected-cleanup-${randomUUID()}@example.invalid`,
  };
}

async function readFields(request) {
  const body = request.postDataBuffer();
  assert.ok(body);

  const data = await new Request(request.url(), {
    method: "POST",
    headers: request.headers(),
    body,
  }).formData();

  const result = {};
  for (const name of [
    "requestId",
    "contactName",
    "contactEmail",
    "departureDate",
    "notes",
  ]) {
    const matches = [...data.entries()].filter(
      ([key]) => key === name || key.endsWith(`_${name}`),
    );
    assert.equal(matches.length, 1);
    assert.equal(typeof matches[0][1], "string");
    result[name] = matches[0][1];
  }

  assert.match(
    result.requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  return result;
}

async function configureContext(context, config, observed) {
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

  context.on("request", (request) => {
    if (request.method() !== "GET") observed.nonGetRequests += 1;
  });

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

      let actionNumber = 0;

      if (request.method() !== "GET") {
        assert.ok(isAction, "Unexpected non-GET request blocked.");
        assert.ok(observed.forwardedActions < 2, "Extra action blocked.");

        const fields = await readFields(request);
        assert.equal(fields.contactName, TEST_NAME);
        assert.equal(fields.contactEmail, config.email);

        actionNumber = observed.forwardedActions + 1;

        if (actionNumber === 1) {
          assert.equal(fields.departureDate, "2020-01-01");
          assert.equal(fields.notes, ORIGINAL_NOTES);
          observed.firstFields = fields;
        } else {
          assert.equal(observed.allowCorrection, true);
          assert.equal(fields.departureDate, "");
          assert.equal(fields.notes, CORRECTED_NOTES);
          assert.notEqual(
            fields.requestId,
            observed.firstFields.requestId,
            "Correction reused the rejected request identity.",
          );
        }

        observed.forwardedActions += 1;
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

      if (isAction) {
        assert.equal(response.status(), 200);
        const text = await response.text();

        if (actionNumber === 1) {
          assert.match(text, /"success":false/);
          assert.match(text, /"outcome":"rejected"/);
          assert.match(text, /Check your inquiry details and travel dates/);
          observed.rejected = true;
          console.log("PASS: real action returned the expected validation rejection");
        } else {
          assert.match(text, /"success":true/);
          assert.match(text, /"outcome":"accepted"/);
          assert.match(text, /"duplicate":false/);
          const match = text.match(/"receiptId":"([0-9a-f-]{36})"/i);
          assert.ok(match);
          observed.receipt = match[1].toLowerCase();
          console.log(`Corrected inquiry receipt: ${observed.receipt}`);
        }
      }

      await route.fulfill({ response });
    } catch (error) {
      observed.routeError = error;
      await route.abort("failed").catch(() => {});
    }
  });

  await context.addInitScript(
    ({ origin, key }) => {
      if (location.origin !== origin) return;

      const originalRemove = Storage.prototype.removeItem;
      const control = { failRemoval: true, faults: 0 };

      Object.defineProperty(window, "__travelproRejectedCleanupTest", {
        value: control,
        configurable: false,
      });

      Storage.prototype.removeItem = function (name) {
        if (
          this === window.sessionStorage &&
          name === key &&
          control.failRemoval
        ) {
          control.faults += 1;
          throw new DOMException(
            "Synthetic rejected-attempt cleanup failure.",
            "SecurityError",
          );
        }
        return originalRemove.call(this, name);
      };
    },
    { origin: config.origin, key: RECOVERY_KEY },
  );
}

async function runTests() {
  const config = loadConfig();
  const browser = await chromium.launch({ headless: true });
  let context;

  const observed = {
    nonGetRequests: 0,
    forwardedActions: 0,
    firstFields: null,
    rejected: false,
    allowCorrection: false,
    receipt: null,
    routeError: null,
  };

  try {
    context = await browser.newContext({ serviceWorkers: "block" });
    await configureContext(context, config, observed);
    const page = await context.newPage();

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Owner sign in" }).waitFor();
    console.log("PASS: private Inbox requires owner authentication");

    await page.goto(`${config.origin}/inquire`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => {
      const button = document.querySelector('button[type="submit"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    });

    console.log(`Synthetic rejected-cleanup email: ${config.email}`);

    await page.locator("#serviceType").selectOption("consultation");
    await page.locator("#passengerCount").waitFor({ state: "hidden" });
    await page.locator("#contactName").fill(TEST_NAME);
    await page.locator("#contactEmail").fill(config.email);
    await page.locator("#departureDate").fill("2020-01-01");
    await page.locator("#notes").fill(ORIGINAL_NOTES);

    assert.equal(
      await page.locator("form").evaluate((form) => form.checkValidity()),
      true,
      "Browser validation would prevent reaching the Server Action.",
    );

    await page.getByRole("button", {
      name: "Submit Inquiry",
      exact: true,
    }).click();

    await page.getByRole("status").filter({
      hasText: "This attempt was rejected, but local recovery cleanup failed.",
    }).waitFor({ timeout: 30_000 });

    if (observed.routeError) throw observed.routeError;
    assert.equal(observed.rejected, true);

    const pausedButton = page.getByRole("button", {
      name: "Submission Paused",
      exact: true,
    });
    assert.equal(await pausedButton.isDisabled(), true);

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
        await page.locator(`#${id}`).isDisabled(),
        true,
        `Rejected cleanup left field editable: ${id}`,
      );
    }

    assert.equal(
      await page.locator("#departureDate").inputValue(),
      "2020-01-01",
    );
    assert.equal(await page.locator("#notes").inputValue(), ORIGINAL_NOTES);

    const pendingRaw = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      RECOVERY_KEY,
    );
    assert.ok(pendingRaw);
    assert.equal(JSON.parse(pendingRaw).state, "pending");

    const firstFaults = await page.evaluate(
      () => window.__travelproRejectedCleanupTest.faults,
    );
    assert.ok(firstFaults > 0);

    await page.locator("form").evaluate((form) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      }
    });

    const cleanupButton = page.getByRole("button", {
      name: "Retry Local Cleanup",
      exact: true,
    });

    await cleanupButton.click();
    await page.getByRole("status").filter({
      hasText: "Local cleanup is still incomplete.",
    }).waitFor();

    assert.equal(await pausedButton.isDisabled(), true);
    assert.equal(
      await page.evaluate(
        (key) => sessionStorage.getItem(key),
        RECOVERY_KEY,
      ),
      pendingRaw,
    );
    assert.ok(
      await page.evaluate(
        () => window.__travelproRejectedCleanupTest.faults,
      ) > firstFaults,
    );

    await page.waitForTimeout(1000);
    if (observed.routeError) throw observed.routeError;
    assert.equal(observed.nonGetRequests, 1);
    assert.equal(observed.forwardedActions, 1);

    console.log(
      "PASS: rejection cleanup failure retains details and blocks additional actions",
    );

    await page.evaluate(() => {
      window.__travelproRejectedCleanupTest.failRemoval = false;
    });
    await cleanupButton.click();

    await page.getByRole("status").filter({
      hasText: "Local recovery cleanup completed.",
    }).waitFor();

    assert.equal(
      await page.evaluate(
        (key) => sessionStorage.getItem(key),
        RECOVERY_KEY,
      ),
      null,
    );
    assert.equal(await page.locator("#departureDate").isDisabled(), false);
    assert.equal(await page.locator("#notes").isDisabled(), false);

    await page.waitForTimeout(1000);
    if (observed.routeError) throw observed.routeError;
    assert.equal(observed.nonGetRequests, 1);
    assert.equal(observed.forwardedActions, 1);

    console.log(
      "PASS: successful local cleanup unlocks editing without another action",
    );

    await page.locator("#departureDate").fill("");
    await page.locator("#notes").fill(CORRECTED_NOTES);

    observed.allowCorrection = true;

    await page.getByRole("button", {
      name: "Submit Inquiry",
      exact: true,
    }).click();

    await page.getByRole("status").filter({
      hasText: "Your inquiry was received successfully.",
    }).waitFor({ timeout: 30_000 });

    if (observed.routeError) throw observed.routeError;
    assert.ok(observed.receipt);
    assert.ok(
      (await page.getByRole("status").innerText()).includes(observed.receipt),
    );

    assert.equal(observed.nonGetRequests, 2);
    assert.equal(observed.forwardedActions, 2);
    assert.equal(
      await page.evaluate(
        (key) => sessionStorage.getItem(key),
        RECOVERY_KEY,
      ),
      null,
    );
    assert.equal(await page.locator("#contactName").inputValue(), "");

    console.log(
      "PASS: corrected submission uses a fresh request ID and receives acceptance",
    );

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Owner sign in" }).waitFor();

    if (observed.routeError) throw observed.routeError;
    assert.equal(observed.nonGetRequests, 2);
    assert.equal(observed.forwardedActions, 2);

    console.log("PASS: private Inbox remains protected");
    console.log(`Receipt for database verification: ${observed.receipt}`);
    console.log(`Email for database verification: ${config.email}`);
    console.log(
      "PASS: controlled rejection cleanup failure, local cleanup and correction.",
    );
    console.log(
      "Verify one database inquiry with the corrected notes and no departure separately.",
    );
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

runTests().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Rejected cleanup test failed.",
  );
  process.exitCode = 1;
});