/**
 * Regenerates the numbers in docs/business-model.md from the live SQLite
 * database and the dated provider price snapshot in docs/data/provider-prices.json.
 *
 * Usage: npm run business-model
 *
 * Only the block between the generated markers is rewritten, so the prose stays
 * hand-written and reviewable.
 */
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import {
  catalogEconomics,
  freePoolEconomics,
  providerPivot,
} from "../lib/business-model.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB_PATH =
  process.env.DB_PATH?.trim() || path.join(ROOT, "data/gateway.db");
const DOC_PATH = path.join(ROOT, "docs/business-model.md");
const SNAPSHOT_PATH = path.join(ROOT, "docs/data/provider-prices.json");

const START = "<!-- generated:start -->";
const END = "<!-- generated:end -->";

const db = new Database(DB_PATH, { readonly: true });
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));

function settingsMap() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  return new Map(rows.map((row) => [row.key, row.value]));
}

function settingNumber(map, key, fallback) {
  const raw = map.get(key);
  const parsed = Number(raw);

  return raw !== undefined && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : fallback;
}

function usd(micros) {
  if (micros === null || micros === undefined) return "—";

  const value = micros / 1_000_000;

  if (value === 0) return "$0";
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`;
  if (Math.abs(value) < 1) return `$${value.toFixed(3)}`;
  if (Math.abs(value) < 100) return `$${value.toFixed(2)}`;

  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function pct(bps) {
  if (bps === null || bps === undefined) return "—";

  return `${(bps / 100).toFixed(1)}%`;
}

function tokens(value) {
  return value.toLocaleString("en-US");
}

function microFromUsd(value) {
  return Math.round(Number(value) * 1_000_000);
}

const settings = settingsMap();
const markupBps = settingNumber(settings, "pricing.markup_bps", 3000);
const dailyTokens = settingNumber(
  settings,
  "free_pool.daily_tokens",
  Number(process.env.FREE_POOL_DAILY_WEIGHTED_TOKENS) || 20_000_000,
);
const allocationBps = settingNumber(settings, "free_pool.allocation_bps", 9000);

const modelRows = db
  .prepare(
    `SELECT id, upstream_id, upstream_slug, group_slug, input_price_micros,
            output_price_micros, sell_input_micros, sell_output_micros,
            token_weight
       FROM models
      WHERE in_catalog = 1
      ORDER BY upstream_slug, group_slug, id`,
  )
  .all();

const providers = db
  .prepare(
    `SELECT slug, label, kind, base_url, key_env_var, enabled, status,
            supports_balance, supports_subscription, supports_pricing,
            balance_usd, synced_at
       FROM providers
      ORDER BY sort_order`,
  )
  .all();

const usage = db
  .prepare(
    `SELECT COALESCE(provider_slug, '—') AS provider,
            COUNT(*) AS requests,
            COALESCE(SUM(cost_micros), 0) AS cost,
            COALESCE(SUM(charged_micros), 0) AS revenue
       FROM usage_events
      GROUP BY provider
      ORDER BY requests DESC`,
  )
  .all();

const groups = new Map();

for (const row of modelRows) {
  if (!groups.has(row.upstream_slug)) groups.set(row.upstream_slug, []);
  groups.get(row.upstream_slug).push({
    id: row.id,
    group:
      row.group_slug === "free"
        ? "free"
        : row.group_slug === "subscription"
          ? "subscription"
          : "paid",
    costInputMicros: row.input_price_micros,
    costOutputMicros: row.output_price_micros,
    sellInputMicros: row.sell_input_micros,
    sellOutputMicros: row.sell_output_micros,
    tokenWeight: row.token_weight,
  });
}

const lines = [];
const push = (line = "") => lines.push(line);

push(
  `_Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC ` +
    `from \`${path.relative(ROOT, DB_PATH).replace(/\\/g, "/")}\`._`,
);
push();

