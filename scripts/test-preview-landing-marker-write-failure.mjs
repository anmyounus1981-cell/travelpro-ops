import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const ORIGIN =
  "https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app";
const RECOVERY_KEY = "travelpro:landing-inquiry-recovery:v1";
const TEST_NAME = "SYNTHETIC MARKER WRITE FAILURE TEST";

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
    email: `marker-write-failure-${randomUUID()}@example.invalid`,
  };
}

async function createTestContext(browser, config) {
  const context = await browser.newContext({
    serviceWorkers: "block",
  });

  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(30_000);

  const observed = {
    nonGetRequests: 0,
    forwardedActions: 0,
    receipt: null,
    routeError: null,
  };

  try {
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
      if (request.method() !== "GET") {
        observed.nonGetRequests += 1;
      }
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

        if (request.method() !== "GET") {
          assert.ok(isAction, "Unexpected non-GET request blocked.");
          assert.equal(
            observed.forwardedActions,
            0,
            "Additional action request blocked.",
          );

          const body = request.postDataBuffer();
          assert.ok(body, "Missing action body.");

          const fields = await new Request(request.url(), {
            method: "POST",
            headers: request.headers(),
            body,
          }).formData();

          for (const [name, expected] of [
            ["contactName", TEST_NAME],
            ["contactEmail", config.email],
          ]) {
            const matches = [...fields.entries()].filter(
              ([key]) => key === name || key.endsWith(`_${name}`),
            );

            assert.equal(matches.length, 1);
            assert.equal(matches[0][1], expected);
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

          assert.match(text, /"success":true/);
          assert.match(text, /"duplicate":false/);

          const match = text.match(
            /"receiptId":"([0-9a-f-]{36})"/i,
          );
          assert.ok(match, "Server acceptance receipt missing.");
          observed.receipt = match[1].toLowerCase();
          console.log(`Server accepted receipt: ${observed.receipt}`);
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

        const originalSet = Storage.prototype.setItem;
        const originalRemove = Storage.prototype.removeItem;
        const control = {
          failMarkerWrite: true,
          failRemoval: true,
          markerWriteFaults: 0,
          removalFaults: 0,
        };

        Object.defineProperty(window, "__travelproCleanupTest", {
          value: control,
          configurable: false,
        });
        Storage.prototype.setItem = function (name, value) {
          if (
            this === window.sessionStorage &&
            name === key &&
            control.failMarkerWrite
          ) {
            let record;

            try {
              record = JSON.parse(String(value));
            } catch {
              // Leave malformed-value handling to the original method.
            }

            if (record?.state === "accepted") {
              control.markerWriteFaults += 1;
              throw new DOMException(
                "Synthetic accepted marker write failure.",
                "QuotaExceededError",
              );
            }
          }

          return originalSet.call(this, name, value);
        };

        Storage.prototype.removeItem = function (name) {
          if (
            this === window.sessionStorage &&
            name === key &&
            control.failRemoval
          ) {
            control.removalFaults += 1;
            throw new DOMException(
              "Synthetic recovery cleanup failure.",
              "SecurityError",
            );
          }

          return originalRemove.call(this, name);
        };
      },
      { origin: config.origin, key: RECOVERY_KEY },
    );

    return { context, observed };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function runTests() {
  const config = loadConfig();
  const browser = await chromium.launch({ headless: true });
  let context;

  try {
    const setup = await createTestContext(browser, config);
    context = setup.context;
    const { observed } = setup;
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

    console.log(`Synthetic cleanup email: ${config.email}`);

    await page.locator("#serviceType").selectOption("consultation");
    await page.locator("#passengerCount").waitFor({ state: "hidden" });
    await page.locator("#contactName").fill(TEST_NAME);
    await page.locator("#contactEmail").fill(config.email);
    await page.locator("#notes").fill(
      "Synthetic accepted inquiry cleanup failure test. Do not contact.",
    );

    assert.equal(
      await page.locator("form").evaluate((form) => form.checkValidity()),
      true,
    );

    await page.getByRole("button", {
      name: "Submit Inquiry",
      exact: true,
    }).click();

    const status = page.getByRole("status").filter({
      hasText: "Your inquiry is confirmed, but local recovery cleanup failed.",
    });
    await status.waitFor({ timeout: 30_000 });

    if (observed.routeError) throw observed.routeError;
    assert.ok(observed.receipt);
    assert.ok((await status.innerText()).includes(observed.receipt));

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
        `Cleanup failure left field editable: ${id}`,
      );
    }

    assert.equal(await page.locator("#contactName").inputValue(), "");
    assert.equal(await page.locator("#contactEmail").inputValue(), "");

    const stored = await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key)),
      RECOVERY_KEY,
    );

    assert.ok(stored);
    assert.equal(stored.state, "pending");
    assert.equal(stored.snapshot.contactName, TEST_NAME);
    assert.equal(stored.snapshot.contactEmail, config.email);
    assert.equal("receiptId" in stored, false);

    const markerFaults = await page.evaluate(
      () => window.__travelproCleanupTest.markerWriteFaults,
    );
    assert.ok(markerFaults > 0, "Accepted marker write fault was not exercised.");

    const firstFaults = await page.evaluate(
      () => window.__travelproCleanupTest.removalFaults,
    );
    assert.ok(firstFaults > 0, "Cleanup fault was not exercised.");

    console.log(
      "PASS: confirmed receipt remains visible while cleanup failure pauses submission",
    );
    console.log(
      "PASS: accepted marker write failure leaves the pending snapshot while receipt remains visible",
    );

    // Repeated submit events must not dispatch another action.
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

    // Retry while the fault remains active.
    await cleanupButton.click();
    await page.getByRole("status").filter({
      hasText: "Local cleanup is still incomplete.",
    }).waitFor();

    assert.equal(await pausedButton.isDisabled(), true);

    const retryFaults = await page.evaluate(
      () => window.__travelproCleanupTest.removalFaults,
    );
    assert.ok(retryFaults > firstFaults);
    assert.equal(
      await page.evaluate(
        (key) => sessionStorage.getItem(key),
        RECOVERY_KEY,
      ),
      JSON.stringify(stored),
    );

    await page.waitForTimeout(1000);
    if (observed.routeError) throw observed.routeError;
    assert.equal(observed.nonGetRequests, 1);
    assert.equal(observed.forwardedActions, 1);

    console.log(
      "PASS: failed local cleanup retry and repeated submits produce no extra action",
    );

    // Restore removal and retry local cleanup without resubmitting.
    await page.evaluate(() => {
      window.__travelproCleanupTest.failRemoval = false;
    });

    await cleanupButton.click();
    await page.getByRole("status").filter({
      hasText: "Local recovery cleanup completed.",
    }).waitFor();

    assert.ok(
      (await page.getByRole("status").innerText()).includes(observed.receipt),
    );
    assert.equal(
      await page.evaluate(
        (key) => sessionStorage.getItem(key),
        RECOVERY_KEY,
      ),
      null,
    );

    assert.equal(
      await page.getByRole("button", {
        name: "Submit Inquiry",
        exact: true,
      }).isEnabled(),
      true,
    );
    assert.equal(await page.locator("#contactName").isDisabled(), false);

    await page.waitForTimeout(1000);
    if (observed.routeError) throw observed.routeError;
    assert.equal(observed.nonGetRequests, 1);
    assert.equal(observed.forwardedActions, 1);

    console.log(
      "PASS: successful local cleanup preserves receipt and unlocks without another action",
    );

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Owner sign in" }).waitFor();

    if (observed.routeError) throw observed.routeError;
    assert.equal(observed.nonGetRequests, 1);
    assert.equal(observed.forwardedActions, 1);

    console.log("PASS: private Inbox remains protected");
    console.log(`Receipt for database verification: ${observed.receipt}`);
    console.log(`Email for database verification: ${config.email}`);
    console.log(
      "PASS: accepted marker write and fallback removal failures recover through local cleanup.",
    );
    console.log("Verify exactly one matching database inquiry separately.");
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

runTests().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Cleanup failure test failed.",
  );
  process.exitCode = 1;
});