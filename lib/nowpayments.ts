import { createHmac, timingSafeEqual } from "node:crypto";

type Env = Readonly<Record<string, string | undefined>>;

export const NOWPAYMENTS_TOPUPS_ENV = "NOWPAYMENTS_TOPUPS_ENABLED";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export type NowpaymentsPolicy = {
  /** Whether crypto checkout may be offered right now. */
  enabled: boolean;
  /** Whether the operator set the flag at all. */
  configured: boolean;
  /** Why crypto sales are off; empty while enabled. */
  reason: string;
};

/**
 * Crypto top-ups are a separate launch decision from NOWPayments
 * configuration. Unset means off: an API key in the environment must never
 * silently reopen sales after a gate decision.
 */
export function readNowpaymentsPolicy(
  env: Env = process.env,
): NowpaymentsPolicy {
  const raw = env[NOWPAYMENTS_TOPUPS_ENV]?.trim().toLowerCase() ?? "";

  if (raw === "") {
    return {
      enabled: false,
      configured: false,
      reason:
        "Crypto top-ups are disabled for this launch. Set NOWPAYMENTS_TOPUPS_ENABLED=true to open them.",
    };
  }

  if (ENABLED_VALUES.has(raw)) {
    return { enabled: true, configured: true, reason: "" };
  }

  return {
    enabled: false,
    configured: true,
    reason: `Crypto top-ups are disabled (${NOWPAYMENTS_TOPUPS_ENV}=${raw}).`,
  };
}

export type NowpaymentsConfig =
  | {
      configured: true;
      apiKey: string;
      ipnSecret: string;
      reason: null;
    }
  | {
      configured: false;
      apiKey: "";
      ipnSecret: "";
      reason: string;
    };

export function readNowpaymentsConfig(
  env: Env = process.env,
): NowpaymentsConfig {
  const apiKey = env.NOWPAYMENTS_API_KEY?.trim() ?? "";
  const ipnSecret = env.NOWPAYMENTS_IPN_SECRET?.trim() ?? "";

  if (!apiKey) {
    return {
      configured: false,
      apiKey: "",
      ipnSecret: "",
      reason:
        "Set NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET to sell crypto top-ups.",
    };
  }

  if (!ipnSecret) {
    return {
      configured: false,
      apiKey: "",
      ipnSecret: "",
      reason:
        "NOWPAYMENTS_IPN_SECRET is missing. Top-ups stay disabled until paid invoices can be verified.",
    };
  }

  return { configured: true, apiKey, ipnSecret, reason: null };
}

/**
 * One explicit environment value picks the sandbox or live host so a key pair
 * can never silently target the wrong environment. The API path (`/v1/...`)
 * is appended by the callers.
 */
export function nowpaymentsBaseUrl(env: Env = process.env): string {
  const raw = env.NOWPAYMENTS_SANDBOX?.trim().toLowerCase() ?? "";

  return ENABLED_VALUES.has(raw)
    ? "https://api-sandbox.nowpayments.io"
    : "https://api.nowpayments.io";
}

export type NowpaymentsInvoiceInput = {
  apiKey: string;
  amountMicros: number;
  orderId: string;
  ipnCallbackUrl: string;
  successUrl: string;
  cancelUrl: string;
};

export type NowpaymentsInvoice = {
  id: string;
  invoiceUrl: string;
};

export class NowpaymentsInvoiceError extends Error {}

/**
 * Creates a fixed-rate USD invoice. `is_fee_paid_by_user` keeps the credited
 * price equal to the listed price, and omitting `pay_currency` lets the
 * customer choose the crypto on the hosted page.
 */