push("### Upstream providers");
push();
push(
  "| Provider | Slug | Wire format | Base URL | Key variable | Balance API | Subscription API | Catalog sync |",
);
push("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const provider of providers) {
  push(
    `| ${provider.label} | \`${provider.slug}\` | ${provider.kind} | \`${provider.base_url}\` | \`${provider.key_env_var}\` | ${
      provider.supports_balance ? "yes" : "no"
    } | ${provider.supports_subscription ? "yes" : "no"} | ${
      provider.synced_at ? provider.synced_at.slice(0, 10) : "never"
    } |`,
  );
}
push();

for (const [slug, rows] of groups) {
  const provider = providers.find((entry) => entry.slug === slug);
  const economics = catalogEconomics(rows, markupBps);

  push(`### Catalog economics — ${provider?.label ?? slug}`);
  push();
  push(
    `**${economics.rows}** models: ${economics.freePool} free-pool, ${economics.priced} priced, ` +
      `${economics.subscriptionOnly} subscription-only. Configured markup: **${pct(markupBps)}** ` +
      `on synced cost.`,
  );
  push();
  push(
    "| Group | Rows | Priced | Mean cost / 1M in | Mean sell / 1M in | Gross margin |",
  );
  push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const group of economics.groups) {
    push(
      `| ${group.group} | ${group.rows} | ${group.priced} | ${usd(group.meanInputCostMicros)} | ` +
        `${usd(group.meanInputSellMicros)} | ${pct(group.grossMarginBps)} |`,
    );
  }
  push();
  push(
    `Paid input cost ranges from **${usd(economics.cheapestPaidInputMicros)}** to ` +
      `**${usd(economics.priciestPaidInputMicros)}** per 1M, median ` +
      `**${usd(economics.medianPaidInputMicros)}**. Blended gross margin on paid rows: ` +
      `**${pct(economics.grossMarginBpsOnPaid)}** (equal weight per model, not per token).`,
  );
  push();

  const pool = freePoolEconomics({
    dailyWeightedTokens: dailyTokens,
    shareBps: allocationBps,
    per1MMicros: {
      cheapest: economics.cheapestPaidInputMicros,
      median: economics.medianPaidInputMicros,
      priciest: economics.priciestPaidInputMicros,
    },
  });

  push(`### Daily free allowance — ${provider?.label ?? slug}`);
  push();
  push(
    `Pool **${tokens(pool.dailyWeightedTokens)}** weighted tokens/day; ` +
      `**${pct(allocationBps)}** allocatable = **${tokens(pool.allocatableTokens)}**/day, ` +
      `reserve **${tokens(pool.reserveTokens)}**/day, **${tokens(pool.monthlyAllocatableTokens)}**/month.`,
  );
  push();
  push("| If every allocated token had to be bought | Cost / month |");
  push("| --- | ---: |");
  push(
    `| at the cheapest paid row (${usd(economics.cheapestPaidInputMicros)} / 1M) | ${usd(pool.monthlyCostMicros.cheapest)} |`,
  );
  push(
    `| at the median paid row (${usd(economics.medianPaidInputMicros)} / 1M) | ${usd(pool.monthlyCostMicros.median)} |`,
  );
  push(
    `| at the priciest paid row (${usd(economics.priciestPaidInputMicros)} / 1M) | ${usd(pool.monthlyCostMicros.priciest)} |`,
  );
  push();
  push(
    "Free-pool rows are synced with zero cost: the upstream grants them as a plan allowance. " +
      "The table above is the exposure if that allowance is exhausted and the same traffic has " +
      "to be served from a funded wallet.",
  );
  push();

  const marginBps = economics.grossMarginBpsOnPaid;

  if (marginBps && marginBps > 0) {
    const revenueFor = (cost) =>
      cost === null ? "—" : usd(Math.round(cost / (marginBps / 10_000)));

    push(
      `At a **${pct(marginBps)}** gross margin, carrying that exposure needs ` +
        `**${revenueFor(pool.monthlyCostMicros.median)}** of paid revenue a month in the median case, ` +
        `**${revenueFor(pool.monthlyCostMicros.priciest)}** in the worst case, and ` +
        `**${revenueFor(pool.monthlyCostMicros.cheapest)}** at the cheapest row.`,
    );
    push();
  }
}

