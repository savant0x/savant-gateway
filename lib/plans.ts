import type {
  PlanInterval,
  PlanOverageMode,
  PlanStatus,
  SubscriptionAllowance,
  SubscriptionPlanSnapshot,
} from "./types";

export const PLAN_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
export const RESERVED_PLAN_SLUGS = new Set(["free", "paid", "subscription"]);
export const MIN_ACTIVE_PLAN_PRICE_MICROS = 500_000;
export const MAX_PLAN_PRICE_MICROS = 10_000_000_000;
export const MAX_PLAN_ALLOWANCE = 1_000_000_000_000;
const MAX_MARKUP_BPS = 100_000;

const PLAN_STATUSES = new Set<PlanStatus>(["draft", "active", "archived"]);
const PLAN_INTERVALS = new Set<PlanInterval>(["month", "year"]);
const OVERAGE_MODES = new Set<PlanOverageMode>(["block", "credit"]);

export type PlanValues = {
  slug: string;
  name: string;
  description: string | null;
  status: PlanStatus;
  priceMicros: number;
  currency: "usd";
  interval: PlanInterval;
  includedWeightedTokens: number;
  overageMode: PlanOverageMode;
  overageMarkupBps: number;
  sortOrder: number;
  groups: string[];
  modelIds: string[];
};

export type ReadResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}

function textList(value: unknown) {
  if (value === undefined) return { ok: true as const, value: [] as string[] };

  if (!Array.isArray(value)) {
    return { ok: false as const, error: "Must be a list of ids." };
  }

  const out: string[] = [];

  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      return {
        ok: false as const,
        error: "List entries must be non-empty ids.",
      };
    }

    const entry = item.trim();

    if (!out.includes(entry)) out.push(entry);
  }

  return { ok: true as const, value: out };
}

/**
 * Validates the authoring shape. Catalog existence, free-group rejection, and
 * the "must expand to a model" rule need the database and live in the store.
 */
export function readPlanValues(input: unknown): ReadResult<PlanValues> {
  const raw = record(input);
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";
  const status =
    typeof raw.status === "string" ? raw.status : ("draft" as string);
  const interval =
    typeof raw.interval === "string" ? raw.interval : ("month" as string);
  const overageMode =
    typeof raw.overageMode === "string" ? raw.overageMode : ("block" as string);

  if (!PLAN_SLUG_PATTERN.test(slug) || RESERVED_PLAN_SLUGS.has(slug)) {
    return {
      ok: false,
      error:
        "Plan slug must be 2–32 lowercase letters, digits, or dashes, start with a letter, and not be free, paid, or subscription.",
    };
  }

  if (name.length < 1 || name.length > 60) {
    return { ok: false, error: "Plan name must be 1–60 characters." };
  }

  if (description.length > 300) {
    return {
      ok: false,
      error: "Plan description is limited to 300 characters.",
    };
  }

  if (!PLAN_STATUSES.has(status as PlanStatus)) {
    return {
      ok: false,
      error: "Plan status must be draft, active, or archived.",
    };
  }

  if (!PLAN_INTERVALS.has(interval as PlanInterval)) {
    return { ok: false, error: "Plan interval must be month or year." };
  }

  if (!OVERAGE_MODES.has(overageMode as PlanOverageMode)) {
    return { ok: false, error: "Overage mode must be block or credit." };
  }

  let priceMicros: number | null;

  if (raw.priceUsd !== undefined) {
    if (
      typeof raw.priceUsd !== "number" ||
      !Number.isFinite(raw.priceUsd) ||
      raw.priceUsd < 0
    ) {
      return {
        ok: false,
        error: "Plan price must be a non-negative dollar amount.",
      };
    }

    priceMicros = Math.round(raw.priceUsd * 1_000_000);
  } else {
    priceMicros = integer(raw.priceMicros);
  }

  if (priceMicros === null || priceMicros < 0) {
    return { ok: false, error: "Plan price must be a non-negative integer." };
  }

  if (priceMicros > MAX_PLAN_PRICE_MICROS) {
    return { ok: false, error: "Plan price cannot exceed $10,000." };
  }

  if (status === "active" && priceMicros < MIN_ACTIVE_PLAN_PRICE_MICROS) {
    return {
      ok: false,
      error: "An active Stripe plan must cost at least $0.50.",
    };
  }

  const allowance = integer(raw.includedWeightedTokens);

  if (allowance === null || allowance < 0 || allowance > MAX_PLAN_ALLOWANCE) {
    return {
      ok: false,
      error: `Included allowance must be an integer from 0 to ${MAX_PLAN_ALLOWANCE}.`,
    };
  }

  const markup = integer(raw.overageMarkupBps);

  if (markup === null || markup < 0 || markup > MAX_MARKUP_BPS) {
    return {
      ok: false,
      error: `Overage markup must be an integer from 0 to ${MAX_MARKUP_BPS} basis points.`,
    };
  }

  const sortOrder = raw.sortOrder === undefined ? 0 : integer(raw.sortOrder);

  if (sortOrder === null || Math.abs(sortOrder) > 1_000_000) {
    return { ok: false, error: "Sort order must be an integer." };
  }

  if (
    raw.currency !== undefined &&
    String(raw.currency).toLowerCase() !== "usd"
  ) {
    return { ok: false, error: "Only USD plans are supported." };
  }

  const groups = textList(raw.groups);

  if (!groups.ok) return { ok: false, error: `Groups: ${groups.error}` };

  const models = textList(raw.modelIds);

  if (!models.ok) return { ok: false, error: `Models: ${models.error}` };

  return {
    ok: true,
    value: {
      slug,
      name,
      description: description || null,
      status: status as PlanStatus,
      priceMicros,
      currency: "usd",
      interval: interval as PlanInterval,
      includedWeightedTokens: allowance,
      overageMode: overageMode as PlanOverageMode,
      overageMarkupBps: markup,
      sortOrder,
      groups: groups.value,
      modelIds: models.value,
    },
  };
}

