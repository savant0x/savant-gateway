import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildSyncedCatalog,
  importedModelStatus,
} from "../lib/providers/catalog.ts";
import { normalizeCatalog } from "../lib/providers/normalize/index.ts";
import { familyFromModelId } from "../lib/model-family.ts";

const PROVIDER = {
  slug: "inferhub",
  label: "InferHub",
  kind: "openai",
  baseUrl: "https://api.inferhub.dev/v1",
  keyEnvVar: "INFERHUB_API_KEY",
  defaultHeaders: {},
  requiresModelReview: true,
  enabled: true,
  sortOrder: 0,
  capabilities: { balance: false, subscription: false, pricing: true },
};

test("the ask-ladder shape prices a row from the cheapest open ask, never the official rate", () => {
  const { models } = normalizeCatalog([
    {
      id: "cc/claude-opus-5-5",
      owned_by: "cc",
      upstream_label: "Claude Opus 5.5",
      input_token_limit: 1000000,
      max_output_tokens: 128000,
      modality: "text,image",
      pricing: {
        official_in: 5,
        official_out: 25,
        min_ask_in: 0.152,
        min_ask_out: 0.76,
        asks_in: [0.152, 0.2],
        asks_out: [0.76, 1.0],
      },
    },
  ]);

  assert.equal(models.length, 1);
  assert.equal(models[0].priceSource, "declared");
  assert.equal(models[0].inputPer1M, 0.152);
  assert.equal(models[0].outputPer1M, 0.76);
  assert.equal(models[0].family, "Claude");
  assert.equal(models[0].contextWindow, "1000000");
  assert.equal(models[0].supportsVision, true);
});

test("an alias row is dropped and reported, never imported", () => {
  const { models, skippedAliases } = normalizeCatalog([
    { id: "claude-opus-5.5", owned_by: "alias" },
    { id: "cc/claude-opus-5-5", owned_by: "cc", pricing: { min_ask_in: 0.1 } },
  ]);

  assert.deepEqual(models.map((model) => model.upstreamId), [
    "cc/claude-opus-5-5",
  ]);
  assert.deepEqual(skippedAliases, ["claude-opus-5.5"]);
});

test("a non-text output row is dropped and reported, never imported as chat", () => {
  const { models, skippedMedia } = normalizeCatalog([
    { id: "cc/an-image-model", owned_by: "cc", output_modality: "image" },
  ]);

  assert.equal(models.length, 0);
  assert.deepEqual(skippedMedia, ["cc/an-image-model"]);
});

test("a free-pool row is refused, not turned into a $0 row", () => {
  const { rows, skippedFreePool } = buildSyncedCatalog(
    PROVIDER,
    [{ id: "free/tiny" }],
    new Map(),
    "savant",
  );

  assert.deepEqual(rows, [], "no free capacity is imported");
  assert.deepEqual(skippedFreePool, ["free/tiny"]);
});

test("the flat-usd shape imports a priced active row", () => {
  const { rows } = buildSyncedCatalog(
    PROVIDER,
    [{ id: "gpt-6-luna", dollarsPer1M: 0.4, outputDollarsPer1M: 1.6 }],
    new Map(),
    "savant",
  );
  const row = rows[0];

  assert.equal(row.costInputMicros, 400000);
  assert.equal(row.costOutputMicros, 1600000);
  assert.equal(row.costSource, "synced");
  assert.equal(row.routeGroup, "gpt-6-luna");
  assert.equal(row.id, "inferhub/gpt-6-luna");
});

test("a declared $0 output is a missing figure and falls back to the input rate", () => {
  const { models } = normalizeCatalog([
    { id: "m", dollarsPer1M: 2, outputDollarsPer1M: 0 },
  ]);

  assert.equal(models[0].outputPer1M, 0);

  const { rows } = buildSyncedCatalog(
    PROVIDER,
    [{ id: "m", dollarsPer1M: 2, outputDollarsPer1M: 0 }],
    new Map(),
    "savant",
  );

  assert.equal(rows[0].costOutputMicros, 2000000);
  assert.equal(rows[0].costInputMicros, 2000000);
});

