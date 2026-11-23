import assert from "node:assert/strict";
import test from "node:test";

import { groupLinkedModels } from "../lib/content/link-groups.ts";

/**
 * One card per underlying model (FID-2026-1123-001).
 *
 * The catalog sells the same weights under several provider prefixes, so one
 * headline used to render one price card per row. Grouping happens at read time
 * from the provider-neutral key, which leaves `content.model_links` exact.
 */
function model(overrides) {
  return {
    id: "cb/glm-5.3",
    upstreamId: "glm-5.3",
    name: "GLM-5.3",
    family: "Zai",
    contextWindow: "128k",
    tokenWeight: 1,
    allowFree: false,
    access: "paid",
    groupSlug: "paid",
    groupLabel: "Paid",
    groupBillingMode: "paid",
    groupSource: "auto",
    requiresSubscription: false,
    inputPricePer1M: 1,
    outputPricePer1M: 2,
    supportsTools: true,
    supportsVision: false,
    health: null,
    status: "active",
    syncedAt: "2026-11-23T00:00:00.000Z",
    ...overrides,
  };
}

const link = (modelId, reason = "Title matches “glm 5 3”") => ({
  modelId,
  relation: "release",
  reason,
});

test("provider rows of one model become one card", () => {
  const models = new Map([
    ["cb/glm-5.3", model({ id: "cb/glm-5.3", inputPricePer1M: 2 })],
    ["alicn/glm-5.3", model({ id: "alicn/glm-5.3", inputPricePer1M: 1 })],
    ["kiro/glm-5", model({ id: "kiro/glm-5", upstreamId: "glm-5" })],
  ]);

  const groups = groupLinkedModels(
    [link("cb/glm-5.3"), link("alicn/glm-5.3"), link("kiro/glm-5")],
    models,
  );

  assert.equal(groups.length, 2, "two models, not three rows");
  assert.equal(groups[0].key, "glm-5-3");
  assert.equal(groups[0].modelId, "alicn/glm-5.3", "the cheapest row is quoted");
  assert.deepEqual(groups[0].providers, ["cb/glm-5.3"]);
  assert.equal(groups[1].key, "glm-5");
  assert.deepEqual(groups[1].providers, []);
});

test("a link whose catalog row is gone keeps its card", () => {
  const groups = groupLinkedModels([link("gone/kimi-k2.5")], new Map());

  assert.equal(groups.length, 1);
  assert.equal(groups[0].model, null);
  assert.equal(groups[0].modelId, "gone/kimi-k2.5");
  assert.match(groups[0].reason, /Title matches/);
});

test("a group keeps a resolved row even when another row is gone", () => {
  const models = new Map([
    ["cb/kimi-k2.5", model({ id: "cb/kimi-k2.5", upstreamId: "kimi-k2.5" })],
  ]);

  const groups = groupLinkedModels(
    [link("gone/kimi-k2.5"), link("cb/kimi-k2.5")],
    models,
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].modelId, "cb/kimi-k2.5");
  assert.deepEqual(groups[0].providers, ["gone/kimi-k2.5"]);
});

test("different versions stay different cards", () => {
  const models = new Map([
    ["cb/glm-5.3", model({ id: "cb/glm-5.3" })],
    ["kiro/glm-5", model({ id: "kiro/glm-5", upstreamId: "glm-5" })],
  ]);

  const groups = groupLinkedModels(
    [link("cb/glm-5.3"), link("kiro/glm-5")],
    models,
  );

  assert.deepEqual(
    groups.map((group) => group.key),
    ["glm-5-3", "glm-5"],
  );
});
