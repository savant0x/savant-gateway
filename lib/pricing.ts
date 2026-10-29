export const TOKENS_PER_PRICE_UNIT = 1_000_000;

/** Default markup over upstream cost, in basis points (3000 = +30%). */
export const DEFAULT_MARKUP_BPS = 3000;
export const MAX_MARKUP_BPS = 100_000;

/** Paid models without an explicit max_tokens get this output budget. */
export const DEFAULT_OUTPUT_BUDGET = 4096;
export const MAX_OUTPUT_BUDGET = 65_536;

/** $100,000 per 1M tokens is a guardrail, not a business limit. */
export const MAX_PRICE_MICROS = 100_000 * TOKENS_PER_PRICE_UNIT;

export function priceToMicros(usdPer1M: number) {
  return Math.round(usdPer1M * TOKENS_PER_PRICE_UNIT);
}

export function microsToPrice(micros: number) {
  return micros / TOKENS_PER_PRICE_UNIT;
}

export function clampMarkupBps(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_MARKUP_BPS;

  return Math.min(MAX_MARKUP_BPS, Math.max(0, Math.round(value)));
}

export function defaultSellMicros(costMicros: number, markupBps: number) {
  const cost = Math.max(0, Math.round(costMicros));

  if (cost === 0) return 0;

  // Exact integer arithmetic, rounded up to the micro. A float multiplier
  // (cost * 1.3) is one micro above the intended price for some costs, and a
  // published rate has to be the rate we meant.
  const numerator = BigInt(cost) * BigInt(10_000 + clampMarkupBps(markupBps));
  const denominator = BigInt(10_000);
  const sell = (numerator + denominator - BigInt(1)) / denominator;

  return Number(sell < BigInt(1) ? BigInt(1) : sell);
}

export function marginBps(costMicros: number, sellMicros: number) {
  if (sellMicros <= 0) return null;

  return Math.round(((sellMicros - costMicros) / sellMicros) * 10_000);
}

export function blendedProfitMicros(input: {
  costInputMicros: number;
  costOutputMicros: number;
  sellInputMicros: number;
  sellOutputMicros: number;
}) {
  return (
    input.sellInputMicros +
    input.sellOutputMicros -
    input.costInputMicros -
    input.costOutputMicros
  );
}

export function computeTokenCostMicros(
  tokens: number,
  priceMicrosPer1M: number,
) {
  const safeTokens = Number.isFinite(tokens)
    ? Math.max(0, Math.floor(tokens))
    : 0;
  const safePrice = Number.isFinite(priceMicrosPer1M)
    ? Math.max(0, Math.round(priceMicrosPer1M))
    : 0;

  // tokens × price overflows the float mantissa (2^53 ≈ 9.007e15) once a large
  // token count meets a large per-million rate, and the rounding then lands one
  // micro off. Integer arithmetic cannot drift: half-up division matches
  // Math.round for the non-negative amounts this handles. A result beyond the
  // safe range is clamped rather than silently rounded.
  const micros =
    (BigInt(safeTokens) * BigInt(safePrice) + BigInt(500_000)) /
    BigInt(TOKENS_PER_PRICE_UNIT);
  const cap = BigInt(Number.MAX_SAFE_INTEGER);

  return Number(micros > cap ? cap : micros);
}

export function computeHoldMicros(input: {
  inputTokens: number;
  outputTokens: number;
  sellInputMicros: number;
  sellOutputMicros: number;
}) {
  const cost =
    computeTokenCostMicros(input.inputTokens, input.sellInputMicros) +
    computeTokenCostMicros(input.outputTokens, input.sellOutputMicros);

  return Math.max(1, cost);
}

export function estimateTokensFromText(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateTokensFromChars(chars: number) {
  if (chars <= 0) return 0;

  return Math.max(1, Math.ceil(chars / 4));
}

export function estimatePromptTokens(messages: unknown, extra?: unknown) {
  const base = Array.isArray(messages) ? JSON.stringify(messages) : "";
  const tail = extra === undefined ? "" : JSON.stringify(extra);

  return Math.max(1, Math.ceil((base.length + tail.length) / 4) + 8);
}

export function readRequestedOutputBudget(body: Record<string, unknown>) {
  for (const key of ["max_completion_tokens", "max_tokens"]) {
    const value = body[key];

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }

  return null;
}

export function readPriceInput(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const micros = priceToMicros(value);

  if (micros < 0 || micros > MAX_PRICE_MICROS) return null;

  return micros;
}

export function readMarkupInput(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  if (value < 0 || value > MAX_MARKUP_BPS) return null;

  return Math.round(value);
}

export function averageMarginBps(
  rows: Array<{ margin: number | null }>,
): number | null {
  const present = rows
    .map((row) => row.margin)
    .filter((margin): margin is number => margin !== null);

  if (present.length === 0) return null;

  return Math.round(
    present.reduce((total, margin) => total + margin, 0) / present.length,
  );
}
