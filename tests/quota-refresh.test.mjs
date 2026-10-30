import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  parseProviderBalance, parseProviderSubscription, providerNumber, quotaIsCurrent,
} from "../lib/provider-quota.ts";
import { claimRuntimeLease, completeRuntimeCheck, effectiveProviderRemaining } from "../lib/quota-ledger.ts";
import { providerSchema } from "../lib/schema/providers.ts";

const AT = "2026-10-30T12:00:00.000Z";
const NOW = Date.parse(AT);
const PAYLOAD = { mode: "free", plan_label: "FREE", unlimited: false,
  token_limit: 20_000_000, tokens_used: 0, tokens_remaining: 20_000_000,
  allowed: true, resets_at_utc: "2026-10-31T00:00:00.000Z" };

function observation(overrides = {}) {
  return { subscriptionMode: "free", subscriptionExpiresAt: null,
    quota: { observedAt: AT, checkedAt: AT, resetsAt: PAYLOAD.resets_at_utc,
      unlimited: false, checking: false, error: null, ...overrides } };
}

function database() {
  const db = new Database(":memory:");

  db.exec(`CREATE TABLE models (id TEXT PRIMARY KEY, upstream_id TEXT, provider TEXT,
      allow_free INTEGER, token_weight INTEGER, input_price_micros INTEGER,
      output_price_micros INTEGER, in_catalog INTEGER, status TEXT);
    CREATE TABLE usage_events (provider_slug TEXT, created_at TEXT, weighted_tokens INTEGER);
    CREATE TABLE free_pool_reservations (provider_slug TEXT, expires_at TEXT, weighted_tokens INTEGER);
    CREATE TABLE provider_status (id INTEGER PRIMARY KEY);`);
  providerSchema(db);

  return db;
}

test("quota parser preserves the observed 0 used / 20M remaining reset", () => {
  const value = parseProviderSubscription(PAYLOAD);

  assert.equal(value.tokensUsed, 0);
  assert.equal(value.tokensRemaining, 20_000_000);
  assert.equal(value.resetsAt, PAYLOAD.resets_at_utc);
  assert.equal(parseProviderBalance({ balance_usd: 0 }).balanceUsd, 0);
});

test("numeric unknowns never become fabricated zero observations", () => {
  for (const raw of [null, undefined, "", " ", false, true, [], {}, -1, Infinity, "NaN"]) {
    assert.equal(providerNumber(raw), null);
    assert.throws(() => parseProviderBalance({ balance_usd: raw }));
  }
  assert.equal(providerNumber("0"), 0);
});

test("partial, unsafe and inconsistent finite quota is rejected", () => {
  for (const patch of [{ tokens_used: null }, { tokens_remaining: "" },
    { token_limit: false }, { tokens_remaining: -1 }, { allowed: "true" },
    { tokens_used: 1 }, { token_limit: Number.MAX_SAFE_INTEGER + 1 },
    { tokens_used: 1.5 }, { resets_at_utc: "invalid" }]) {
    assert.throws(() => parseProviderSubscription({ ...PAYLOAD, ...patch }));
  }
  assert.throws(() => parseProviderSubscription(null));
});

test("unlimited is explicit, not a truthy string or missing finite quota", () => {
  const unlimited = parseProviderSubscription({ unlimited: true, allowed: true });

  assert.equal(unlimited.unlimited, true);
  assert.equal(unlimited.tokensRemaining, null);
  assert.throws(() => parseProviderSubscription({ unlimited: "true", allowed: true }));
});

test("stale, failed, pending and future observations are not current", () => {
  assert.equal(quotaIsCurrent(observation(), NOW), true);
  for (const patch of [{ observedAt: null }, { observedAt: "invalid" },
    { observedAt: new Date(NOW - 30_000).toISOString() },
    { observedAt: new Date(NOW + 1).toISOString() },
    { error: "upstream failed" }, { checking: true }]) {
    assert.equal(quotaIsCurrent(observation(patch), NOW), false);
  }
});

