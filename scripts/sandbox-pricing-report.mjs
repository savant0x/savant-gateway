#!/usr/bin/env node
/**
 * Sandbox pricing economics report (FID-2026-1103-153).
 *
 * Reads the catalog and exports the shared economics projection plus the guarded
 * recommendation for every row. It is deliberately read-only: no sync, no price
 * update, no decision row. Approval remains `PATCH /api/admin/pricing`.
 *
 *   npm run report:pricing
 *   npm run report:pricing -- --json --out dev/receipts/pricing.json
 *   npm run report:pricing -- --target-margin=30 --rounding=cent
 *
 * The connection string is read from DATABASE_URL (or DB_CONNECTION_STRING as
 * the local fallback) and is never printed or written. Only the database host
 * and name appear in the report header.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import { scenarioLabel } from "../lib/catalog-economics.ts";
import { buildPricingReport, reviewQueue } from "../lib/pricing-report.ts";
import { microsToPrice } from "../lib/pricing.ts";
import { createPostgresDatabase } from "../lib/storage/pg-adapter.ts";
import { createPostgresPool } from "../lib/storage/pg-pool.ts";
import { bindStoreRuntime } from "../lib/store-facade/runtime.ts";
import {
  getMarkupBps,
  listAllModels,
  listProviders,
} from "../lib/store-facade/catalog.ts";

const USAGE = `usage: npm run report:pricing [-- options]

  --json                    print JSON instead of the Markdown table
  --out <path>              write the report to a file
  --target-margin <percent> recommendation target margin, 0-99 (default 30)
  --rounding <micro|cent>   price rounding policy (default micro)
  --scenario <in,out>       token workload per row (default 1000000,1000000)
  --stale-days <days>       manual-cost freshness window (default 30)
  --review-threshold <pct>  review a move above this percent (default 25)
  --include-hidden          include rows outside the published catalog
  --help                    show this text

The report never changes a price. It reads the catalog only.`;

function loadLocalEnv() {
  if (process.env.DATABASE_URL?.trim()) return;

  const file = resolve(process.cwd(), ".env.local");

  if (!existsSync(file)) return;

  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());

    if (!match || process.env[match[1]] !== undefined) continue;

    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[match[1]] = value;
  }
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);

  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function has(name) {
  return process.argv.includes(name);
}

function readNumber(name, fallback) {
  const index = process.argv.findIndex((value) => value.startsWith(`${name}=`));
  const raw =
    index === -1
      ? argument(name, undefined)
      : process.argv[index].slice(name.length + 1);
  const parsed = Number(raw);

  return raw !== undefined && Number.isFinite(parsed) ? parsed : fallback;
}

function readScenario() {
  const index = process.argv.findIndex((value) =>
    value.startsWith("--scenario="),
  );
  const raw =
    index === -1
      ? argument("--scenario", undefined)
      : process.argv[index].slice(11);

  if (!raw) return undefined;

  const [input, output] = raw.split(",").map(Number);

  return Number.isFinite(input) && Number.isFinite(output)
    ? { inputTokens: input, outputTokens: output }
    : undefined;
}

function redactedDatabase(url) {
  try {
    const parsed = new URL(url);

    return {
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\//, "") || "postgres",
      tls: parsed.searchParams.get("sslmode") ?? "driver-default",
    };
  } catch {
    return { host: "invalid-connection-string", database: "unknown", tls: "unknown" };
  }
}

function usd(micros) {
  if (micros === null || micros === undefined) return "—";

  const value = microsToPrice(micros);

  if (value === 0) return "$0";
  if (Math.abs(value) < 0.01) return `$${value.toFixed(6)}`;
  if (Math.abs(value) < 1) return `$${value.toFixed(4)}`;
  if (Math.abs(value) < 100) return `$${value.toFixed(2)}`;

  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function pct(bps) {
  return bps === null || bps === undefined ? "—" : `${(bps / 100).toFixed(1)}%`;
}

function signedUsd(micros) {
  if (!micros) return "$0";

  return `${micros > 0 ? "+" : "-"}${usd(Math.abs(micros))}`;
}

function changeMove(change) {
  if (change.direction === "new") return "new price";

  return `${change.direction}${change.maxAbsBps === null ? "" : ` ${pct(change.maxAbsBps)}`}`;
}

function table(report, catalog) {
  const lines = [
    "# Sandbox pricing economics report",
    "",
    `Generated: ${report.summary.generatedAt}`,
    `Catalog: ${catalog.database.host}/${catalog.database.database} (read-only snapshot)`,
    `Scenario: ${scenarioLabel(report.summary.scenario)} per row, not realized traffic`,
    `Target margin: ${pct(report.summary.targetMarginBps)} · rounding: ${report.summary.rounding}`,
    `Default markup: ${pct(catalog.markupBps)} · review threshold: ${pct(report.summary.reviewThresholdBps)}`,
    `Report-only: no price was changed. Approval remains an explicit operator action.`,
    "",
    "## Summary",
    "",
    "| Class | Rows |",
    "| --- | ---: |",
    ...Object.entries(report.summary.counts).map(
      ([name, count]) => `| ${name} | ${count} |`,
    ),
    "",
    `Modeled paid scenario profit: ${usd(report.summary.currentScenarioProfitMicros)} now → ` +
      `${usd(report.summary.recommendedScenarioProfitMicros)} at the recommendation ` +
      `(${usd(report.summary.modeledProfitDeltaMicros)} delta).`,
    "",
    "## Highest-impact modeled price changes",
    "",
    `Ranked by absolute modeled profit movement at ${scenarioLabel(report.summary.scenario)} per row. ` +
      "Includes safe and review-required rows; unchanged recommendations are excluded.",
    "",
    "| Model | Class | Route | Current sell / 1M | Recommended / 1M | Move | Scenario profit now → after | Δ modeled |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: |",
  ];

  if (report.priceChanges.length === 0) {
    lines.push(
      "| — | — | — | — | — | — | — | No eligible price change in the modeled scenario. |",
    );
  } else {
    for (const change of report.priceChanges) {
      lines.push(
        `| ${change.name} | ${change.classification} | ` +
          `${change.upstreamProvider}${change.routeTakeover ? ` → ${change.servingProvider}` : ""} | ` +
          `${usd(change.currentInputMicros)} / ${usd(change.currentOutputMicros)} | ` +
          `${usd(change.recommendedInputMicros)} / ${usd(change.recommendedOutputMicros)} | ` +
          `${changeMove(change)} | ` +
          `${usd(change.currentScenarioProfitMicros)} → ${usd(change.recommendedScenarioProfitMicros)} | ` +
          `${signedUsd(change.profitDeltaMicros)} |`,
      );
    }
  }

  lines.push(
    "",
    "## Catalog sources",
    "",
    "| Provider | Key variable | Models | Synced | Enabled |",
    "| --- | --- | ---: | --- | --- |",
    ...Object.entries(catalog.providers).map(
      ([slug, provider]) =>
        `| ${slug} | ${provider.keyEnvVar} | ${provider.modelCount} | ` +
        `${provider.syncedAt ?? "never"} | ${provider.enabled ? "yes" : "no"} |`,
    ),
    "",
    "Provider key presence is not inferred here; the deployed Admin Diagnostics page is that evidence.",
    "",
    "## Review queue (highest impact first)",
    "",
    "| Model | Route | Change | Current sell / 1M | Recommended / 1M | Explanation |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  const queue = reviewQueue(report, 10);

  if (queue.length === 0) {
    lines.push("| — | — | — | — | — | No review-required row. |");
  } else {
    for (const row of queue) {
      lines.push(
        `| ${row.name} | ${row.upstreamProvider}${row.routeTakeover ? ` → ${row.servingProvider}` : ""} | ` +
          `${row.change.direction}${row.change.maxAbsBps === null ? "" : ` ${pct(row.change.maxAbsBps)}`} | ` +
          `${usd(row.current.inputMicros)} / ${usd(row.current.outputMicros)} | ` +
          `${usd(row.recommended?.inputMicros)} / ${usd(row.recommended?.outputMicros)} | ` +
          `${row.explanation} |`,
      );
    }
  }

  lines.push(
    "",
    "## All catalog rows",
    "",
    "| Class | Model | Access | Cost source | Route | Cost in/out | Sell in/out | Margin in/out | Scenario profit |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | ---: |",
  );

  for (const row of report.rows) {
    lines.push(
      `| ${row.classification} | ${row.name} | ${row.access} | ${row.costSource} | ` +
        `${row.servingProvider ?? row.upstreamProvider}${row.routeTakeover ? " (takeover)" : ""} | ` +
        `${usd(row.costInputMicros)} / ${usd(row.costOutputMicros)} | ` +
        `${usd(row.current.inputMicros)} / ${usd(row.current.outputMicros)} | ` +
        `${pct(row.current.inputMarginBps)} / ${pct(row.current.outputMarginBps)} | ` +
        `${usd(row.current.scenarioProfitMicros)} |`,
    );
  }

  lines.push(
    "",
    "## Method",
    "",
    "- Cost is the serving route's upstream cost from the catalog snapshot.",
    "- Sell is the price the gateway currently charges; free and subscription rows have no per-token sell price.",
    "- Margin = (sell − cost) ÷ sell per direction. Scenario profit is modeled, never realized revenue.",
    "- Unknown or stale cost blocks a recommendation. A manual price, a negative margin, a new price, a move above the threshold, or any recommendation warning requires review.",
    "- No row was approved, published, or written by this report.",
    "",
  );

  return lines.join("\n");
}

async function main() {
  if (has("--help")) {
    console.log(USAGE);
    return;
  }

  loadLocalEnv();

  const connectionString =
    process.env.DATABASE_URL?.trim() || process.env.DB_CONNECTION_STRING?.trim();

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required (or place it in .env.local). The report reads only.",
    );
  }

  const targetMarginPercent = readNumber("--target-margin", 30);

  if (!(targetMarginPercent >= 0 && targetMarginPercent <= 99)) {
    throw new Error("--target-margin must be between 0 and 99.");
  }

  const roundingIndex = process.argv.findIndex((value) =>
    value.startsWith("--rounding="),
  );
  const roundingRaw =
    roundingIndex === -1
      ? argument("--rounding", "micro")
      : process.argv[roundingIndex].slice(11);
  const rounding = roundingRaw === "cent" ? "cent" : "micro";
  const scenario = readScenario();
  const staleDays = readNumber("--stale-days", 30);
  const reviewThresholdPercent = readNumber("--review-threshold", 25);
  const pool = createPostgresPool({ connectionString });
  const database = createPostgresDatabase({ pool });

  try {
    bindStoreRuntime(async () => database);

    const [models, markupBps, providers] = await Promise.all([
      listAllModels(),
      getMarkupBps(),
      listProviders(),
    ]);
    const report = buildPricingReport(models, {
      targetMarginBps: Math.round(targetMarginPercent * 100),
      rounding,
      scenario,
      staleAfterDays: staleDays,
      reviewThresholdBps: Math.round(reviewThresholdPercent * 100),
      includeOutOfCatalog: has("--include-hidden"),
    });
    const catalog = {
      source: "postgres-catalog-snapshot",
      readOnly: true,
      database: redactedDatabase(connectionString),
      markupBps,
      providers: Object.fromEntries(
        providers.map((provider) => [
          provider.slug,
          {
            enabled: provider.enabled,
            keyEnvVar: provider.keyEnvVar,
            modelCount: provider.modelCount,
            syncedAt: provider.syncedAt,
          },
        ]),
      ),
    };
    const payload = { ...report, catalog };
    const output = has("--json")
      ? `${JSON.stringify(payload, null, 2)}\n`
      : table(report, catalog);
    const out = argument("--out", undefined);

    if (out) {
      const path = resolve(process.cwd(), out);

      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, output, "utf8");
      console.log(`Wrote ${out} (${report.rows.length} rows, report-only).`);
    } else {
      process.stdout.write(output);
    }
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(
    `sandbox-pricing-report: FAIL — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
