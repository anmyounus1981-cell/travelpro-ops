import "server-only";

const TEST_SECRET = "1x0000000000000000000000000000000AA";

export async function verifyInquiryChallenge(token: string) {
  const secret = process.env.INQUIRY_TURNSTILE_SECRET;
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  const test = process.env.NEXT_PUBLIC_OPS_ENV === "staging" &&
    process.env.VERCEL_ENV !== "production" && secret === TEST_SECRET;

  if (!secret || !origin || !token || token.length > 2048) return false;
  if (!test && /^[123]x0{10}/.test(secret)) return false;

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!response.ok) return false;

  const result = await response.json();
  return result.success === true &&
    (test || (result.action === "travel_inquiry" && result.hostname === new URL(origin).hostname));
}
