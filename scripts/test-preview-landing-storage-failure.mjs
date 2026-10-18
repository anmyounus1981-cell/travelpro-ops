import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const ORIGIN =
  "https://travelpro-db0u20j5b-anmyounus1981-8496.vercel.app";
const RECOVERY_KEY = "travelpro:landing-inquiry-recovery:v1";
const TEST_NAME = "SYNTHETIC STORAGE FAILURE TEST";

function loadConfig() {
  const bypass = process.env.TRAVELPRO_PREVIEW_BYPASS?.trim();
  assert.ok(bypass, "Missing TRAVELPRO_PREVIEW_BYPASS.");

  const url = new URL(ORIGIN);
  assert.equal(url.protocol, "https:");
  assert.equal(
    url.hostname,
    "travelpro-db0u20j5b-anmyounus1981-8496.vercel.app",
  );

  return { origin: url.origin, bypass };
}

async function createTestContext(browser, config, mode) {
  const context = await browser.newContext({
    serviceWorkers: "block",
  });

  context.setDefaultTimeout(20_000);
  context.setDefaultNavigationTimeout(30_000);

  const observed = {
    nonGetRequests: 0,
    blockedRequests: 0,
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

      if (request.method() !== "GET") {
        observed.blockedRequests += 1;
        await route.abort("blockedbyclient");
        return;
      }

      if (url.origin !== config.origin) {
        await route.abort("blockedbyclient");
        return;
      }

      try {
        const response = await route.fetch({
          headers: {
            ...request.headers(),
            "x-vercel-protection-bypass": config.bypass,
          },
          maxRedirects: 0,
          maxRetries: 0,
          timeout: 20_000,
        });

        const location = response.headers().location;
        if (
          location &&
          new URL(location, request.url()).origin !== config.origin
        ) {
          throw new Error("External redirect blocked.");
        }

        await route.fulfill({ response });
      } catch (error) {
        observed.routeError = error;
        await route.abort("failed").catch(() => {});
      }
    });

    await context.addInitScript(
      ({ origin, key, initialMode }) => {
        if (location.origin !== origin) return;

        const originalGet = Storage.prototype.getItem;
        const originalSet = Storage.prototype.setItem;

        const control = {
          mode: initialMode,
          readFaults: 0,
          writeFaults: 0,
        };

        Object.defineProperty(window, "__travelproStorageTest", {
          value: control,
          configurable: false,
        });

        Storage.prototype.getItem = function (name) {
          if (
            this === window.sessionStorage &&
            name === key &&
            control.mode === "read"
          ) {
            control.readFaults += 1;
            throw new DOMException(
              "Synthetic storage read denial.",
              "SecurityError",
            );
          }

          return originalGet.call(this, name);
        };

        Storage.prototype.setItem = function (name, value) {
          if (this === window.sessionStorage && name === key) {
            if (control.mode === "write") {
              control.writeFaults += 1;
              throw new DOMException(
                "Synthetic storage write failure.",
                "QuotaExceededError",
              );
            }

            if (control.mode === "drop") {
              control.writeFaults += 1;
              return;
            }
          }

          return originalSet.call(this, name, value);
        };
      },
      {
        origin: config.origin,
        key: RECOVERY_KEY,
        initialMode: mode,
      },
    );

    return { context, observed };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function assertFormLocked(page) {
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
      `Field remained editable: ${id}`,
    );
  }

  assert.equal(
    await page.locator('button[type="submit"]').isDisabled(),
    true,
  );
}

async function dispatchRepeatedSubmits(page) {
  await page.locator("form").evaluate((form) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    }
  });
}

