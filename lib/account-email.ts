import type { AccountActionPurpose } from "./storage/ledger/account-actions.ts";

import { isJsonObject } from "./http.ts";

export type AccountEmailConfig = {
  origin: string;
  endpoint: string;
  apiKey: string;
  from: string;
};

export function readAccountEmailConfig(
  env: Record<string, string | undefined> = process.env,
): AccountEmailConfig | null {
  if (env.EMAIL_TRANSPORT !== "resend") return null;

  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();

  if (!apiKey || !from || /[\r\n]/.test(from)) return null;

  try {
    const origin = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
    const endpoint = new URL(
      env.RESEND_API_URL || "https://api.resend.com/emails",
    );
    const disposable = env.GATEWAY_DISPOSABLE_START === "yes";

    if (
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      return null;
    if (
      origin.protocol !== "https:" &&
      !(disposable || env.NODE_ENV !== "production")
    )
      return null;
    if (!["http:", "https:"].includes(origin.protocol)) return null;
    // A custom endpoint exists only for disposable HTTP acceptance fixtures.
    // Production cannot redirect credentials to an arbitrary configured URL.
    if (
      endpoint.href !== "https://api.resend.com/emails" &&
      !(
        disposable &&
        endpoint.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(endpoint.hostname)
      )
    )
      return null;

    return { origin: origin.origin, endpoint: endpoint.href, apiKey, from };
  } catch {
    return null;
  }
}

type EmailInput = {
  config: AccountEmailConfig;
  actionId: string;
  recipient: string;
  purpose: AccountActionPurpose;
  token: string;
};

export async function sendAccountEmail(
  input: EmailInput,
  send: typeof fetch = fetch,
) {
  const link = new URL("/account/action", input.config.origin);

  link.hash = new URLSearchParams({
    purpose: input.purpose,
    token: input.token,
  }).toString();
  const verification = input.purpose === "verify";
  const subject = verification
    ? "Verify your Savant Gateway email"
    : "Reset your Savant Gateway password";
  const text = `${subject}\n\n${link.href}\n\n${verification ? "This link expires in 24 hours." : "This link expires in 30 minutes. Resetting revokes existing sessions and API keys."}\nIf you did not request this, ignore this message.`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await send(input.config.endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
        headers: {
          Authorization: `Bearer ${input.config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.actionId,
        },
        body: JSON.stringify({
          from: input.config.from,
          to: [input.recipient],
          subject,
          text,
        }),
      });

      if (response.ok) {
        const result: unknown = await response.json();

        return (
          isJsonObject(result) &&
          typeof result.id === "string" &&
          result.id.length > 0
        );
      }

      if (response.status !== 429 && response.status < 500) return false;
      await response.body?.cancel();
    } catch {
      // Never log provider text: it can contain addresses, tokens or credentials.
      if (attempt === 1) return false;
    }
  }

  return false;
}
