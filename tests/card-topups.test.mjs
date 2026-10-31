import assert from "node:assert/strict";
import test from "node:test";

import { CARD_TOPUPS_ENV, readCardTopupPolicy } from "../lib/card-topups.ts";

test("card top-ups are off when the flag is unset", () => {
  const policy = readCardTopupPolicy({});

  assert.equal(policy.enabled, false);
  assert.equal(policy.configured, false);
  assert.match(policy.reason, /crypto/);
});

test("card top-ups stay off for an explicit false", () => {
  const policy = readCardTopupPolicy({ [CARD_TOPUPS_ENV]: "false" });

  assert.equal(policy.enabled, false);
  assert.equal(policy.configured, true);
  assert.match(policy.reason, /CARD_TOPUPS_ENABLED=false/);
});

test("only an affirmative flag enables card sales", () => {
  for (const value of ["1", "true", "TRUE", " yes ", "on"]) {
    const policy = readCardTopupPolicy({ [CARD_TOPUPS_ENV]: value });

    assert.equal(policy.enabled, true, value);
    assert.equal(policy.reason, "");
  }
});

test("payment credentials alone never enable card sales", () => {
  const policy = readCardTopupPolicy({
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.configured, false);
});
