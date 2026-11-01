import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { readAnalyticsData } from "../lib/analytics.ts";
import { subscriptionSchema } from "../lib/schema/subscriptions.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { getAnalyticsData } from "../lib/storage/store/analytics.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = new Date("2026-10-29T12:00:00.000Z");
const ONE_DAY = "2026-10-28T12:00:00.000Z";
const TWO_DAYS = "2026-10-27T12:00:00.000Z";
const THREE_DAYS = "2026-10-26T12:00:00.000Z";
const OUTSIDE = "2026-09-19T12:00:00.000Z";
const PERIOD_END = "2027-11-29T12:00:00.000Z";
const STAMP = "2026-10-20T12:00:00.000Z";

/**
 * Parity between the live SQLite report and the PostgreSQL port (FID-086).
 *
 * Both implementations are given the same logical dataset, then their outputs
 * are compared with `deepEqual`. That is a stronger statement than either
 * suite's hand-written expectations: a shared bug still fails those, but a
 * divergence introduced by the port — a day bucketed differently, a plan counted
 * in two groups, MRR normalized twice — fails here even when both sides look
 * plausible on their own.
 *
 * The dataset deliberately includes the cases where the two dialects could
 * disagree:
 *
 * - an invoice outside the window, and one with no `paid_at`
 * - failed, void and non-usd invoices, which are not revenue
 * - a canceling subscription and a manual comp, which are excluded from MRR
 * - a yearly price, which has to become a monthly run-rate
 * - a delisted model id in usage, which has no name or family to join
 * - an error call, which counts in requests but not in `ok`
 *
 * The PostgreSQL session is pinned to UTC before reading. The report's day
 * boundary is UTC by contract — SQLite's `strftime` reads the stored ISO string,
 * which is UTC — so leaving the session timezone to the server would make the
 * same data report different days on different deployments.
 */

const MODELS = [
  { id: "m1", name: "Model One", family: "GPT" },
  { id: "m2", name: "Model Two", family: "Claude" },
];

const USAGE = [
  {
    id: "use_credit",
    modelId: "m1",
    status: "ok",
    input: 100,
    output: 50,
    charged: 3_000_000,
    cost: 1_000_000,
    latency: 100,
    at: ONE_DAY,
  },
  {
    id: "use_included",
    modelId: "m1",
    status: "error",
    input: 10,
    output: 0,
    charged: 0,
    cost: 500_000,
    latency: 200,
    at: TWO_DAYS,
  },
  {
    id: "use_outside",
    modelId: "m2",
    status: "ok",
    input: 1_000,
    output: 1_000,
    charged: 1_000_000,
    cost: 0,
    latency: 300,
    at: OUTSIDE,
  },
];

const PLANS = [
  { id: "plan_month", name: "Starter", interval: "month", price: 10_000_000 },
  { id: "plan_year", name: "Annual", interval: "year", price: 120_000_000 },
  { id: "plan_comp", name: "Comp", interval: "month", price: 50_000_000 },
];

const SUBSCRIPTIONS = [
  ["sub_month", "u1", "plan_month", "active", "stripe", "Starter", 10_000_000, "month", 0],
  ["sub_year", "u2", "plan_year", "active", "stripe", "Annual", 120_000_000, "year", 0],
  ["sub_comp", "u3", "plan_comp", "active", "manual", "Comp", 50_000_000, "month", 0],
  ["sub_cancel", "u4", "plan_month", "active", "stripe", "Starter", 20_000_000, "month", 1],
  ["sub_past_due", "u5", "plan_month", "past_due", "stripe", "Starter", 30_000_000, "month", 0],
];

const INVOICES = [
  ["inv_month_paid", "sub_month", 10_000_000, "usd", "paid", ONE_DAY, ONE_DAY],
  ["inv_year_paid", "sub_year", 120_000_000, "usd", "paid", TWO_DAYS, TWO_DAYS],
  ["inv_past_due_paid", "sub_past_due", 30_000_000, "usd", "paid", THREE_DAYS, THREE_DAYS],
  ["inv_no_paid_at", "sub_month", 1_000_000, "usd", "paid", null, THREE_DAYS],
  ["inv_outside", "sub_month", 5_000_000, "usd", "paid", OUTSIDE, OUTSIDE],
  ["inv_failed", "sub_month", 10_000_000, "usd", "failed", null, ONE_DAY],
  ["inv_void", "sub_month", 10_000_000, "usd", "void", null, ONE_DAY],
  ["inv_eur", "sub_month", 7_000_000, "eur", "paid", ONE_DAY, ONE_DAY],
];

