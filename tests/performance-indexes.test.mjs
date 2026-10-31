import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { performanceIndexSchema } from "../lib/schema/indexes.ts";

const NOW = "2026-10-31T12:00:00.000Z";

function fixture() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE usage_events (
      id TEXT PRIMARY KEY,
      provider_slug TEXT NOT NULL DEFAULT 'savant',
      created_at TEXT NOT NULL
    );
    CREATE INDEX usage_events_created_idx ON usage_events(created_at);

    CREATE TABLE billing_events (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'processed',
      claimed_at TEXT
    );
  `);
  performanceIndexSchema(db);

  const insertUsage = db.prepare(
    "INSERT INTO usage_events (id, provider_slug, created_at) VALUES (?, ?, ?)",
  );
  const insertEvent = db.prepare(
    "INSERT INTO billing_events (id, status, claimed_at) VALUES (?, ?, ?)",
  );

  db.transaction(() => {
    for (let index = 0; index < 2_000; index += 1) {
      insertUsage.run(
        `usage_${index}`,
        index % 2 === 0 ? "savant" : "other",
        new Date(Date.parse(NOW) - index * 60_000).toISOString(),
      );
      insertEvent.run(
        `event_${index}`,
        index % 3 === 0 ? "pending" : "processed",
        new Date(Date.parse(NOW) - index * 60_000).toISOString(),
      );
    }
  })();

  return db;
}

function plan(db, sql, ...params) {
  return db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...params)
    .map((row) => row.detail)
    .join(" | ");
}

test("the payment-claim composite index exists and does not duplicate", () => {
  const db = fixture();

  try {
    const billingIndexes = db
      .prepare("PRAGMA index_list(billing_events)")
      .all()
      .map((row) => row.name);

    assert.equal(
      billingIndexes.includes("billing_events_status_claimed_idx"),
      true,
    );

    performanceIndexSchema(db);

    assert.equal(
      db.prepare("PRAGMA index_list(billing_events)").all().length,
      billingIndexes.length,
      "a second bootstrap must not duplicate an index",
    );
  } finally {
    db.close();
  }
});

test("the analytics range uses the created_at index", () => {
  const db = fixture();

  try {
    const detail = plan(
      db,
      "SELECT COUNT(*) FROM usage_events WHERE created_at >= ?",
      "2026-10-31T00:00:00.000Z",
    );

    assert.match(detail, /usage_events_created_idx/);
    assert.doesNotMatch(detail, /SCAN usage_events(?! USING)/);
  } finally {
    db.close();
  }
});

test("provider-scoped usage uses created_at and claims use the composite", () => {
  const db = fixture();

  try {
    const usageDetail = plan(
      db,
      `SELECT COUNT(*) FROM usage_events
       WHERE provider_slug = ? AND created_at >= ?`,
      "savant",
      "2026-10-31T00:00:00.000Z",
    );
    const claimDetail = plan(
      db,
      `SELECT id FROM billing_events
       WHERE status = ? AND claimed_at <= ?`,
      "pending",
      NOW,
    );

    assert.match(usageDetail, /usage_events_created_idx/);
    assert.match(claimDetail, /billing_events_status_claimed_idx/);
  } finally {
    db.close();
  }
});
