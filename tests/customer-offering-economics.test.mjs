import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  getCustomerContributionPage,
  getFreeCohort,
  listSimulationModels,
} from "../lib/storage/store/economics.ts";
import {
  normalizeCustomerPage,
  normalizeEconomicsRange,
} from "../lib/economics.ts";
import { simulatePlan } from "../lib/plan-simulation.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = new Date("2026-11-01T00:00:00.000Z");
const STAMP = "2026-09-01T00:00:00.000Z";

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  return db;
}

async function addUser(db, id, createdAt, status = "active") {
  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, `${id}@example.test`, id, status, createdAt);
}

async function addUsage(
  db,
  input,
) {
  await db
    .prepare(
      `INSERT INTO usage_events
        (id, user_id, model_id, input_tokens, output_tokens, charged_micros,
         cost_micros, status, billing_source, latency_ms, created_at)
       VALUES (?, ?, NULL, 100, 50, ?, ?, 'ok', ?, 10, ?)`,
    )
    .run(
      input.id,
      input.userId,
      input.chargedMicros ?? 0,
      input.costMicros ?? 0,
      input.billingSource ?? "credit",
      input.createdAt,
    );
}

async function addPaidTopup(db, id, userId, amountMicros, at) {
  await db
    .prepare(
      `INSERT INTO topups
        (id, user_id, provider, provider_ref, amount_micros, currency, status,
         created_at, paid_at)
       VALUES (?, ?, 'stripe', ?, ?, 'usd', 'paid', ?, ?)`,
    )
    .run(id, userId, `ref_${id}`, amountMicros, at, at);
}

async function addPlanSubscriptionInvoice(db, userId) {
  await db
    .prepare(
      `INSERT INTO plans
        (id, slug, name, status, price_micros, currency, interval,
         included_weighted_tokens, overage_mode, overage_markup_bps,
         sort_order, created_at, updated_at)
       VALUES ('plan_econ', 'econ', 'Econ', 'active', 5000000, 'usd',
               'month', 1000000, 'block', 0, 0, ?, ?)`,
    )
    .run(STAMP, STAMP);

  await db
    .prepare(
      `INSERT INTO subscriptions
        (id, user_id, plan_id, status, source, stripe_customer_id,
         stripe_subscription_id, plan_name_snapshot, price_micros_snapshot,
         currency_snapshot, interval_snapshot, included_weighted_tokens_snapshot,
         overage_mode_snapshot, overage_markup_bps_snapshot,
         current_period_start, current_period_end, cancel_at_period_end,
         created_at, updated_at)
       VALUES ('sub_econ', ?, 'plan_econ', 'active', 'stripe', NULL,
               'sub_stripe_econ', 'Econ', 5000000, 'usd', 'month', 1000000,
               'block', 0, ?, ?, 0, ?, ?)`,
    )
    .run(userId, STAMP, "2026-12-01T00:00:00.000Z", STAMP, STAMP);

  await db
    .prepare(
      `INSERT INTO subscription_invoices
        (id, subscription_id, provider_invoice_id, amount_micros, currency,
         status, paid_at, created_at)
       VALUES ('inv_econ', 'sub_econ', 'in_econ', 5000000, 'usd', 'paid',
               '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z')`,
    )
    .run();
}

