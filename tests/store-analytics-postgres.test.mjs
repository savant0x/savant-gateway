import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import { getAnalyticsData } from "../lib/storage/store/analytics.ts";
import { getPricingCommand } from "../lib/storage/store/pricing-command.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = new Date("2026-10-31T12:00:00.000Z");
const LATER = new Date("2027-03-01T12:00:00.000Z");
const STAMP = "2026-10-20T12:00:00.000Z";
const PERIOD_END = "2027-12-31T12:00:00.000Z";

/**
 * Analytics on the target engine (FID-086, Batch B).
 *
 * The report is the operator's only view of margin, so the suite asserts the
 * arithmetic and the two honesty rules it was written for:
 *
 * 1. **A quiet day is a zero, not a missing point.** The series is dense over the
 *    whole range, so a flat chart cannot be mistaken for missing data.
 * 2. **Revenue and subscribers come from different places.** A plan with a
 *    subscriber and no paid invoice still appears, and the subscriber counts are
 *    current while revenue is windowed.
 *
 * Subscription arithmetic is asserted rather than eyeballed: yearly prices are
 * normalized to a monthly run-rate, manual and canceling subscriptions are
 * excluded from MRR, and a past-due subscription counts as past due, never as
 * revenue.
 */

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('u1', 'u1@example.test', 'One', 'active', ?),
              ('u2', 'u2@example.test', 'Two', 'active', ?),
              ('u3', 'u3@example.test', 'Three', 'active', ?),
              ('u4', 'u4@example.test', 'Four', 'active', ?),
              ('u5', 'u5@example.test', 'Five', 'active', ?)`,
    )
    .run(STAMP, STAMP, STAMP, STAMP, STAMP);

  await db
    .prepare(
      `INSERT INTO models
        (id, upstream_id, upstream_slug, name, provider, context_window,
         token_weight, in_catalog, group_slug, status, sort_order, synced_at)
       VALUES ('m1', 'm1', 'savant', 'Model One', 'Family', '8k', 1, 1,
               'paid', 'active', 0, ?)`,
    )
    .run(STAMP);

  const usage = [
    ["u_today_ok", "m1", "ok", 100, 50, 300, 100, 100, "2026-10-31T09:00:00.000Z"],
    ["u_today_bad", "m1", "error", 10, 0, 0, 0, 500, "2026-10-31T10:00:00.000Z"],
    ["u_yesterday", "ghost", "ok", 20, 30, 100, 40, 300, "2026-10-30T10:00:00.000Z"],
    ["u_outside", "m1", "ok", 1, 1, 9_999, 9_999, 1, "2026-09-01T10:00:00.000Z"],
  ];

  for (const [id, model, status, input, output, charged, cost, latency, at] of usage) {
    await db
      .prepare(
        `INSERT INTO usage_events
          (id, user_id, model_id, input_tokens, output_tokens, charged_micros,
           cost_micros, status, latency_ms, created_at)
         VALUES (?, 'u1', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, model, input, output, charged, cost, status, latency, at);
  }

  for (const [id, name, price, interval] of [
    ["plan_month", "Monthly", 5_000_000, "month"],
    ["plan_year", "Yearly", 12_000_000, "year"],
    ["plan_solo", "Solo", 2_000_000, "month"],
  ]) {
    await db
      .prepare(
        `INSERT INTO plans
          (id, slug, name, status, price_micros, currency, interval,
           included_weighted_tokens, overage_mode, overage_markup_bps,
           sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, 'usd', ?, 10_000, 'block', 0, 0, ?, ?)`,
      )
      .run(id, id, name, price, interval, STAMP, STAMP);
  }

  const subscriptions = [
    ["sub_a", "u1", "plan_month", "active", "stripe", "Monthly", 5_000_000, "month", 0],
    ["sub_b", "u2", "plan_year", "active", "stripe", "Yearly", 12_000_000, "year", 0],
    ["sub_c", "u3", "plan_month", "active", "manual", "Monthly", 5_000_000, "month", 0],
    ["sub_d", "u4", "plan_month", "past_due", "stripe", "Monthly", 5_000_000, "month", 0],
    ["sub_e", "u5", "plan_solo", "active", "manual", "Solo", 2_000_000, "month", 0],
  ];

  for (const row of subscriptions) {
    const [id, user, planId, status, source, name, price, interval, cancel] = row;

    await db
      .prepare(
        `INSERT INTO subscriptions
          (id, user_id, plan_id, status, source, plan_name_snapshot,
           price_micros_snapshot, currency_snapshot, interval_snapshot,
           included_weighted_tokens_snapshot, overage_mode_snapshot,
           overage_markup_bps_snapshot, current_period_start, current_period_end,
           cancel_at_period_end, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'usd', ?, 10_000, 'block', 0, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        user,
        planId,
        status,
        source,
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

  for (const [id, subscription, amount, currency, status, paidAt] of [
    ["inv_1", "sub_a", 5_000_000, "usd", "paid", "2026-10-30T00:00:00.000Z"],
    ["inv_open", "sub_b", 3_000_000, "usd", "open", null],
    ["inv_eur", "sub_a", 999, "eur", "paid", "2026-10-30T00:00:00.000Z"],
    ["inv_old", "sub_a", 400_000, "usd", "paid", "2026-08-01T00:00:00.000Z"],
  ]) {
    await db
      .prepare(
        `INSERT INTO subscription_invoices
          (id, subscription_id, provider_invoice_id, amount_micros, currency,
           status, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, subscription, `stripe_${id}`, amount, currency, status, paidAt, STAMP);
  }

  return db;
}

