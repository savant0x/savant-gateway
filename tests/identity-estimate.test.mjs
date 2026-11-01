import assert from "node:assert/strict";
import test from "node:test";

import { estimateRun, readIdentityCaps, sumEstimates } from "../lib/identity/estimate.ts";

const BASE = {
  mode: "baseline",
  hasReference: false,
  hasControl: false,
  costInputMicros: 1_000_000,
  costOutputMicros: 2_000_000,
  tokenWeight: 1,
  rpm: 10,
  maxRequestsPerModel: 600,
  maxRequestsPerBatch: 3_000,
  quotaRemaining: null,
};

test("a baseline estimates 232 requests after the 20% retry headroom", () => {
  const estimate = estimateRun(BASE);

  assert.equal(estimate.requests, 232);
  assert.equal(estimate.promptTokens, 36_814);
  assert.equal(estimate.completionTokens, 1_536);
  assert.equal(estimate.costMicros, 39_886);
  assert.equal(estimate.weightedTokens, 38_350);
  assert.equal(estimate.minutes, 27.8);
  assert.equal(estimate.effectiveMode, "baseline");
  assert.equal(estimate.quotaCheck, "unknown");
  assert.deepEqual(estimate.refusals, []);
});

test("a verify run with a reference and a control adds the control arm", () => {
  const estimate = estimateRun({
    ...BASE,
    mode: "verify",
    hasReference: true,
    hasControl: true,
  });

  assert.equal(estimate.effectiveMode, "verify");
  assert.equal(estimate.requests, 376);
  assert.equal(estimate.promptTokens, 38_254);
  assert.equal(estimate.completionTokens, 1_656);
  assert.equal(estimate.costMicros, 41_566);
  assert.equal(estimate.minutes, 45.1);
});

test("a verify run without a reference is priced as a baseline", () => {
  const estimate = estimateRun({
    ...BASE,
    mode: "verify",
    hasReference: false,
    hasControl: true,
  });

  assert.equal(estimate.effectiveMode, "baseline");
  assert.equal(estimate.requests, 232);
  assert.equal(estimate.promptTokens, 36_814);
  assert.equal(estimate.completionTokens, 1_536);
});

test("a verify run with a reference but no control prices no control arm", () => {
  const estimate = estimateRun({
    ...BASE,
    mode: "verify",
    hasReference: true,
    hasControl: false,
  });

  assert.equal(estimate.effectiveMode, "verify");
  assert.equal(estimate.requests, 232);
  assert.equal(estimate.promptTokens, 36_814);
});

test("cost, weighted tokens, and minutes follow the sealed formulas", () => {
  const estimate = estimateRun({
    ...BASE,
    costInputMicros: 2_500_000,
    costOutputMicros: 10_000_000,
    tokenWeight: 4,
    rpm: 60,
  });

  assert.equal(estimate.costMicros, 36_814 * 2.5 + 1_536 * 10);
  assert.equal(estimate.weightedTokens, 36_814 + 1_536 * 4);
  assert.equal(estimate.minutes, 4.6);
});

test("per-model and per-batch caps refuse instead of warning", () => {
  const perModel = estimateRun({ ...BASE, maxRequestsPerModel: 231 });
  const perBatch = estimateRun({ ...BASE, maxRequestsPerBatch: 100 });

  assert.equal(perModel.refusals.length, 1);
  assert.match(perModel.refusals[0], /232 requests/);
  assert.match(perModel.refusals[0], /per-model cap is 231/);

  assert.equal(perBatch.refusals.length, 1);
  assert.match(perBatch.refusals[0], /batch cap is 100/);
});

test("quota refusal keeps the 2x headroom and allows an exact match", () => {
  const short = estimateRun({ ...BASE, quotaRemaining: 76_699 });
  const exact = estimateRun({ ...BASE, quotaRemaining: 76_700 });

  assert.equal(short.quotaCheck, "reported");
  assert.equal(short.refusals.length, 1);
  assert.match(short.refusals[0], /76700 with headroom/);
  assert.deepEqual(exact.refusals, []);
  assert.equal(exact.quotaRemaining, 76_700);
});

test("an unknown quota is allowed and labelled unknown", () => {
  const estimate = estimateRun({ ...BASE, quotaRemaining: null });

  assert.equal(estimate.quotaCheck, "unknown");
  assert.deepEqual(estimate.refusals, []);
});

test("sumEstimates adds totals, concatenates refusals, and merges mode", () => {
  const baseline = estimateRun(BASE);
  const verify = estimateRun({
    ...BASE,
    mode: "verify",
    hasReference: true,
    hasControl: true,
    quotaRemaining: null,
  });
  const refused = estimateRun({ ...BASE, maxRequestsPerModel: 1 });
  const total = sumEstimates([baseline, verify, refused]);

  assert.equal(total.requests, 232 + 376 + 232);
  assert.equal(total.promptTokens, 36_814 + 38_254 + 36_814);
  assert.equal(total.completionTokens, 1_536 + 1_656 + 1_536);
  assert.equal(total.costMicros, 39_886 + 41_566 + 39_886);
  assert.equal(total.weightedTokens, 38_350 + 39_910 + 38_350);
  assert.equal(total.minutes, 100.7);
  assert.equal(total.effectiveMode, "verify");
  assert.equal(total.quotaCheck, "unknown");
  assert.equal(total.refusals.length, 1);
});

test("readIdentityCaps applies defaults, clamps, and the enabled switch", () => {
  const defaults = readIdentityCaps({});

  assert.deepEqual(defaults, {
    enabled: false,
    rpm: 10,
    maxRequestsPerModel: 600,
    maxRequestsPerBatch: 3_000,
    retentionDays: 90,
  });

  assert.equal(readIdentityCaps({ IDENTITY_ENABLED: "true" }).enabled, true);
  assert.equal(readIdentityCaps({ IDENTITY_ENABLED: " TRUE " }).enabled, true);
  assert.equal(readIdentityCaps({ IDENTITY_ENABLED: "1" }).enabled, false);

  assert.equal(readIdentityCaps({ IDENTITY_RPM: "999" }).rpm, 60);
  assert.equal(readIdentityCaps({ IDENTITY_RPM: "0" }).rpm, 10);
  assert.equal(
    readIdentityCaps({ IDENTITY_MAX_REQUESTS_PER_MODEL: "5" })
      .maxRequestsPerModel,
    5,
  );
  assert.equal(
    readIdentityCaps({ IDENTITY_MAX_REQUESTS_PER_BATCH: "lots" })
      .maxRequestsPerBatch,
    3_000,
  );
  assert.equal(
    readIdentityCaps({ IDENTITY_SAMPLE_RETENTION_DAYS: "99999" })
      .retentionDays,
    3_650,
  );
});