test("customer contribution separates top-up principal, plan cash and recorded cost", async () => {
  const db = await fixture();

  try {
    await addUser(db, "u1", "2026-10-01T00:00:00.000Z");
    await addUser(db, "u2", "2026-09-25T00:00:00.000Z");
    await addUser(db, "u_deleted", "2026-09-25T00:00:00.000Z", "deleted");

    await addUsage(db, {
      id: "u1_credit",
      userId: "u1",
      chargedMicros: 300,
      costMicros: 100,
      billingSource: "credit",
      createdAt: "2026-10-20T00:00:00.000Z",
    });
    await addUsage(db, {
      id: "u1_free",
      userId: "u1",
      costMicros: 40,
      billingSource: "free",
      createdAt: "2026-10-20T00:00:00.000Z",
    });
    await addUsage(db, {
      id: "u1_sub",
      userId: "u1",
      costMicros: 60,
      billingSource: "subscription",
      createdAt: "2026-10-20T00:00:00.000Z",
    });
    await addUsage(db, {
      id: "anonymous",
      userId: null,
      costMicros: 999,
      createdAt: "2026-10-20T00:00:00.000Z",
    });
    await addUsage(db, {
      id: "deleted_usage",
      userId: "u_deleted",
      costMicros: 999,
      createdAt: "2026-10-20T00:00:00.000Z",
    });

    await addPaidTopup(
      db,
      "topup_u1",
      "u1",
      2_000_000,
      "2026-10-20T00:00:00.000Z",
    );
    await addPlanSubscriptionInvoice(db, "u1");

    for (let index = 0; index < 26; index += 1) {
      const id = `u_extra_${index}`;

      await addUser(db, id, "2026-09-25T00:00:00.000Z");
      await addUsage(db, {
        id: `usage_${id}`,
        userId: id,
        createdAt: "2026-10-20T00:00:00.000Z",
      });
    }

    const data = await getCustomerContributionPage(db, 30, 1, NOW);
    const first = data.rows.find((row) => row.userId === "u1");

    assert.ok(first, "the contributing customer is on page one");
    assert.equal(data.total, 27);
    assert.equal(data.pageCount, 2);
    assert.equal(first.creditChargedMicros, 300);
    assert.equal(first.creditCostMicros, 100);
    assert.equal(first.freeCostMicros, 40);
    assert.equal(first.subscriptionCostMicros, 60);
    assert.equal(first.totalCostMicros, 200);
    assert.equal(first.planCashMicros, 5_000_000);
    assert.equal(first.topupPrincipalMicros, 2_000_000);
    assert.equal(first.contributionMicros, 5_000_100);
    assert.equal(first.creditContributionMicros, 200);
    assert.equal(first.planCashContributionMicros, 4_999_940);
    assert.equal(first.freeRequestCount, 1);
    assert.equal(first.coverage.costs, "recorded_estimate");
    assert.equal(first.coverage.fees, "unavailable");
    assert.equal(first.coverage.topups, "liability");
    assert.equal(
      data.rows.some((row) => row.userId === "u_deleted"),
      false,
      "a deleted identity is not attributed",
    );

    const second = await getCustomerContributionPage(db, 30, 2, NOW);

    assert.equal(second.page, 2);
    assert.equal(second.rows.length, 2);
    assert.equal(normalizeCustomerPage("0"), 1);
    assert.equal(normalizeEconomicsRange("60"), 30);
  } finally {
    await db.close();
  }
});

test("free cohorts count first free use and paid conversion only inside the window", async () => {
  const db = await fixture();

  try {
    await addUser(db, "convert", "2026-09-10T00:00:00.000Z");
    await addUser(db, "free_only", "2026-09-11T00:00:00.000Z");
    await addUser(db, "paid_no_free", "2026-09-12T00:00:00.000Z");
    await addUser(db, "unknown", "2026-09-13T00:00:00.000Z");
    await addUser(db, "late_paid", "2026-09-14T00:00:00.000Z");
    await addUser(db, "outside", "2026-08-01T00:00:00.000Z");
    await addUser(db, "deleted", "2026-09-15T00:00:00.000Z", "deleted");

    for (const [id, at] of [
      ["convert", "2026-09-12T00:00:00.000Z"],
      ["free_only", "2026-09-13T00:00:00.000Z"],
      ["late_paid", "2026-09-16T00:00:00.000Z"],
    ]) {
      await addUsage(db, {
        id: `free_${id}`,
        userId: id,
        billingSource: "free",
        createdAt: at,
      });
    }

    await addPaidTopup(
      db,
      "convert_topup",
      "convert",
      1_000_000,
      "2026-09-20T00:00:00.000Z",
    );
    await addPaidTopup(
      db,
      "paid_no_free_topup",
      "paid_no_free",
      1_000_000,
      "2026-09-15T00:00:00.000Z",
    );
    await addPaidTopup(
      db,
      "late_topup",
      "late_paid",
      1_000_000,
      "2026-10-20T00:00:00.000Z",
    );

    const cohort = await getFreeCohort(db, 30, 30, NOW);

    assert.equal(cohort.eligibleSignups, 5);
    assert.equal(cohort.withFirstFree, 3);
    assert.equal(cohort.convertedAfterFree, 1);
    assert.equal(cohort.paidWithoutFree, 1);
    assert.equal(cohort.unknownHistory, 1);
    assert.equal(cohort.observedActivity, 4);
    assert.equal(cohort.freeToPaidBps, 3_333);
    assert.equal(cohort.signupToPaidBps, 4_000);
    assert.equal(cohort.unknownHistoryBps, 2_000);
    assert.equal(cohort.causalAttribution, "not_claimed");
    assert.ok(cohort.cohortStart < cohort.cohortEnd);
  } finally {
    await db.close();
  }
});

