import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { createPostgresPool } from "../lib/storage/pg-pool.ts";
import { migrateDatabase } from "../lib/storage/schema/index.ts";
import { resolveSubscriptionAccess } from "../lib/storage/store/subscription-access.ts";
import { revokeSubscription } from "../lib/storage/store/subscription-lifecycle.ts";
import { refreshSubscriptionEntitlements } from "../lib/storage/store/subscription-admin.ts";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();

/**
 * Real two-connection admission proof (FID-2026-1105-009).
 *
 * PGlite serializes connections, so these tests skip in the ordinary suite and
 * are registered in scripts/postgres-concurrency-proof.mjs, which fails when no
 * disposable PostgreSQL is available.
 */
function handles(suffix) {
  return [
    createPostgresDatabase({
      pool: createPostgresPool({
        connectionString: TEST_DATABASE_URL,
        applicationName: `sub_admission_${suffix}_a`,
      }),
    }),
    createPostgresDatabase({
      pool: createPostgresPool({
        connectionString: TEST_DATABASE_URL,
        applicationName: `sub_admission_${suffix}_b`,
      }),
    }),
  ];
}

const NOW = "2026-11-05T12:00:00.000Z";
const PERIOD_END = "2026-12-05T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);

async function seed(first, options = {}) {
  const suffix = randomUUID().slice(0, 10);
  const ids = {
    suffix,
    user: `admission_${suffix}`,
    key: `key_${suffix}`,
    plan: `plan_${suffix}`,
    subscription: `sub_${suffix}`,
    period: `period_${suffix}`,
    model: `model_${suffix}`,
    otherModel: `other_${suffix}`,
  };

  await first
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES (?, ?, 'Admission', 'active', ?)`,
    )
    .run(ids.user, `${ids.user}@example.test`, NOW);
  await first
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES (?, ?, 'Key', ?, ?, 'active', ?)`,
    )
    .run(ids.key, ids.user, ids.key, `hash_${ids.suffix}`, NOW);
  await first
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, context_window,
         token_weight, in_catalog, group_slug, status, sort_order, synced_at)
       VALUES (?, ?, 'savant', 'Covered', 'Family', '8k', 1, 1,
               'subscription', 'active', 0, ?),
              (?, ?, 'savant', 'Other', 'Family', '8k', 1, 1,
               'subscription', 'active', 1, ?)`,
    )
    .run(ids.model, ids.model, NOW, ids.otherModel, ids.otherModel, NOW);
  await first
    .prepare(
      `INSERT INTO plans
        (id, slug, name, status, price_micros, currency, interval,
         included_weighted_tokens, overage_mode, overage_markup_bps,
         sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 'active', 1000, 'usd', 'month', 100,
               ?, 1500, 0, ?, ?)`,
    )
    .run(
      ids.plan,
      ids.plan,
      `Admission ${ids.suffix}`,
      options.overageMode ?? "block",
      NOW,
      NOW,
    );
  await first
    .prepare(
      `INSERT INTO plan_models (plan_id, model_id) VALUES (?, ?)`,
    )
    .run(ids.plan, ids.model);
  await first
    .prepare(
      `INSERT INTO subscriptions
        (id, user_id, plan_id, status, source, plan_name_snapshot,
         price_micros_snapshot, currency_snapshot, interval_snapshot,
         included_weighted_tokens_snapshot, overage_mode_snapshot,
         overage_markup_bps_snapshot, current_period_start, current_period_end,
         created_at, updated_at)
       VALUES (?, ?, ?, 'active', 'manual', ?, 1000, 'usd', 'month',
               100, ?, 1500, ?, ?, ?, ?)`,
    )
    .run(
      ids.subscription,
      ids.user,
      ids.plan,
      `Admission ${ids.suffix}`,
      options.overageMode ?? "block",
      NOW,
      PERIOD_END,
      NOW,
      NOW,
    );
  await first
    .prepare(
      `INSERT INTO subscription_periods
        (id, subscription_id, period_start, period_end,
         included_weighted_tokens, weighted_tokens_used,
         weighted_tokens_held, status, created_at)
       VALUES (?, ?, ?, ?, 100, 0, 0, 'open', ?)`,
    )
    .run(ids.period, ids.subscription, NOW, PERIOD_END, NOW);
  await first
    .prepare(
      `INSERT INTO subscription_models (subscription_id, model_id)
       VALUES (?, ?)`,
    )
    .run(ids.subscription, ids.model);

  return ids;
}

async function blockUser(pool, userId) {
  const lease = await pool.connect();

  await lease.query("BEGIN");
  await lease.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);

  return lease;
}

async function waitForWaiters(db, expected, pattern) {
  const deadline = Date.now() + 8_000;
  let waiting = 0;

  while (Date.now() < deadline) {
    const rows = await db.query(
      `SELECT COUNT(*)::int AS total FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query ILIKE $1`,
      [pattern],
    );

    waiting = Number(rows[0].total);

    if (waiting >= expected) return waiting;

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return waiting;
}

function access(db, ids) {
  return resolveSubscriptionAccess(db, {
    userId: ids.user,
    keyId: ids.key,
    modelId: ids.model,
    estimateWeightedTokens: 80,
    now: NOW_MS,
  });
}

async function assertOneIncluded(first, ids) {
  const period = await first
    .prepare(
      `SELECT weighted_tokens_held, weighted_tokens_used
         FROM subscription_periods WHERE id = ?`,
    )
    .get(ids.period);
  const holds = await first
    .prepare(
      "SELECT COUNT(*)::int AS total FROM subscription_holds WHERE period_id = ?",
    )
    .get(ids.period);

  assert.equal(Number(period.weighted_tokens_held), 80);
  assert.equal(Number(period.weighted_tokens_used), 0);
  assert.equal(Number(holds.total), 1);
}

test("two connections cannot both reserve the same block-mode allowance", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip(
      "TEST_DATABASE_URL is required for the subscription admission race",
    );

    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const [first, second] = handles(suffix);
  const blockerPool = createPostgresPool({
    connectionString: TEST_DATABASE_URL,
    applicationName: `sub_admission_blocker_${suffix}`,
  });
  let ids;
  let blocker;

  try {
    await migrateDatabase(first);
    ids = await seed(first);
    blocker = await blockUser(blockerPool, ids.user);

    const pending = Promise.all([access(first, ids), access(second, ids)]);
    const waiting = await waitForWaiters(first, 2, "%FROM users%");

    assert.equal(waiting, 2, "both decisions must contend on the user lock");

    await blocker.query("COMMIT");

    const outcomes = await pending;
    const included = outcomes.filter((outcome) => outcome.kind === "included");
    const blocked = outcomes.filter((outcome) => outcome.kind === "blocked");

    assert.equal(included.length, 1);
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].code, "subscription_limit_reached");
    await assertOneIncluded(first, ids);
  } finally {
    if (blocker) {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
    if (ids) {
      await first.prepare("DELETE FROM users WHERE id = ?").run(ids.user).catch(() => undefined);
    }
    await first.close();
    await second.close();
    await blockerPool.end?.();
  }
});

test("credit-overage mode admits exactly one included hold", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip("TEST_DATABASE_URL is required for the overage admission race");

    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const [first, second] = handles(suffix);
  const blockerPool = createPostgresPool({
    connectionString: TEST_DATABASE_URL,
    applicationName: `sub_overage_blocker_${suffix}`,
  });
  let ids;
  let blocker;

  try {
    await migrateDatabase(first);
    ids = await seed(first, { overageMode: "credit" });
    blocker = await blockUser(blockerPool, ids.user);

    const pending = Promise.all([access(first, ids), access(second, ids)]);
    assert.equal(await waitForWaiters(first, 2, "%FROM users%"), 2);

    await blocker.query("COMMIT");

    const outcomes = await pending;

    assert.equal(
      outcomes.filter((outcome) => outcome.kind === "included").length,
      1,
    );
    assert.equal(
      outcomes.filter((outcome) => outcome.kind === "overage").length,
      1,
    );
    await assertOneIncluded(first, ids);
  } finally {
    if (blocker) {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
    if (ids) {
      await first.prepare("DELETE FROM users WHERE id = ?").run(ids.user).catch(() => undefined);
    }
    await first.close();
    await second.close();
    await blockerPool.end?.();
  }
});

test("revocation and admission cannot leave a held allowance behind", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip("TEST_DATABASE_URL is required for the revocation race");

    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const [first, second] = handles(suffix);
  const blockerPool = createPostgresPool({
    connectionString: TEST_DATABASE_URL,
    applicationName: `sub_revoke_blocker_${suffix}`,
  });
  let ids;
  let blocker;

  try {
    await migrateDatabase(first);
    ids = await seed(first);
    blocker = await blockUser(blockerPool, ids.user);

    const pending = Promise.all([
      access(first, ids),
      revokeSubscription(second, ids.subscription),
    ]);
    assert.equal(await waitForWaiters(first, 2, "%FROM users%"), 2);

    await blocker.query("COMMIT");

    const [, revoked] = await pending;

    assert.ok(revoked);

    const subscription = await first
      .prepare("SELECT status FROM subscriptions WHERE id = ?")
      .get(ids.subscription);
    const period = await first
      .prepare("SELECT status FROM subscription_periods WHERE id = ?")
      .get(ids.period);
    const holds = await first
      .prepare(
        "SELECT COUNT(*)::int AS total FROM subscription_holds WHERE subscription_id = ?",
      )
      .get(ids.subscription);

    assert.equal(subscription.status, "canceled");
    assert.equal(period.status, "closed");
    assert.equal(Number(holds.total), 0);
  } finally {
    if (blocker) {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
    if (ids) {
      await first.prepare("DELETE FROM users WHERE id = ?").run(ids.user).catch(() => undefined);
    }
    await first.close();
    await second.close();
    await blockerPool.end?.();
  }
});

test("entitlement refresh and admission serialize on the subscription", async (context) => {
  if (!TEST_DATABASE_URL) {
    context.skip("TEST_DATABASE_URL is required for the entitlement race");

    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const [first, second] = handles(suffix);
  const blockerPool = createPostgresPool({
    connectionString: TEST_DATABASE_URL,
    applicationName: `sub_refresh_blocker_${suffix}`,
  });
  let ids;
  let blocker;

  try {
    await migrateDatabase(first);
    ids = await seed(first);
    blocker = await blockUser(blockerPool, ids.user);

    const pending = Promise.all([
      access(first, ids),
      refreshSubscriptionEntitlements(second, ids.subscription),
    ]);
    assert.equal(await waitForWaiters(first, 2, "%FROM users%"), 2);

    await blocker.query("COMMIT");

    const [decision, refreshed] = await pending;
    const holds = await first
      .prepare(
        "SELECT COALESCE(SUM(weighted_tokens), 0) AS total FROM subscription_holds WHERE period_id = ?",
      )
      .get(ids.period);

    assert.ok(refreshed.ok);
    assert.ok(["included", "none"].includes(decision.kind));
    assert.equal(Number(holds.total), decision.kind === "included" ? 80 : 0);
  } finally {
    if (blocker) {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
    if (ids) {
      await first.prepare("DELETE FROM users WHERE id = ?").run(ids.user).catch(() => undefined);
    }
    await first.close();
    await second.close();
    await blockerPool.end?.();
  }
});
