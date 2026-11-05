import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCapitalWindow,
  providerBalanceState,
  providerCapitalSummary,
  toProviderCapitalRow,
  economicAlertCandidates,
} from "../lib/provider-capital.ts";
import { readEconomicAlertThresholds } from "../lib/operations-economics.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  getEconomicAlertInput,
  getProviderCapital,
} from "../lib/storage/store/provider-capital.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const NOW = "2026-11-03T12:00:00.000Z";
const STAMP = "2026-10-01T00:00:00.000Z";

function capitalInput(overrides = {}) {
  return {
    slug: "alpha",
    label: "Alpha",
    enabled: true,
    configured: true,
    supportsBalance: true,
    balanceUsd: 20,
    balanceObservedAt: "2026-11-03T11:00:00.000Z",
    spendMicros: 9_000_000,
    coveredDays: 30,
    dependentModels: 2,
    windowDays: 30,
    ...overrides,
  };
}

test("a fresh balance over covered spend produces an explicit runway estimate", () => {
  const row = toProviderCapitalRow(capitalInput(), NOW);

  assert.equal(row.balanceState, "current");
  assert.equal(row.dailySpendMicros, 300_000);
  assert.equal(row.coverageBps, 10_000);
  assert.equal(row.runwayDays, 66.7);
  assert.equal(row.runwayReason, null);
});

test("stale, absent and incapable balances never produce a runway", () => {
  const stale = toProviderCapitalRow(
    capitalInput({ balanceObservedAt: "2026-11-03T04:00:00.000Z" }),
    NOW,
  );

  assert.equal(stale.balanceState, "stale");
  assert.equal(stale.runwayDays, null);
  assert.match(stale.runwayReason, /older than six hours/);

  const absent = toProviderCapitalRow(
    capitalInput({ balanceUsd: null, balanceObservedAt: null }),
    NOW,
  );

  assert.equal(absent.balanceState, "unavailable");
  assert.equal(absent.runwayDays, null);

  const incapable = toProviderCapitalRow(
    capitalInput({ supportsBalance: false }),
    NOW,
  );

  assert.equal(incapable.balanceState, "unavailable");
  assert.match(incapable.runwayReason, /not registered for balance/);

  assert.equal(
    providerBalanceState({ supportsBalance: true, balanceUsd: 1, balanceObservedAt: null }, Date.parse(NOW)),
    "unavailable",
  );
});

test("runway refuses thin history, zero spend and a negative balance", () => {
  const thin = toProviderCapitalRow(capitalInput({ coveredDays: 3 }), NOW);

  assert.equal(thin.runwayDays, null);
  assert.match(thin.runwayReason, /covers 3 of 30 days/);
  assert.equal(thin.coverageBps, 1_000);

  const idle = toProviderCapitalRow(capitalInput({ spendMicros: 0 }), NOW);

  assert.equal(idle.runwayDays, null);
  assert.match(idle.runwayReason, /No recorded upstream cost/);

  const negative = toProviderCapitalRow(capitalInput({ balanceUsd: -1 }), NOW);

  assert.equal(negative.runwayDays, null);
  assert.match(negative.runwayReason, /negative balance/);

  assert.equal(normalizeCapitalWindow("12"), 12);
  assert.equal(normalizeCapitalWindow("0"), 30);
  assert.equal(normalizeCapitalWindow("999"), 30);
});

test("summary counts only current balances in the known total", () => {
  const summary = providerCapitalSummary([
    toProviderCapitalRow(capitalInput(), NOW),
    toProviderCapitalRow(
      capitalInput({
        slug: "beta",
        label: "Beta",
        balanceUsd: 10,
        balanceObservedAt: "2026-11-01T12:00:00.000Z",
      }),
      NOW,
    ),
    toProviderCapitalRow(
      capitalInput({
        slug: "gamma",
        label: "Gamma",
        supportsBalance: false,
        balanceUsd: null,
      }),
      NOW,
    ),
  ]);

  assert.equal(summary.providers, 3);
  assert.equal(summary.currentBalances, 1);
  assert.equal(summary.staleBalances, 1);
  assert.equal(summary.unavailableBalances, 1);
  assert.equal(summary.knownBalanceUsd, 20);
  assert.equal(summary.spendMicros, 27_000_000);
});

