// Builds the cross-upstream price sheets from committed snapshots.
//
// Inputs (both committed): docs/data/provider-prices.json — Apixo's published
// retail rates and our own Apinex cost recorded on 2026-11-20 — and a captured
// InferHub public catalog payload, which needs no credential:
//
//   curl -sS https://api.inferhub.dev/v1/models -o .scratch/inh-models.json
//   node scripts/inferhub-price-sheet.mjs .scratch/inh-models.json --out-dir docs/data
//
// Outputs: one row per model identity with every upstream side by side, and one
// row per InferHub offer (publisher-pinned id) as the buy list. Amounts are USD
// per 1M tokens unless the column says otherwise. Nothing here is a claimed
// charge: the InferHub column is the cheapest open ask, not the price a call
// settles at until a bid is pinned in that account.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalModelKey } from "../lib/model-identity.ts";

const args = process.argv.slice(2);
const input = args.find((arg) => !arg.startsWith("--"));

if (!input) {
  console.error(
    "usage: node scripts/inferhub-price-sheet.mjs <inferhub-models.json> [--out-dir DIR]",
  );
  process.exit(2);
}

const outDirIndex = args.indexOf("--out-dir");
const outDir = outDirIndex >= 0 ? args[outDirIndex + 1] : null;
const capturedAt = new Date().toISOString();

const published = JSON.parse(
  readFileSync("docs/data/provider-prices.json", "utf8"),
);
const apixo = published.providers.apixo.models;
const apinex = published.providers.apinex.observedCosts ?? {};

const payload = JSON.parse(readFileSync(input, "utf8"));
const offers = (Array.isArray(payload) ? payload : payload?.data ?? []).filter(
  (row) => row?.pricing && row?.id,
);

function blended(input_, output_, outShare) {
  return (input_ + output_ * outShare) / (1 + outShare);
}

function tier2(offer) {
  const asksIn = offer.pricing.asks_in ?? [];
  const asksOut = offer.pricing.asks_out ?? [];

  if (asksIn.length > 1 && asksOut.length > 1) {
    return { input: asksIn[1], output: asksOut[1] };
  }

  return {
    input: offer.pricing.min_ask_in,
    output: offer.pricing.min_ask_out,
  };
}

function deepest(offer) {
  const asksIn = offer.pricing.asks_in ?? [];
  const asksOut = offer.pricing.asks_out ?? [];

  return {
    input: asksIn.length ? asksIn[asksIn.length - 1] : offer.pricing.min_ask_in,
    output: asksOut.length
      ? asksOut[asksOut.length - 1]
      : offer.pricing.min_ask_out,
  };
}

const byKey = new Map();

for (const offer of offers) {
  const key = canonicalModelKey(offer.id);
  const list = byKey.get(key) ?? [];

  list.push(offer);
  byKey.set(key, list);
}

for (const [id, price] of Object.entries(apixo)) {
  const key = canonicalModelKey(id);

  if (!byKey.has(key)) byKey.set(key, []);
  void price;
}

const sheet = [];

