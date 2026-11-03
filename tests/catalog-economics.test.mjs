import assert from "node:assert/strict";
import test from "node:test";

import { catalogEconomics, scenarioLabel } from "../lib/catalog-economics.ts";

const NOW = new Date("2026-11-03T12:00:00.000Z");

function input(overrides = {}) {
  return {
    access: "paid",
    costInputMicros: 2_000_000,
    costOutputMicros: 8_000_000,
    sellInputMicros: 3_000_000,
    sellOutputMicros: 10_000_000,
    costSource: "synced",
    costObservedAt: "2026-11-03T09:00:00.000Z",
    now: NOW,
    ...overrides,
  };
}

test("the shared projection computes margins and the labelled scenario", () => {
  const result = catalogEconomics(input());

  assert.equal(result.status, "priced");
  assert.equal(result.inputMarginBps, 3_333);
  assert.equal(result.outputMarginBps, 2_000);
  assert.equal(result.blendedProfitMicros, 3_000_000);
  assert.equal(result.scenarioRevenueMicros, 13_000_000);
  assert.equal(result.scenarioCostMicros, 10_000_000);
  assert.equal(result.scenarioProfitMicros, 3_000_000);
  assert.deepEqual(result.warnings, []);
  assert.equal(scenarioLabel(result.scenario), "1M in + 1M out");
});

test("free and subscription rows never acquire a per-token price", () => {
  const free = catalogEconomics(
    input({ access: "free", sellInputMicros: 9_000_000 }),
  );
  const subscription = catalogEconomics(
    input({ access: "subscription", sellInputMicros: 9_000_000 }),
  );

  assert.equal(free.status, "free");
  assert.equal(free.sellInputMicros, 0);
  assert.equal(subscription.status, "subscription");
  assert.equal(subscription.sellOutputMicros, 0);
});

test("unknown cost and a stale manual cost are separate warnings", () => {
  const unknown = catalogEconomics(input({ costSource: "unknown" }));
  const stale = catalogEconomics(
    input({
      costSource: "manual",
      costObservedAt: "2026-09-01T00:00:00.000Z",
    }),
  );

  assert.equal(unknown.costKnown, false);
  assert.equal(unknown.inputMarginBps, null);
  assert.match(unknown.warnings.join(" "), /unknown/i);
  assert.equal(stale.costStale, true);
  assert.match(stale.warnings.join(" "), /older than/i);
});

test("an unpriced paid row and a negative margin are visible", () => {
  const unpriced = catalogEconomics(
    input({ sellInputMicros: 0, sellOutputMicros: 0 }),
  );
  const negative = catalogEconomics(input({ sellInputMicros: 1_000_000 }));

  assert.equal(unpriced.status, "unpriced");
  assert.match(unpriced.warnings.join(" "), /cannot be published/);
  assert.ok((negative.inputMarginBps ?? 0) < 0);
  assert.match(negative.warnings.join(" "), /below upstream cost/);
});

test("a custom scenario uses the same integer math", () => {
  const result = catalogEconomics(
    input({
      scenario: { inputTokens: 2_000, outputTokens: 500 },
    }),
  );

  assert.equal(result.scenarioRevenueMicros, 11_000);
  assert.equal(result.scenarioCostMicros, 8_000);
  assert.equal(result.scenarioProfitMicros, 3_000);
  assert.equal(scenarioLabel(result.scenario), "2K in + 500 out");
});
