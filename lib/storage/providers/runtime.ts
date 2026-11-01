import type { PostgresDatabase } from "../pg-adapter.ts";
import type { ProviderRecord } from "../../providers/types.ts";
import type {
  ProviderBalance,
  ProviderSubscription,
} from "../../provider-quota.ts";

import { randomUUID } from "node:crypto";

import { quotaIsCurrent } from "../../provider-quota.ts";
import { redactSecrets } from "../../redaction.ts";
import { providerKeyConfigured } from "../../providers/registry.ts";
import { claimRuntimeLease, completeRuntimeCheck } from "../ledger/quota.ts";
import {
  getProvider,
  getProviderStatusBySlug,
  listProviderRecords,
} from "../store/providers.ts";

/**
 * Provider account runtime, ported to the async handle (FID-086, Batch B).
 *
 * The check answers one question — may this account serve right now, and with
 * how much headroom — and its safety rules are unchanged:
 *
 * 1. **One check at a time per provider.** A lease makes the second caller wait
 *    on the first rather than hitting the upstream twice; in this port
 *    overlapping callers also share the in-flight promise.
 * 2. **A stale observation is not evidence.** `ensureProviderObservation`
 *    refreshes once when the stored reading has expired, and if that refresh
 *    fails it returns the stale status — which still reads as unknown capacity,
 *    a refusal rather than a guess.
 * 3. **A failed fetch is not an error to throw.** It is recorded on the row and
 *    returned as a warning, so an operator sees why the gateway is refusing
 *    without the caller having to handle an exception.
 *
 * The network fetchers are injected. `lib/providers/request.ts` imports
 * `server-only` and opens sockets; this module has to load under the test runner
 * and must not decide a credential's fate on its own.
 */

export type ProviderRuntimeDeps = {
  fetchBalance?: (provider: ProviderRecord) => Promise<ProviderBalance | null>;
  fetchSubscription?: (
    provider: ProviderRecord,
  ) => Promise<ProviderSubscription | null>;
};

type RuntimeResult = {
  balance: ProviderBalance | null;
  subscription: ProviderSubscription | null;
  warnings: string[];
};

const pending = new WeakMap<object, Map<string, Promise<RuntimeResult>>>();

function pendingFor(db: PostgresDatabase) {
  let map = pending.get(db);

  if (!map) {
    map = new Map();
    pending.set(db, map);
  }

  return map;
}

function unavailable(message: string): RuntimeResult {
  return { balance: null, subscription: null, warnings: [message] };
}

async function readRuntime(
  db: PostgresDatabase,
  provider: ProviderRecord,
  deps: ProviderRuntimeDeps,
): Promise<RuntimeResult> {
  const startedAt = new Date().toISOString();
  const checkedAt = new Date().toISOString();
  const id = randomUUID();

  if (
    !(await claimRuntimeLease(db, { slug: provider.slug, id, at: startedAt }))
  ) {
    return unavailable("Provider account check is already in progress.");
  }

  const [balanceResult, quotaResult] = await Promise.allSettled([
    provider.capabilities.balance && deps.fetchBalance
      ? deps.fetchBalance(provider)
      : Promise.resolve(null),
    provider.capabilities.subscription && deps.fetchSubscription
      ? deps.fetchSubscription(provider)
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

  const written = await completeRuntimeCheck(db, {
    slug: provider.slug,
    id,
    startedAt,
    checkedAt,
    balance,
    subscription,
    quotaError,
    error: warnings.length ? warnings.join("; ") : null,
  });

  if (!written) {
    return unavailable("Provider account check was superseded; check again.");
  }

  return { balance, subscription, warnings };
}

/** No result cache: every check reads upstream; overlapping checks share work. */
export async function refreshProviderRuntime(
  db: PostgresDatabase,
  slug: string,
  deps: ProviderRuntimeDeps = {},
): Promise<RuntimeResult> {
  const provider = await getProvider(db, slug);

  if (!provider?.enabled || !providerKeyConfigured(provider.keyEnvVar)) {
    return unavailable(
      "Provider is disabled or its credential is unavailable.",
    );
  }

  const map = pendingFor(db);
  const existing = map.get(slug);

  if (existing) return existing;

  const task = readRuntime(db, provider, deps);

  map.set(slug, task);

  try {
    return await task;
  } finally {
    if (map.get(slug) === task) map.delete(slug);
  }
}

/**
 * A current observation, refreshing once when the stored one has expired.
 *
 * The stored reading counts as current for only `QUOTA_MAX_AGE_MS`; past that
 * every counter reads as null because an expired observation is not evidence.
 * Refreshing here makes an idle gateway cost one upstream check instead of
 * refusing every call until someone opens an operator page.
 */
export async function ensureProviderObservation(
  db: PostgresDatabase,
  slug: string,
  deps: ProviderRuntimeDeps = {},
) {
  const status = await getProviderStatusBySlug(db, slug);

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
    await refreshProviderRuntime(db, slug, deps);
  } catch {
    // Left stale on purpose; the returned status reports the truth.
  }

  return getProviderStatusBySlug(db, slug);
}

export async function refreshEnabledProviderAccounts(
  db: PostgresDatabase,
  deps: ProviderRuntimeDeps = {},
) {
  const providers = await listProviderRecords(db);

  await Promise.all(
    providers
      .filter((provider) => provider.enabled)
      .map((provider) => refreshProviderRuntime(db, provider.slug, deps)),
  );
}