for (const [key, group] of [...byKey.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const best = group.length
    ? group.reduce((left, right) =>
        right.pricing.min_ask_in < left.pricing.min_ask_in ? right : left,
      )
    : null;
  const prices = Object.entries(apixo).find(
    ([id]) => canonicalModelKey(id) === key,
  )?.[1];
  const ours = Object.entries(apinex).find(
    ([id]) => canonicalModelKey(id) === key,
  )?.[1];

  const inhIn = best?.pricing.min_ask_in ?? null;
  const inhOut = best?.pricing.min_ask_out ?? null;
  const second = best ? tier2(best) : null;

  const inhBlend = inhIn === null ? null : blended(inhIn, inhOut, 4);
  const inhT2Blend = second ? blended(second.input, second.output, 4) : null;
  const oursBlend = ours ? blended(ours.inputPer1M, ours.outputPer1M, 4) : null;
  const apixoBlend = prices
    ? blended(prices.inputPer1M, prices.outputPer1M, 4)
    : null;

  const candidates = [
    ["inferhub", inhBlend],
    ["inferhub_tier2", inhT2Blend],
    ["apinex", oursBlend],
    ["apixo", apixoBlend],
  ].filter(([, value]) => value !== null);
  const cheapest = candidates.length
    ? candidates.reduce((left, right) => (right[1] < left[1] ? right : left))
    : null;

  sheet.push({
    key,
    family: best?.upstream_label ?? best?.owned_by ?? "",
    inferhub_id: best?.id ?? "",
    publishers: group.length,
    inh_in: inhIn,
    inh_out: inhOut,
    inh_tier2_in: second?.input ?? null,
    inh_tier2_out: second?.output ?? null,
    inh_worst_in: best ? deepest(best).input : null,
    inh_worst_out: best ? deepest(best).output : null,
    official_in: best?.pricing.official_in ?? null,
    official_out: best?.pricing.official_out ?? null,
    off_list_pct:
      best && best.pricing.official_in
        ? Math.round((inhIn / best.pricing.official_in) * 1000) / 10
        : null,
    ctx: best?.input_token_limit ?? "",
    cache: best?.supports_cache === true ? "yes" : "",
    reasoning: (best?.reasoning_levels ?? []).join("/"),
    apinex_in: ours?.inputPer1M ?? null,
    apinex_out: ours?.outputPer1M ?? null,
    apixo_in: prices?.inputPer1M ?? null,
    apixo_out: prices?.outputPer1M ?? null,
    blend_inh: round(inhBlend),
    blend_inh_tier2: round(inhT2Blend),
    blend_apinex: round(oursBlend),
    blend_apixo: round(apixoBlend),
    cheapest_1in4out: cheapest ? cheapest[0] : "",
    cheapest_value: round(cheapest ? cheapest[1] : null),
  });
}

function round(value) {
  return value === null || value === undefined
    ? ""
    : Math.round(value * 100000) / 100000;
}

function csv(rows, columns) {
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);

    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ].join("\n");
}

const sheetColumns = [
  "key",
  "family",
  "inferhub_id",
  "publishers",
  "inh_in",
  "inh_out",
  "inh_tier2_in",
  "inh_tier2_out",
  "inh_worst_in",
  "inh_worst_out",
  "official_in",
  "official_out",
  "off_list_pct",
  "ctx",
  "cache",
  "reasoning",
  "apinex_in",
  "apinex_out",
  "apixo_in",
  "apixo_out",
  "blend_inh",
  "blend_inh_tier2",
  "blend_apinex",
  "blend_apixo",
  "cheapest_1in4out",
  "cheapest_value",
];

const offerRows = offers.map((offer) => {
  const second = tier2(offer);

  return {
    id: offer.id,
    publisher: offer.owned_by ?? "",
    label: offer.upstream_label ?? "",
    in: offer.pricing.min_ask_in,
    out: offer.pricing.min_ask_out,
    tier2_in: second.input,
    tier2_out: second.output,
    official_in: offer.pricing.official_in,
    official_out: offer.pricing.official_out,
    tiers: (offer.pricing.asks_in ?? []).length,
    off_list_pct: offer.pricing.official_in
      ? Math.round((offer.pricing.min_ask_in / offer.pricing.official_in) * 1000) /
        10
      : "",
    ctx: offer.input_token_limit ?? "",
    cache: offer.supports_cache === true ? "yes" : "",
    reasoning: (offer.reasoning_levels ?? []).join("/"),
    output_modality: offer.output_modality ?? "text",
  };
});

const offerColumns = [
  "id",
  "publisher",
  "label",
  "in",
  "out",
  "tier2_in",
  "tier2_out",
  "official_in",
  "official_out",
  "tiers",
  "off_list_pct",
  "ctx",
  "cache",
  "reasoning",
  "output_modality",
];

// Launch arithmetic: the free tier is a 20M weighted-token/day pool with 90%
// allocatable, so 18M tokens/day is the figure that has to be funded when the
// upstream's own allowance is exhausted.
const DAILY_ALLOCATABLE_TOKENS = 18_000_000;

