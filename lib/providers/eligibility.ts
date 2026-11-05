import type { ModelAccess } from "../types.ts";

/**
 * Chat eligibility and cost admission for providers that require review.
 *
 * The rule exists twice by necessity: `PUBLIC_MODEL_SCOPE` applies it in SQL so
 * an ineligible row is never listed, and this module applies it to a resolved
 * route so a direct id, alias or subscription snapshot cannot bypass the list.
 * Both sides use the same decision vocabulary and the same freshness arithmetic.
 *
 * Review is a provider property, not a model family property. An absent decision
 * means `unknown`, and `unknown` is denied. Only an explicit, dated `chat`
 * decision by the operator makes a row eligible.
 */

export type EligibilityDecision = "chat" | "unsupported" | "unknown";

const DECISIONS: readonly EligibilityDecision[] = [
  "chat",
  "unsupported",
  "unknown",
];

export function isEligibilityDecision(
  value: unknown,
): value is EligibilityDecision {
  return (
    typeof value === "string" &&
    (DECISIONS as readonly string[]).includes(value)
  );
}

/** `requiresReview = 0` preserves every existing provider's semantics. */
export function isModelEligible(input: {
  requiresReview: boolean;
  decision: EligibilityDecision | null | undefined;
}) {
  return !input.requiresReview || input.decision === "chat";
}

/**
 * How long a manually entered upstream cost stays trusted. `0` keeps it
 * published indefinitely; a malformed value keeps the 30-day default.
 */
export function priceMaxAgeDays(value: string | undefined) {
  const days = Number(value);

  return Number.isFinite(days) && days >= 0 ? days : 30;
}

export const PRICE_MAX_AGE_DAYS = priceMaxAgeDays(
  process.env.PROVIDER_PRICE_MAX_AGE_DAYS,
);

export function manualCostIsFresh(
  observedAt: string | null | undefined,
  maxAgeDays = PRICE_MAX_AGE_DAYS,
  now = Date.now(),
) {
  if (maxAgeDays <= 0) return true;
  if (!observedAt) return false;

  const time = Date.parse(observedAt);

  return (
    Number.isFinite(time) && time >= now - maxAgeDays * 24 * 60 * 60 * 1000
  );
}

export type ModelAdmissionInput = {
  requiresReview: boolean;
  decision: EligibilityDecision | null | undefined;
  billingMode: ModelAccess;
  costSource: "synced" | "manual" | "unknown";
  costInputMicros: number;
  costOutputMicros: number;
  sellInputMicros: number;
  sellOutputMicros: number;
  costObservedAt: string | null | undefined;
};

export type ModelAdmissionRefusal =
  "eligibility" | "cost_unknown" | "cost_stale" | "unpriced";

/**
 * The one refusal rule for a resolved model. Non-review providers keep their
 * current behavior: only eligibility is new for them, and it is always granted
 * because `requiresReview` is false. A paid review row must have both cost
 * figures, both sell prices, and a manual cost inside the freshness window.
 */
export function modelAdmissionRefusal(
  input: ModelAdmissionInput,
  now = Date.now(),
  maxAgeDays = PRICE_MAX_AGE_DAYS,
): ModelAdmissionRefusal | null {
  if (
    !isModelEligible({
      requiresReview: input.requiresReview,
      decision: input.decision,
    })
  ) {
    return "eligibility";
  }

  if (!input.requiresReview || input.billingMode === "free") return null;

  if (
    input.costSource === "unknown" ||
    input.costInputMicros <= 0 ||
    input.costOutputMicros <= 0
  ) {
    return "cost_unknown";
  }

  if (input.sellInputMicros <= 0 || input.sellOutputMicros <= 0) {
    return "unpriced";
  }

  if (
    input.costSource === "manual" &&
    !manualCostIsFresh(input.costObservedAt, maxAgeDays, now)
  ) {
    return "cost_stale";
  }

  return null;
}

/** One catalog row as the provider review surface needs to see it. */
export type ProviderReviewModel = {
  id: string;
  upstreamId: string;
  name: string;
  status: string;
  inCatalog: boolean;
  costSource: "synced" | "manual" | "unknown";
  costObservedAt: string | null;
  costInputMicros: number;
  costOutputMicros: number;
  sellInputMicros: number;
  sellOutputMicros: number;
  decision: EligibilityDecision | null;
  source: string | null;
  observedAt: string | null;
  note: string | null;
};
