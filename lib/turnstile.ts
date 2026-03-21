/**
 * Cloudflare Turnstile server-side verification.
 * POST https://challenges.cloudflare.com/turnstile/v0/siteverify
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
}

export async function verifyTurnstile(
  token: string,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  // Bypass CAPTCHA verification in development
  if (process.env.NODE_ENV === "development") {
    return { success: true };
  }
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not set");
  }
  const body: { secret: string; response: string; remoteip?: string } = {
    secret,
    response: token,
  };
  if (remoteIp) body.remoteip = remoteIp;

  const res = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    success: boolean;
    "error-codes"?: string[];
  };
  return {
    success: !!data.success,
    errorCodes: data["error-codes"],
  };
}