function monthlyCost(blend) {
  return (DAILY_ALLOCATABLE_TOKENS / 1_000_000) * blend * 30;
}

const withBlend = sheet.filter((row) => row.blend_inh !== "");

function cheapestWhere(useTier2) {
  const counts = { inferhub: 0, apinex: 0, apixo: 0, none: 0 };

  for (const row of sheet) {
    const candidates = [
      ["inferhub", useTier2 ? row.blend_inh_tier2 : row.blend_inh],
      ["apinex", row.blend_apinex],
      ["apixo", row.blend_apixo],
    ].filter(([, value]) => value !== "" && value !== null);

    if (!candidates.length) {
      counts.none += 1;
      continue;
    }

    const winner = candidates.reduce((left, right) =>
      right[1] < left[1] ? right : left,
    );

    counts[winner[0]] += 1;
  }

  return counts;
}

const summary = {
  capturedAt,
  sheetRows: sheet.length,
  offers: offers.length,
  inferhubModels: withBlend.length,
  apinexOverlap: sheet.filter((row) => row.apinex_in !== null).length,
  apixoPriced: sheet.filter((row) => row.apixo_in !== null).length,
  apixoAndInferhub: sheet.filter(
    (row) => row.apixo_in !== null && row.inh_in !== null,
  ).length,
  apinexAndInferhub: sheet.filter(
    (row) => row.apinex_in !== null && row.inh_in !== null,
  ).length,
  cheapestAtFloor: cheapestWhere(false),
  cheapestIfCheapestPublisherBusy: cheapestWhere(true),
  inferhubBlendMedian: median(withBlend.map((row) => row.blend_inh)),
  inferhubTier2BlendMedian: median(withBlend.map((row) => row.blend_inh_tier2)),
  inferhubBlendP10: percentile(withBlend.map((row) => row.blend_inh), 0.1),
  apixoBlendMedian: median(
    sheet.filter((row) => row.blend_apixo !== "").map((row) => row.blend_apixo),
  ),
  apinexBlendMedian: median(
    sheet.filter((row) => row.blend_apinex !== "").map((row) => row.blend_apinex),
  ),
  freeTierMonthlyUsd: {
    atCheapestRow: monthlyCost(Math.min(...withBlend.map((row) => row.blend_inh))),
    atP10: monthlyCost(percentile(withBlend.map((row) => row.blend_inh), 0.1)),
    atMedian: monthlyCost(median(withBlend.map((row) => row.blend_inh))),
    atHy4Preview: monthlyCost(
      withBlend.find((row) => row.key === "hy4-preview")?.blend_inh ?? 0,
    ),
  },
  usd20Days: {
    atCheapestRow: 20 / (DAILY_ALLOCATABLE_TOKENS / 1_000_000) /
      Math.min(...withBlend.map((row) => row.blend_inh)) / 30,
    atMedian: 20 / (DAILY_ALLOCATABLE_TOKENS / 1_000_000) /
      median(withBlend.map((row) => row.blend_inh)) / 30,
  },
};

const sheetCsv = csv(sheet, sheetColumns);
const offerCsv = csv(offerRows, offerColumns);

if (outDir) {
  writeFileSync(join(outDir, "inferhub-price-sheet.csv"), `${sheetCsv}\n`);
  writeFileSync(join(outDir, "inferhub-offers.csv"), `${offerCsv}\n`);
  console.log(
    JSON.stringify(
      {
        ...summary,
        written: [
          join(outDir, "inferhub-price-sheet.csv"),
          join(outDir, "inferhub-offers.csv"),
        ],
      },
      null,
      1,
    ),
  );
} else {
  console.log(sheetCsv);
  console.error(JSON.stringify(summary, null, 1));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);

  return round(sorted[Math.floor((sorted.length - 1) / 2)]);
}

function percentile(values, share) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);

  return round(sorted[Math.floor((sorted.length - 1) * share)]);
}
