import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  normalizeAnalyticsRange,
  readAnalyticsData,
} from "../lib/analytics.ts";
import { subscriptionSchema } from "../lib/schema/subscriptions.ts";

const NOW = new Date("2026-10-29T12:00:00.000Z");
const ONE_DAY = "2026-10-28T12:00:00.000Z";
const TWO_DAYS = "2026-10-27T12:00:00.000Z";
const THREE_DAYS = "2026-10-26T12:00:00.000Z";
const OUTSIDE = "2026-09-19T12:00:00.000Z";
const LATER = "2026-11-29T12:00:00.000Z";

function createDatabase() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE model_groups (slug TEXT PRIMARY KEY, label TEXT NOT NULL);
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

  return db;
}

function insertPlan(db, input) {
  db.prepare(
    `INSERT INTO plans
       (id, slug, name, description, status, price_micros, currency, interval,
        included_weighted_tokens, overage_mode, overage_markup_bps, sort_order,
        created_at, updated_at)
     VALUES (?, ?, ?, NULL, 'active', ?, 'usd', ?, 0, 'block', 0, 0, ?, ?)`,
  ).run(
    input.id,
    input.id,
    input.name,
    input.priceMicros,
    input.interval,
    ONE_DAY,
    ONE_DAY,
  );
}

