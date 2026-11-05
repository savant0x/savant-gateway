import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { reconcileRoutesIn } from "../lib/route-reconcile.ts";

function database() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE providers (
      slug TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      requires_model_review INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE model_eligibility (
      provider_slug TEXT NOT NULL,
      upstream_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      PRIMARY KEY (provider_slug, upstream_id)
    );
    CREATE TABLE model_groups (
      slug TEXT PRIMARY KEY,
      billing_mode TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE models (
      id TEXT PRIMARY KEY,
      upstream_id TEXT NOT NULL,
      upstream_slug TEXT NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'chat',
      route_group TEXT,
      is_primary INTEGER NOT NULL DEFAULT 1,
      served_provider_slug TEXT,
      served_upstream_id TEXT,
      served_protocol TEXT,
      served_cost_input_micros INTEGER,
      served_cost_output_micros INTEGER,
      input_price_micros INTEGER NOT NULL DEFAULT 0,
      output_price_micros INTEGER NOT NULL DEFAULT 0,
      sell_input_micros INTEGER NOT NULL DEFAULT 0,
      sell_output_micros INTEGER NOT NULL DEFAULT 0,
      price_source TEXT NOT NULL DEFAULT 'auto',
      allow_free INTEGER NOT NULL DEFAULT 0,
      cost_source TEXT NOT NULL DEFAULT 'unknown',
      cost_observed_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      in_catalog INTEGER NOT NULL DEFAULT 1,
      group_slug TEXT,
      token_weight INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.prepare("INSERT INTO model_groups (slug, billing_mode) VALUES (?, ?)").run(
    "paid",
    "paid",
  );
  db.prepare("INSERT INTO model_groups (slug, billing_mode) VALUES (?, ?)").run(
    "free",
    "free",
  );

  return db;
}

function provider(db, slug, { enabled = 1, sortOrder = 10 } = {}) {
  db.prepare(
    "INSERT INTO providers (slug, enabled, sort_order) VALUES (?, ?, ?)",
  ).run(slug, enabled, sortOrder);
}

function model(db, overrides) {
  const row = {
    id: "gpt-6-astra",
    upstream_id: "gpt-6-astra",
    upstream_slug: "savant",
    route_group: "gpt-6-astra",
    input_price_micros: 900_000,
    output_price_micros: 900_000,
    sell_input_micros: 1_125_000,
    sell_output_micros: 1_125_000,
    price_source: "auto",
    cost_source: "synced",
    status: "active",
    in_catalog: 1,
    group_slug: "paid",
    ...overrides,
  };

  db.prepare(`
    INSERT INTO models (id, upstream_id, upstream_slug, route_group,
      input_price_micros, output_price_micros, sell_input_micros,
      sell_output_micros, price_source, allow_free, cost_source, status,
      in_catalog, group_slug)
    VALUES (@id, @upstream_id, @upstream_slug, @route_group,
      @input_price_micros, @output_price_micros, @sell_input_micros,
      @sell_output_micros, @price_source, @allow_free, @cost_source, @status,
      @in_catalog, @group_slug)
  `).run({ allow_free: 0, ...row });

  return row;
}

const APIXO = {
  id: "apixo/gpt-6-astra",
  upstream_id: "gpt-6-astra",
  upstream_slug: "apixo",
  input_price_micros: 500_000,
  output_price_micros: 600_000,
  sell_input_micros: 625_000,
  sell_output_micros: 750_000,
};

function row(db, id) {
  return db.prepare("SELECT * FROM models WHERE id = ?").get(id);
}

test("the cheaper provider serves and the stable id reprices from its cost", () => {
  const db = database();

  provider(db, "savant", { sortOrder: 10 });
  provider(db, "apixo", { sortOrder: 30 });
  model(db, {});
  model(db, APIXO);

  assert.equal(reconcileRoutesIn(db, 2500), 2);

  const published = row(db, "gpt-6-astra");

  assert.equal(published.is_primary, 1);
  assert.equal(published.served_provider_slug, "apixo");
  assert.equal(published.served_upstream_id, "gpt-6-astra");
  assert.equal(published.served_cost_input_micros, 500_000);
  assert.equal(published.served_cost_output_micros, 600_000);
  // 500k × 1.25 and 600k × 1.25, the serving cost and the default markup.
  assert.equal(published.sell_input_micros, 625_000);
  assert.equal(published.sell_output_micros, 750_000);

  const secondary = row(db, "apixo/gpt-6-astra");

  assert.equal(secondary.is_primary, 0);
  assert.equal(secondary.served_provider_slug, null);
});

test("a manual sell price is never rewritten by a takeover", () => {
  const db = database();

  provider(db, "savant");
  provider(db, "apixo", { sortOrder: 30 });
  model(db, { price_source: "manual", sell_input_micros: 2_000_000 });
  model(db, APIXO);

  reconcileRoutesIn(db, 2500);

  const published = row(db, "gpt-6-astra");

  assert.equal(published.served_provider_slug, "apixo");
  assert.equal(published.sell_input_micros, 2_000_000);
});

test("a disabled published row hides the group instead of promoting a route", () => {
  const db = database();

  provider(db, "savant");
  provider(db, "apixo", { sortOrder: 30 });
  model(db, { status: "disabled" });
  model(db, APIXO);

  reconcileRoutesIn(db, 2500);

  const published = row(db, "gpt-6-astra");

  assert.equal(published.is_primary, 1);
  assert.equal(published.served_provider_slug, null);
});

test("a disabled provider is skipped by the ranking", () => {
  const db = database();

  provider(db, "savant");
  provider(db, "apixo", { enabled: 0, sortOrder: 30 });
  model(db, {});
  model(db, APIXO);

  reconcileRoutesIn(db, 2500);

  const published = row(db, "gpt-6-astra");

  assert.equal(published.served_provider_slug, "savant");
  assert.equal(published.sell_input_micros, 1_125_000);
});

test("a model only the new provider sells becomes its own published row", () => {
  const db = database();

  provider(db, "apixo");
  model(db, {
    id: "apixo/new-model",
    upstream_id: "new-model",
    upstream_slug: "apixo",
    route_group: "new-model",
    input_price_micros: 100_000,
    output_price_micros: 200_000,
  });

  reconcileRoutesIn(db, 2500);

  const published = row(db, "apixo/new-model");

  assert.equal(published.is_primary, 1);
  assert.equal(published.served_provider_slug, "apixo");
  assert.equal(published.sell_input_micros, 125_000);
  assert.equal(published.sell_output_micros, 250_000);
});

test("a free-pool row keeps its tier and the paid row stays published", () => {
  const db = database();

  provider(db, "savant");
  provider(db, "apixo", { sortOrder: 30 });
  model(db, {
    id: "free/gpt-6-luna",
    upstream_id: "free/gpt-6-luna",
    route_group: "gpt-6-luna",
    allow_free: 1,
    group_slug: "free",
    input_price_micros: 0,
    output_price_micros: 0,
    sell_input_micros: 0,
    sell_output_micros: 0,
    cost_source: "synced",
  });
  model(db, {
    id: "apixo/gpt-6-luna",
    upstream_id: "gpt-6-luna",
    upstream_slug: "apixo",
    route_group: "gpt-6-luna",
    input_price_micros: 100_000,
    output_price_micros: 100_000,
  });

  reconcileRoutesIn(db, 2500);

  const published = row(db, "free/gpt-6-luna");

  assert.equal(published.is_primary, 1);
  assert.equal(published.served_provider_slug, "savant");
  assert.equal(published.sell_input_micros, 0);

  // The paid row is a different product, not a losing route: it publishes in
  // its own tier instead of disappearing behind the free allocation.
  const paid = row(db, "apixo/gpt-6-luna");

  assert.equal(paid.is_primary, 1);
  assert.equal(paid.served_provider_slug, "apixo");
  assert.equal(paid.sell_input_micros, 125_000);
});

test("a free allocation and its paid counterpart publish side by side", () => {
  const db = database();

  provider(db, "savant");
  model(db, {
    id: "free/glm-5.3",
    upstream_id: "free/glm-5.3",
    route_group: "glm-5-3",
    allow_free: 1,
    group_slug: "free",
    input_price_micros: 0,
    output_price_micros: 0,
    sell_input_micros: 0,
    sell_output_micros: 0,
    cost_source: "synced",
  });
  model(db, {
    id: "glm-5.3",
    upstream_id: "glm-5.3",
    route_group: "glm-5-3",
    group_slug: "paid",
    input_price_micros: 400_000,
    output_price_micros: 800_000,
    sell_input_micros: 500_000,
    sell_output_micros: 1_000_000,
  });

  reconcileRoutesIn(db, 2500);

  const free = row(db, "free/glm-5.3");
  const paid = row(db, "glm-5.3");

  assert.equal(
    free.is_primary,
    1,
    "the free allocation is its own published row",
  );
  assert.equal(free.sell_input_micros, 0);
  assert.equal(paid.is_primary, 1, "the paid counterpart is published too");
  assert.equal(paid.served_provider_slug, "savant");
  assert.equal(paid.sell_input_micros, 500_000);
  assert.equal(paid.sell_output_micros, 1_000_000);
});
