import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogAccessPaths,
  pairCatalogModels,
  pairedCatalogCounts,
} from "../lib/catalog-pairs.ts";

function model(overrides = {}) {
  return {
    id: "glm-5.3",
    upstreamId: "glm-5.3",
    name: "GLM 5.3",
    family: "GLM",
    contextWindow: "128k",
    tokenWeight: 0,
    allowFree: false,
    access: "paid",
    groupSlug: "paid",
    groupLabel: "Paid",
    groupBillingMode: "paid",
    groupSource: "auto",
    requiresSubscription: false,
    inputPricePer1M: 0.4,
    outputPricePer1M: 0.8,
    supportsTools: true,
    supportsVision: false,
    health: null,
    status: "active",
    syncedAt: "2026-11-02T00:00:00.000Z",
    ...overrides,
  };
}

const FREE = model({
  id: "free/glm-5.3",
  upstreamId: "free/glm-5.3",
  access: "free",
  allowFree: true,
  groupSlug: "free",
  groupLabel: "Free",
  groupBillingMode: "free",
  tokenWeight: 2,
  inputPricePer1M: 0,
  outputPricePer1M: 0,
});

test("a free allocation and its paid row are one catalog row", () => {
  const rows = pairCatalogModels([FREE, model()]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "glm-5-3");
  assert.equal(rows[0].variants.length, 2);
  assert.equal(rows[0].free?.id, "free/glm-5.3");
  assert.equal(rows[0].paid?.id, "glm-5.3");
});

test("the paid variant names the row and carries its price", () => {
  const [row] = pairCatalogModels([FREE, model()]);

  assert.equal(row.display.id, "glm-5.3");
  assert.equal(row.primary.id, "glm-5.3");
  assert.equal(row.primary.inputPricePer1M, 0.4);
});

test("a free-only model still names its own row", () => {
  const [row] = pairCatalogModels([FREE]);

  assert.equal(row.display.id, "free/glm-5.3");
  assert.equal(row.primary.id, "free/glm-5.3");
  assert.equal(row.paid, null);
});

test("different models never become variants of each other", () => {
  const rows = pairCatalogModels([
    model(),
    model({ id: "glm-5.3-flash", upstreamId: "glm-5.3-flash" }),
    model({ id: "glm-5.4", upstreamId: "glm-5.4" }),
  ]);

  assert.equal(rows.length, 3);
});

test("a namespaced provider row pairs on its upstream identity", () => {
  const rows = pairCatalogModels([
    model(),
    model({ id: "apixo/glm-5.3", upstreamId: "glm-5.3", name: "GLM 5.3 (Apixo)" }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].variants.length, 2);
});

test("a free row and a paid row are both purchase paths", () => {
  const [row] = pairCatalogModels([FREE, model()]);
  const paths = catalogAccessPaths(row);

  assert.deepEqual(
    paths.map((path) => path.access),
    ["free", "paid"],
  );
  assert.deepEqual(
    paths.map((path) => path.href),
    ["/dashboard", "/account"],
  );
  assert.ok(paths.every((path) => path.detail.length > 0));
});

test("a plan-only model links to the plans page, not to a credit top-up", () => {
  const [row] = pairCatalogModels([
    model({
      id: "gated",
      upstreamId: "gated",
      access: "subscription",
      groupSlug: "subscription",
      groupLabel: "Subscription",
      groupBillingMode: "subscription",
      requiresSubscription: true,
    }),
  ]);

  assert.deepEqual(
    catalogAccessPaths(row).map((path) => [path.label, path.href]),
    [["See plans", "/plans"]],
  );
});

test("counts follow rows, not published ids", () => {
  const rows = pairCatalogModels([
    FREE,
    model(),
    model({
      id: "gated",
      upstreamId: "gated",
      access: "subscription",
      groupBillingMode: "subscription",
      groupSlug: "subscription",
    }),
    model({ id: "free/only-free", upstreamId: "free/only-free", access: "free" }),
  ]);

  assert.deepEqual(pairedCatalogCounts(rows), {
    models: 3,
    free: 2,
    paid: 1,
    subscriptionOnly: 1,
  });
});