test("plan simulation changes overage and cost states without writing", () => {
  const model = {
    id: "m1",
    name: "Model One",
    groupSlug: "paid",
    tokenWeight: 1,
    costInputMicros: 1_000_000,
    costOutputMicros: 2_000_000,
    sellInputMicros: 2_000_000,
    sellOutputMicros: 4_000_000,
    costSource: "synced",
    costObservedAt: null,
  };
  const workload = {
    label: "normal",
    usage: [{ modelId: "m1", inputTokens: 1_000_000, outputTokens: 1_000_000 }],
  };
  const base = {
    priceMicros: 29_000_000,
    interval: "month",
    includedWeightedTokens: 1_000_000,
    overageMode: "credit",
    overageMarkupBps: 0,
  };
  const overage = simulatePlan({
    terms: base,
    models: [model],
    workloads: [workload],
    now: new Date("2026-11-01T00:00:00.000Z"),
  });
  const scenario = overage.scenarios[0];

  assert.equal(overage.writes, "none");
  assert.equal(scenario.status, "overage_credit");
  assert.equal(scenario.weightedTokens, 2_000_000);
  assert.equal(scenario.includedWeightedTokensUsed, 1_000_000);
  assert.equal(scenario.overageWeightedTokens, 1_000_000);
  assert.equal(scenario.planRevenueMicros, 29_000_000);
  assert.equal(scenario.overageRevenueMicros, 3_000_000);
  assert.equal(scenario.costMicros, 3_000_000);
  assert.equal(scenario.contributionMicros, 29_000_000);
  assert.equal(scenario.marginBps, 9_063);

  const blocked = simulatePlan({
    terms: { ...base, overageMode: "block" },
    models: [model],
    workloads: [workload],
    now: new Date("2026-11-01T00:00:00.000Z"),
  }).scenarios[0];

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.contributionMicros, null);
  assert.equal(blocked.marginBps, null);

  const unknown = simulatePlan({
    terms: base,
    models: [{ ...model, costSource: "unknown", costInputMicros: 0, costOutputMicros: 0 }],
    workloads: [workload],
    now: new Date("2026-11-01T00:00:00.000Z"),
  }).scenarios[0];

  assert.equal(unknown.costKnown, false);
  assert.ok(unknown.warnings.some((warning) => warning.includes("unknown")));
});

test("simulation catalog exposes only active in-catalog models", async () => {
  const db = await fixture();

  try {
    await db
      .prepare(
        `INSERT INTO models
          (id, upstream_id, name, provider, context_window, synced_at,
           in_catalog, status, cost_source)
         VALUES ('m1', 'm1', 'One', 'Family', '8k', ?, 1, 'active', 'synced'),
                ('m2', 'm2', 'Two', 'Family', '8k', ?, 1, 'disabled', 'synced'),
                ('m3', 'm3', 'Three', 'Family', '8k', ?, 0, 'active', 'synced')`,
      )
      .run(STAMP, STAMP, STAMP);

    const models = await listSimulationModels(db);

    assert.deepEqual(
      models.map((model) => model.id),
      ["m1"],
    );
  } finally {
    await db.close();
  }
});
