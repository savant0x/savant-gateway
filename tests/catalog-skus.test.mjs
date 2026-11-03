import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogAccessPath,
  catalogSkuCounts,
  catalogSkuName,
  catalogSkuRows,
} from "../lib/catalog-skus.ts";

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

const SUBSCRIPTION = model({
  id: "free/glm-5.3-plan",
  upstreamId: "free/glm-5.3-plan",
  access: "subscription",
  groupSlug: "subscription",
  groupLabel: "Subscription",
  groupBillingMode: "subscription",
  requiresSubscription: true,
});

test("a free allocation and its paid counterpart are separate SKUs", () => {
  const rows = catalogSkuRows([FREE, model()]);

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.model.id).sort(),
    ["free/glm-5.3", "glm-5.3"],
  );
  assert.equal(
    rows.find((row) => row.model.access === "free")?.name,
    "GLM 5.3 (Free)",
  );
  assert.equal(
    rows.find((row) => row.model.access === "paid")?.name,
    "GLM 5.3",
  );
});

test("same-tier provider rows still merge into one SKU", () => {
  const rows = catalogSkuRows([
    model(),
    model({ id: "apixo/glm-5.3", upstreamId: "glm-5.3", name: "GLM 5.3 (Apixo)" }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].model.id, "glm-5.3", "the provider's own row names it");
  assert.equal(rows[0].variants.length, 2);
  assert.equal(rows[0].name, "GLM 5.3");
});

test("a free-only model still names its own SKU", () => {
  const [row] = catalogSkuRows([FREE]);

  assert.equal(row.model.id, "free/glm-5.3");
  assert.equal(row.name, "GLM 5.3 (Free)");
  assert.deepEqual(catalogAccessPath(row.model), {
    access: "free",
    label: "Free tier",
    href: "/dashboard",
    detail:
      "Free access draws on a daily weighted-token allowance and shared upstream capacity. Open the console for a key.",
  });
});

test("a plan-only model is qualified and links to plans", () => {
  const [row] = catalogSkuRows([SUBSCRIPTION]);

  assert.equal(row.name, "GLM 5.3 (Subscription)");
  assert.deepEqual(
    [catalogAccessPath(row.model).label, catalogAccessPath(row.model).href],
    ["See plans", "/plans"],
  );
});

test("a paid SKU links to credit, never to the free console", () => {
  const [row] = catalogSkuRows([model()]);

  assert.equal(catalogAccessPath(row.model).label, "Buy credit");
  assert.equal(catalogAccessPath(row.model).href, "/account");
});

test("different models never become variants of each other", () => {
  const rows = catalogSkuRows([
    model(),
    model({ id: "glm-5.3-flash", upstreamId: "glm-5.3-flash" }),
    model({ id: "glm-5.4", upstreamId: "glm-5.4" }),
  ]);

  assert.equal(rows.length, 3);
});

test("counts follow SKU rows, not model identity", () => {
  const rows = catalogSkuRows([
    FREE,
    model(),
    SUBSCRIPTION,
    model({ id: "free/only-free", upstreamId: "free/only-free", access: "free" }),
  ]);

  assert.deepEqual(catalogSkuCounts(rows), {
    skus: 4,
    free: 2,
    paid: 1,
    subscription: 1,
  });
});

test("the visible name is the qualification, not a stored rename", () => {
  assert.equal(catalogSkuName(model()), "GLM 5.3");
  assert.equal(catalogSkuName(FREE), "GLM 5.3 (Free)");
  assert.equal(catalogSkuName(SUBSCRIPTION), "GLM 5.3 (Subscription)");
});
