import assert from "node:assert/strict";
import test from "node:test";

import { nextUtcReset } from "../lib/free-pool.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  claimRuntimeLease,
  completeRuntimeCheck,
} from "../lib/storage/ledger/quota.ts";
import {
  ensureProviderObservation,
  refreshProviderRuntime,
} from "../lib/storage/providers/runtime.ts";
import {
  syncAllEnabled,
  syncProvider,
} from "../lib/storage/providers/sync.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-31T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const LATER = "2026-10-31T12:00:40.000Z";

const BALANCE = {
  balanceUsd: 12.5,
  rpm: 60,
  rpmPlan: "pro",
  spendLimitUsd: null,
  spentUsd: null,
  remainingUsd: null,
  limitReached: false,
};

const SUBSCRIPTION = {
  mode: "free",
  plan: "Free",
  unlimited: false,
  tokenLimit: 100,
  tokensUsed: 40,
  tokensRemaining: 60,
  expiresAt: null,
  resetsAt: null,
  allowed: true,
};

/**
 * The provider account path on the target engine (FID-086, Batch B).
 *
 * Two failure modes justify this suite, and both cost real money:
 *
 * 1. **A late check overwriting a newer one.** The lease is the guard: claiming
 *    is conditional on no live lease, and completing is conditional on still
 *    owning it.
 * 2. **A bad catalog response replacing a working one.** Pagination validation
 *    runs before any write, so a malformed body or an abandoned cursor throws
 *    with the existing catalog untouched.
 */
async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  for (const [slug, label, mode] of [
    ["free", "Free", "free"],
    ["paid", "Paid", "paid"],
  ]) {
    await db
      .prepare(
        `INSERT INTO model_groups
          (slug, label, billing_mode, sort_order, is_system, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, ?, ?)
         ON CONFLICT (slug) DO NOTHING`,
      )
      .run(slug, label, mode, NOW, NOW);
  }

  return db;
}

async function addProvider(db, slug, overrides = {}) {
  await db
    .prepare(
      `INSERT INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, supports_subscription, supports_pricing, enabled,
         sort_order, status, created_at, updated_at)
       VALUES (?, ?, 'openai', 'https://example.test', ?, '{}', 1, 1, 1, ?,
               0, 'unconfigured', ?, ?)`,
    )
    .run(
      slug,
      slug,
      overrides.keyEnvVar ?? `KEY_${slug.toUpperCase()}`,
      overrides.enabled === false ? 0 : 1,
      NOW,
      NOW,
    );
}

