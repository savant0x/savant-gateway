import type { PlanStatus } from "./types";

type Env = Readonly<Record<string, string | undefined>>;

export const PLAN_SALES_ENV = "PLAN_SALES_ENABLED";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export type PlanSalesPolicy = {
  /** Whether new subscriptions may be sold right now. */
  selling: boolean;
  /** Whether the operator set the flag at all. */
  configured: boolean;
  /** Why sales are off; empty while selling. */
  reason: string;
};

/**
 * One explicit launch decision, independent of whether Stripe is configured for
 * prepaid credit. Unset means off: an accidental or forgotten flag must never
 * turn a disabled offering into a purchasable one.
 */
export function readPlanSalesPolicy(env: Env = process.env): PlanSalesPolicy {
  const raw = env[PLAN_SALES_ENV]?.trim().toLowerCase() ?? "";

  if (raw === "") {
    return {
      selling: false,
      configured: false,
      reason:
        "Plan sales are disabled for this launch. Set PLAN_SALES_ENABLED=true only after recurring billing acceptance and funded capacity are recorded.",
    };
  }

  if (ENABLED_VALUES.has(raw)) {
    return { selling: true, configured: true, reason: "" };
  }

  return {
    selling: false,
    configured: true,
    reason: `Plan sales are disabled (${PLAN_SALES_ENV}=${raw}).`,
  };
}

export type PlanActivationDecision =
  { allowed: true } | { allowed: false; error: string };

/**
 * Publishing a plan is a sale gate. Editing or comping a plan that is already
 * active is not: that preserves existing entitlements and in-flight obligations
 * while new purchases stay closed.
 */
export function decidePlanActivation(input: {
  selling: boolean;
  /** Null when the plan is being created. */
  current: PlanStatus | null;
  next: PlanStatus;
}): PlanActivationDecision {
  if (input.next !== "active") return { allowed: true };
  if (input.current === "active") return { allowed: true };
  if (input.selling) return { allowed: true };

  return {
    allowed: false,
    error:
      "Plan sales are disabled for this launch, so a plan cannot be published for purchase. Keep it draft or archived.",
  };
}
