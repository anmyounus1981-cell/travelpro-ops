import "server-only";

import { createHmac } from "node:crypto";
import { createIntakeClient } from "@/lib/supabase/intake";

type RateLimitScope = "landing_page" | "webhook";

export type InquiryRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

function createBucketKey(
  scope: RateLimitScope,
  category: string,
  identity: string,
): string {
  const secret = process.env.INQUIRY_RATE_LIMIT_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Inquiry rate limiting is not configured.");
  }

  return createHmac("sha256", secret)
    .update(JSON.stringify(["inquiry-rate-limit-v1", scope, category, identity]))
    .digest("hex");
}
async function consumeBucket(
  scope: RateLimitScope,
  category: string,
  identity: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<InquiryRateLimitResult> {
  const bucketKey = createBucketKey(scope, category, identity);
  const db = createIntakeClient();

  const { data, error } = await db.rpc("consume_inquiry_rate_limit", {
    p_scope: scope,
    p_bucket_key: bucketKey,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("Inquiry rate-limit RPC failed", {
      code: error.code,
    });

    throw new Error("Inquiry rate limiting is temporarily unavailable.");
  }

  if (
    data === null ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof data.allowed !== "boolean" ||
    !Number.isInteger(data.remaining) ||
    data.remaining < 0 ||
    data.remaining > maxRequests ||
    !Number.isInteger(data.retryAfterSeconds) ||
    (data.allowed
      ? data.retryAfterSeconds !== 0
      : data.retryAfterSeconds < 1)
  ) {
    throw new Error("Invalid inquiry rate-limit response.");
  }

  return {
    allowed: data.allowed,
    remaining: data.remaining,
    retryAfterSeconds: data.retryAfterSeconds,
  };
}
export async function checkLandingInquiryRateLimit(contact: {
  email?: string;
  phone?: string;
}): Promise<InquiryRateLimitResult> {
  const email = contact.email?.trim().toLowerCase() ?? "";
  const phone = contact.phone?.trim() ?? "";

  if (!email && !phone) {
    throw new Error("Contact details are required for rate limiting.");
  }

  // Initial shared ceiling: 100 attempts per 15-minute window.
  const globalLimit = await consumeBucket(
    "landing_page",
    "global",
    "all",
    100,
    900,
  );

  if (!globalLimit.allowed) {
    return globalLimit;
  }

  let remaining = globalLimit.remaining;

  // Each supplied contact has its own five-attempt ceiling.
  for (const [category, identity] of [
    ["email", email],
    ["phone", phone],
  ]) {
    if (!identity) continue;

    const contactLimit = await consumeBucket(
      "landing_page",
      category,
      identity,
      5,
      900,
    );

    if (!contactLimit.allowed) {
      return contactLimit;
    }

    remaining = Math.min(remaining, contactLimit.remaining);
  }

  return {
    allowed: true,
    remaining,
    retryAfterSeconds: 0,
  };
}
export async function checkWebhookInquiryRateLimit(account: {
  source: string;
  provider: string;
  accountId: string;
}): Promise<InquiryRateLimitResult> {
  if (
    !["web", "email", "whatsapp", "meta_lead_ads"].includes(account.source) ||
    !account.provider.trim() ||
    !account.accountId.trim()
  ) {
    throw new Error("A valid webhook account is required.");
  }

  const globalLimit = await consumeBucket(
    "webhook",
    "global",
    "all",
    500,
    60,
  );

  if (!globalLimit.allowed) {
    return globalLimit;
  }

  const accountLimit = await consumeBucket(
    "webhook",
    "account",
    JSON.stringify([
      account.source,
      account.provider,
      account.accountId,
    ]),
    60,
    60,
  );

  if (!accountLimit.allowed) {
    return accountLimit;
  }

  return {
    allowed: true,
    remaining: Math.min(globalLimit.remaining, accountLimit.remaining),
    retryAfterSeconds: 0,
  };
}