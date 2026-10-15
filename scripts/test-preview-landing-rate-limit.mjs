import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const PREVIEW_ORIGIN =
  "https://travelpro-4k792ne1s-anmyounus1981-8496.vercel.app";

const WINDOW_MS = 15 * 60 * 1000;
const MIN_REMAINING_MS = 3 * 60 * 1000;
const MAX_SUBMISSIONS = 6;
const TEST_NAME = "SYNTHETIC AUTOMATED LANDING LIMIT TEST";

function loadConfig() {
    const mode = process.argv[2] ?? "email";

  if (!["email", "phone"].includes(mode)) {
    throw new Error("Test mode must be email or phone.");
  }
  const bypass = process.env.TRAVELPRO_PREVIEW_BYPASS?.trim();

  if (!bypass) {
    throw new Error(
      "Missing TRAVELPRO_PREVIEW_BYPASS. Do not put the secret in this file.",
    );
  }

  const preview = new URL(PREVIEW_ORIGIN);

  assert.equal(preview.protocol, "https:");
  assert.equal(
    preview.hostname,
    "travelpro-4k792ne1s-anmyounus1981-8496.vercel.app",
  );

  const remaining = WINDOW_MS - (Date.now() % WINDOW_MS);

  if (remaining < MIN_REMAINING_MS) {
    throw new Error(
      "INCONCLUSIVE: fewer than three minutes remain in the fixed window. Run after the next quarter-hour.",
    );
  }

    return {
    origin: preview.origin,
    bypass,
    mode,
    email:
      mode === "email"
        ? `landing-limit-${randomUUID()}@example.invalid`
        : "",
    phone: mode === "phone" ? "+12025550124" : "",
  };
}

function currentWindow() {
  return Math.floor(Date.now() / WINDOW_MS);
}

function assertSameWindow(expectedWindow) {
  if (currentWindow() !== expectedWindow) {
    throw new Error(
      "INCONCLUSIVE: submissions crossed a fixed-window boundary. No rate-limit pass recorded.",
    );
  }
}

function readReceipt(message) {
  const match = message.match(
    /^Your inquiry was received successfully\. Reference: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );

  if (!match) return null;
  return match[1].toLowerCase();
}

