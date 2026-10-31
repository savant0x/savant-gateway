import { createHash, randomBytes } from "node:crypto";

/** No 0/O or 1/I: a code is read aloud and typed by a customer. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12;
const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/** $500 per code. A promo is a marketing cost, not an unlimited mint. */
export const MAX_PROMO_MICROS = 500_000_000;
export const MAX_PROMO_REDEMPTIONS = 10_000;

export type PromoPolicy = {
  enabled: boolean;
  reason: string | null;
};

export type PromoStatus = "active" | "paused" | "archived";

export type PromoCodeSummary = {
  id: string;
  codePrefix: string;
  label: string;
  amountMicros: number;
  maxRedemptions: number;
  redeemedCount: number;
  status: PromoStatus;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export function readPromoPolicy(
  env: Record<string, string | undefined> = process.env,
): PromoPolicy {
  const enabled = env.PROMO_CODES_ENABLED?.trim().toLowerCase() === "true";

  return {
    enabled,
    reason: enabled ? null : "Promo codes are not enabled for this deployment.",
  };
}

export function generatePromoCode(
  read: (size: number) => Buffer = randomBytes,
) {
  const bytes = read(CODE_LENGTH);
  let bare = "";

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    bare += ALPHABET[bytes[index] % ALPHABET.length];
  }

  return formatPromoCode(bare);
}

function formatPromoCode(bare: string) {
  return `${bare.slice(0, 4)}-${bare.slice(4, 8)}-${bare.slice(8, 12)}`;
}

/**
 * Accepts spaces and hyphens anywhere, then requires the canonical alphabet.
 * Removing only those separators means a typo such as `!` still fails rather
 * than being silently stripped into a valid code.
 */
export function normalizePromoCode(value: unknown) {
  if (typeof value !== "string") return null;

  const bare = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");

  if (!CODE_PATTERN.test(bare)) return null;

  return formatPromoCode(bare);
}

export function promoCodeHash(normalized: string) {
  return createHash("sha256")
    .update(normalized.replace(/-/g, ""))
    .digest("hex");
}

export function promoCodePrefix(normalized: string) {
  return normalized.slice(0, 9);
}

export function readPromoInstant(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return { ok: true as const, value: null };
  }

  if (typeof value !== "string") return { ok: false as const };

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) return { ok: false as const };

  return { ok: true as const, value: new Date(parsed).toISOString() };
}

export function promoWindowProblem(
  startsAt: string | null,
  expiresAt: string | null,
) {
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
    return "expiresAt must be after startsAt.";
  }

  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    return "expiresAt must be in the future.";
  }

  return null;
}

export function promoAmountProblem(amountMicros: number) {
  if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) {
    return "Promo amount must be a positive whole number of micro-dollars.";
  }

  if (amountMicros > MAX_PROMO_MICROS) {
    return `Promo amount cannot exceed $${MAX_PROMO_MICROS / 1_000_000}.`;
  }

  return null;
}

export function promoRedemptionProblem(maxRedemptions: number) {
  if (
    !Number.isSafeInteger(maxRedemptions) ||
    maxRedemptions < 1 ||
    maxRedemptions > MAX_PROMO_REDEMPTIONS
  ) {
    return `maxRedemptions must be an integer from 1 to ${MAX_PROMO_REDEMPTIONS}.`;
  }

  return null;
}
