import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { createIntakeClient } from "@/lib/supabase/intake";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_SIGNATURE_AGE_SECONDS = 300;

class IntakeRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readBoundedBody(request: Request): Promise<Buffer> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw new IntakeRequestError("JSON content type required.", 415);
  }

  const reader = request.body?.getReader();

  if (!reader) {
    throw new IntakeRequestError("Request body required.", 400);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new IntakeRequestError("Request body too large.", 413);
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new IntakeRequestError("Request body required.", 400);
  }

  return Buffer.concat(chunks, totalBytes);
}
function verifySignature(
  request: Request,
  body: Buffer,
  secret: string,
): void {
  const timestamp = request.headers.get("x-inquiry-timestamp");
  const signature = request.headers.get("x-inquiry-signature");

  if (
    !timestamp ||
    !/^[0-9]{1,12}$/.test(timestamp) ||
    !signature ||
    !/^sha256=[0-9a-f]{64}$/i.test(signature)
  ) {
    throw new IntakeRequestError("Invalid webhook authentication.", 401);
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) >
      MAX_SIGNATURE_AGE_SECONDS
  ) {
    throw new IntakeRequestError("Invalid webhook authentication.", 401);
  }

  const expected = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest();

  const supplied = Buffer.from(signature.slice(7), "hex");

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new IntakeRequestError("Invalid webhook authentication.", 401);
  }
}
type AllowedWebhookAccount = {
  source: string;
  provider: string;
  accountId: string;
};

function loadAllowedAccounts(): AllowedWebhookAccount[] {
  const configured = process.env.INQUIRY_WEBHOOK_ALLOWED_ACCOUNTS;

  if (!configured) {
    throw new IntakeRequestError("Webhook intake is not configured.", 503);
  }

  let accounts: unknown;

  try {
    accounts = JSON.parse(configured);
  } catch {
    throw new IntakeRequestError("Webhook intake is not configured.", 503);
  }

  if (
    !Array.isArray(accounts) ||
    accounts.length === 0 ||
    accounts.length > 100 ||
    !accounts.every(
      (account: unknown) =>
        account !== null &&
        typeof account === "object" &&
        ["web", "email", "whatsapp", "meta_lead_ads"].includes(
          (account as AllowedWebhookAccount).source,
        ) &&
        typeof (account as AllowedWebhookAccount).provider === "string" &&
        (account as AllowedWebhookAccount).provider.trim().length > 0 &&
        typeof (account as AllowedWebhookAccount).accountId === "string" &&
        (account as AllowedWebhookAccount).accountId.trim().length > 0,
    )
  ) {
    throw new IntakeRequestError("Webhook intake is not configured.", 503);
  }

  return accounts as AllowedWebhookAccount[];
}

function parseWebhookPayload(
  body: Buffer,
  accounts: AllowedWebhookAccount[],
): Record<string, unknown> {
  let payload: unknown;

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(body);
    payload = JSON.parse(decoded);
  } catch {
    throw new IntakeRequestError("Invalid JSON body.", 400);
  }

  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new IntakeRequestError("Inquiry payload must be an object.", 400);
  }

  const inquiry = payload as Record<string, unknown>;

  if (
    !accounts.some(
      (account) =>
        account.source === inquiry.source &&
        account.provider === inquiry.provider &&
        account.accountId === inquiry.providerAccountId,
    )
  ) {
    throw new IntakeRequestError("Source account is not authorized.", 403);
  }

  return inquiry;
}
export async function POST(request: Request) {
  try {
    const secret = process.env.INQUIRY_WEBHOOK_SECRET;

    if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
      throw new IntakeRequestError(
        "Webhook intake is not configured.",
        503,
      );
    }

    const accounts = loadAllowedAccounts();
    const body = await readBoundedBody(request);

    verifySignature(request, body, secret);

    const payload = parseWebhookPayload(body, accounts);
    const db = createIntakeClient();

    const { data, error } = await db.rpc("submit_inquiry_intake", {
      p_payload: payload,
    });

    if (error) {
      console.error("Inquiry intake RPC failed", {
        code: error.code,
      });
      if (error.code === "23505") {
        throw new IntakeRequestError(
          "Submission identity conflicts with an existing inquiry.",
          409,
        );
      }

      if (
        ["22023", "22P02", "22007", "22008", "22003", "22001"].includes(
          error.code,
        )
      ) {
        throw new IntakeRequestError("Invalid inquiry submission.", 400);
      }

      throw new IntakeRequestError(
        "Inquiry intake is temporarily unavailable.",
        503,
      );
    }

    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        data.id,
      ) ||
      data.status !== "accepted" ||
      typeof data.duplicate !== "boolean"
    ) {
      throw new IntakeRequestError("Invalid intake receipt.", 503);
    }

    return NextResponse.json(
      {
        id: data.id,
        status: "accepted",
        duplicate: data.duplicate,
      },
      {
        status: data.duplicate ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const knownError = error instanceof IntakeRequestError;

    return NextResponse.json(
      {
        error: knownError
          ? error.message
          : "Inquiry intake is temporarily unavailable.",
      },
      {
        status: knownError ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}