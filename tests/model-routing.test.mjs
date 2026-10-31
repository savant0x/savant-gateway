import assert from "node:assert/strict";
import test from "node:test";

import {
  isServableRoute,
  planModelRoutes,
  routeCostMicros,
} from "../lib/model-routing.ts";

function route(overrides = {}) {
  return {
    id: "gpt-6-astra",
    namespaced: false,
    providerSlug: "savant",
    upstreamId: "gpt-6-astra",
    protocol: "chat",
    costInputMicros: 900_000,
    costOutputMicros: 900_000,
    costSource: "synced",
    allowFree: false,
    status: "active",
    inCatalog: true,
    providerEnabled: true,
    providerSortOrder: 10,
    sellInputMicros: 1_125_000,
    sellOutputMicros: 1_125_000,
    groupBillingMode: "paid",
    ...overrides,
  };
}

const APIXO = route({
  id: "apixo/gpt-6-astra",
  namespaced: true,
  providerSlug: "apixo",
  upstreamId: "gpt-6-astra",
  costInputMicros: 500_000,
  costOutputMicros: 600_000,
  providerSortOrder: 30,
  protocol: "chat",
  sellInputMicros: 625_000,
  sellOutputMicros: 750_000,
});

test("the cheaper provider serves while the published id stays stable", () => {
  const plan = planModelRoutes([route(), APIXO]);

  assert.equal(plan.publishedId, "gpt-6-astra");
  assert.equal(plan.servingId, "apixo/gpt-6-astra");
  assert.deepEqual(plan.ranking, ["apixo/gpt-6-astra", "gpt-6-astra"]);
});

test("a costlier newcomer never replaces the incumbent", () => {
  const plan = planModelRoutes([
    route({ costInputMicros: 100_000, costOutputMicros: 100_000 }),
    APIXO,
  ]);

  assert.equal(plan.servingId, "gpt-6-astra");
  assert.deepEqual(plan.ranking, ["gpt-6-astra", "apixo/gpt-6-astra"]);
});

test("the blend weighs three input tokens to one output token", () => {
  assert.equal(
    routeCostMicros({ costInputMicros: 100, costOutputMicros: 400 }),
    700,
  );
});

test("an unknown cost is never servable even when it looks free", () => {
  assert.equal(
    isServableRoute(route({ costSource: "unknown", costInputMicros: 0 })),
    false,
  );

  const plan = planModelRoutes([
    route({ costSource: "unknown", costInputMicros: 0, costOutputMicros: 0 }),
    APIXO,
  ]);

  assert.equal(plan.servingId, "apixo/gpt-6-astra");
});

test("an unpriced non-free row is not servable", () => {
  assert.equal(
    isServableRoute(route({ sellInputMicros: 0, sellOutputMicros: 0 })),
    false,
  );
  assert.equal(
    isServableRoute(
      route({
        sellInputMicros: 0,
        sellOutputMicros: 0,
        groupBillingMode: "free",
        allowFree: true,
        costInputMicros: 0,
        costOutputMicros: 0,
      }),
    ),
    true,
  );
});

test("a disabled published row hides the whole group", () => {
  const plan = planModelRoutes([route({ status: "disabled" }), APIXO]);

  assert.equal(plan.publishedId, "gpt-6-astra");
  assert.equal(plan.servingId, null);
});

test("a disabled provider route is skipped", () => {
  const plan = planModelRoutes([
    route(),
    { ...APIXO, providerEnabled: false },
  ]);

  assert.equal(plan.servingId, "gpt-6-astra");
});

test("a model that only a secondary provider sells publishes its own id", () => {
  const plan = planModelRoutes([APIXO]);

  assert.equal(plan.publishedId, "apixo/gpt-6-astra");
  assert.equal(plan.servingId, "apixo/gpt-6-astra");
});

test("an equal price is settled by provider order, never by id order alone", () => {
  const plan = planModelRoutes([
    route({ id: "savant/equal", namespaced: true, providerSortOrder: 30 }),
    route({
      id: "apixo/equal",
      namespaced: true,
      providerSlug: "apixo",
      providerSortOrder: 10,
    }),
  ]);

  assert.equal(plan.servingId, "apixo/equal");
});

test("an empty group has nothing to publish or serve", () => {
  assert.deepEqual(planModelRoutes([]), {
    publishedId: null,
    servingId: null,
    ranking: [],
  });
});
