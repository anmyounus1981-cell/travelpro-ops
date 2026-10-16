import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const ORIGIN =
  "https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app";
const TEST_NAME = "SYNTHETIC STICKY RECOVERY TEST";
const NOTES = "Synthetic sticky recovery test. Do not contact.";

function loadConfig() {
  const bypass = process.env.TRAVELPRO_PREVIEW_BYPASS?.trim();
  assert.ok(bypass, "Missing TRAVELPRO_PREVIEW_BYPASS.");

  const url = new URL(ORIGIN);
  assert.equal(url.protocol, "https:");
  assert.equal(
    url.hostname,
    "travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app",
  );

  return {
    origin: url.origin,
    bypass,
    email: `sticky-recovery-${randomUUID()}@example.invalid`,
  };
}

async function actionFields(request) {
  const body = request.postDataBuffer();
  assert.ok(body, "Action body is missing.");

  const data = await new Request(request.url(), {
    method: "POST",
    headers: request.headers(),
    body,
  }).formData();

  const fields = {};
  for (const name of [
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
  ]) {
    const matches = Array.from(data.entries()).filter(
      ([key]) => key === name || key.endsWith(`_${name}`),
    );
    assert.equal(matches.length, 1, `Missing or repeated field: ${name}`);
    assert.equal(typeof matches[0][1], "string");
    fields[name] = matches[0][1];
  }

  assert.match(
    fields.requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  return fields;
}

async function assertFieldsLocked(page) {
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
      `Field unexpectedly editable: ${id}`,
    );
  }
}

async function runTests() {
  const config = loadConfig();
  const browser = await chromium.launch({ headless: true });
  const calls = [];
  let receipt = null;
  let routeError = null;

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
        let controlledBody = null;
    let actionContentType = null;

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

        let actionNumber = 0;

        if (isAction) {
          assert.ok(!routeError, "An earlier route failed.");
          const fields = await actionFields(request);
          calls.push(fields);
          actionNumber = calls.length;

          assert.ok(actionNumber <= 3, "More than three action requests.");
          assert.equal(fields.contactName, TEST_NAME);
          assert.equal(fields.contactEmail, config.email);
          assert.equal(fields.notes, NOTES);

          if (actionNumber > 1) {
            assert.deepEqual(
              fields,
              calls[0],
              "Retry changed request ID or submitted details.",
            );
          }

          if (actionNumber === 2) {
            assert.ok(controlledBody, "Controlled response is unavailable.");

            // Browser-only rejection. Do not forward this attempt.
            await route.fulfill({
              status: 200,
              headers: {
                "content-type": actionContentType,
                "cache-control": "no-store",
              },
              body: controlledBody,
            });
            return;
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

        if (isAction && actionNumber === 1) {
          assert.equal(response.status(), 200);
          actionContentType = response.headers()["content-type"];
          assert.match(actionContentType ?? "", /text\/x-component/i);

          const body = await response.text();
          let replacements = 0;

          const lines = body.split("\n").map((line) => {
            const match = line.match(/^([0-9a-f]+:)(.*)$/i);
            if (!match) return line;

            let value;
            try {
              value = JSON.parse(match[2]);
            } catch {
              return line;
            }

            if (
              !value ||
              typeof value !== "object" ||
              value.success !== true ||
              value.outcome !== "accepted" ||
              value.duplicate !== false ||
              typeof value.receiptId !== "string"
            ) {
              return line;
            }

            assert.match(
              value.receiptId,
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            );

            receipt = value.receiptId.toLowerCase();
            replacements += 1;

            return match[1] + JSON.stringify({
              success: false,
              outcome: "rejected",
              message: "Too many attempts. Try again in 30 seconds.",
              receiptId: null,
              duplicate: false,
            });
          });

          if (receipt) {
            console.log(`First server accepted receipt: ${receipt}`);
          }

          assert.equal(
            replacements,
            1,
            "Unsupported action response format; stop without rerunning.",
          );

          controlledBody = lines.join("\n");

          // The server accepted it, but the browser receives no receipt.
          await route.abort("failed");
          return;
        }

        await route.fulfill({ response });
      } catch (error) {
        routeError = error;
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

    console.log(`Synthetic test email: ${config.email}`);

    await page.locator("#serviceType").selectOption("consultation");
    await page.locator("#passengerCount").waitFor({ state: "hidden" });
    await page.locator("#contactName").fill(TEST_NAME);
    await page.locator("#contactEmail").fill(config.email);
    await page.locator("#notes").fill(NOTES);

    await page.getByRole("button", {
      name: "Submit Inquiry",
      exact: true,
    }).click();

    await page.getByRole("status").filter({
      hasText: "Unable to confirm receipt. Your details are locked",
    }).waitFor({ timeout: 40_000 });

    if (routeError) throw routeError;
    assert.ok(receipt);
    assert.equal(calls.length, 1);
    await assertFieldsLocked(page);

    const retryButton = page.getByRole("button", {
      name: "Retry Same Inquiry",
      exact: true,
    });

    assert.equal(await retryButton.isEnabled(), true);
    console.log("PASS: lost response leaves fields locked with retry available");

    await retryButton.click();

    await page.getByRole("status").filter({
      hasText:
        "Too many attempts. Try again in 30 seconds. " +
        "An earlier attempt is still unconfirmed.",
    }).waitFor({ timeout: 30_000 });

    if (routeError) throw routeError;
    assert.equal(calls.length, 2);
    await assertFieldsLocked(page);
    assert.equal(await retryButton.isEnabled(), true);
    assert.equal(
      await page.locator("#contactName").inputValue(),
      TEST_NAME,
    );
    assert.equal(
      await page.locator("#contactEmail").inputValue(),
      config.email,
    );
    assert.equal(await page.locator("#notes").inputValue(), NOTES);

    console.log(
      "PASS: controlled rejection after uncertainty keeps fields locked",
    );

    // Controlled rejection did not consume real server quota.
    // Retry the original accepted inquiry through the real action.
    await retryButton.click();

    await page.getByRole("status").filter({
      hasText: `Your inquiry was already received. Reference: ${receipt}`,
    }).waitFor({ timeout: 40_000 });

    if (routeError) throw routeError;
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[1], calls[0]);
    assert.deepEqual(calls[2], calls[0]);

    await page.waitForFunction(() => {
      const name = document.querySelector("#contactName");
      const button = document.querySelector('button[type="submit"]');

      return (
        name instanceof HTMLInputElement &&
        name.value === "" &&
        !name.disabled &&
        button instanceof HTMLButtonElement &&
        !button.disabled &&
        button.textContent?.trim() === "Submit Inquiry"
      );
    });

    console.log("PASS: both retries preserve request ID and all fields");
    console.log("PASS: real duplicate receipt matches first acceptance");
    console.log("PASS: confirmed acceptance resets and unlocks the form");

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Owner sign in" }).waitFor();

    if (routeError) throw routeError;

    console.log("PASS: private Inbox remains protected");
    console.log(`Receipt for database verification: ${receipt}`);
    console.log(`Email for database verification: ${config.email}`);
    console.log(
      "PASS: browser sticky recovery with controlled rejection. " +
        "This does not verify real rate-limit enforcement.",
    );
    console.log("Verify exactly one matching database inquiry separately.");
  } finally {
    await browser.close();
  }
}

runTests().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Sticky recovery test failed.",
  );
  process.exitCode = 1;
});