export async function createNowpaymentsInvoice(
  input: NowpaymentsInvoiceInput,
  options: { baseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<NowpaymentsInvoice> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${options.baseUrl ?? nowpaymentsBaseUrl()}/v1/invoice`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
      },
      body: JSON.stringify({
        price_amount: input.amountMicros / 1_000_000,
        price_currency: "usd",
        order_id: input.orderId,
        order_description: `Savant Gateway credit: $${(
          input.amountMicros / 1_000_000
        ).toFixed(2)}`,
        ipn_callback_url: input.ipnCallbackUrl,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        is_fixed_rate: true,
        is_fee_paid_by_user: true,
      }),
      // A redirect must not carry the API key to another host.
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    throw new NowpaymentsInvoiceError(
      `NOWPayments invoice request failed with ${response.status}.`,
    );
  }

  const data = (await response.json()) as {
    id?: unknown;
    invoice_url?: unknown;
  };
  const rawId = data.id;
  const id =
    typeof rawId === "string" && rawId.length > 0
      ? rawId
      : typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId > 0
        ? String(rawId)
        : "";
  const invoiceUrl =
    typeof data.invoice_url === "string" ? data.invoice_url : "";

  if (!id || !invoiceUrl) {
    throw new NowpaymentsInvoiceError(
      "NOWPayments invoice response is missing the invoice id or url.",
    );
  }

  return { id, invoiceUrl };
}

/**
 * NOWPayments signs IPNs with HMAC-SHA512 (hex) over the JSON of the payment
 * object with keys sorted recursively. Node's JSON.stringify replacer sorts
 * top-level keys only, so the sort is implemented here, matching the official
 * SDK (`createWebhookSignature`).
 */
export function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectDeep);

  if (
    value !== null &&
    typeof value === "object" &&
    value.constructor === Object
  ) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortObjectDeep((value as Record<string, unknown>)[key]);

        return result;
      }, {});
  }

  return value;
}

export function createIpnSignature(
  payload: Record<string, unknown>,
  secret: string,
): string {
  return createHmac("sha512", secret.trim())
    .update(JSON.stringify(sortObjectDeep(payload)))
    .digest("hex");
}

export function verifyIpnSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature) return false;

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return false;
  }

  const expected = Buffer.from(
    createIpnSignature(parsed as Record<string, unknown>, secret),
    "hex",
  );
  const given = Buffer.from(signature.trim(), "hex");

  if (given.length !== expected.length) return false;

  return timingSafeEqual(given, expected);
}

export type NowpaymentsIpnPayment = {
  paymentId: string;
  paymentStatus: string;
  orderId: string;
  priceAmount: number;
  priceCurrency: string;
  actuallyPaid: number | null;
  payCurrency: string | null;
};

const NON_FINAL_STATUSES = new Set([
  "waiting",
  "confirming",
  "confirmed",
  "sending",
  "partially_paid",
]);

const FINAL_FAIL_STATUSES = new Set(["failed", "expired", "refunded"]);

/** Only `finished` is settled enough to credit. */
export function isCreditWorthyStatus(status: string): boolean {
  return status === "finished";
}

/** Terminal failures never lead to credit; a later delivery cannot revive them. */
export function isFinalFailStatus(status: string): boolean {
  return FINAL_FAIL_STATUSES.has(status);
}

export function isNonFinalStatus(status: string): boolean {
  return NON_FINAL_STATUSES.has(status);
}

function idString(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;

  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  return "";
}

function amountNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed !== "" && Number.isFinite(Number(trimmed))) {
      return Number(trimmed);
    }
  }

  return null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Extracts the fields the gateway trusts from an IPN payload. `payment_id` is
 * numeric in API responses, so it is normalized to a string; `price_amount`
 * may arrive as a number or a decimal string, so it is normalized to a number.
 */
export function parseIpnPayment(
  payload: Record<string, unknown>,
): NowpaymentsIpnPayment | null {
  const paymentId = idString(payload.payment_id);
  const paymentStatus = optionalString(payload.payment_status);
  const orderId = optionalString(payload.order_id);
  const priceAmount = amountNumber(payload.price_amount);
  const priceCurrency = optionalString(payload.price_currency);

  if (
    !paymentId ||
    !paymentStatus ||
    !orderId ||
    priceAmount === null ||
    !priceCurrency
  ) {
    return null;
  }

  return {
    paymentId,
    paymentStatus,
    orderId,
    priceAmount,
    priceCurrency,
    actuallyPaid: amountNumber(payload.actually_paid),
    payCurrency: optionalString(payload.pay_currency),
  };
}
