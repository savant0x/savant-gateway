import assert from "node:assert/strict";
import test from "node:test";

import { measureValidators } from "../lib/content/validator-measurement.ts";
import {
  measureSearch,
  percentile,
  SEARCH_INDEX_THRESHOLDS,
} from "../lib/content/search-measurement.ts";

test("validator measurement shows the local cache removes repeat downloads", () => {
  const result = measureValidators({
    sources: 16,
    cyclesPerDay: 24,
    feedBytes: 120_000,
    restartsPerDay: 1,
  });

  assert.equal(result.requestsPerDay, 384);
  assert.equal(result.fullDownloads, 16);
  assert.equal(result.conditionalRequests, 368);
  assert.ok(result.validatorHitRate > 0.95);
  assert.ok(result.savedBytes > 0);
  assert.equal(result.restartDownloads, 0);
  assert.equal(result.decision, "process-local-cache");
  assert.match(result.reason, /304 without a cached body/);
});

test("validator measurement reports restart downloads without inventing savings", () => {
  const result = measureValidators({
    sources: 10,
    cyclesPerDay: 24,
    feedBytes: 1_000_000,
    restartsPerDay: 4,
  });

  assert.equal(result.restartDownloads, 30);
  assert.equal(result.restartBytes, 30_000_000);
  assert.equal(result.durableBodyBytes, 10_000_000);
  assert.equal(result.decision, "process-local-cache");
});

test("a corpus above the threshold asks for an index even when fast", () => {
  const result = measureSearch(SEARCH_INDEX_THRESHOLDS.corpus, [
    { term: "luna", ms: 1, total: 10 },
  ]);

  assert.equal(result.decision, "add-trigram-index");
});

test("a slow p95 asks for an index and percentiles are nearest-rank", () => {
  assert.equal(percentile([5, 1, 3, 9], 0.5), 3);
  assert.equal(percentile([5, 1, 3, 9], 0.95), 9);
  assert.equal(percentile([], 0.5), 0);

  const result = measureSearch(100, [
    { term: "a", ms: 80, total: 1 },
    { term: "b", ms: 90, total: 1 },
  ]);

  assert.equal(result.decision, "add-trigram-index");
  assert.equal(result.maxMs, 90);
});