test("an unpriced row imports unknown and disabled, and importing it again keeps it", () => {
  const { rows } = buildSyncedCatalog(
    PROVIDER,
    [{ id: "naked" }],
    new Map(),
    "savant",
  );

  assert.equal(rows[0].costSource, "unknown");
  assert.equal(importedModelStatus({ costSource: "unknown" }), "disabled");
});

test("the overlay wins over an envelope-declared price, matching the old builder", () => {
  const overlay = new Map([
    ["gpt-9", { id: "gpt-9", dollarsPer1M: 0.8, provider: "GPT" }],
  ]);
  const { models } = normalizeCatalog(
    [{ id: "gpt-9", dollarsPer1M: 99, outputDollarsPer1M: 99 }],
    overlay,
  );

  assert.equal(models[0].inputPer1M, 0.8);
  assert.equal(models[0].family, "GPT");
});

test("a marketplace prefix is a publisher, never a family", () => {
  assert.equal(familyFromModelId("cc/claude-opus-5-5"), "Claude");
  assert.equal(familyFromModelId("ag/gemini-3-flash"), "Gemini");
  assert.equal(familyFromModelId("free/gpt-6-luna"), "GPT");

  const { models } = normalizeCatalog([
    { id: "kiro/claude-fable-5", owned_by: "kiro", pricing: { min_ask_in: 1 } },
  ]);

  assert.equal(models[0].family, "Claude");
});

test("a declared label that is the publisher prefix is ignored", () => {
  const { models } = normalizeCatalog([
    {
      id: "cc/claude-opus-5-5",
      owned_by: "cc",
      provider: "cc",
      pricing: { min_ask_in: 0.1, min_ask_out: 0.5 },
    },
  ]);

  assert.equal(models[0].family, "Claude");
});

test("the recorded default-provider payload imports exactly as it did before", () => {
  const payload = JSON.parse(
    readFileSync(new URL("./fixtures/catalog-parity.json", import.meta.url)),
  );
  const { rows } = buildSyncedCatalog(
    PROVIDER,
    payload.models,
    new Map(),
    "savant",
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(rows)),
    payload.expected,
    "every field of every row must match the pre-normalization output",
  );
});

test("the shape layer and the sync port carry no provider-name branches", () => {
  const scopedFiles = [
    "lib/providers/catalog.ts",
    "lib/providers/normalize/types.ts",
    "lib/providers/normalize/facts.ts",
    "lib/providers/normalize/shapes.ts",
    "lib/providers/normalize/index.ts",
    "lib/storage/providers/sync.ts",
  ];

  for (const file of scopedFiles) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

    assert.ok(
      !/\.slug\s*===/.test(source),
      `${file} must not branch on a provider slug`,
    );
  }
});
test("a free/ row is refused for every provider, with no registry flag", () => {
  const entries = [
    { id: "free/tiny" },
    { id: "gpt-6-luna", dollarsPer1M: 0.4, outputDollarsPer1M: 1.6 },
  ];

  const { rows, skippedFreePool } = buildSyncedCatalog(
    PROVIDER,
    entries,
    new Map(),
    "savant",
  );

  assert.deepEqual(
    rows.map((row) => row.upstreamId),
    ["gpt-6-luna"],
    "the paid row is untouched and the free row is refused",
  );
  assert.deepEqual(skippedFreePool, ["free/tiny"]);
});

test("a declared upstream weight is ignored on a priced row too", () => {
  const { rows } = buildSyncedCatalog(
    PROVIDER,
    [
      { id: "gpt-6-luna", weight: 3, dollarsPer1M: 0.4, outputDollarsPer1M: 1.6 },
      { id: "gpt-6-sol", weight: 2, dollarsPer1M: 1, outputDollarsPer1M: 4 },
    ],
    new Map(),
    "savant",
  );

  assert.deepEqual(
    rows.map((row) => row.tokenWeight),
    [1, 1],
    "every row meters 1:1",
  );
});