test("economic thresholds are default-off and fall back from malformed values", () => {
  const off = readEconomicAlertThresholds({});
  const on = readEconomicAlertThresholds({
    OPERATIONS_ECONOMIC_ALERTS: "1",
    OPERATIONS_RUNWAY_MIN_DAYS: "14",
    OPERATIONS_MARGIN_FLOOR_BPS: "1500",
  });
  const malformed = readEconomicAlertThresholds({
    OPERATIONS_ECONOMIC_ALERTS: "1",
    OPERATIONS_RUNWAY_MIN_DAYS: "-2",
    OPERATIONS_MARGIN_FLOOR_BPS: "nonsense",
    OPERATIONS_STALE_COST_HOURS: "99999",
  });

  assert.equal(off.enabled, false);
  assert.equal(on.enabled, true);
  assert.equal(on.runwayMinDays, 14);
  assert.equal(on.marginFloorBps, 1_500);
  assert.equal(malformed.runwayMinDays, off.runwayMinDays);
  assert.equal(malformed.marginFloorBps, off.marginFloorBps);
  assert.equal(malformed.staleCostHours, off.staleCostHours);
  assert.equal(off.customerSpendMicros, 0);
});

test("economic candidates reuse incident fingerprints and safe admin links", () => {
  const thresholds = readEconomicAlertThresholds({
    OPERATIONS_ECONOMIC_ALERTS: "1",
    OPERATIONS_RUNWAY_MIN_DAYS: "7",
    OPERATIONS_MARGIN_FLOOR_BPS: "1000",
    OPERATIONS_STALE_COST_HOURS: "72",
    OPERATIONS_CUSTOMER_SPEND_MICROS: "500000",
  });
  const input = {
    capital: [
      toProviderCapitalRow(
        capitalInput({ balanceUsd: 1, spendMicros: 15_000_000 }),
        NOW,
      ),
    ],
    margins: [
      {
        modelId: "m1",
        modelName: "Model One",
        inputMarginBps: -500,
        outputMarginBps: 100,
        costSource: "manual",
        costObservedAt: "2026-10-28T00:00:00.000Z",
      },
    ],
    customerSpend: [{ userId: "u1", spendMicros: 1_000_000 }],
  };
  const candidates = economicAlertCandidates(input, thresholds, NOW);
  const byFingerprint = new Map(
    candidates.map((candidate) => [candidate.fingerprint, candidate]),
  );

  assert.deepEqual(
    [...byFingerprint.keys()].sort(),
    [
      "economics:cost:m1",
      "economics:customer:u1",
      "economics:margin:m1",
      "economics:runway:alpha",
    ],
  );
  assert.equal(byFingerprint.get("economics:runway:alpha").severity, "critical");
  assert.equal(byFingerprint.get("economics:margin:m1").severity, "critical");
  assert.equal(byFingerprint.get("economics:customer:u1").severity, "critical");
  assert.match(
    byFingerprint.get("economics:runway:alpha").detail,
    /\/admin\/providers/,
  );
  assert.match(byFingerprint.get("economics:margin:m1").detail, /\/admin\/pricing/);
  assert.match(byFingerprint.get("economics:cost:m1").detail, /\/admin\/pricing/);
  assert.match(
    byFingerprint.get("economics:customer:u1").detail,
    /\/admin\/customers/,
  );
  assert.equal(
    economicAlertCandidates(input, { ...thresholds, enabled: false }, NOW)
      .length,
    0,
  );
});

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at)
       VALUES ('u1', 'u1@example.test', 'One', 'active', ?)`,
    )
    .run(STAMP);

  await db
    .prepare(
      `INSERT INTO providers
        (slug, label, kind, base_url, key_env_var, default_headers,
         supports_balance, enabled, sort_order, status, balance_usd,
         balance_observed_at, created_at, updated_at)
       VALUES
        ('alpha', 'Alpha', 'openai', 'https://alpha.test', 'ALPHA_KEY', '{}',
         1, 1, 0, 'active', 20, ?, ?, ?),
        ('beta', 'Beta', 'openai', 'https://beta.test', 'BETA_KEY', '{}',
         1, 1, 1, 'active', 10, ?, ?, ?),
        ('gamma', 'Gamma', 'openai', 'https://gamma.test', 'GAMMA_KEY', '{}',
         0, 1, 2, 'active', NULL, NULL, ?, ?)`,
    )
    .run(
      "2026-11-03T11:00:00.000Z",
      STAMP,
      STAMP,
      "2026-11-01T12:00:00.000Z",
      STAMP,
      STAMP,
      STAMP,
      STAMP,
    );

  for (const [id, slug, catalog, costInput, costOutput] of [
    ["m1", "alpha", 1, 500_000, 500_000],
    ["m2", "alpha", 1, 400_000, 400_000],
    ["m3", "beta", 1, 300_000, 300_000],
    ["m4", "alpha", 0, 200_000, 200_000],
  ]) {
    await db
      .prepare(
        `INSERT INTO models
          (id, upstream_id, upstream_slug, name, provider, context_window,
           token_weight, input_price_micros, output_price_micros,
           sell_input_micros, sell_output_micros, price_source, in_catalog,
           allow_free, group_slug, cost_source, route_group, is_primary, status,
           sort_order, synced_at)
         VALUES (?, ?, ?, ?, 'Family', '8k', 1, ?, ?, ?, ?, 'auto', ?, 0,
                 'paid', 'synced', ?, 1, 'active', 0, ?)`,
      )
      .run(
        id,
        id,
        slug,
        id.toUpperCase(),
        costInput,
        costOutput,
        costInput,
        costOutput,
        catalog,
        id,
        STAMP,
      );
  }

  const usage = [
    ["h1", "alpha", 1_000_000, "2026-11-02T10:00:00.000Z"],
    ["h2", "alpha", 2_000_000, "2026-11-03T10:00:00.000Z"],
    ["h3", "beta", 1_000_000, "2026-11-03T09:00:00.000Z"],
    ["h4", "deleted", 500_000, "2026-11-01T09:00:00.000Z"],
  ];

  for (const [id, provider, cost, at] of usage) {
    await db
      .prepare(
        `INSERT INTO usage_events
          (id, user_id, model_id, provider_slug, input_tokens, output_tokens,
           charged_micros, cost_micros, billing_source, status, latency_ms,
           created_at)
         VALUES (?, 'u1', 'm1', ?, 10, 10, ?, ?, 'credit', 'ok', 10, ?)`,
      )
      .run(id, provider, cost * 3, cost, at);
  }

  return db;
}

test("capital spend follows the serving provider, including a deleted one", async () => {
  const db = await fixture();

  try {
    const data = await getProviderCapital(db, NOW, 30);
    const bySlug = new Map(data.rows.map((row) => [row.slug, row]));

    assert.equal(bySlug.get("alpha").spendMicros, 3_000_000);
    assert.equal(bySlug.get("alpha").coveredDays, 2);
    assert.equal(bySlug.get("alpha").dependentModels, 2);
    assert.equal(bySlug.get("alpha").balanceState, "current");
    assert.equal(bySlug.get("alpha").runwayDays, null, "two covered days is thin history");
    assert.equal(bySlug.get("beta").balanceState, "stale");
    assert.equal(bySlug.get("gamma").balanceState, "unavailable");
    assert.equal(bySlug.get("deleted").enabled, false);
    assert.equal(bySlug.get("deleted").spendMicros, 500_000);
    assert.equal(data.summary.spendMicros, 4_500_000);
    assert.equal(data.summary.knownBalanceUsd, 20);
    assert.equal(data.summary.currentBalances, 1);
    assert.equal(data.summary.staleBalances, 1);
    assert.ok(
      data.summary.unavailableBalances >= 2,
      "the seeded unconfigured providers also have no balance capability",
    );
  } finally {
    await db.close();
  }
});

test("economic inputs expose margins and de-identified customer spend", async () => {
  const db = await fixture();

  try {
    const input = await getEconomicAlertInput(db, {
      now: NOW,
      windowDays: 30,
      customerSpendMicros: 500_000,
    });

    assert.deepEqual(
      ["alpha", "beta", "gamma", "deleted"].map((slug) =>
        input.capital.find((row) => row.slug === slug)?.slug,
      ),
      ["alpha", "beta", "gamma", "deleted"],
    );
    assert.deepEqual(
      ["m1", "m2", "m3"].map((id) =>
        input.margins.find((row) => row.modelId === id)?.modelId,
      ),
      ["m1", "m2", "m3"],
      "archived rows are not current prices",
    );
    assert.equal(
      input.margins.some((row) => row.modelId === "m4"),
      false,
    );
    assert.deepEqual(input.customerSpend, [
      { userId: "u1", spendMicros: 9_000_000 },
    ]);

    const alpha = input.capital.find((row) => row.slug === "alpha");

    assert.equal(alpha.label, "Alpha");
    assert.equal(alpha.windowDays, 30);

    const disabled = await getEconomicAlertInput(db, {
      now: NOW,
      windowDays: 30,
      customerSpendMicros: 0,
    });

    assert.deepEqual(disabled.customerSpend, []);
  } finally {
    await db.close();
  }
});
