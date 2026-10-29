import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { trialSchema } from "../lib/schema/trials.ts";
import { reserveTrial, settleTrial, trialBalance } from "../lib/trial-ledger.ts";
import { readTrialConfig } from "../lib/trials.ts";

const NOW = "2026-10-29T12:00:00.000Z";
const LATER = "2026-10-29T12:15:00.000Z";
const NEXT = "2026-10-30T12:00:00.000Z";
const CONFIG = { enabled: true, grantTokens: 100, grantBudget: 200, pairs: {} };

function fixture() {
  const db = new Database(":memory:");

  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email_verified_at TEXT);
    CREATE TABLE free_pool_usage (user_id TEXT, weighted_tokens INTEGER);
    CREATE TABLE usage_events (id TEXT PRIMARY KEY);
    INSERT INTO users VALUES ('a', '${NOW}'), ('b', '${NOW}'), ('c', NULL);
  `);
  trialSchema(db);

  return db;
}

function reserve(db, id, overrides = {}) {
  return reserveTrial(db, {
    userId: "a", id, estimated: 60, now: NOW, expiresAt: LATER,
    config: CONFIG, ...overrides,
  });
}

test("trials are off, unpaired and unbudgeted by default", () => {
  assert.deepEqual(readTrialConfig({}), {
    enabled: false, grantTokens: 100000, grantBudget: 0, pairs: {},
  });
  assert.equal(readTrialConfig({ TRIAL_WEIGHTED_TOKENS: "-1" }).grantTokens, 100000);
  assert.deepEqual(readTrialConfig({ TRIAL_MODEL_PAIRS: "{bad" }).pairs, {});
  assert.deepEqual(readTrialConfig({ TRIAL_MODEL_PAIRS: '{"free/a":"a","free/b":true}' }).pairs, { "free/a": "a" });
});

test("holds share one grant and settlement is isolated and replay safe", () => {
  const db = fixture();

  try {
    assert.equal(reserve(db, "one"), true);
    assert.equal(reserve(db, "two"), false);
    assert.equal(settleTrial(db, { id: "one", userId: "b", actual: 50, now: NOW }), false);
    assert.equal(settleTrial(db, { id: "one", userId: "a", actual: 50, now: NOW }), true);
    assert.equal(settleTrial(db, { id: "one", userId: "a", actual: 50, now: NOW }), false);
    assert.equal(trialBalance(db, "a", NOW).used, 50);
    assert.equal(reserve(db, "three", { estimated: 50 }), true);
    assert.equal(reserve(db, "four", { estimated: 1 }), false);
  } finally { db.close(); }
});

test("grants do not reset at midnight or change when configuration increases", () => {
  const db = fixture();

  try {
    reserve(db, "one", { estimated: 100 });
    settleTrial(db, { id: "one", userId: "a", actual: 100, now: NOW });
    assert.equal(reserve(db, "next", { estimated: 1, now: NEXT, config: { ...CONFIG, grantTokens: 200 } }), false);
    assert.equal(trialBalance(db, "a", NEXT).granted, 100);
  } finally { db.close(); }
});

test("verification, gateway grant budget and historic usage constrain issuance", () => {
  const db = fixture();

  try {
    assert.equal(reserve(db, "unverified", { userId: "c" }), false);
    assert.equal(reserve(db, "no-budget", { config: { ...CONFIG, grantBudget: 0 } }), false);
    db.prepare("INSERT INTO free_pool_usage VALUES ('a', 90)").run();
    assert.equal(reserve(db, "too-large"), false);
    assert.equal(reserve(db, "fits", { estimated: 10 }), true);
    assert.equal(reserve(db, "b", { userId: "b" }), true);
    db.prepare("UPDATE users SET email_verified_at = ? WHERE id = 'c'").run(NOW);
    assert.equal(reserve(db, "c", { userId: "c" }), false);
  } finally { db.close(); }
});

test("expired reservations release capacity but late settlement still counts once", () => {
  const db = fixture();

  try {
    reserve(db, "expired");
    assert.equal(trialBalance(db, "a", NEXT).remaining, 100);
    assert.equal(settleTrial(db, { id: "expired", userId: "a", actual: 120, now: NEXT }), true);
    assert.equal(trialBalance(db, "a", NEXT).remaining, 0);
    assert.equal(trialBalance(db, "a", NEXT).used, 120);
    assert.equal(settleTrial(db, { id: "expired", userId: "a", actual: 120, now: NEXT }), false);
  } finally { db.close(); }
});
