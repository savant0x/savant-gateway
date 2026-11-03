#!/usr/bin/env node
/**
 * FID-2026-1103-130 decision measurement.
 *
 * Deterministic workload; no network and no database. `restartsPerDay` is an
 * explicit deployment assumption, so a hosted result can replace it later
 * without changing the code.
 *
 *   node scripts/feed-validator-measurement.mjs --sources=16 --cycles=24 \
 *     --feed-bytes=120000 --restarts=1
 */

import { measureValidators } from "../lib/content/validator-measurement.ts";

function readNumber(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  const parsed = Number(argument?.slice(prefix.length));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const workload = {
  sources: readNumber("sources", 16),
  cyclesPerDay: readNumber("cycles", 24),
  feedBytes: readNumber("feed-bytes", 120_000),
  restartsPerDay: readNumber("restarts", 1),
};
const result = measureValidators(workload);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

console.log("Feed-validator measurement (synthetic workload)");
console.log(`  sources              ${result.workload.sources}`);
console.log(`  cycles/day           ${result.workload.cyclesPerDay}`);
console.log(`  mean feed            ${mb(result.workload.feedBytes)}`);
console.log(`  cold starts/day      ${result.workload.restartsPerDay}`);
console.log(`  requests/day         ${result.requestsPerDay}`);
console.log(`  full downloads/day   ${result.fullDownloads}`);
console.log(`  conditional 304/day  ${result.conditionalRequests}`);
console.log(
  `  validator hit rate   ${(result.validatorHitRate * 100).toFixed(1)}%`,
);
console.log(`  bytes with cache     ${mb(result.bytesWithCache)}`);
console.log(`  bytes without        ${mb(result.bytesWithoutValidators)}`);
console.log(`  saved by cache       ${mb(result.savedBytes)}`);
console.log(`  restart penalty      ${mb(result.restartBytes)}`);
console.log(`  durable body would   ${mb(result.durableBodyBytes)}`);
console.log(`  decision             ${result.decision}`);
console.log(`  reason               ${result.reason}`);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
}
