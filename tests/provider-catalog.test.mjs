import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { providerCatalogSummaryIn } from "../lib/provider-catalog.ts";

function database() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE providers (
      slug TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      key_env_var TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT
    );
    CREATE TABLE models (
      id TEXT PRIMARY KEY,
      upstream_slug TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      in_catalog INTEGER NOT NULL DEFAULT 1,
      allow_free INTEGER NOT NULL DEFAULT 0,
      sell_input_micros INTEGER NOT NULL DEFAULT 0,
      sell_output_micros INTEGER NOT NULL DEFAULT 0,
      cost_source TEXT NOT NULL DEFAULT 'synced',
      is_primary INTEGER NOT NULL DEFAULT 1,
      served_provider_slug TEXT
    );
  `);

  return db;
}

function provider(db, slug, label, sortOrder = 10) {
  db.prepare(
    `INSERT INTO providers (slug, label, key_env_var, enabled, sort_order, synced_at)
     VALUES (?, ?, ?, 1, ?, '2026-10-31T00:00:00.000Z')`,
  ).run(slug, label, `${slug.toUpperCase()}_KEY`, sortOrder);
}

function model(db, overrides) {
  const row = {
    id: "gpt-6-astra",
    upstream_slug: "savant",
    status: "active",
    in_catalog: 1,
    allow_free: 0,
    sell_input_micros: 1_000_000,
    sell_output_micros: 1_000_000,
    cost_source: "synced",
    is_primary: 1,
    served_provider_slug: null,
    ...overrides,
  };

  db.prepare(
    `INSERT INTO models (id, upstream_slug, status, in_catalog, allow_free,
       sell_input_micros, sell_output_micros, cost_source, is_primary,
       served_provider_slug)
     VALUES (@id, @upstream_slug, @status, @in_catalog, @allow_free,
       @sell_input_micros, @sell_output_micros, @cost_source, @is_primary,
       @served_provider_slug)`,
  ).run(row);
}

test("each provider reports its own contribution and serving count", () => {
  const db = database();

  provider(db, "savant", "Savant", 10);
  provider(db, "apixo", "Apixo", 30);
  model(db, { id: "gpt-6-astra", served_provider_slug: "apixo" });
  model(db, {
    id: "free/gpt-6-luna",
    allow_free: 1,
    sell_input_micros: 0,
    sell_output_micros: 0,
    served_provider_slug: "savant",
  });
  model(db, {
    id: "apixo/glm-5.3",
    upstream_slug: "apixo",
    served_provider_slug: "apixo",
  });

  const summary = providerCatalogSummaryIn(db);

  assert.deepEqual(
    summary.map((row) => row.slug),
    ["savant", "apixo"],
  );
  assert.deepEqual(
    summary.map((row) => [
      row.modelCount,
      row.activeCount,
      row.pricedCount,
      row.servingCount,
    ]),
    [
      [2, 2, 2, 1],
      [1, 1, 1, 2],
    ],
  );
  assert.equal(summary[1].label, "Apixo");
  assert.equal(summary[1].configured, false);
});

test("an unpriced or unknown-cost row is counted but not priced", () => {
  const db = database();

  provider(db, "apixo", "Apixo");
  model(db, {
    id: "apixo/unknown",
    upstream_slug: "apixo",
    status: "disabled",
    cost_source: "unknown",
    sell_input_micros: 0,
    sell_output_micros: 0,
  });

  const [row] = providerCatalogSummaryIn(db);

  assert.equal(row.modelCount, 1);
  assert.equal(row.activeCount, 0);
  assert.equal(row.pricedCount, 0);
  assert.equal(row.unknownCostCount, 1);
  assert.equal(row.servingCount, 0);
});

test("a provider with no synced models still appears with zeros", () => {
  const db = database();

  provider(db, "twigpine", "Twigpine");

  const [row] = providerCatalogSummaryIn(db);

  assert.equal(row.modelCount, 0);
  assert.equal(row.activeCount, 0);
  assert.equal(row.pricedCount, 0);
  assert.equal(row.servingCount, 0);
  assert.equal(row.syncedAt, "2026-10-31T00:00:00.000Z");
});
