import assert from "node:assert/strict";
import test from "node:test";

import { providersDue, syncIntervalMs } from "../lib/provider-sync-policy.ts";
import { PUBLIC_MODEL_SCOPE, PRICE_MAX_AGE_DAYS } from "../lib/storage/store/model-sql.ts";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-10-31T12:00:00.000Z");

function row(overrides = {}) {
  return {
    slug: "savant",
    enabled: true,
    configured: true,
    syncedAt: "2026-10-31T10:00:00.000Z",
    ...overrides,
  };
}

test("the sync interval defaults to six hours and 0 disables it", () => {
  assert.equal(syncIntervalMs(undefined), 6 * HOUR);
  assert.equal(syncIntervalMs("2"), 2 * HOUR);
  assert.equal(syncIntervalMs("0"), 0);
});

test("a malformed interval keeps the default instead of stopping sync", () => {
  for (const value of ["", "abc", "-3", "NaN"]) {
    assert.equal(syncIntervalMs(value), 6 * HOUR, String(value));
  }
});

test("a catalog older than the interval is due", () => {
  assert.deepEqual(
    providersDue([row()], NOW, 1 * HOUR),
    ["savant"],
  );
  assert.deepEqual(
    providersDue([row()], NOW, 6 * HOUR),
    [],
  );
});

test("a provider that never synced is due", () => {
  assert.deepEqual(providersDue([row({ syncedAt: null })], NOW, 6 * HOUR), [
    "savant",
  ]);
  assert.deepEqual(
    providersDue([row({ syncedAt: "not-a-date" })], NOW, 6 * HOUR),
    ["savant"],
  );
});

test("disabled or unconfigured providers are never due", () => {
  assert.deepEqual(
    providersDue(
      [
        row({ slug: "off", enabled: false }),
        row({ slug: "nokey", configured: false }),
      ],
      NOW,
      1 * HOUR,
    ),
    [],
  );
});

test("a disabled interval reports nothing due", () => {
  assert.deepEqual(providersDue([row()], NOW, 0), []);
});

test("the public scope withholds paid rows without a sell price", () => {
  assert.match(PUBLIC_MODEL_SCOPE, /sell_input_micros > 0/);
  assert.match(PUBLIC_MODEL_SCOPE, /billing_mode, 'paid'\) <> 'paid'/);
});

test("the public scope withholds stale manual costs with a 30-day default", () => {
  assert.equal(PRICE_MAX_AGE_DAYS, 30);
  assert.match(PUBLIC_MODEL_SCOPE, /cost_source <> 'manual'/);
  assert.match(
    PUBLIC_MODEL_SCOPE,
    /m\.cost_observed_at::timestamptz >= now\(\) - interval '30 days'/,
  );
});