async function runTests() {
  const config = loadConfig();
  const browser = await chromium.launch({ headless: true });

  try {
    // Fresh context: no TravelPro owner cookies or saved authentication.
    const context = await browser.newContext({
      serviceWorkers: "block",
    });

    context.setDefaultTimeout(20_000);
    context.setDefaultNavigationTimeout(30_000);
    const bypassSetup = await context.request.get(
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

    assert.ok(
      [200, 302, 303, 307, 308].includes(bypassSetup.status()),
      `Bypass setup failed: HTTP ${bypassSetup.status()}`,
    );

    await bypassSetup.dispose();
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      // Keep the bypass secret and all test traffic on this Preview origin.
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
          timeout: 30_000,
        });

        const location = response.headers().location;

        if (
          location &&
          new URL(location, request.url()).origin !== config.origin
        ) {
          await route.abort("blockedbyclient");
          return;
        }

        await route.fulfill({ response });
      } catch {
        await route.abort("failed");
      }
    });

    const page = await context.newPage();

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });

        try {
      await page.getByRole("heading", { name: "Owner sign in" }).waitFor();
    } catch {
      const currentUrl = new URL(page.url());
      console.error(
        `Stopped at: ${currentUrl.origin}${currentUrl.pathname}`,
      );
      console.error(`Page title: ${await page.title()}`);
      console.error(
        `Headings: ${JSON.stringify(
          await page.locator("h1, h2").allTextContents(),
        )}`,
      );
      throw new Error(
        "Initial Inbox protection check failed before form submissions.",
      );
    }
    assert.equal(new URL(page.url()).pathname, "/login");
    console.log("PASS: fresh browser cannot access private Inbox");

    await page.goto(`${config.origin}/inquire`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByRole("heading", { name: "Travel Inquiry" }).waitFor();
    console.log("PASS: public inquiry form without TravelPro owner login");

    const remaining = WINDOW_MS - (Date.now() % WINDOW_MS);

    if (remaining < MIN_REMAINING_MS) {
      throw new Error(
        "INCONCLUSIVE: browser setup left insufficient window time.",
      );
    }

    const windowNumber = currentWindow();
    const startedAt = Date.now();
    const receipts = [];

        console.log(`Test mode: ${config.mode}`);
    console.log(
      `Synthetic contact: ${
        config.mode === "email" ? config.email : config.phone
      }`,
    );
    console.log("Submitting at most six distinct synthetic inquiries.");

        for (let attempt = 1; attempt <= MAX_SUBMISSIONS; attempt += 1) {
      assertSameWindow(windowNumber);

      if (Date.now() - startedAt > 120_000) {
        throw new Error(
          "INCONCLUSIVE: test exceeded its two-minute submission budget.",
        );
      }

      await page.locator("#clientType").selectOption("individual");
      await page.locator("#serviceType").selectOption("consultation");
      await page.locator("#contactName").fill(TEST_NAME);
      await page.locator("#contactEmail").fill(config.email);
      await page.locator("#contactPhone").fill(config.phone);
      await page.locator("#origin").fill("");
      await page.locator("#destination").fill("");
      await page.locator("#departureDate").fill("");
      await page.locator("#returnDate").fill("");
      await page.locator("#notes").fill(
        `Synthetic automated contact-limit test ${attempt}. Do not contact.`,
      );

      const previousMessage =
        (await page.locator('[role="status"]').allTextContents()).join(" ");

      await page.getByRole("button", {
        name: "Submit Inquiry",
        exact: true,
      }).click();

      await page.waitForFunction(
        (previous) => {
          const button = document.querySelector('button[type="submit"]');
          const messages = Array.from(
            document.querySelectorAll('[role="status"]'),
          )
            .map((element) => element.textContent?.trim() ?? "")
            .join(" ");

          return (
            button instanceof HTMLButtonElement &&
            !button.disabled &&
            messages !== "" &&
            messages !== previous
          );
        },
        previousMessage,
                { timeout: 30_000 },
      ).catch(async () => {
        console.error(
          "Visible status messages:",
          await page.locator('[role="status"]').allTextContents(),
        );

        console.error(
          "Invalid form fields:",
          await page.locator("form").evaluate((form) =>
            Array.from(form.querySelectorAll("input, select, textarea"))
              .filter((field) => !field.validity.valid)
              .map((field) => ({
                id: field.id,
                message: field.validationMessage,
              })),
          ),
        );

        console.error(
          "Submit button:",
          await page.locator('button[type="submit"]').textContent(),
        );

        throw new Error(
          "Submission outcome unresolved; inspect diagnostics before rerunning.",
        );
      });

      const message = (
        await page.locator('[role="status"]').allTextContents()
      ).join(" ").trim();

      assertSameWindow(windowNumber);

      if (attempt <= 5) {
        const receipt = readReceipt(message);
        assert.ok(
          receipt,
          `Attempt ${attempt} was not accepted: ${message}`,
        );
        assert.equal(
          receipts.includes(receipt),
          false,
          "Distinct form submissions unexpectedly reused a receipt.",
        );

        receipts.push(receipt);
        console.log(
          `Attempt ${attempt}: accepted ${receipt} at ${new Date().toISOString()}`,
        );
      } else {
        const limited = message.match(
          /^Too many attempts\. Try again in ([0-9]+) seconds\.$/,
        );

        assert.ok(limited, `Sixth attempt was not rate-limited: ${message}`);

        const retrySeconds = Number(limited[1]);
        assert.ok(
          retrySeconds >= 1 && retrySeconds <= 900,
          "Invalid retry delay.",
        );

        console.log(`Attempt 6: rate-limited; retry in ${retrySeconds} seconds`);
      }
    }

    assert.equal(receipts.length, 5);
    assertSameWindow(windowNumber);

    await page.goto(`${config.origin}/inbox`, {
      waitUntil: "domcontentloaded",
    });

    await page.getByRole("heading", { name: "Owner sign in" }).waitFor();
    console.log("PASS: private Inbox still protected after submissions");

    console.log(
      "PASS: five accepted Landing submissions and sixth rate-limited within one client-observed fixed window.",
    );
    console.log(
      "Server timestamps and database inquiry count require separate verification.",
    );
  } finally {
    await browser.close();
  }
}

runTests().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Landing rate-limit test failed.",
  );
  process.exitCode = 1;
});