test("crossing a daily reset never invents a fresh 20M pool", () => {
  const at = "2026-10-30T23:59:59.000Z";
  const state = observation({ observedAt: at });

  assert.equal(quotaIsCurrent(state, Date.parse(at)), true);
  assert.equal(quotaIsCurrent(state, Date.parse("2026-10-31T00:00:00Z")), false);
  state.quota.resetsAt = null;
  assert.equal(quotaIsCurrent(state, Date.parse(at)), false);
  assert.equal(quotaIsCurrent(state, Date.parse("2026-10-31T00:00:00Z")), false);
  assert.equal(quotaIsCurrent({ ...observation(), subscriptionExpiresAt: AT }, NOW), false);
});

test("additive quota migration preserves legacy counters without certifying them", () => {
  const db = database();

  db.prepare("UPDATE providers SET subscription_tokens_used = 19631919, subscription_tokens_remaining = 368081 WHERE slug = 'savant'").run();
  providerSchema(db);
  const row = db.prepare("SELECT * FROM providers WHERE slug = 'savant'").get();

  assert.equal(row.subscription_tokens_used, 19631919);
  assert.equal(row.subscription_tokens_remaining, 368081);
  assert.equal(row.quota_observed_at, null);
  db.close();
});

test("leases fence concurrent, expired and superseded writers", () => {
  const db = database();
  const input = { slug: "savant", id: "first", at: AT };

  assert.equal(claimRuntimeLease(db, input), true);
  assert.equal(db.prepare("SELECT quota_observed_at FROM providers WHERE slug = 'savant'").get().quota_observed_at, null);
  assert.equal(claimRuntimeLease(db, { ...input, id: "second" }), false);
  const later = new Date(NOW + 26_000).toISOString();

  assert.equal(claimRuntimeLease(db, { ...input, id: "second", at: later }), true);
  const complete = { slug: "savant", id: "first", startedAt: AT, checkedAt: later,
    balance: null, subscription: parseProviderSubscription(PAYLOAD), quotaError: null, error: null };

  assert.equal(completeRuntimeCheck(db, complete), false);
  assert.equal(completeRuntimeCheck(db, { ...complete, id: "second", startedAt: later }), true);
  assert.equal(db.prepare("SELECT quota_observed_at FROM providers WHERE slug = 'savant'").get().quota_observed_at, later);
  assert.equal(completeRuntimeCheck(db, complete), false);
  db.close();
});

test("failed quota check clears success without advancing catalog clock", () => {
  const db = database();

  db.prepare("UPDATE providers SET synced_at = '2026-10-29', subscription_tokens_remaining = 368081 WHERE slug = 'savant'").run();
  claimRuntimeLease(db, { slug: "savant", id: "failure", at: AT });
  assert.equal(completeRuntimeCheck(db, { slug: "savant", id: "failure",
    startedAt: AT, checkedAt: AT, balance: null, subscription: null,
    quotaError: "unavailable", error: "unavailable" }), true);
  const row = db.prepare("SELECT * FROM providers WHERE slug = 'savant'").get();

  assert.equal(row.quota_observed_at, null);
  assert.equal(row.subscription_tokens_remaining, null);
  assert.equal(row.balance_usd, null);
  assert.equal(row.synced_at, "2026-10-29");
  db.close();
});

test("accounting conserves overlapping completions and live holds by provider", () => {
  const db = database();

  db.prepare("INSERT INTO usage_events VALUES (?, ?, ?)").run("savant", AT, 400);
  db.prepare("INSERT INTO usage_events VALUES (?, ?, ?)").run("other", AT, 9000);
  db.prepare("INSERT INTO usage_events VALUES (?, ?, ?)").run("savant", "2026-10-29", 9000);
  db.prepare("INSERT INTO free_pool_reservations VALUES (?, ?, ?)")
    .run("savant", "2026-10-30T13:00:00Z", 300);
  db.prepare("INSERT INTO free_pool_reservations VALUES (?, ?, ?)").run("savant", AT, 9000);
  assert.equal(effectiveProviderRemaining(db, { slug: "savant", remaining: 1000,
    observedAt: AT, at: AT }), 300);
  assert.equal(effectiveProviderRemaining(db, { slug: "savant", remaining: null,
    observedAt: AT, at: AT }), null);
  db.close();
});