test("the report counts only the requested window and fills quiet days", async () => {
  const db = await fixture();

  try {
    const data = await getAnalyticsData(db, 7, NOW);

    assert.equal(data.rangeDays, 7);
    assert.equal(data.series.length, 7);
    assert.equal(data.series[0].date, "2026-10-25");
    assert.equal(data.series.at(-1).date, "2026-10-31");

    const quiet = data.series.slice(0, 5);

    assert.ok(
      quiet.every(
        (point) =>
          point.requests === 0 &&
          point.tokens === 0 &&
          point.chargedMicros === 0 &&
          point.costMicros === 0,
      ),
      "a day with no traffic is a zero point, not a missing one",
    );

    const yesterday = data.series[5];
    const today = data.series[6];

    assert.deepEqual(
      [yesterday.requests, yesterday.tokens, yesterday.chargedMicros],
      [1, 50, 100],
    );
    assert.deepEqual(
      [today.requests, today.tokens, today.chargedMicros, today.costMicros],
      [2, 160, 300, 100],
    );

    assert.equal(data.totals.requests, 3, "the row outside the window is excluded");
    assert.equal(data.totals.okRequests, 2);
    assert.equal(data.totals.errorRequests, 1);
    assert.equal(data.totals.inputTokens, 130);
    assert.equal(data.totals.outputTokens, 80);
    assert.equal(data.totals.chargedMicros, 400);
    assert.equal(data.totals.costMicros, 140);
    assert.equal(data.totals.marginMicros, 260);
    assert.equal(data.totals.averageLatencyMs, 300);
    assert.equal(data.totals.maxLatencyMs, 500);
    assert.equal(data.totals.errorRateBps, 3_333);
  } finally {
    await db.close();
  }
});

test("models are ranked by charge and an unknown model is named honestly", async () => {
  const db = await fixture();

  try {
    const data = await getAnalyticsData(db, 7, NOW);

    assert.deepEqual(
      data.models.map((row) => row.modelId),
      ["m1", "ghost"],
    );

    const known = data.models[0];

    assert.equal(known.modelName, "Model One");
    assert.equal(known.family, "Family");
    assert.equal(known.requests, 2);
    assert.equal(known.tokens, 160);
    assert.equal(known.costMicros, 100);

    const unknown = data.models[1];

    assert.equal(unknown.modelName, "ghost");
    assert.equal(unknown.family, "—", "a delisted model has no family to claim");
  } finally {
    await db.close();
  }
});

