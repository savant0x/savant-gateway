#!/usr/bin/env node
/**
 * FID-2026-1103-132 search baseline.
 *
 * Seeds a disposable embedded PostgreSQL (PGlite) with a representative corpus
 * and times the same wildcard query the public hub uses. This is a local
 * baseline, not a hosted measurement: the decision record names the corpus and
 * the p95 it observed, and a hosted run can replace the numbers.
 *
 *   node scripts/search-benchmark.mjs --items=5000 --queries=15
 */

import { randomUUID } from "node:crypto";

import { searchTerms } from "../lib/content/search-benchmark-terms.ts";
import { measureSearch } from "../lib/content/search-measurement.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

function readNumber(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  const parsed = Number(argument?.slice(prefix.length));

  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

const items = Math.min(60_000, readNumber("items", 5_000));
const queryCount = Math.min(100, readNumber("queries", 15));
const db = await createStorageDatabase({ env: {} });
const now = new Date("2026-11-03T12:00:00.000Z").toISOString();
const sourceId = `src_bench_${randomUUID().slice(0, 8)}`;

try {
  await db
    .prepare(
      `INSERT INTO content.sources
        (id, kind, label, url, config_json, enabled, fetch_interval_minutes,
         max_items, status, failure_streak, created_at, updated_at)
       VALUES (?, 'rss', 'Search benchmark', 'https://example.com/bench.xml',
               '{"tags":[]}', 1, 60, 20, 'active', 0, ?, ?)`,
    )
    .run(sourceId, now, now);

  const insert = db.prepare(
    `INSERT INTO content.items
      (id, source_id, kind, title, url, excerpt, published_at, fetched_at,
       content_hash, created_at, updated_at)
     VALUES (?, ?, 'article', ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const startedSeed = Date.now();

  await db.transaction(async () => {
    for (let index = 0; index < items; index += 1) {
      const term = searchTerms[index % searchTerms.length];

      await insert.run(
        `itm_bench_${index}`,
        sourceId,
        `${term} release notes ${index}`,
        `https://example.com/bench/${index}`,
        `A benchmark excerpt about ${term} and gateway pricing.`,
        now,
        now,
        `hash_${index}`,
        now,
        now,
      );
    }
  })();

  const seedMs = Date.now() - startedSeed;
  const samples = [];

  for (let index = 0; index < queryCount; index += 1) {
    const term = searchTerms[index % searchTerms.length];
    const started = performance.now();
    const page = await db
      .prepare(
        `SELECT COUNT(*) AS total
           FROM content.items i
          WHERE i.title ILIKE ? OR i.excerpt ILIKE ?`,
      )
      .get(`%${term}%`, `%${term}%`);
    const total = Number(page?.total ?? 0);

    samples.push({ term, ms: performance.now() - started, total });
  }

  const measurement = measureSearch(items, samples);
  const plan = await db
    .prepare(
      `EXPLAIN SELECT COUNT(*) FROM content.items i
        WHERE i.title ILIKE '%luna%' OR i.excerpt ILIKE '%luna%'`,
    )
    .all();

  console.log("Signal search baseline (PGlite, local)");
  console.log(`  corpus            ${items} items`);
  console.log(`  seed time         ${seedMs} ms`);
  console.log(`  queries           ${samples.length}`);
  console.log(`  p50               ${measurement.p50Ms.toFixed(2)} ms`);
  console.log(`  p95               ${measurement.p95Ms.toFixed(2)} ms`);
  console.log(`  max               ${measurement.maxMs.toFixed(2)} ms`);
  console.log(`  decision          ${measurement.decision}`);
  console.log(
    `  thresholds        p95 > ${measurement.thresholds.p95Ms} ms or corpus >= ${measurement.thresholds.corpus}`,
  );
  console.log("  plan");
  for (const row of plan) console.log(`    ${Object.values(row).join(" ")}`);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ...measurement, seedMs, plan }, null, 2));
  }
} finally {
  await db.close();
}