function catalog(models) {
  return new Response(JSON.stringify({ data: models }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("a runtime lease is exclusive and expires", async () => {
  const db = await fixture();

  try {
    await addProvider(db, "p1");

    assert.equal(
      await claimRuntimeLease(db, { slug: "p1", id: "a", at: NOW }),
      true,
    );
    assert.equal(
      await claimRuntimeLease(db, { slug: "p1", id: "b", at: NOW }),
      false,
      "a second check cannot take a live lease",
    );
    assert.equal(
      await claimRuntimeLease(db, { slug: "p1", id: "c", at: LATER }),
      true,
      "an expired lease can be taken over",
    );

    const row = await db
      .prepare(
        "SELECT quota_observed_at, balance_observed_at FROM providers WHERE slug = 'p1'",
      )
      .get();

    assert.equal(row.quota_observed_at, null, "a claim is not an observation");
    assert.equal(row.balance_observed_at, null);
  } finally {
    await db.close();
  }
});

test("completion writes the observation only for the lease that owns it", async () => {
  const db = await fixture();

  try {
    await addProvider(db, "p1");
    await claimRuntimeLease(db, { slug: "p1", id: "a", at: NOW });

    const written = await completeRuntimeCheck(db, {
      slug: "p1",
      id: "a",
      startedAt: NOW,
      checkedAt: "2026-10-31T12:00:05.000Z",
      balance: BALANCE,
      subscription: SUBSCRIPTION,
      quotaError: null,
      error: null,
    });

    assert.equal(written, true);

    const row = await db.prepare("SELECT * FROM providers WHERE slug = 'p1'").get();

    assert.equal(row.status, "active");
    assert.equal(Number(row.balance_usd), 12.5);
    assert.equal(Number(row.subscription_tokens_remaining), 60);
    assert.equal(Number(row.subscription_allowed), 1);
    assert.equal(Number(row.quota_unlimited), 0);
    assert.equal(row.quota_observed_at, NOW);
    assert.equal(row.runtime_lease_id, null);

    assert.equal(
      await completeRuntimeCheck(db, {
        slug: "p1",
        id: "a",
        startedAt: NOW,
        checkedAt: NOW,
        balance: BALANCE,
        subscription: SUBSCRIPTION,
        quotaError: null,
        error: null,
      }),
      false,
      "a superseded response writes nothing",
    );
  } finally {
    await db.close();
  }
});

test("overlapping checks share one upstream read", async () => {
  const db = await fixture();
  let balanceCalls = 0;
  let subscriptionCalls = 0;

  process.env.KEY_P1 = "secret";

  try {
    await addProvider(db, "p1", { keyEnvVar: "KEY_P1" });

    const deps = {
      fetchBalance: async () => {
        balanceCalls += 1;

        return BALANCE;
      },
      // A free-mode observation only counts as current while its reported
      // reset boundary is the next UTC reset; anything else reads as stale and
      // must trigger a re-read. The fixture therefore reports a real boundary.
      fetchSubscription: async () => {
        subscriptionCalls += 1;

        return {
          ...SUBSCRIPTION,
          resetsAt: nextUtcReset(Date.now()).toISOString(),
        };
      },
    };
    const [first, second] = await Promise.all([
      refreshProviderRuntime(db, "p1", deps),
      refreshProviderRuntime(db, "p1", deps),
    ]);

    assert.equal(balanceCalls, 1, "the second caller joined the first check");
    assert.equal(subscriptionCalls, 1);
    assert.equal(first.balance.balanceUsd, 12.5);
    assert.equal(second.warnings.length, 0);

    const status = await ensureProviderObservation(db, "p1", deps);

    assert.equal(
      balanceCalls,
      1,
      "a fresh observation is reused instead of re-read",
    );
    assert.equal(status.status, "active");
  } finally {
    await db.close();
    delete process.env.KEY_P1;
  }
});

test("a failed quota read is recorded, not thrown", async () => {
  const db = await fixture();

  process.env.KEY_P1 = "secret";

  try {
    await addProvider(db, "p1", { keyEnvVar: "KEY_P1" });

    const result = await refreshProviderRuntime(db, "p1", {
      fetchBalance: async () => BALANCE,
      fetchSubscription: async () => {
        throw new Error("subscription endpoint returned 401");
      },
    });

    assert.equal(result.subscription, null);
    assert.ok(result.warnings.some((warning) => warning.startsWith("Quota:")));

    const row = await db
      .prepare("SELECT status, error FROM providers WHERE slug = 'p1'")
      .get();

    assert.equal(row.status, "error");
    assert.match(row.error, /401/);
  } finally {
    await db.close();
    delete process.env.KEY_P1;
  }
});

test("a disabled or unconfigured provider is not checked", async () => {
  const db = await fixture();
  let calls = 0;

  try {
    await addProvider(db, "off", {
      keyEnvVar: "KEY_OFF",
      enabled: false,
    });
    await addProvider(db, "nokey", { keyEnvVar: "KEY_MISSING_XYZ" });
    delete process.env.KEY_MISSING_XYZ;

    const disabled = await refreshProviderRuntime(db, "off", {
      fetchBalance: async () => {
        calls += 1;

        return BALANCE;
      },
    });
    const unconfigured = await refreshProviderRuntime(db, "nokey", {
      fetchBalance: async () => {
        calls += 1;

        return BALANCE;
      },
    });

    assert.equal(calls, 0);
    assert.match(disabled.warnings[0], /disabled|credential/);
    assert.match(unconfigured.warnings[0], /disabled|credential/);
  } finally {
    await db.close();
  }
});

test("a sync imports the catalog and preserves the provider scope", async () => {
  const db = await fixture();

  process.env.KEY_P1 = "secret";

  try {
    await addProvider(db, "p1", { keyEnvVar: "KEY_P1" });

    const summary = await syncProvider(db, "p1", {
      request: async () =>
        catalog([
          { id: "free/alpha", name: "Alpha", weight: 2, allowFree: true },
          {
            id: "beta",
            name: "Beta",
            dollarsPer1M: 1,
            outputDollarsPer1M: 2,
            context_window: "128k",
          },
        ]),
      fetchBalance: async () => BALANCE,
      fetchSubscription: async () => SUBSCRIPTION,
    });

    assert.equal(summary.imported, 2);
    assert.equal(summary.free, 1);
    assert.equal(summary.paid, 1);
    assert.equal(summary.subscriptionOnly, 0);

    const rows = await db
      .prepare("SELECT * FROM models WHERE upstream_slug = 'p1' ORDER BY id")
      .all();

    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => row.id),
      ["p1/beta", "p1/free/alpha"],
      "a non-default provider is namespaced",
    );

    const freeRow = rows.find((row) => row.id === "p1/free/alpha");
    const paidRow = rows.find((row) => row.id === "p1/beta");

    assert.equal(Number(freeRow.allow_free), 1);
    assert.equal(Number(freeRow.input_price_micros), 0);
    assert.equal(paidRow.price_source, "auto");
    assert.equal(Number(paidRow.input_price_micros), 1_000_000);
    assert.equal(Number(paidRow.sell_input_micros), 1_250_000, "25% default markup");
    assert.ok(
      Number(paidRow.sell_output_micros) > Number(paidRow.sell_input_micros),
    );

    const provider = await db
      .prepare("SELECT synced_at FROM providers WHERE slug = 'p1'")
      .get();

    assert.ok(provider.synced_at);
  } finally {
    await db.close();
    delete process.env.KEY_P1;
  }
});

test("an unconfigured provider syncs nothing and says why", async () => {
  const db = await fixture();

  try {
    await addProvider(db, "nokey", { keyEnvVar: "KEY_MISSING_XYZ" });
    delete process.env.KEY_MISSING_XYZ;

    const summary = await syncProvider(db, "nokey", { request: async () => catalog([]) });

    assert.equal(summary.imported, 0);
    assert.match(summary.warnings[0], /not configured/);

    const models = await db
      .prepare("SELECT COUNT(*) AS n FROM models WHERE upstream_slug = 'nokey'")
      .get();

    assert.equal(Number(models.n), 0);
  } finally {
    await db.close();
  }
});

test("a malformed catalog is refused before anything is written", async () => {
  const db = await fixture();

  process.env.KEY_P1 = "secret";

  try {
    await addProvider(db, "p1", { keyEnvVar: "KEY_P1" });

    await assert.rejects(
      () =>
        syncProvider(db, "p1", {
          request: async () =>
            new Response(JSON.stringify({ error: "unauthorized" }), {
              status: 200,
            }),
          fetchBalance: async () => BALANCE,
          fetchSubscription: async () => SUBSCRIPTION,
        }),
      /no model list|not valid JSON|refusing to replace/i,
    );

    const models = await db
      .prepare("SELECT COUNT(*) AS n FROM models WHERE upstream_slug = 'p1'")
      .get();

    assert.equal(Number(models.n), 0, "the existing catalog is untouched");
  } finally {
    await db.close();
    delete process.env.KEY_P1;
  }
});

test("one failing provider does not stop the others", async () => {
  const db = await fixture();

  process.env.KEY_P1 = "secret";
  process.env.KEY_P2 = "secret";

  try {
    await addProvider(db, "p1", { keyEnvVar: "KEY_P1" });
    await addProvider(db, "p2", { keyEnvVar: "KEY_P2" });

    const summary = await syncAllEnabled(db, {
      // Every other provider fails too, so a passing row can only come from
      // the transport rather than from a seeded, reachable account.
      request: async (provider) =>
        provider.slug === "p2"
          ? catalog([{ id: "gamma", name: "Gamma", dollarsPer1M: 1 }])
          : new Response("upstream exploded", { status: 500 }),
      fetchBalance: async () => BALANCE,
      fetchSubscription: async () => SUBSCRIPTION,
    });

    const ours = summary.providers.filter(
      (row) => row.slug === "p1" || row.slug === "p2",
    );

    assert.equal(ours.length, 2);
    assert.equal(
      ours.reduce((total, row) => total + row.imported, 0),
      1,
      "only the reachable provider imports",
    );
    assert.ok(summary.warnings.some((warning) => warning.startsWith("p1:")));

    const rows = await db
      .prepare(
        "SELECT id FROM models WHERE upstream_slug IN ('p1', 'p2') ORDER BY id",
      )
      .all();

    assert.deepEqual(
      rows.map((row) => row.id),
      ["p2/gamma"],
    );
  } finally {
    await db.close();
    delete process.env.KEY_P1;
    delete process.env.KEY_P2;
  }
});
