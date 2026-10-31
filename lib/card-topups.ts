type Env = Readonly<Record<string, string | undefined>>;

export const CARD_TOPUPS_ENV = "CARD_TOPUPS_ENABLED";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export type CardTopupPolicy = {
  /** Whether card checkout may be offered right now. */
  enabled: boolean;
  /** Whether the operator set the flag at all. */
  configured: boolean;
  /** Why card sales are off; empty while enabled. */
  reason: string;
};

/**
 * Card top-ups are a separate launch decision from Stripe configuration. Unset
 * means off: a Stripe key in the environment must never silently reopen card
 * sales after the operator selected a crypto-only launch.
 */
export function readCardTopupPolicy(env: Env = process.env): CardTopupPolicy {
  const raw = env[CARD_TOPUPS_ENV]?.trim().toLowerCase() ?? "";

  if (raw === "") {
    return {
      enabled: false,
      configured: false,
      reason:
        "Card top-ups are disabled for this launch. Prepaid credit opens with the direct USDC lane.",
    };
  }

  if (ENABLED_VALUES.has(raw)) {
    return { enabled: true, configured: true, reason: "" };
  }

  return {
    enabled: false,
    configured: true,
    reason: `Card top-ups are disabled (${CARD_TOPUPS_ENV}=${raw}).`,
  };
}
