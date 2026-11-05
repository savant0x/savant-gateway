import assert from "node:assert/strict";
import test from "node:test";

import {
  loadServerEnvironment,
  readEnvelope,
  validateEnvelope,
} from "../scripts/load/envelope.mjs";

const { envelope } = await readEnvelope(process.cwd());

test("the load fixture pins both free-pool environment families", () => {
  const environment = loadServerEnvironment(envelope);

  assert.equal(environment.FREE_POOL_DAILY_WEIGHTED_TOKENS, "20000000");
  assert.equal(environment.FREE_POOL_ALLOCATION_BPS, "9000");
  assert.equal(environment.FREE_POOL_ALLOCATION_ENABLED, "true");
  assert.equal(environment.FREE_ACCOUNT_DAILY_CAP, "100000");
  assert.equal(environment.FREE_DAILY_WEIGHTED_TOKENS, "500000");
  assert.equal(environment.TRIAL_ENABLED, "false");
});

test("the pinned daily pool equals the observed upstream grant", () => {
  assert.equal(
    envelope.environment.freePoolDailyWeightedTokens,
    envelope.environment.observedDailyWeightedTokens,
  );
});

test("a missing effective policy field is refused before boot", () => {
  const clone = structuredClone(envelope);

  clone.environment.freeAccountDailyCap = undefined;

  assert.throws(
    () => validateEnvelope(clone),
    /freeAccountDailyCap/,
  );
});

test("an invalid allocation basis is refused before boot", () => {
  const clone = structuredClone(envelope);

  clone.environment.freePoolAllocationBps = 10_001;

  assert.throws(
    () => validateEnvelope(clone),
    /freePoolAllocationBps/,
  );
});
