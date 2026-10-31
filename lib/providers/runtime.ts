import "server-only";

import type { ProviderRecord } from "./types";

import { randomUUID } from "node:crypto";

import { db } from "../db";
import {
  quotaIsCurrent,
  type ProviderBalance,
  type ProviderSubscription,
} from "../provider-quota";
import { claimRuntimeLease, completeRuntimeCheck } from "../quota-ledger";
import { redactSecrets } from "../redaction";
import {
  getProvider,
  getProviderStatusBySlug,
  listProviderRecords,
} from "../store/providers";

import { providerKeyConfigured } from "./registry";
import { fetchProviderBalance, fetchProviderSubscription } from "./request";

type RuntimeResult = {
  balance: ProviderBalance | null;
  subscription: ProviderSubscription | null;
  warnings: string[];
};

const pending = new Map<string, Promise<RuntimeResult>>();

function unavailable(message: string): RuntimeResult {
  return { balance: null, subscription: null, warnings: [message] };
}

async function readRuntime(provider: ProviderRecord): Promise<RuntimeResult> {
  const startedAt = new Date().toISOString();
  const id = randomUUID();

  if (!claimRuntimeLease(db, { slug: provider.slug, id, at: startedAt })) {
    return unavailable("Provider account check is already in progress.");
  }

  const [balanceResult, quotaResult] = await Promise.allSettled([
    provider.capabilities.balance
      ? fetchProviderBalance(provider)
      : Promise.resolve(null),
    provider.capabilities.subscription
      ? fetchProviderSubscription(provider)
      : Promise.resolve(null),
  ]);
  const balance =
    balanceResult.status === "fulfilled" ? balanceResult.value : null;
  const subscription =
    quotaResult.status === "fulfilled" ? quotaResult.value : null;
  const warnings: string[] = [];
  const quotaError =
    quotaResult.status === "rejected"
      ? redactSecrets(quotaResult.reason).slice(0, 500)
      : provider.capabilities.subscription
        ? null
        : "Provider does not expose quota.";

  if (balanceResult.status === "rejected") {
    warnings.push(
      `Balance: ${redactSecrets(balanceResult.reason).slice(0, 500)}`,
    );
  }
  if (quotaResult.status === "rejected") warnings.push(`Quota: ${quotaError}`);

  if (
    !completeRuntimeCheck(db, {
      slug: provider.slug,
      id,
      startedAt,
      checkedAt: new Date().toISOString(),
      balance,
      subscription,
      quotaError,
      error: warnings.length ? warnings.join("; ") : null,
    })
  )
    return unavailable("Provider account check was superseded; check again.");

  return { balance, subscription, warnings };
}

/** No result cache: every check reads upstream; overlapping checks share work. */
export async function refreshProviderRuntime(
  slug: string,
): Promise<RuntimeResult> {
  const provider = getProvider(slug);

  if (!provider?.enabled || !providerKeyConfigured(provider.keyEnvVar)) {
    return unavailable(
      "Provider is disabled or its credential is unavailable.",
    );
  }

  const existing = pending.get(slug);

  if (existing) return existing;

  const task = readRuntime(provider);

  pending.set(slug, task);

  try {
    return await task;
  } finally {
    if (pending.get(slug) === task) pending.delete(slug);
  }
}

/**
 * A current observation, refreshing once when the stored one has expired.
 *
 * The stored reading is reported as current for only `QUOTA_MAX_AGE_MS`, and
 * past that every counter reads as null because an expired observation is not
 * evidence. Callers that must trust a counter therefore cannot just read the
 * row: a request path that only reads it refuses for as long as nobody happens
 * to open an operator page. Refreshing here makes idleness cost one upstream
 * check instead of an outage.
 *
 * A failed check is deliberately not an error: the caller re-reads the status
 * and still sees null, which stays a refusal rather than a guess.
 */
export async function ensureProviderObservation(slug: string) {
  const status = getProviderStatusBySlug(slug);

  if (
    quotaIsCurrent({
      quota: status.quota,
      subscriptionMode: status.subscriptionMode,
      subscriptionExpiresAt: status.subscriptionExpiresAt,
    })
  ) {
    return status;
  }

  try {
    await refreshProviderRuntime(slug);
  } catch {
    // Left stale on purpose; the returned status reports the truth.
  }

  return getProviderStatusBySlug(slug);
}

export async function refreshEnabledProviderAccounts() {
  await Promise.all(
    listProviderRecords()
      .filter((provider) => provider.enabled)
      .map((provider) => refreshProviderRuntime(provider.slug)),
  );
}