test("plan revenue comes from paid usd invoices, MRR from live prices", async () => {
  const db = await fixture();

  try {
    const data = await getAnalyticsData(db, 7, NOW);
    const byId = new Map(data.byPlan.map((plan) => [plan.planId, plan]));

    assert.equal(data.totals.planRevenueMicros, 5_000_000);
    assert.equal(data.totals.paidInvoiceCount, 1, "open, eur and out-of-window invoices are excluded");
    assert.equal(data.totals.totalRevenueMicros, 5_000_400);
    assert.equal(data.totals.totalMarginMicros, 5_000_400 - 140);
    assert.equal(data.series[5].planRevenueMicros, 5_000_000);

    assert.equal(byId.get("plan_month").planRevenueMicros, 5_000_000);
    assert.equal(byId.get("plan_month").activeSubscribers, 2);
    assert.equal(byId.get("plan_month").pastDueSubscribers, 1);
    assert.equal(byId.get("plan_year").planRevenueMicros, 0);

    assert.ok(
      byId.has("plan_solo"),
      "a plan with a subscriber and no invoice still appears",
    );
    assert.equal(byId.get("plan_solo").activeSubscribers, 1);
    assert.equal(byId.get("plan_solo").paidInvoiceCount, 0);

    assert.deepEqual(
      data.byPlan.map((plan) => plan.planId),
      ["plan_month", "plan_year", "plan_solo"],
      "revenue first, then run-rate",
    );
  } finally {
    await db.close();
  }
});

test("pricing command revenue reconciles with analytics and flags unknown cost", async () => {
  const db = await fixture();

  try {
    await db
      .prepare("UPDATE models SET cost_source = 'synced' WHERE id = 'm1'")
      .run();

    const analytics = await getAnalyticsData(db, 7, NOW);
    const command = await getPricingCommand(db, 7, NOW.toISOString());

    assert.equal(command.summary.requests, analytics.totals.requests);
    assert.equal(command.summary.revenueMicros, analytics.totals.chargedMicros);
    assert.equal(command.summary.revenueMicros, 400);

    // The deleted model's cost basis is unknown, so its 40 micros of recorded
    // cost stays out of the command total instead of being trusted as zero.
    assert.equal(command.summary.knownRevenueMicros, 300);
    assert.equal(command.summary.costMicros, 100);
    assert.equal(command.summary.contributionMicros, 200);
    assert.equal(command.summary.unknownCostRequests, 1);
    assert.equal(
      command.summary.costMicros + 40,
      analytics.totals.costMicros,
    );
  } finally {
    await db.close();
  }
});

test("subscriber counts are current while revenue is windowed", async () => {
  const db = await fixture();

  try {
    const data = await getAnalyticsData(db, 7, NOW);

    assert.equal(data.totals.activeSubscribers, 4);
    assert.equal(data.totals.pastDueSubscribers, 1);
    assert.equal(data.totals.manualSubscribers, 2);
    assert.equal(data.totals.cancelingSubscribers, 0);
    assert.equal(
      data.totals.mrrMicros,
      6_000_000,
      "a yearly price is normalized to a monthly run-rate, manual plans are not",
    );

    const later = await getAnalyticsData(db, 7, LATER);

    assert.equal(later.totals.requests, 0);
    assert.equal(later.totals.planRevenueMicros, 0);
    assert.ok(later.series.every((point) => point.requests === 0));
    assert.equal(
      later.totals.activeSubscribers,
      4,
      "subscribers are a present-tense count, not a windowed one",
    );
  } finally {
    await db.close();
  }
});
