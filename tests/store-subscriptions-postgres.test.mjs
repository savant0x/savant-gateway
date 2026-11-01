import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  resolveSubscriptionAccess,
  settleSubscriptionHoldWithin,
  sweepSubscriptions,
} from "../lib/storage/store/subscription-access.ts";
import {
  activeSubscriptionRow,
  customerSubscriptionSummary,
  getSubscriptionSummary,
  listSubscriptionSummaries,
  openPeriodRow,
} from "../lib/storage/store/subscription-rows.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-10-30T12:00:00.000Z";
const PERIOD_END = "2026-11-30T12:00:00.000Z";
const NOW_MS = Date.parse("2026-10-30T12:00:00.000Z");

/**
 * Subscriptions on the target engine.
 *
 * The admission ordering is the subject: past-due blocks before free or credit
 * routing, an uncovered model falls through to `none` instead of refusing, and an
 * included call takes a hold that settlement moves into used. The allowance is
 * therefore never exceeded by requests admitted together, which is the property
 * this whole table exists to provide.
 */
async function fixture(options = {}) {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('u1', 'u1@example.test', 'Customer', 'active', ?),
              ('u2', 'u2@example.test', 'Other', 'active', ?)`,
    )
    .run(NOW, NOW);

  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES ('key_1', 'u1', 'Key', 'sk_test', 'hash_1', 'active', ?)`,
    )
    .run(NOW);

  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, context_window,
         token_weight, in_catalog, group_slug, status, sort_order, synced_at)
       VALUES ('m1', 'm1', 'savant', 'Covered', 'Family', '8k', 1, 1,
               'subscription', 'active', 0, ?),
              ('m2', 'm2', 'savant', 'Uncovered', 'Family', '8k', 1, 1,
               'paid', 'active', 0, ?)`,
    )
    .run(NOW, NOW);

  await db
    .prepare(
      `INSERT INTO plans
        (id, slug, name, status, price_micros, currency, interval,
         included_weighted_tokens, overage_mode, overage_markup_bps,
         sort_order, created_at, updated_at)
       VALUES ('plan_1', 'starter', 'Starter', 'active', 9990000, 'usd',
               'month', 10000, ?, ?, 0, ?, ?)`,
    )
    .run(options.overageMode ?? "block", options.markup ?? 0, NOW, NOW);

  const status = options.status ?? "active";

  await db
    .prepare(
      `INSERT INTO subscriptions
        (id, user_id, plan_id, status, source, plan_name_snapshot,
         price_micros_snapshot, currency_snapshot, interval_snapshot,
         included_weighted_tokens_snapshot, overage_mode_snapshot,
         overage_markup_bps_snapshot, current_period_start, current_period_end,
         created_at, updated_at)
       VALUES ('sub_1', ?, 'plan_1', ?, 'manual', 'Starter', 9990000, 'usd',
               'month', 10000, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      options.userId ?? "u1",
      status,
      options.overageMode ?? "block",
      options.markup ?? 0,
      NOW,
      options.periodEnd ?? PERIOD_END,
      NOW,
      NOW,
    );

  if (options.period !== false) {
    await db
      .prepare(
        `INSERT INTO subscription_periods
          (id, subscription_id, period_start, period_end,
           included_weighted_tokens, weighted_tokens_used,
           weighted_tokens_held, status, created_at)
         VALUES ('period_1', 'sub_1', ?, ?, ?, ?, 0, 'open', ?)`,
      )
      .run(
        NOW,
        options.periodEnd ?? PERIOD_END,
        options.included ?? 10_000,
        options.used ?? 0,
        NOW,
      );
  }

  await db
    .prepare(
      "INSERT INTO subscription_models (subscription_id, model_id) VALUES (?, ?)",
    )
    .run("sub_1", "m1");

  return db;
}

function access(db, overrides = {}) {
  return resolveSubscriptionAccess(db, {
    userId: "u1",
    keyId: "key_1",
    modelId: "m1",
    estimateWeightedTokens: 100,
    now: NOW_MS,
    ...overrides,
  });
}

test("an account with no subscription resolves to none", async () => {
  const db = await fixture();

  assert.deepEqual(await access(db, { userId: "u2" }), { kind: "none" });
});

