import "server-only";

import type { ProviderRecord } from "./types";

import { authHeaders } from "./auth-headers";
import { readProviderError } from "./error-text.ts";

export { readProviderError };

export class ProviderConfigError extends Error {}

export type ProviderBalance = {
  balanceUsd: number;
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
  allowed: boolean | null;
};

export function getProviderKey(provider: ProviderRecord) {
  const key = process.env[provider.keyEnvVar]?.trim();

  if (!key) {
    throw new ProviderConfigError(
      `${provider.keyEnvVar} is not configured. Add it to .env.local and restart the server.`,
    );
  }

  return key;
}

export function providerHeaders(
  provider: ProviderRecord,
): Record<string, string> {
  return authHeaders(
    provider.kind,
    getProviderKey(provider),
    provider.defaultHeaders,
  );
}

export function providerFetch(
  provider: ProviderRecord,
  path: string,
  init: RequestInit = {},
) {
  const headers = providerHeaders(provider);

  if (
    init.headers &&
    !(init.headers instanceof Headers) &&
    !Array.isArray(init.headers)
  ) {
    Object.assign(headers, init.headers);
  }

  return fetch(`${provider.baseUrl}${path}`, {
    ...init,
    headers,
    // An operator-configured origin must not bounce the request (and the
    // credential on it) to a different host. A redirect is a configuration
    // error to report, not a hop to follow.
    redirect: init.redirect ?? "error",
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchProviderBalance(
  provider: ProviderRecord,
): Promise<ProviderBalance> {
  const response = await providerFetch(provider, "/balance");

  if (!response.ok) throw new Error(await readProviderError(response));

  const data = (await response.json()) as {
    balance_usd?: unknown;
    rpm?: unknown;
    rpm_plan?: string | null;
    api_key?: {
      spend_limit_usd?: unknown;
      spent_usd?: unknown;
      remaining_usd?: unknown;
      limit_reached?: unknown;
    };
  };

  return {
    balanceUsd: numberOrNull(data.balance_usd) ?? 0,
    rpm: numberOrNull(data.rpm),
    rpmPlan: data.rpm_plan ?? null,
    spendLimitUsd: numberOrNull(data.api_key?.spend_limit_usd),
    spentUsd: numberOrNull(data.api_key?.spent_usd),
    remainingUsd: numberOrNull(data.api_key?.remaining_usd),
    limitReached: Boolean(data.api_key?.limit_reached),
  };
}

export async function fetchProviderSubscription(
  provider: ProviderRecord,
): Promise<ProviderSubscription> {
  const response = await providerFetch(provider, "/subscription");

  if (!response.ok) throw new Error(await readProviderError(response));

  const data = (await response.json()) as {
    mode?: string;
    plan?: string | null;
    plan_label?: string | null;
    unlimited?: unknown;
    token_limit?: unknown;
    tokens_used?: unknown;
    tokens_remaining?: unknown;
    expires_at_utc?: string | null;
    allowed?: unknown;
  };

  return {
    mode: data.mode ?? null,
    plan: data.plan_label || data.plan || null,
    unlimited: Boolean(data.unlimited),
    tokenLimit: numberOrNull(data.token_limit),
    tokensUsed: numberOrNull(data.tokens_used),
    tokensRemaining: numberOrNull(data.tokens_remaining),
    expiresAt: data.expires_at_utc ?? null,
    allowed: typeof data.allowed === "boolean" ? data.allowed : null,
  };
}
