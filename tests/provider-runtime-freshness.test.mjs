import assert from "node:assert/strict";
import test from "node:test";

import { providerObservationIsCurrent } from "../lib/provider-quota.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { ensureProviderObservation } from "../lib/storage/providers/runtime.ts";

import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);

/**
 * Provider freshness follows the declared capability (FID-2026-1124-003).
 *
 * Before this, only subscription metering was modelled: a provider that
 * publishes a wallet balance and no quota endpoint was treated as having failed
 * a check, which wrote a fabricated `quota_error` on every observation and made
 * the account a permanent unknown in the operations snapshot. These cases pin
 * the three clocks — subscription, balance, and nothing to observe — and the
 * store behavior that a wallet-only check is neither an error nor repeated.
 */
function observation(overrides = {}) {
  return {
    supportsSubscription: false,
    supportsBalance: false,
    quota: {
      observedAt: null,
      checkedAt: null,
      resetsAt: null,
      unlimited: false,
      error: null,
      checking: false,
    },
    balanceObservedAt: null,
    subscriptionMode: null,
    subscriptionExpiresAt: null,
    ...overrides,
  };
}

test("a provider that publishes no quota is never stale", () => {
  assert.equal(providerObservationIsCurrent(observation(), NOW_MS), true);
});

test("a wallet-only provider is judged by its balance observation", () => {
  const base = observation({ supportsBalance: true });

  assert.equal(providerObservationIsCurrent(base, NOW_MS), false);
  assert.equal(
    providerObservationIsCurrent(
      { ...base, balanceObservedAt: new Date(NOW_MS - 1_000).toISOString() },
      NOW_MS,
    ),
    true,
  );
  assert.equal(
    providerObservationIsCurrent(
      { ...base, balanceObservedAt: new Date(NOW_MS - 60_000).toISOString() },
      NOW_MS,
    ),
    false,
    "an expired balance is not evidence",
  );
});

test("a wallet error or an in-flight check is not current", () => {
  const base = observation({ supportsBalance: true, balanceObservedAt: NOW });

  assert.equal(
    providerObservationIsCurrent(
      { ...base, quota: { ...base.quota, error: "upstream 401" } },
      NOW_MS,
    ),
    false,
  );
  assert.equal(
    providerObservationIsCurrent(
      { ...base, quota: { ...base.quota, checking: true } },
      NOW_MS,
    ),
    false,
  );
});

test("a subscription provider still needs a current quota", () => {
  const base = observation({
    supportsSubscription: true,
    supportsBalance: true,
  });

  assert.equal(providerObservationIsCurrent(base, NOW_MS), false);
  assert.equal(
    providerObservationIsCurrent(
      {
        ...base,
        quota: {
          ...base.quota,
          observedAt: new Date(NOW_MS - 1_000).toISOString(),
        },
      },
      NOW_MS,
    ),
    true,
    "a current quota satisfies a provider that also publishes a balance",
  );
});

test("a wallet-only check stores no fabricated error and is not repeated", async () => {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });
  let balanceCalls = 0;

  process.env.KEY_WALLET = "configured";

  try {
    await db
      .prepare(
        `INSERT INTO providers
          (slug, label, base_url, key_env_var, status, supports_balance,
           supports_subscription, supports_pricing, enabled, sort_order,
           created_at, updated_at)
         VALUES ('wallet', 'Wallet', 'https://example.test', 'KEY_WALLET',
                 'active', 1, 0, 0, 1, 1, ?, ?)`,
      )
      .run(NOW, NOW);

    const deps = {
      fetchBalance: async () => {
        balanceCalls += 1;

        return {
          balanceUsd: 12.5,
          rpm: 60,
          rpmPlan: null,
          spendLimitUsd: null,
          spentUsd: null,
          remainingUsd: 12.5,
          limitReached: false,
        };
      },
    };
    const first = await ensureProviderObservation(db, "wallet", deps);

    assert.equal(balanceCalls, 1);
    assert.equal(first.quota.error, null, "no fabricated quota error");
    assert.equal(first.status, "active", "a wallet-only account is not failing");
    assert.equal(first.balanceUsd, 12.5);

    const stored = await db
      .prepare("SELECT quota_error FROM providers WHERE slug = 'wallet'")
      .get();

    assert.equal(stored.quota_error, null);

    const second = await ensureProviderObservation(db, "wallet", deps);

    assert.equal(balanceCalls, 1, "a recent balance is reused, not refetched");
    assert.equal(second.balanceUsd, 12.5);
  } finally {
    await db.close();
    delete process.env.KEY_WALLET;
  }
});