test("a past-due subscription blocks before any routing", async () => {
  const db = await fixture({ status: "past_due", periodEnd: "2026-12-31T12:00:00.000Z" });

  const decision = await access(db);

  assert.equal(decision.kind, "blocked");
  assert.equal(decision.status, 402);
  assert.equal(decision.code, "subscription_past_due");
});

test("a model the plan does not cover falls through to none", async () => {
  const db = await fixture();

  assert.deepEqual(await access(db, { modelId: "m2" }), { kind: "none" });
});

test("an included call takes a hold against the period", async () => {
  const db = await fixture();

  const decision = await access(db);

  assert.equal(decision.kind, "included");
  assert.equal(decision.weightedTokens, 100);
  assert.equal(decision.markupBps, 0);
  assert.equal(decision.periodId, "period_1");

  const period = await openPeriodRow(db, "sub_1");

  assert.equal(Number(period.weighted_tokens_held), 100);
  assert.equal(Number(period.weighted_tokens_used), 0);

  const hold = await db
    .prepare("SELECT weighted_tokens FROM subscription_holds WHERE id = ?")
    .get(decision.holdId);

  assert.equal(Number(hold.weighted_tokens), 100);
});

test("an exhausted allowance is refused when overage is blocked", async () => {
  const db = await fixture({ included: 100, used: 100 });

  const decision = await access(db);

  assert.equal(decision.kind, "blocked");
  assert.equal(decision.code, "subscription_limit_reached");
});

test("an exhausted allowance becomes overage when the plan allows it", async () => {
  const db = await fixture({ included: 100, used: 100, overageMode: "credit", markup: 1_500 });

  const decision = await access(db);

  assert.equal(decision.kind, "overage");
  assert.equal(decision.markupBps, 1_500);
});

test("a subscription without an open period reports a 503", async () => {
  const db = await fixture({ period: false });

  const decision = await access(db);

  assert.equal(decision.kind, "blocked");
  assert.equal(decision.status, 503);
  assert.equal(decision.code, "subscription_period_missing");
});

test("settlement moves the hold into used and frees the held amount", async () => {
  const db = await fixture();

  const decision = await access(db);

  assert.equal(decision.kind, "included");

  const periodId = await settleSubscriptionHoldWithin(db, decision.holdId, 40);

  assert.equal(periodId, "period_1");

  const period = await openPeriodRow(db, "sub_1");

  assert.equal(Number(period.weighted_tokens_held), 0);
  assert.equal(Number(period.weighted_tokens_used), 40);

  assert.equal(
    await settleSubscriptionHoldWithin(db, decision.holdId, 40),
    0,
    "a replayed settlement finds no hold and counts nothing twice",
  );
});

test("the sweep expires a subscription whose period ended", async () => {
  const db = await fixture();

  await sweepSubscriptions(db, Date.parse("2026-12-01T00:00:00.000Z"));

  const row = await db
    .prepare("SELECT status FROM subscriptions WHERE id = ?")
    .get("sub_1");

  assert.equal(row.status, "expired");

  const period = await db
    .prepare("SELECT status FROM subscription_periods WHERE id = ?")
    .get("period_1");

  assert.equal(period.status, "closed");
});

test("a summary composes the snapshot, the allowance and the entitlements", async () => {
  const db = await fixture();

  const row = await activeSubscriptionRow(db, "u1");

  assert.ok(row);

  const summary = await getSubscriptionSummary(db, "sub_1");

  assert.equal(summary.plan.name, "Starter");
  assert.equal(summary.plan.priceMicros, 9_990_000);
  assert.equal(summary.plan.includedWeightedTokens, 10_000);
  assert.equal(summary.entitlementCount, 1);
  assert.equal(summary.customerEmail, "u1@example.test");
  assert.equal(summary.cancelAtPeriodEnd, false);
  assert.ok(summary.allowance, "the open period's allowance is included");

  const listed = await listSubscriptionSummaries(db, 10);

  assert.equal(listed.length, 1);

  const customer = await customerSubscriptionSummary(db, "u1");

  assert.equal(customer.id, "sub_1");
});
