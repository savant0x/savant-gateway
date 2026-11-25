import { nextUtcReset } from "./free-pool.ts";

export const QUOTA_MAX_AGE_MS = 30_000;
export const RUNTIME_LEASE_MS = 25_000;

export type ProviderBalance = {
  balanceUsd: number | null;
  rpm: number | null;
  rpmPlan: string | null;
  spendLimitUsd: number | null;
  spentUsd: number | null;
  remainingUsd: number | null;
  limitReached: boolean;
};

export type ProviderSubscription = {
  mode: string | null;
  plan: string | null;
  unlimited: boolean;
  tokenLimit: number | null;
  tokensUsed: number | null;
  tokensRemaining: number | null;
  expiresAt: string | null;
  resetsAt: string | null;
  allowed: boolean | null;
};

export type QuotaObservation = {
  observedAt: string | null;
  checkedAt: string | null;
  resetsAt: string | null;
  unlimited: boolean;
  error: string | null;
  checking: boolean;
};

export function isProviderObject(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Unknown values must never become a successful zero observation. */
export function providerNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function tokenCount(value: unknown) {
  const parsed = providerNumber(value);

  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("Provider returned an invalid quota timestamp.");
  }

  return new Date(value).toISOString();
}

/**
 * Two documented envelopes are accepted. The first is the default provider's,
 * which publishes `balance_usd` plus its key limits. The second is a
 * marketplace wallet, which publishes `balances.consumer_balance` as a USD
 * string and no limits. An empty `balances` object is a wallet funded at zero —
 * that is how an unfunded account is published — while a present value that
 * cannot be read still throws, so a broken provider never looks like `$0`.
 */
export function parseProviderBalance(value: unknown): ProviderBalance {
  if (!isProviderObject(value)) {
    throw new Error("Provider returned an unknown balance.");
  }

  const wallet = walletBalance(value);

  if (wallet !== null) {
    return {
      balanceUsd: wallet,
      rpm: null,
      rpmPlan: null,
      spendLimitUsd: null,
      spentUsd: null,
      remainingUsd: null,
      limitReached: false,
    };
  }

  if (providerNumber(value.balance_usd) === null) {
    throw new Error("Provider returned an unknown balance.");
  }

  const apiKey = isProviderObject(value.api_key) ? value.api_key : {};

  return {
    balanceUsd: providerNumber(value.balance_usd),
    rpm: tokenCount(value.rpm),
    rpmPlan: text(value.rpm_plan),
    spendLimitUsd: providerNumber(apiKey.spend_limit_usd),
    spentUsd: providerNumber(apiKey.spent_usd),
    remainingUsd: providerNumber(apiKey.remaining_usd),
    limitReached: apiKey.limit_reached === true,
  };
}

/** `null` means "not this shape", so the primary reader can decide. */
function walletBalance(value: Record<string, unknown>): number | null {
  if (!isProviderObject(value.balances)) return null;

  const published = value.balances.consumer_balance;

  if (published === undefined || published === null || published === "") {
    return 0;
  }

  const parsed = providerNumber(published);

  if (parsed === null) {
    throw new Error("Provider returned an unknown balance.");
  }

  return parsed;
}

export function parseProviderSubscription(
  value: unknown,
): ProviderSubscription {
  if (!isProviderObject(value) || typeof value.allowed !== "boolean") {
    throw new Error("Provider returned unknown quota permission.");
  }

  const unlimited = value.unlimited === true;
  const tokenLimit = tokenCount(value.token_limit);
  const tokensUsed = tokenCount(value.tokens_used);
  const tokensRemaining = tokenCount(value.tokens_remaining);

  if (
    !unlimited &&
    (tokenLimit === null ||
      tokensUsed === null ||
      tokensRemaining === null ||
      tokensUsed > tokenLimit ||
      tokensRemaining > tokenLimit ||
      tokensUsed + tokensRemaining > tokenLimit)
  ) {
    throw new Error(
      "Provider returned incomplete or inconsistent quota counters.",
    );
  }

  return {
    mode: text(value.mode),
    plan: text(value.plan_label) ?? text(value.plan),
    unlimited,
    tokenLimit,
    tokensUsed,
    tokensRemaining,
    expiresAt: timestamp(value.expires_at_utc),
    resetsAt: timestamp(value.resets_at_utc),
    allowed: value.allowed,
  };
}

export function observationIsRecent(at: string | null, now = Date.now()) {
  const time = at === null ? NaN : Date.parse(at);

  return Number.isFinite(time) && time <= now && now - time < QUOTA_MAX_AGE_MS;
}

/** Validity is a safety guard; explicit checks always fetch upstream again. */
export function quotaIsCurrent(
  input: {
    quota: QuotaObservation;
    subscriptionMode: string | null;
    subscriptionExpiresAt: string | null;
  },
  now = Date.now(),
) {
  const { quota } = input;

  if (
    quota.error ||
    quota.checking ||
    !observationIsRecent(quota.observedAt, now)
  ) {
    return false;
  }

  if (
    input.subscriptionMode === "free" &&
    quota.observedAt &&
    (quota.resetsAt !==
      nextUtcReset(Date.parse(quota.observedAt)).toISOString() ||
      nextUtcReset(Date.parse(quota.observedAt)).getTime() <= now)
  )
    return false;

  for (const boundary of [quota.resetsAt, input.subscriptionExpiresAt]) {
    if (
      boundary &&
      (!Number.isFinite(Date.parse(boundary)) || Date.parse(boundary) <= now)
    )
      return false;
  }

  return true;
}

/**
 * Whether the stored observation is one this provider can actually make.
 *
 * `quotaIsCurrent` answers for subscription metering. A provider that only
 * publishes a wallet balance has no quota endpoint at all, so judging it by the
 * subscription clock reported every wallet-only account as permanently unknown
 * and, before FID-2026-1124-003, stored a fabricated `quota_error` on each check.
 * The capability decides which clock applies; an account that publishes neither
 * is never stale, because there is nothing to refresh.
 */
export function providerObservationIsCurrent(
  input: {
    supportsSubscription: boolean;
    supportsBalance: boolean;
    quota: QuotaObservation;
    balanceObservedAt: string | null;
    subscriptionMode: string | null;
    subscriptionExpiresAt: string | null;
  },
  now = Date.now(),
) {
  if (input.supportsSubscription) {
    return quotaIsCurrent(
      {
        quota: input.quota,
        subscriptionMode: input.subscriptionMode,
        subscriptionExpiresAt: input.subscriptionExpiresAt,
      },
      now,
    );
  }

  if (input.supportsBalance) {
    return (
      !input.quota.error &&
      !input.quota.checking &&
      observationIsRecent(input.balanceObservedAt, now)
    );
  }

  return true;
}