async function runScenario(browser, config, mode) {
  const { context, observed } = await createTestContext(
    browser,
    config,
    mode,
  );

  try {
    const page = await context.newPage();

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Owner sign in" }).waitFor();

    await page.goto(`${config.origin}/inquire`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Travel Inquiry" }).waitFor();

    if (mode === "read") {
      await page.getByRole("status").filter({
        hasText: "Browser recovery storage could not be accessed.",
      }).waitFor();

      await assertFormLocked(page);
      await dispatchRepeatedSubmits(page);

      const faults = await page.evaluate(
        () => window.__travelproStorageTest.readFaults,
      );
      assert.ok(faults > 0, "Read fault was not exercised.");
    } else {
      await page.waitForFunction(() => {
        const button = document.querySelector('button[type="submit"]');
        return button instanceof HTMLButtonElement && !button.disabled;
      });

      const email = `storage-${mode}-${randomUUID()}@example.invalid`;

      await page.locator("#serviceType").selectOption("consultation");
      await page.locator("#passengerCount").waitFor({ state: "hidden" });
      await page.locator("#contactName").fill(TEST_NAME);
      await page.locator("#contactEmail").fill(email);
      await page.locator("#notes").fill(
        "Synthetic browser storage failure test. Do not contact.",
      );

      assert.equal(
        await page.locator("form").evaluate((form) => form.checkValidity()),
        true,
        "Browser validation would prevent this test from reaching the handler.",
      );

      await page.getByRole("button", {
        name: "Submit Inquiry",
        exact: true,
      }).click();

      await page.getByRole("status").filter({
        hasText: "Recovery information could not be safely saved.",
      }).waitFor();

      await assertFormLocked(page);
      assert.equal(await page.locator("#contactEmail").inputValue(), email);

      const faults = await page.evaluate(
        () => window.__travelproStorageTest.writeFaults,
      );
      assert.ok(faults > 0, "Write fault was not exercised.");

      const saved = await page.evaluate(
        (key) => sessionStorage.getItem(key),
        RECOVERY_KEY,
      );
      assert.equal(saved, null);

      await dispatchRepeatedSubmits(page);
    }

    // Observe after both normal and programmatic submission attempts.
    await page.waitForTimeout(1000);
    if (observed.routeError) throw observed.routeError;

    assert.equal(
      observed.nonGetRequests,
      0,
      `Unexpected non-GET request in ${mode} scenario.`,
    );
    assert.equal(observed.blockedRequests, 0);

    if (mode === "read" || mode === "write") {
      await page.evaluate(() => {
        window.__travelproStorageTest.mode = "off";
      });

      await page.getByRole("button", {
        name: "Retry Local Recovery",
        exact: true,
      }).click();

      await page.waitForFunction(() => {
        const button = document.querySelector('button[type="submit"]');
        return button instanceof HTMLButtonElement && !button.disabled;
      });

      assert.equal(await page.locator("#contactName").isDisabled(), false);

      await page.waitForTimeout(1000);
      assert.equal(observed.nonGetRequests, 0);
      assert.equal(observed.blockedRequests, 0);
    }

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Owner sign in" }).waitFor();

    if (observed.routeError) throw observed.routeError;
    assert.equal(observed.nonGetRequests, 0);
    assert.equal(observed.blockedRequests, 0);

    console.log(
      `PASS: ${mode} fault exercised; form paused; zero non-GET requests`,
    );
    if (mode !== "drop") {
      console.log(
        `PASS: ${mode} local recovery re-enables the form without submission`,
      );
    }
    console.log(`PASS: ${mode} private Inbox protected before and after`);
  } finally {
    await context.close();
  }
}

async function runTests() {
  const config = loadConfig();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const mode of ["read", "write", "drop"]) {
      await runScenario(browser, config, mode);
    }

    console.log(
      "PASS: controlled storage read denial, write failure and ignored write.",
    );
    console.log(
      "Zero non-GET browser requests observed; no inquiry POST forwarded.",
    );
    console.log(
      "This test does not establish behaviour for every browser storage failure.",
    );
  } finally {
    await browser.close();
  }
}

runTests().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Storage failure test failed.",
  );
  process.exitCode = 1;
});