function sqliteDatabase() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE models (id TEXT PRIMARY KEY, name TEXT, provider TEXT);
    CREATE TABLE api_keys (id TEXT PRIMARY KEY);
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY,
      model_id TEXT,
      status TEXT NOT NULL DEFAULT 'ok',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      charged_micros INTEGER NOT NULL DEFAULT 0,
      cost_micros INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  subscriptionSchema(db);

  for (const model of MODELS) {
    db.prepare("INSERT INTO models (id, name, provider) VALUES (?, ?, ?)").run(
      model.id,
      model.name,
      model.family,
    );
  }

  // Subscriptions reference a customer; the live report never reads it, but the
  // schema's foreign key does.
  for (const userId of new Set(SUBSCRIPTIONS.map((row) => row[1]))) {
    db.prepare("INSERT INTO users (id) VALUES (?)").run(userId);
  }

  for (const plan of PLANS) {
    db.prepare(
      `INSERT INTO plans
        (id, slug, name, status, price_micros, currency, interval,
         included_weighted_tokens, overage_mode, overage_markup_bps, sort_order,
         created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, 'usd', ?, 0, 'block', 0, 0, ?, ?)`,
    ).run(plan.id, plan.id, plan.name, plan.price, plan.interval, STAMP, STAMP);
  }

  for (const row of SUBSCRIPTIONS) {
    const [id, userId, planId, status, source, name, price, interval, cancel] = row;

    db.prepare(
      `INSERT INTO subscriptions
        (id, user_id, plan_id, status, source, stripe_customer_id,
         stripe_subscription_id, plan_name_snapshot, price_micros_snapshot,
         currency_snapshot, interval_snapshot, included_weighted_tokens_snapshot,
         overage_mode_snapshot, overage_markup_bps_snapshot, current_period_start,
         current_period_end, cancel_at_period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'usd', ?, 0, 'block', 0, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      planId,
      status,
      source,
      `stripe_${id}`,
      name,
      price,
      interval,
      STAMP,
      PERIOD_END,
      cancel,
      STAMP,
      STAMP,
    );
  }

  for (const [id, subscriptionId, amount, currency, status, paidAt, createdAt] of INVOICES) {
    db.prepare(
      `INSERT INTO subscription_invoices
        (id, subscription_id, provider_invoice_id, amount_micros, currency,
         status, paid_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, subscriptionId, `in_${id}`, amount, currency, status, paidAt, createdAt);
  }

  for (const row of USAGE) {
    db.prepare(
      `INSERT INTO usage_events
        (id, model_id, status, input_tokens, output_tokens, charged_micros,
         cost_micros, latency_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      row.modelId,
      row.status,
      row.input,
      row.output,
      row.charged,
      row.cost,
      row.latency,
      row.at,
    );
  }

  return db;
}

async function postgresDatabase() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  // The report's day boundary is UTC; pin it rather than inherit the server's.
  await db.exec("SET TIME ZONE 'UTC'");

  for (const [index, model] of MODELS.entries()) {
    await db
      .prepare(
        `INSERT INTO models
          (id, upstream_id, upstream_slug, name, provider, context_window,
           token_weight, in_catalog, group_slug, status, sort_order, synced_at,
           input_price_micros, output_price_micros, sell_input_micros,
           sell_output_micros)
         VALUES (?, ?, 'savant', ?, ?, '8k', 1, 1, 'paid', 'active', ?, ?, 0, 0, 0, 0)`,
      )
      .run(model.id, model.id, model.name, model.family, index, STAMP);
  }

  for (const plan of PLANS) {
    await db
      .prepare(
        `INSERT INTO plans
          (id, slug, name, status, price_micros, currency, interval,
           included_weighted_tokens, overage_mode, overage_markup_bps, sort_order,
           created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, 'usd', ?, 0, 'block', 0, 0, ?, ?)`,
      )
      .run(plan.id, plan.id, plan.name, plan.price, plan.interval, STAMP, STAMP);
  }

  for (const [index, row] of SUBSCRIPTIONS.entries()) {
    const [id, userId, planId, status, source, name, price, interval, cancel] = row;

    await db
      .prepare(
        `INSERT INTO users (id, email, name, status, created_at)
         VALUES (?, ?, 'Customer', 'active', ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .run(userId, `${userId}@example.test`, STAMP);

    await db
      .prepare(
        `INSERT INTO subscriptions
          (id, user_id, plan_id, status, source, stripe_subscription_id,
           plan_name_snapshot, price_micros_snapshot, currency_snapshot,
           interval_snapshot, included_weighted_tokens_snapshot,
           overage_mode_snapshot, overage_markup_bps_snapshot,
           current_period_start, current_period_end, cancel_at_period_end,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'usd', ?, 0, 'block', 0, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        userId,
        planId,
        status,
        source,
        `stripe_${index}`,
        name,
        price,
        interval,
        STAMP,
        PERIOD_END,
        cancel,
        STAMP,
        STAMP,
      );
  }

  for (const [id, subscriptionId, amount, currency, status, paidAt, createdAt] of INVOICES) {
    await db
      .prepare(
        `INSERT INTO subscription_invoices
          (id, subscription_id, provider_invoice_id, amount_micros, currency,
           status, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, subscriptionId, `in_${id}`, amount, currency, status, paidAt, createdAt);
  }

  for (const row of USAGE) {
    await db
      .prepare(
        `INSERT INTO usage_events
          (id, model_id, status, input_tokens, output_tokens, charged_micros,
           cost_micros, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.modelId,
        row.status,
        row.input,
        row.output,
        row.charged,
        row.cost,
        row.latency,
        row.at,
      );
  }

  return db;
}

test("the ported report equals the live report across every range", async () => {
  const live = sqliteDatabase();
  const ported = await postgresDatabase();

  try {
    for (const range of [7, 30, 90]) {
      const expected = readAnalyticsData(live, range, NOW);
      const actual = await getAnalyticsData(ported, range, NOW);

      assert.deepEqual(
        actual,
        expected,
        `the ${range}-day report diverged between SQLite and PostgreSQL`,
      );

      assert.equal(actual.rangeDays, range);
      assert.equal(actual.series.length, range);
    }
  } finally {
    live.close();
    await ported.close();
  }
});

test("both reports agree on the values the operator actually reads", async () => {
  const live = sqliteDatabase();
  const ported = await postgresDatabase();

  try {
    const data = await getAnalyticsData(ported, 30, NOW);
    const liveData = readAnalyticsData(live, 30, NOW);

    assert.deepEqual(data, liveData, "parity is the precondition for these numbers");

    assert.equal(data.totals.requests, 2);
    assert.equal(data.totals.okRequests, 1);
    assert.equal(data.totals.errorRequests, 1);
    assert.equal(data.totals.inputTokens, 110);
    assert.equal(data.totals.outputTokens, 50);
    assert.equal(data.totals.chargedMicros, 3_000_000);
    assert.equal(data.totals.planRevenueMicros, 161_000_000);
    assert.equal(data.totals.totalRevenueMicros, 164_000_000);
    assert.equal(data.totals.paidInvoiceCount, 4);
    assert.equal(data.totals.costMicros, 1_500_000);
    assert.equal(data.totals.marginMicros, 1_500_000);
    assert.equal(data.totals.activeSubscribers, 4);
    assert.equal(data.totals.pastDueSubscribers, 1);
    assert.equal(data.totals.cancelingSubscribers, 1);
    assert.equal(data.totals.manualSubscribers, 1);
    assert.equal(data.totals.mrrMicros, 20_000_000);
    assert.equal(data.totals.errorRateBps, 5_000);

    assert.deepEqual(
      data.byPlan.map((plan) => plan.planId),
      ["plan_year", "plan_month", "plan_comp"],
    );
    assert.equal(
      data.byPlan[0].mrrMicros,
      10_000_000,
      "a yearly price is one twelfth of the monthly run-rate",
    );
  } finally {
    live.close();
    await ported.close();
  }
});

test("an empty database produces the same empty report", async () => {
  const empty = new Database(":memory:");

  empty.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE models (id TEXT PRIMARY KEY, name TEXT, provider TEXT);
    CREATE TABLE api_keys (id TEXT PRIMARY KEY);
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY,
      model_id TEXT,
      status TEXT NOT NULL DEFAULT 'ok',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      charged_micros INTEGER NOT NULL DEFAULT 0,
      cost_micros INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  subscriptionSchema(empty);

  const { pool } = await createPgliteDatabase();
  const ported = await createStorageDatabase({ env: {}, pool });

  try {
    await ported.exec("SET TIME ZONE 'UTC'");

    const expected = readAnalyticsData(empty, 7, NOW);
    const actual = await getAnalyticsData(ported, 7, NOW);

    assert.deepEqual(actual, expected);
    assert.equal(actual.totals.requests, 0);
    assert.equal(actual.totals.errorRateBps, 0);
    assert.deepEqual(actual.models, []);
    assert.deepEqual(actual.byPlan, []);
  } finally {
    empty.close();
    await ported.close();
  }
});
