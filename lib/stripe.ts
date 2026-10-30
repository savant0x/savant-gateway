import Stripe from "stripe";

type Env = Readonly<Record<string, string | undefined>>;

export type StripeConfig =
  | {
      configured: true;
      secretKey: string;
      webhookSecret: string;
      reason: null;
    }
  | {
      configured: false;
      secretKey: "";
      webhookSecret: "";
      reason: string;
    };

export function readStripeConfig(env: Env = process.env): StripeConfig {
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";

  if (!secretKey) {
    return {
      configured: false,
      secretKey: "",
      webhookSecret: "",
      reason:
        "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to sell credit top-ups.",
    };
  }

  if (!webhookSecret) {
    return {
      configured: false,
      secretKey: "",
      webhookSecret: "",
      reason:
        "STRIPE_WEBHOOK_SECRET is missing. Top-ups stay disabled until paid checkouts can be verified.",
    };
  }

  return { configured: true, secretKey, webhookSecret, reason: null };
}

/**
 * Declared payment environment. `null` means not configured: the event mode is
 * recorded but not enforced, which is a stated limitation rather than consent.
 */
export function readStripeExpectedLivemode(
  env: Env = process.env,
): boolean | null {
  const raw = env.STRIPE_EXPECTED_LIVEMODE?.trim().toLowerCase();

  if (raw === "true" || raw === "1" || raw === "live") return true;
  if (raw === "false" || raw === "0" || raw === "test") return false;

  return null;
}

let cached: { secretKey: string; client: Stripe } | null = null;

export function stripeClient(secretKey: string) {
  if (cached?.secretKey === secretKey) return cached.client;

  const client = new Stripe(secretKey, {
    appInfo: { name: "savant-gateway", version: "0.1.0" },
  });

  cached = { secretKey, client };

  return client;
}

/**
 * Absolute origin for Stripe redirects. Configured URLs win over the request
 * host so production redirects cannot be influenced by a spoofed Host header.
 */
export function resolveAppOrigin(requestUrl: string): string | null {
  const configured =
    process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();

  for (const candidate of [configured, requestUrl]) {
    if (!candidate) continue;

    try {
      const url = new URL(candidate);

      if (url.protocol !== "http:" && url.protocol !== "https:") continue;

      return url.origin;
    } catch {
      continue;
    }
  }

  return null;
}
