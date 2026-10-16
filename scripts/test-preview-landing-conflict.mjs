import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const ORIGIN =
  "https://travelpro-ohpsra6jm-anmyounus1981-8496.vercel.app";
const TEST_NAME = "SYNTHETIC LANDING CONFLICT TEST";
const NOTES = "Synthetic conflict guard test. Do not contact.";

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
    email: `landing-conflict-${randomUUID()}@example.invalid`,
  };
}

async function readAction(request) {
  const body = request.postDataBuffer();
  assert.ok(body, "Action body is missing.");

  const data = await new Request(request.url(), {
    method: "POST",
    headers: request.headers(),
    body,
  }).formData();

  const fields = {};
  const keys = {};

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
    keys[name] = matches[0][0];
    fields[name] = matches[0][1];
  }

  assert.match(
    fields.requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );

  return { data, fields, keys };
}

async function assertLocked(page) {
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

        const headers = {
          ...request.headers(),
          "x-vercel-protection-bypass": config.bypass,
        };

        let actionNumber = 0;
        let postData;

        if (isAction) {
          assert.ok(!routeError, "An earlier route failed.");

          actionNumber = calls.length + 1;
          assert.ok(actionNumber <= 2, "Additional action request blocked.");

          // Reserve this request before asynchronous body parsing.
          calls.push(null);

          const parsed = await readAction(request);
          calls[actionNumber - 1] = parsed.fields;

          assert.equal(parsed.fields.contactName, TEST_NAME);
          assert.equal(parsed.fields.contactEmail, config.email);
          assert.equal(parsed.fields.notes, NOTES);

          if (actionNumber === 2) {
            assert.deepEqual(
              parsed.fields,
              calls[0],
              "Browser retry changed request ID or form details.",
            );

            // Deliberately change only the forwarded test payload.
            // Preserve the original request ID and serializer metadata.
            parsed.data.set(
              parsed.keys.notes,
              "Synthetic deliberately conflicting notes. Do not contact.",
            );

            const encoded = new Request(request.url(), {
              method: "POST",
              body: parsed.data,
            });

            headers["content-type"] =
              encoded.headers.get("content-type");
            delete headers["content-length"];

            postData = Buffer.from(await encoded.arrayBuffer());
          }
        }

        const response = await route.fetch({
          headers,
          ...(postData === undefined ? {} : { postData }),
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
          assert.match(
            response.headers()["content-type"] ?? "",
            /text\/x-component/i,
          );

          const text = await response.text();
          const results = [];

          for (const line of text.split("\n")) {
            const match = line.match(/^[0-9a-f]+:(.*)$/i);
            if (!match) continue;

            let value;
            try {
              value = JSON.parse(match[1]);
            } catch {
              continue;
            }

            if (
              value &&
              typeof value === "object" &&
              typeof value.success === "boolean" &&
              typeof value.outcome === "string"
            ) {
              results.push(value);
            }
          }

          assert.equal(
            results.length,
            1,
            "Unsupported action response format; stop without rerunning.",
          );

          const result = results[0];

          if (actionNumber === 1) {
            assert.equal(result.success, true);
            assert.equal(result.outcome, "accepted");
            assert.equal(result.duplicate, false);
            assert.match(
              result.receiptId ?? "",
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            );

            receipt = result.receiptId.toLowerCase();
            console.log(`First server accepted receipt: ${receipt}`);

            await route.abort("failed");
            return;
          }

          assert.equal(result.success, false);
          assert.equal(result.outcome, "conflict");
          assert.equal(result.receiptId, null);
          assert.match(result.message, /already used with different details/);

          console.log(
            "PASS: real action returned conflict for the altered test payload",
          );
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
    await assertLocked(page);

    await page.getByRole("button", {
      name: "Retry Same Inquiry",
      exact: true,
    }).click();

    await page.getByRole("status").filter({
      hasText: "This submission reference conflicts with existing details.",
    }).waitFor({ timeout: 40_000 });

    if (routeError) throw routeError;
    assert.equal(calls.length, 2);
    await assertLocked(page);

    const contactButton = page.getByRole("button", {
        name: "Submission Paused",
      exact: true,
    });

    assert.equal(await contactButton.isDisabled(), true);
        const supportLink = page.getByRole("link", {
      name: "WhatsApp Support: +880 1842737654 (opens in a new tab)",
      exact: true,
    });

    assert.equal(await supportLink.isVisible(), true);

    const supportHref = await supportLink.getAttribute("href");
    assert.equal(supportHref, "https://wa.me/8801842737654");

    const supportUrl = new URL(supportHref);
    assert.equal(supportUrl.search, "");
    assert.equal(supportUrl.hash, "");

    assert.equal(await supportLink.getAttribute("target"), "_blank");
    assert.equal(
      await supportLink.getAttribute("referrerpolicy"),
      "no-referrer",
    );

    const supportRel =
      (await supportLink.getAttribute("rel"))?.split(/\s+/) ?? [];

    assert.ok(supportRel.includes("noopener"));
    assert.ok(supportRel.includes("noreferrer"));

    console.log(
      "PASS: official WhatsApp support link has no prefilled inquiry data",
    );
    assert.equal(await page.locator("#contactName").inputValue(), TEST_NAME);
    assert.equal(
      await page.locator("#contactEmail").inputValue(),
      config.email,
    );
    assert.equal(await page.locator("#notes").inputValue(), NOTES);

    console.log("PASS: conflict locks fields and disables further submission");
    console.log("PASS: browser retains original details after conflict");

    await page.locator("form").evaluate((form) => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    // Bounded observation for unexpected requests after handler re-entry.
    await page.waitForTimeout(1000);

    if (routeError) throw routeError;
    assert.equal(calls.length, 2);
    assert.equal(await contactButton.isDisabled(), true);
    await assertLocked(page);

    console.log(
      "PASS: tested programmatic submits produced no extra action requests",
    );

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Owner sign in" }).waitFor();

    if (routeError) throw routeError;

    console.log("PASS: private Inbox remains protected");
    console.log(`Receipt for database verification: ${receipt}`);
    console.log(`Email for database verification: ${config.email}`);
    console.log(
      "PASS: browser conflict blocking after deliberate test-payload alteration.",
    );
    console.log(
      "Verify one database inquiry with the original notes separately.",
    );
  } finally {
    await browser.close();
  }
}

runTests().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Conflict browser test failed.",
  );
  process.exitCode = 1;
});