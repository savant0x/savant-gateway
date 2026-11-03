#!/usr/bin/env node
/**
 * Sandbox pricing and analytics chart receipt (FID-2026-1103-154).
 *
 * Runs only against a disposable PostgreSQL endpoint. It seeds a labelled
 * sandbox catalog, records two price approvals through the production
 * `setModelPricing` path, settles two synthetic credit calls through
 * `settleCall`, then renders the same chart series the admin pages use.
 *
 * Every generated observation is synthetic. The caller owns the disposable
 * database and must drop it after this command writes its receipt.
 *
 *   TEST_DATABASE_URL=postgres://... SANDBOX_ALLOW_REMOTE=yes \
 *     node scripts/sandbox-chart-receipt.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { getAnalyticsData } from "../lib/storage/store/analytics.ts";
import {
  getModelForGateway,
  listAllModels,
  setModelPricing,
} from "../lib/storage/store/models.ts";
import { listPricingDecisions } from "../lib/storage/store/pricing-decisions.ts";
import { openCallSettlement } from "../lib/storage/store/settlements.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";
import { settleCall } from "../lib/storage/gateway/settle.ts";
import {
  marginBuckets,
  priceHistorySeries,
  routeMix,
} from "../lib/pricing-chart-data.ts";
import { resolveUsage } from "../lib/usage.ts";

const USER = "sandbox-chart-user";
const KEY = "sandbox-chart-key";
const PAID = "sandbox-chart-paid";
const UNUSED = "sandbox-chart-unused";
const FREE = "sandbox-chart-free";
const OUT = resolve(
  process.argv.includes("--out-dir")
    ? process.argv[process.argv.indexOf("--out-dir") + 1]
    : "dev/receipts/2026-11-03-sandbox",
);

function fail(message) {
  console.error(`sandbox-chart-receipt: FAIL — ${message}`);
  process.exit(1);
}

function databaseName(connectionString) {
  try {
    const url = new URL(connectionString);

    return {
      host: url.hostname,
      name: url.pathname.replace(/^\//, "") || "postgres",
    };
  } catch {
    return { host: "invalid-connection-string", name: "unknown" };
  }
}

function usd(micros) {
  const value = micros / 1_000_000;

  if (value === 0) return "$0";
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`;

  return `$${value.toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bar(label, value, max, detail) {
  const width = max <= 0 ? 0 : Math.max(2, Math.round((value / max) * 100));

  return `<div class="bar"><div class="bar-head"><span>${escapeHtml(label)}</span><span>${escapeHtml(detail)}</span></div><div class="track"><div class="fill" style="width:${width}%"></div></div></div>`;
}

function html(receipt) {
  const maxMargin = Math.max(1, ...receipt.charts.marginBuckets.map((b) => b.count));
  const maxHistory = Math.max(
    1,
    ...receipt.charts.priceHistory.map((p) => p.averageInputMicros),
  );
  const maxRoute = Math.max(1, ...receipt.charts.routeMix.map((r) => r.models));
  const maxMoney = Math.max(
    1,
    ...receipt.charts.analytics.series.map((p) =>
      Math.max(p.chargedMicros, p.costMicros, p.planRevenueMicros),
    ),
  );

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sandbox chart receipt</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;margin:2rem;max-width:72rem;color:#111}
h1{font-size:1.5rem}h2{font-size:1.05rem;margin-top:2rem}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
.card{border:1px solid #ddd;border-radius:.6rem;padding:1rem}
.bar{margin:.5rem 0}.bar-head{display:flex;justify-content:space-between;font-size:.8rem}
.track{height:.5rem;background:#eee;border-radius:1rem;overflow:hidden}
.fill{height:100%;background:#0891b2}.fill.cost{background:#64748b}
table{border-collapse:collapse;width:100%;font-size:.8rem}td,th{border-top:1px solid #ddd;padding:.3rem;text-align:left}
.mono{font-family:ui-monospace,monospace}.muted{color:#666}
</style></head><body>
<h1>Sandbox pricing and analytics chart receipt</h1>
<p class="muted">Synthetic observations only. No real payment, funding, or customer traffic. Generated ${escapeHtml(receipt.generatedAt)} from a disposable database.</p>
<div class="grid">
<div class="card"><h2>Margin distribution</h2><p class="muted">Paid catalog rows by blended margin, 1M in + 1M out.</p>
${receipt.charts.marginBuckets.map((b) => bar(b.label, b.count, maxMargin, `${b.count} rows`)).join("")}</div>
<div class="card"><h2>Approved price history</h2><p class="muted">Average approved input price per UTC day; one point per day with an approval.</p>
${receipt.charts.priceHistory.map((p) => bar(p.date, p.averageInputMicros, maxHistory, `${usd(p.averageInputMicros)} · ${p.changes} changes`)).join("") || "<p>No approvals.</p>"}</div>
<div class="card"><h2>Serving route mix</h2><p class="muted">Catalog rows per provider; served counts rows whose own provider is published.</p>
${receipt.charts.routeMix.map((r) => bar(r.provider, r.models, maxRoute, `${r.served}/${r.models} serving`)).join("")}</div>
<div class="card"><h2>Daily money, 30 days</h2><p class="muted">Credit revenue (cyan), plan revenue (green), upstream cost (slate). Zero days are explicit, not missing.</p>
${receipt.charts.analytics.series.slice(-7).map((p) => `${bar(p.date, p.chargedMicros, maxMoney, `${usd(p.chargedMicros)} credit · ${usd(p.costMicros)} cost`)}`).join("")}</div>
</div>
<h2>Reconciliation</h2>
<table><thead><tr><th>Check</th><th>Expected</th><th>Observed</th><th>Result</th></tr></thead><tbody>
${receipt.reconciliation.checks
  .map(
    (check) =>
      `<tr><td>${escapeHtml(check.name)}</td><td class="mono">${escapeHtml(check.expected)}</td><td class="mono">${escapeHtml(check.observed)}</td><td>${check.pass ? "pass" : "FAIL"}</td></tr>`,
  )
  .join("")}
</tbody></table>
<h2>Limitations</h2><ul>${receipt.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
</body></html>`;
}

async function seed(db, now) {
  await db
    .prepare(
      `INSERT INTO users (id, email, name, status, created_at, credit_micros, held_micros)
       VALUES (?, 'sandbox-chart@example.test', 'Sandbox Chart', 'active', ?, 100000000, 0)
       ON CONFLICT DO NOTHING`,
    )
    .run(USER, now);
  await db
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, status, created_at)
       VALUES (?, ?, 'Sandbox chart key', 'sk_sandbox', 'sandbox-hash', 'active', ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(KEY, USER, now);

  const insertModel = db.prepare(
    `INSERT INTO models
      (id, upstream_id, upstream_slug, name, provider, context_window,
       token_weight, input_price_micros, output_price_micros, allow_free,
       supports_tools, supports_vision, status, sort_order, synced_at, family,
       protocol, cost_source, sell_input_micros, sell_output_micros,
       price_source, in_catalog, group_slug, group_source, route_group,
       is_primary)
     VALUES (?, ?, 'savant', ?, 'Sandbox', '128000', ?, ?, ?, ?, 1, 0,
             'active', ?, ?, 'Sandbox', 'chat', 'synced', ?, ?, 'auto', 1,
             ?, 'manual', ?, 1)
     ON CONFLICT DO NOTHING`,
  );

  await insertModel.run(
    PAID, "sandbox-chart-paid-upstream", "Sandbox Paid", 1, 400_000, 800_000, 0,
    0, now, 1_000_000, 2_000_000, "paid", PAID,
  );
  await insertModel.run(
    UNUSED, "sandbox-chart-unused-upstream", "Sandbox Unused", 1, 300_000,
    600_000, 0, 1, now, 750_000, 1_500_000, "paid", UNUSED,
  );
  await insertModel.run(
    FREE, "sandbox-chart-free-upstream", "Sandbox Free", 2, 0, 0, 1, 2, now,
    0, 0, "free", FREE,
  );
}

async function settleSandboxCalls(db) {
  const gatewayModel = await getModelForGateway(db, PAID);

  if (!gatewayModel) fail("seeded model does not project as a gateway model");

  const auth = { userId: USER, keyId: KEY };
  const calls = [
    [12_000, 8_000],
    [30_000, 15_000],
  ];

  for (const [inputTokens, outputTokens] of calls) {
    const settlementId = await openCallSettlement(db, {
      userId: USER,
      keyId: KEY,
      modelId: PAID,
      providerSlug: "savant",
      billingSource: "credit",
      creditHoldId: null,
      freeReservationId: null,
      subscriptionHoldId: null,
      estimatedMicros: 0,
    });

    await settleCall(
      db,
      {
        auth,
        model: gatewayModel,
        hold: null,
        freeReservation: null,
        subscription: null,
        startedAt: Date.now(),
        promptTokens: inputTokens,
        settlementId,
      },
      resolveUsage({
        usage: null,
        fallbackInputTokens: inputTokens,
        fallbackOutputTokens: outputTokens,
      }),
      "ok",
    );
  }
}

async function main() {
  const url = process.env.TEST_DATABASE_URL?.trim();

  if (!url) fail("TEST_DATABASE_URL is required; this receipt refuses production");
  if (url === process.env.DATABASE_URL?.trim()) {
    fail("TEST_DATABASE_URL must not equal DATABASE_URL");
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail("TEST_DATABASE_URL is not a valid URL");
  }

  const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(
    parsed.hostname.toLowerCase(),
  );
  if (!loopback && process.env.SANDBOX_ALLOW_REMOTE !== "yes") {
    fail("refusing a non-loopback endpoint without SANDBOX_ALLOW_REMOTE=yes");
  }

  const db = await createStorageDatabase({ env: { DATABASE_URL: url } });
  const now = new Date().toISOString();

  try {
    await seed(db, now);
    await setModelPricing(db, PAID, 1_200_000, 2_400_000, {
      actor: "sandbox-chart",
      reason: "Sandbox chart decision one",
      modelName: "Sandbox Paid",
      costSource: "synced",
      costInputMicros: 400_000,
      costOutputMicros: 800_000,
      targetMarginBps: 3_000,
      rounding: "micro",
      recommendationJson: JSON.stringify({ eligible: true, sandbox: true }),
    });
    await setModelPricing(db, PAID, 1_300_000, 2_600_000, {
      actor: "sandbox-chart",
      reason: "Sandbox chart decision two",
      modelName: "Sandbox Paid",
      costSource: "synced",
      costInputMicros: 400_000,
      costOutputMicros: 800_000,
      targetMarginBps: 3_000,
      rounding: "micro",
      recommendationJson: JSON.stringify({ eligible: true, sandbox: true }),
    });
    await settleSandboxCalls(db);

    const [models, decisions, analytics] = await Promise.all([
      listAllModels(db),
      listPricingDecisions(db, 100),
      getAnalyticsData(db, 30),
    ]);
    const usage = await db
      .prepare(
        `SELECT COUNT(*)::int AS rows, COALESCE(SUM(charged_micros), 0) AS charged,
                COALESCE(SUM(cost_micros), 0) AS cost
           FROM usage_events`,
      )
      .get();
    const margin = marginBuckets(models);
    const history = priceHistorySeries(decisions);
    const mix = routeMix(models);
    const usageCharged = Number(usage.charged);
    const usageCost = Number(usage.cost);
    const seriesCharged = analytics.series.reduce(
      (total, point) => total + point.chargedMicros,
      0,
    );
    const seriesCost = analytics.series.reduce(
      (total, point) => total + point.costMicros,
      0,
    );
    const historyChanges = history.reduce(
      (total, point) => total + point.changes,
      0,
    );
    const checks = [
      {
        name: "usage rows exist",
        expected: "> 0",
        observed: Number(usage.rows),
        pass: Number(usage.rows) > 0,
      },
      {
        name: "usage charged equals analytics total",
        expected: usageCharged,
        observed: analytics.totals.chargedMicros,
        pass: usageCharged === analytics.totals.chargedMicros,
      },
      {
        name: "usage cost equals analytics total",
        expected: usageCost,
        observed: analytics.totals.costMicros,
        pass: usageCost === analytics.totals.costMicros,
      },
      {
        name: "daily series charged equals totals",
        expected: analytics.totals.chargedMicros,
        observed: seriesCharged,
        pass: seriesCharged === analytics.totals.chargedMicros,
      },
      {
        name: "daily series cost equals totals",
        expected: analytics.totals.costMicros,
        observed: seriesCost,
        pass: seriesCost === analytics.totals.costMicros,
      },
      {
        name: "price approvals equal price-history changes",
        expected: decisions.length,
        observed: historyChanges,
        pass: decisions.length === historyChanges,
      },
      {
        name: "unused model is absent, not zero-profit",
        expected: true,
        observed: !analytics.models.some((model) => model.modelId === UNUSED),
        pass: !analytics.models.some((model) => model.modelId === UNUSED),
      },
    ];
    const exact = checks.every((check) => check.pass);
    const emptyBuckets = marginBuckets([]);
    const emptyHistory = priceHistorySeries([]);
    const receipt = {
      report: "sandbox-pricing-chart-receipt",
      schema: 1,
      generatedAt: new Date().toISOString(),
      source: "synthetic-sandbox",
      database: databaseName(url),
      dataset: {
        models: models.length,
        paidModels: models.filter((model) => model.access === "paid").length,
        usageEvents: Number(usage.rows),
        pricingDecisions: decisions.length,
      },
      charts: {
        marginBuckets: margin,
        priceHistory: history,
        routeMix: mix,
        analytics: {
          rangeDays: analytics.rangeDays,
          totals: analytics.totals,
          series: analytics.series,
          models: analytics.models,
        },
      },
      emptyBehavior: {
        marginBucketCountsSum: emptyBuckets.reduce(
          (total, bucket) => total + bucket.count,
          0,
        ),
        priceHistoryPoints: emptyHistory.length,
        note: "Empty inputs render an explicit empty state; they are not a zero-profit line.",
      },
      reconciliation: {
        exact,
        checks,
        usageChargedMicros: usageCharged,
        usageCostMicros: usageCost,
        seriesChargedMicros: seriesCharged,
        seriesCostMicros: seriesCost,
      },
      limitations: [
        "All usage and price decisions are synthetic sandbox observations.",
        "No real payment, funding, provider call, or customer traffic occurred.",
        "The receipt is generated from a disposable database that the runner drops.",
        "The static HTML is a receipt view of the same chart series; the production React charts are compiled by the build gate.",
      ],
    };

    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, "charts.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    writeFileSync(join(OUT, "charts.html"), html(receipt));
    console.log(
      `sandbox-chart-receipt: ${exact ? "PASS" : "FAIL"} — ${Number(usage.rows)} usage rows, ${decisions.length} approvals, ${mix.length} routes`,
    );
    console.log(`wrote ${join(OUT, "charts.json")} and charts.html`);
    if (!exact) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(
    `sandbox-chart-receipt: FAIL — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