const alternatives = {};
for (const [id, price] of Object.entries(snapshot.providers.apixo.models)) {
  alternatives[id] = {
    provider: "Apixo",
    inputPer1MMicros: microFromUsd(price.inputPer1M),
    outputPer1MMicros: microFromUsd(price.outputPer1M),
  };
}

const savantRows = (groups.get("savant") ?? []).map((row) => {
  const source = modelRows.find((entry) => entry.id === row.id);

  return {
    id: source.upstream_id,
    costInputMicros: row.costInputMicros,
    costOutputMicros: row.costOutputMicros,
  };
});

const pivots = providerPivot(savantRows, alternatives);

const matchedAlternatives = savantRows.filter(
  (row) => alternatives[row.id],
).length;

push("### Sourcing pivot — Apixo published rate vs our current cost");
push();
push(
  `${matchedAlternatives} of ${savantRows.length} catalog rows match a published Apixo id exactly; ` +
    `a near miss such as \`claude-fable-5\` against \`claude-fable-5.1\` is not compared.`,
);
push();
if (pivots.length === 0) {
  push(
    "No catalog row is listed cheaper by Apixo on input at the captured rates.",
  );
} else {
  push(
    "| Upstream id | Our cost / 1M in | Apixo / 1M in | Input saving | Apixo / 1M out | Output saving |",
  );
  push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const row of pivots) {
    const alternative = alternatives[row.id];
    push(
      `| \`${row.id}\` | ${usd(row.currentInputMicros)} | ${usd(row.alternativeInputMicros)} | ` +
        `${pct(row.inputSavingBps)} | ${usd(alternative.outputPer1MMicros)} | ${pct(row.outputSavingBps)} |`,
    );
  }
  push();
  push(
    `Savings are against our **cost** from Apinex, so moving a row to Apixo widens margin ` +
      `without changing the sell price, or funds a deeper public discount.`,
  );
}
push();

push("### Recorded traffic");
push();
if (usage.length === 0) {
  push("No requests recorded yet.");
} else {
  push("| Provider | Requests | Cost | Charged | Margin |");
  push("| --- | ---: | ---: | ---: | ---: |");
  for (const row of usage) {
    const margin =
      row.revenue > 0
        ? `${(((row.revenue - row.cost) / row.revenue) * 100).toFixed(1)}%`
        : "—";
    push(
      `| \`${row.provider}\` | ${tokens(row.requests)} | ${usd(row.cost)} | ${usd(row.revenue)} | ${margin} |`,
    );
  }
}
push();
push(
  `Free allowance divided evenly: at **1** activated account it is ` +
    `${tokens(Math.floor(freePoolEconomics({ dailyWeightedTokens: dailyTokens, shareBps: allocationBps, per1MMicros: { cheapest: null, median: null, priciest: null } }).allocatableTokens))} ` +
    `weighted tokens/day, at **5** it is ${tokens(Math.floor((dailyTokens * allocationBps) / 10_000 / 5))}, ` +
    `at **20** it is ${tokens(Math.floor((dailyTokens * allocationBps) / 10_000 / 20))}.`,
);

const block = lines.join("\n");
const doc = fs.readFileSync(DOC_PATH, "utf8");
const startIndex = doc.indexOf(START);
const endIndex = doc.indexOf(END);

if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
  throw new Error(
    `docs/business-model.md is missing the ${START} / ${END} markers.`,
  );
}

const next =
  doc.slice(0, startIndex + START.length) +
  "\n\n" +
  block +
  "\n\n" +
  doc.slice(endIndex);

fs.writeFileSync(DOC_PATH, next, "utf8");
console.log(
  `Wrote ${path.relative(ROOT, DOC_PATH)} (${block.length} chars generated).`,
);
