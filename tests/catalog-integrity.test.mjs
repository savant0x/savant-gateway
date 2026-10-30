import assert from "node:assert/strict";
import test from "node:test";

import { buildSyncedModels } from "../lib/providers/catalog.ts";
import { readUpstreamModelPage } from "../lib/providers/model-list.ts";

const PROVIDER = {
  slug: "savant",
  label: "Savant",
  kind: "openai",
  baseUrl: "https://example.test",
  keyEnvVar: "SAVANT_KEY",
  defaultHeaders: {},
  supportsBalance: false,
  supportsSubscription: false,
  supportsPricing: false,
  enabled: true,
  sortOrder: 0,
  status: "active",
};

test("a valid model list is read in source order", () => {
  const page = readUpstreamModelPage({
    object: "list",
    data: [
      { id: "free/alpha" },
      { id: " beta ", name: "Beta" },
      { id: "gamma" },
    ],
  });

  assert.deepEqual(
    page.models.map((model) => model.id),
    ["free/alpha", "beta", "gamma"],
  );
  assert.equal(page.received, 3);
  assert.equal(page.hasMore, false);
  assert.equal(page.lastId, null);
});

test("pagination metadata is reported, not guessed", () => {
  const page = readUpstreamModelPage({
    data: [{ id: "a" }],
    has_more: true,
    last_id: "model_a",
  });

  assert.equal(page.hasMore, true);
  assert.equal(page.lastId, "model_a");

  const last = readUpstreamModelPage({ data: [], has_more: false });

  assert.equal(last.hasMore, false);
  assert.equal(last.lastId, null);
});

test("an explicit empty list is a verified empty catalog", () => {
  const page = readUpstreamModelPage({ object: "list", data: [] });

  assert.deepEqual(page.models, []);
  assert.equal(page.received, 0);
});

test("a non-object or non-list body is refused", () => {
  for (const payload of [
    "<!doctype html><title>upstream</title>",
    null,
    [],
    42,
    { error: "catalog unavailable" },
    { data: "mock-upstream-model" },
    { data: null },
    { models: [{ id: "a" }] },
  ]) {
    assert.throws(
      () => readUpstreamModelPage(payload),
      /JSON object|model list/,
      JSON.stringify(payload),
    );
  }
});

test("entries without usable ids are dropped", () => {
  const page = readUpstreamModelPage({
    data: [{ id: "keep" }, {}, null, { id: "   " }, { id: 7 }],
  });

  assert.deepEqual(
    page.models.map((model) => model.id),
    ["keep"],
  );
  assert.equal(page.received, 5);
});

test("a non-empty page with no usable ids fails instead of delisting", () => {
  for (const data of [[{}], [null], [{ id: "" }], [{ id: 5 }, { name: "x" }]]) {
    assert.throws(
      () => readUpstreamModelPage({ data }),
      /no usable model ids/,
      JSON.stringify(data),
    );
  }
});

test("a sync deduplicates repeated upstream ids", () => {
  const rows = buildSyncedModels(
    PROVIDER,
    [
      { id: "dup-model", name: "First" },
      { id: "dup-model", name: "Second" },
      { id: "other-model" },
    ],
    new Map(),
  );

  assert.equal(rows.filter((row) => row.upstreamId === "dup-model").length, 1);
  assert.equal(rows.length, 2);
});
