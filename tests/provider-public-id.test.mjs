import assert from "node:assert/strict";
import test from "node:test";

import { buildSyncedCatalog } from "../lib/providers/catalog.ts";
import { publicModelId } from "../lib/providers/registry.ts";

/**
 * One published id rule, driven by the stored default.
 *
 * The default provider owns the unprefixed namespace, so its rows answer to the
 * bare upstream id and every other provider's rows are `slug/id`. The owner is an
 * argument, not a constant, because an operator can move it
 * (FID-2026-1124-002).
 */
function provider(slug) {
  return {
    slug,
    label: slug,
    kind: "openai",
    baseUrl: `https://${slug}.test/v1`,
    keyEnvVar: `${slug.toUpperCase().replace(/-/g, "_")}_KEY`,
    defaultHeaders: {},
    capabilities: { balance: false, subscription: false, pricing: false },
    requiresModelReview: false,
    balanceUrl: null,
    catalogUrl: null,
    enabled: true,
    isDefault: false,
    sortOrder: 10,
    createdAt: "2026-11-24T00:00:00.000Z",
    updatedAt: "2026-11-24T00:00:00.000Z",
  };
}

function upstream(id) {
  return {
    id,
    name: id,
    input_per_1m: 1,
    output_per_1m: 2,
    context_window: "8k",
  };
}

test("the default keeps bare ids and every other provider is namespaced", () => {
  assert.equal(publicModelId("inferhub", "inferhub", "glm-5.3"), "glm-5.3");
  assert.equal(publicModelId("inferhub", "savant", "glm-5.3"), "savant/glm-5.3");
  assert.equal(
    publicModelId(null, "inferhub", "glm-5.3"),
    "inferhub/glm-5.3",
    "with no default every id is namespaced, so nothing is ambiguous",
  );
});

test("the built catalog publishes the ids the current default implies", () => {
  const before = buildSyncedCatalog(
    provider("inferhub"),
    [upstream("glm-5.3")],
    new Map(),
    "savant",
  );
  const after = buildSyncedCatalog(
    provider("inferhub"),
    [upstream("glm-5.3")],
    new Map(),
    "inferhub",
  );

  assert.deepEqual(
    before.rows.map((row) => row.id),
    ["inferhub/glm-5.3"],
  );
  assert.deepEqual(
    after.rows.map((row) => row.id),
    ["glm-5.3"],
  );
});