export type EntitlementCandidate = {
  id: string;
  groupSlug: string;
};

/**
 * Expands plan inclusions to exact model ids. Free models are already free, so
 * they are never part of a paid entitlement snapshot.
 */
export function expandEntitlementIds(input: {
  groups: readonly string[];
  modelIds: readonly string[];
  models: readonly EntitlementCandidate[];
}): string[] {
  const groups = new Set(input.groups);
  const explicit = new Set(input.modelIds);
  const out: string[] = [];

  for (const model of input.models) {
    if (groups.has(model.groupSlug) || explicit.has(model.id)) {
      if (!out.includes(model.id)) out.push(model.id);
    }
  }

  return out;
}

export function entitlementMatches(
  modelIds: readonly string[],
  modelId: string,
) {
  return modelIds.includes(modelId);
}

export function allowanceFor(
  includedWeightedTokens: number,
  usedWeightedTokens: number,
  heldWeightedTokens: number,
): SubscriptionAllowance {
  const included = Math.max(0, includedWeightedTokens);
  const used = Math.max(0, usedWeightedTokens);
  const held = Math.max(0, heldWeightedTokens);

  return {
    includedWeightedTokens: included,
    usedWeightedTokens: used,
    heldWeightedTokens: held,
    remainingWeightedTokens: Math.max(0, included - used - held),
    usedBps:
      included === 0
        ? used > 0
          ? 10_000
          : 0
        : Math.min(10_000, Math.round((used / included) * 10_000)),
  };
}

export type AllowanceDecision =
  | { kind: "included"; remaining: number }
  | { kind: "credit"; remaining: number }
  | { kind: "block"; remaining: number };

/** One decision per call keeps included and credit billing mutually exclusive. */
export function decideAllowance(input: {
  includedWeightedTokens: number;
  usedWeightedTokens: number;
  heldWeightedTokens: number;
  estimateWeightedTokens: number;
  overageMode: PlanOverageMode;
}): AllowanceDecision {
  const { remainingWeightedTokens } = allowanceFor(
    input.includedWeightedTokens,
    input.usedWeightedTokens,
    input.heldWeightedTokens,
  );
  const estimate = Math.max(0, Math.ceil(input.estimateWeightedTokens));

  if (estimate <= remainingWeightedTokens) {
    return { kind: "included", remaining: remainingWeightedTokens };
  }

  if (input.overageMode === "credit") {
    return { kind: "credit", remaining: remainingWeightedTokens };
  }

  return { kind: "block", remaining: remainingWeightedTokens };
}

export function subscriptionWeightedTokens(
  tokenWeight: number,
  inputTokens: number,
  outputTokens: number,
) {
  return (
    (Math.max(0, inputTokens) + Math.max(0, outputTokens)) *
    Math.max(1, tokenWeight)
  );
}

export function markupSellMicros(sellMicros: number, markupBps: number) {
  const base = Math.max(0, Math.round(sellMicros));
  const bps = Math.min(MAX_MARKUP_BPS, Math.max(0, Math.round(markupBps)));

  return Math.round((base * (10_000 + bps)) / 10_000);
}

export function subscriptionSnapshot(input: {
  name: string;
  priceMicros: number;
  currency: string;
  interval: PlanInterval;
  includedWeightedTokens: number;
  overageMode: PlanOverageMode;
  overageMarkupBps: number;
}): SubscriptionPlanSnapshot {
  return {
    name: input.name,
    priceMicros: input.priceMicros,
    currency: input.currency,
    interval: input.interval,
    includedWeightedTokens: input.includedWeightedTokens,
    overageMode: input.overageMode,
    overageMarkupBps: input.overageMarkupBps,
  };
}
