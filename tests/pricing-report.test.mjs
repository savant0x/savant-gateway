import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPricingReport,
  DEFAULT_REVIEW_THRESHOLD_BPS,
  reviewQueue,
} from "../lib/pricing-report.ts";

const NOW = new Date("2026-11-03T12:00:00.000Z");

function model(overrides = {}) {
  return {
    id: "m1",
    upstreamId: "upstream-m1",
    name: "Sandbox Model",
    family: "Sandbox",
    contextWindow: "128000",
    tokenWeight: 1,
    allowFree: false,
    access: "paid",
    groupSlug: "paid",
    groupLabel: "Paid",
    groupBillingMode: "paid",
    groupSource: "auto",
    requiresSubscription: false,
    inputPricePer1M: 3,
    outputPricePer1M: 10,
    supportsTools: true,
    supportsVision: false,
    health: null,
    status: "active",
    syncedAt: "2026-11-03T10:00:00.000Z",
    upstreamSlug: "sandbox",
    protocol: "chat",
    costSource: "synced",
    costObservedAt: null,
    costInputPer1M: 2,
    costOutputPer1M: 8,
    ownCostInputPer1M: 2,
    ownCostOutputPer1M: 8,
    priceSource: "auto",
    routeGroup: "paid:m1",
    isPrimary: true,
    servedProviderSlug: "sandbox",
    routes: [],
    inputMarginBps: 3_333,
    outputMarginBps: 2_000,
    blendedProfitMicros: 3_000_000,
    inCatalog: true,
    sortOrder: 0,
    ...overrides,
  };
}

function rows(models, overrides = {}) {
  return buildPricingReport(models, {
    targetMarginBps: 3_000,
    now: NOW,
    ...overrides,
  });
}

test("free and subscription rows are classified without a per-token price", () => {
  const report = rows([
    model({ id: "free", access: "free", groupSlug: "free" }),
    model({ id: "sub", access: "subscription", groupSlug: "subscription" }),
  ]);

  assert.deepEqual(
    report.rows.map((row) => row.classification).sort(),
    ["free", "subscription"],
  );
  assert.equal(report.summary.paidRows, 0);
  assert.equal(report.summary.currentScenarioProfitMicros, 0);
  assert.equal(report.summary.autoPublish, false);
});

test("unknown and stale costs are blocked from recommendation", () => {
  const report = rows([
    model({
      id: "unknown",
      costSource: "unknown",
      costInputPer1M: 0,
      costOutputPer1M: 0,
    }),
    model({
      id: "stale",
      costSource: "manual",
      costObservedAt: "2026-09-01T00:00:00.000Z",
    }),
  ]);

  const unknown = report.rows.find((row) => row.id === "unknown");
  const stale = report.rows.find((row) => row.id === "stale");

  assert.equal(unknown.classification, "unknown");
  assert.equal(unknown.eligible, false);
  assert.equal(unknown.recommended, null);
  assert.match(unknown.explanation, /cost is unknown/i);
  assert.equal(stale.classification, "stale");
  assert.equal(stale.eligible, false);
  assert.match(stale.explanation, /freshness window/i);
  assert.equal(report.summary.blockedRows, 2);
  assert.equal(
    report.summary.currentScenarioProfitMicros,
    0,
    "stale cost must not contribute to modeled profit",
  );
});

test("a route takeover is visible and does not invent a second provider", () => {
  const report = rows([
    model({
      id: "takeover",
      upstreamSlug: "origin",
      servedProviderSlug: "fallback",
    }),
  ]);

  const [row] = report.rows;

  assert.equal(row.upstreamProvider, "origin");
  assert.equal(row.servingProvider, "fallback");
  assert.equal(row.routeTakeover, true);
  assert.equal(row.classification, "safe");
  assert.equal(row.recommended.inputMicros, 2_857_143);
});

test("a manual price is always review-required, even when unchanged", () => {
  const report = rows([
    model({
      id: "manual",
      priceSource: "manual",
      inputPricePer1M: 2.857143,
      outputPricePer1M: 11.428572,
    }),
  ]);

  const [row] = report.rows;

  assert.equal(row.classification, "review-required");
  assert.equal(row.change.direction, "unchanged");
  assert.match(row.explanation, /manual/i);
});

test("a negative current margin is review-required, not safe", () => {
  const report = rows([
    model({
      id: "negative",
      inputPricePer1M: 1,
      outputPricePer1M: 4,
    }),
  ]);

  const [row] = report.rows;

  assert.equal(row.classification, "review-required");
  assert.match(row.explanation, /below upstream cost/i);
  assert.ok(row.current.inputMarginBps < 0);
  assert.ok(row.current.outputMarginBps < 0);
});

test("zero upstream cost keeps the paid row reviewable and flags it", () => {
  const report = rows([
    model({
      id: "zero",
      costInputPer1M: 0,
      costOutputPer1M: 0,
      inputPricePer1M: 0,
      outputPricePer1M: 0,
    }),
  ]);

  const [row] = report.rows;

  assert.equal(row.classification, "review-required");
  assert.equal(row.change.direction, "new");
  assert.ok(row.warnings.some((warning) => /zero cost/i.test(warning)));
  assert.equal(row.recommended.inputMicros, 1);
});

test("a price above the configured ceiling is blocked", () => {
  const report = rows([
    model({
      id: "ceiling",
      costInputPer1M: 2_000_000,
      costOutputPer1M: 2_000_000,
    }),
  ]);

  const [row] = report.rows;

  assert.equal(row.classification, "blocked");
  assert.equal(row.eligible, false);
  assert.match(row.explanation, /ceiling/i);
});

test("modeled totals exclude free, subscription, and unknown-cost rows", () => {
  const report = rows([
    model({ id: "paid" }),
    model({ id: "free", access: "free" }),
    model({ id: "sub", access: "subscription" }),
    model({ id: "unknown", costSource: "unknown" }),
  ]);

  assert.equal(report.summary.paidRows, 2);
  assert.equal(report.summary.currentScenarioProfitMicros, 3_000_000);
  assert.ok(report.summary.recommendedScenarioProfitMicros > 0);
  assert.equal(
    report.summary.modeledProfitDeltaMicros,
    report.summary.recommendedScenarioProfitMicros -
      report.summary.currentScenarioProfitMicros,
  );
});

test("rows sort by risk and the review queue ranks by impact", () => {
  const report = rows(
    [
      model({ id: "safe" }),
      model({
        id: "small",
        costInputPer1M: 1,
        costOutputPer1M: 1,
      }),
      model({
        id: "large",
        costInputPer1M: 10,
        costOutputPer1M: 10,
      }),
      model({ id: "unknown", costSource: "unknown" }),
    ],
    { reviewThresholdBps: DEFAULT_REVIEW_THRESHOLD_BPS },
  );

  assert.equal(report.rows[0].classification, "unknown");

  const queue = reviewQueue(report, 2);

  assert.equal(queue.length, 2);
  assert.ok(queue[0].impactMicros >= queue[1].impactMicros);
  assert.ok(queue.every((row) => row.classification === "review-required"));
});

test("out-of-catalog rows are excluded unless the report asks for them", () => {
  const hidden = model({ id: "hidden", inCatalog: false });
  const normal = rows([hidden]);

  assert.equal(normal.rows.length, 0);
  assert.equal(normal.summary.excludedOutOfCatalog, 1);

  const included = rows([hidden], { includeOutOfCatalog: true });

  assert.equal(included.rows.length, 1);
  assert.equal(included.rows[0].classification, "blocked");
  assert.match(included.rows[0].explanation, /published catalog/i);
});
