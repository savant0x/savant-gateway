export const TOPUP_MIN_USD = 5;
export const TOPUP_MAX_USD = 500;
export const TOPUP_PRESETS_USD = [10, 25, 50, 100] as const;

const AMOUNT_PATTERN = /^(0|[1-9]\d{0,3})(?:\.(\d{1,2}))?$/;

export type TopupAmount =
  | { ok: true; amountMicros: number; amountCents: number; amountUsd: number }
  | { ok: false; error: string };

/**
 * Parses a dollar amount without floating point. Accepts a number or numeric
 * string with at most two decimals; the result is exact micro-dollars.
 */
export function parseTopupAmount(value: unknown): TopupAmount {
  const raw =
    typeof value === "number"
      ? Number.isFinite(value)
        ? String(value)
        : ""
      : typeof value === "string"
        ? value.trim()
        : "";

  if (!raw) {
    return { ok: false, error: "Enter a dollar amount." };
  }

  const match = AMOUNT_PATTERN.exec(raw);

  if (!match) {
    return {
      ok: false,
      error: "Enter a dollar amount with at most two decimal places.",
    };
  }

  const whole = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const amountCents = whole * 100 + cents;
  const amountUsd = amountCents / 100;

  if (amountUsd < TOPUP_MIN_USD) {
    return {
      ok: false,
      error: `The minimum top-up is $${TOPUP_MIN_USD}.`,
    };
  }

  if (amountUsd > TOPUP_MAX_USD) {
    return {
      ok: false,
      error: `The maximum top-up is $${TOPUP_MAX_USD}.`,
    };
  }

  return {
    ok: true,
    amountMicros: amountCents * 10_000,
    amountCents,
    amountUsd,
  };
}