function insertSubscription(db, input) {
  db.prepare(
    `INSERT INTO subscriptions
       (id, user_id, plan_id, status, source, stripe_customer_id,
        stripe_subscription_id, plan_name_snapshot, price_micros_snapshot,
        currency_snapshot, interval_snapshot, included_weighted_tokens_snapshot,
        overage_mode_snapshot, overage_markup_bps_snapshot,
        current_period_start, current_period_end, cancel_at_period_end,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'usd', ?, 0, 'block', 0, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    input.planId,
    input.status,
    input.source,
    input.stripeId ?? null,
    input.planName,
    input.priceMicros,
    input.interval,
    ONE_DAY,
    LATER,
    input.cancelAtPeriodEnd ?? 0,
    ONE_DAY,
    ONE_DAY,
  );
}

function insertInvoice(db, input) {
  db.prepare(
    `INSERT INTO subscription_invoices
       (id, subscription_id, provider_invoice_id, amount_micros, currency,
        status, period_start, period_end, paid_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  ).run(
    input.id,
    input.subscriptionId,
    input.providerInvoiceId,
    input.amountMicros,
    input.currency ?? "usd",
    input.status,
    input.paidAt ?? null,
    input.createdAt ?? ONE_DAY,
  );
}

function insertUsage(db, input) {
  db.prepare(
    `INSERT INTO usage_events
       (id, model_id, status, input_tokens, output_tokens, charged_micros,
        cost_micros, latency_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.modelId,
    input.status,
    input.inputTokens,
    input.outputTokens,
    input.chargedMicros,
    input.costMicros,
    input.latencyMs,
    input.createdAt,
  );
}

function seed(db) {
  db.prepare("INSERT INTO models (id, name, provider) VALUES (?, ?, ?)").run(
    "m1",
    "Model One",
    "GPT",
  );
  db.prepare("INSERT INTO models (id, name, provider) VALUES (?, ?, ?)").run(
    "m2",
    "Model Two",
    "Claude",
  );

  for (const id of ["u1", "u2", "u3", "u4", "u5"]) {
    db.prepare("INSERT INTO users (id) VALUES (?)").run(id);
  }

  insertPlan(db, {
    id: "plan_month",
    name: "Starter",
    interval: "month",
    priceMicros: 10_000_000,
  });
  insertPlan(db, {
    id: "plan_year",
    name: "Annual",
    interval: "year",
    priceMicros: 120_000_000,
  });
  insertPlan(db, {
    id: "plan_comp",
    name: "Comp",
    interval: "month",
    priceMicros: 50_000_000,
  });

  insertSubscription(db, {
    id: "sub_month",
    userId: "u1",
    planId: "plan_month",
    status: "active",
    source: "stripe",
    stripeId: "sub_stripe_month",
    planName: "Starter",
    priceMicros: 10_000_000,
    interval: "month",
  });
  insertSubscription(db, {
    id: "sub_year",
    userId: "u2",
    planId: "plan_year",
    status: "active",
    source: "stripe",
    stripeId: "sub_stripe_year",
    planName: "Annual",
    priceMicros: 120_000_000,
    interval: "year",
  });
  insertSubscription(db, {
    id: "sub_comp",
    userId: "u3",
    planId: "plan_comp",
    status: "active",
    source: "manual",
    planName: "Comp",
    priceMicros: 50_000_000,
    interval: "month",
  });
  insertSubscription(db, {
    id: "sub_cancel",
    userId: "u4",
    planId: "plan_month",
    status: "active",
    source: "stripe",
    stripeId: "sub_stripe_cancel",
    planName: "Starter",
    priceMicros: 20_000_000,
    interval: "month",
    cancelAtPeriodEnd: 1,
  });
  insertSubscription(db, {
    id: "sub_past_due",
    userId: "u5",
    planId: "plan_month",
    status: "past_due",
    source: "stripe",
    stripeId: "sub_stripe_past",
    planName: "Starter",
    priceMicros: 30_000_000,
    interval: "month",
  });

  insertInvoice(db, {
    id: "inv_month_paid",
    subscriptionId: "sub_month",
    providerInvoiceId: "in_month_paid",
    amountMicros: 10_000_000,
    status: "paid",
    paidAt: ONE_DAY,
    createdAt: ONE_DAY,
  });
  insertInvoice(db, {
    id: "inv_year_paid",
    subscriptionId: "sub_year",
    providerInvoiceId: "in_year_paid",
    amountMicros: 120_000_000,
    status: "paid",
    paidAt: TWO_DAYS,
    createdAt: TWO_DAYS,
  });
  insertInvoice(db, {
    id: "inv_past_due_paid",
    subscriptionId: "sub_past_due",
    providerInvoiceId: "in_past_due_paid",
    amountMicros: 30_000_000,
    status: "paid",
    paidAt: THREE_DAYS,
    createdAt: THREE_DAYS,
  });
  insertInvoice(db, {
    id: "inv_outside",
    subscriptionId: "sub_month",
    providerInvoiceId: "in_outside",
    amountMicros: 5_000_000,
    status: "paid",
    paidAt: OUTSIDE,
    createdAt: OUTSIDE,
  });
  insertInvoice(db, {
    id: "inv_failed",
    subscriptionId: "sub_month",
    providerInvoiceId: "in_failed",
    amountMicros: 10_000_000,
    status: "failed",
    createdAt: ONE_DAY,
  });
  insertInvoice(db, {
    id: "inv_void",
    subscriptionId: "sub_month",
    providerInvoiceId: "in_void",
    amountMicros: 10_000_000,
    status: "void",
    createdAt: ONE_DAY,
  });
  insertInvoice(db, {
    id: "inv_eur",
    subscriptionId: "sub_month",
    providerInvoiceId: "in_eur",
    amountMicros: 7_000_000,
    currency: "eur",
    status: "paid",
    paidAt: ONE_DAY,
    createdAt: ONE_DAY,
  });

  insertUsage(db, {
    id: "use_credit",
    modelId: "m1",
    status: "ok",
    inputTokens: 100,
    outputTokens: 50,
    chargedMicros: 3_000_000,
    costMicros: 1_000_000,
    latencyMs: 100,
    createdAt: ONE_DAY,
  });
  insertUsage(db, {
    id: "use_included",
    modelId: "m1",
    status: "error",
    inputTokens: 10,
    outputTokens: 0,
    chargedMicros: 0,
    costMicros: 500_000,
    latencyMs: 200,
    createdAt: TWO_DAYS,
  });
  insertUsage(db, {
    id: "use_outside",
    modelId: "m2",
    status: "ok",
    inputTokens: 1_000,
    outputTokens: 1_000,
    chargedMicros: 1_000_000,
    costMicros: 0,
    latencyMs: 300,
    createdAt: OUTSIDE,
  });
}

test("analytics keeps credit and plan revenue separate and derives MRR", () => {
  const db = createDatabase();

  try {
    seed(db);

    const data = readAnalyticsData(db, 30, NOW);
    const { totals } = data;

    assert.equal(totals.requests, 2);
    assert.equal(totals.okRequests, 1);
    assert.equal(totals.errorRequests, 1);
    assert.equal(totals.inputTokens, 110);
    assert.equal(totals.outputTokens, 50);
    assert.equal(totals.chargedMicros, 3_000_000);
    assert.equal(totals.planRevenueMicros, 160_000_000);
    assert.equal(totals.totalRevenueMicros, 163_000_000);
    assert.equal(totals.paidInvoiceCount, 3);
    assert.equal(totals.costMicros, 1_500_000);
    assert.equal(totals.marginMicros, 1_500_000);
    assert.equal(totals.totalMarginMicros, 161_500_000);
    assert.equal(totals.activeSubscribers, 4);
    assert.equal(totals.pastDueSubscribers, 1);
    assert.equal(totals.cancelingSubscribers, 1);
    assert.equal(totals.manualSubscribers, 1);
    assert.equal(totals.mrrMicros, 20_000_000);
    assert.equal(totals.averageLatencyMs, 150);
    assert.equal(totals.maxLatencyMs, 200);
    assert.equal(totals.errorRateBps, 5_000);

    assert.equal(data.series.length, 30);
    assert.equal(data.series.at(-1).date, "2026-10-29");
    assert.equal(
      data.series.reduce((sum, point) => sum + point.planRevenueMicros, 0),
      160_000_000,
    );
    assert.equal(
      data.series.reduce((sum, point) => sum + point.chargedMicros, 0),
      3_000_000,
    );
    assert.equal(
      data.series.reduce((sum, point) => sum + point.costMicros, 0),
      1_500_000,
    );

    assert.equal(data.models.length, 1);
    assert.equal(data.models[0].modelId, "m1");
    assert.equal(data.models[0].requests, 2);
    assert.equal(data.models[0].tokens, 160);
    assert.equal(data.models[0].chargedMicros, 3_000_000);
    assert.equal(data.models[0].costMicros, 1_500_000);

    assert.deepEqual(
      data.byPlan.map((plan) => plan.planId),
      ["plan_year", "plan_month", "plan_comp"],
    );

    const annual = data.byPlan[0];
    assert.equal(annual.planName, "Annual");
    assert.equal(annual.interval, "year");
    assert.equal(annual.activeSubscribers, 1);
    assert.equal(annual.pastDueSubscribers, 0);
    assert.equal(annual.mrrMicros, 10_000_000);
    assert.equal(annual.paidInvoiceCount, 1);
    assert.equal(annual.planRevenueMicros, 120_000_000);

    const starter = data.byPlan[1];
    assert.equal(starter.planName, "Starter");
    assert.equal(starter.interval, "month");
    assert.equal(starter.activeSubscribers, 2);
    assert.equal(starter.pastDueSubscribers, 1);
    assert.equal(starter.mrrMicros, 10_000_000);
    assert.equal(starter.paidInvoiceCount, 2);
    assert.equal(starter.planRevenueMicros, 40_000_000);

    const comp = data.byPlan[2];
    assert.equal(comp.planName, "Comp");
    assert.equal(comp.activeSubscribers, 1);
    assert.equal(comp.mrrMicros, 0);
    assert.equal(comp.paidInvoiceCount, 0);
    assert.equal(comp.planRevenueMicros, 0);
  } finally {
    db.close();
  }
});

test("analytics returns zeros and no plan rows on an empty database", () => {
  const db = createDatabase();

  try {
    const data = readAnalyticsData(db, 7, NOW);

    assert.equal(data.rangeDays, 7);
    assert.equal(data.series.length, 7);
    assert.equal(data.totals.requests, 0);
    assert.equal(data.totals.chargedMicros, 0);
    assert.equal(data.totals.planRevenueMicros, 0);
    assert.equal(data.totals.totalRevenueMicros, 0);
    assert.equal(data.totals.activeSubscribers, 0);
    assert.equal(data.totals.mrrMicros, 0);
    assert.equal(data.totals.errorRateBps, 0);
    assert.deepEqual(data.models, []);
    assert.deepEqual(data.byPlan, []);
  } finally {
    db.close();
  }
});

test("analytics range normalization keeps only supported windows", () => {
  assert.equal(normalizeAnalyticsRange("7"), 7);
  assert.equal(normalizeAnalyticsRange("30"), 30);
  assert.equal(normalizeAnalyticsRange("90"), 90);
  assert.equal(normalizeAnalyticsRange("60"), 30);
  assert.equal(normalizeAnalyticsRange(undefined), 30);
  assert.equal(normalizeAnalyticsRange(null), 30);
  assert.equal(normalizeAnalyticsRange(""), 30);
});
