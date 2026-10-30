import assert from "node:assert/strict";
import test from "node:test";

import {
  decidePlanActivation,
  PLAN_SALES_ENV,
  readPlanSalesPolicy,
} from "../lib/plan-sales.ts";

test("plan sales are off when the flag is unset", () => {
  const policy = readPlanSalesPolicy({});

  assert.equal(policy.selling, false);
  assert.equal(policy.configured, false);
  assert.match(policy.reason, /disabled for this launch/);
});

test("only an explicit true value enables plan sales", () => {
  for (const value of ["true", "TRUE", "1", "yes", "on", " true "]) {
    const policy = readPlanSalesPolicy({ [PLAN_SALES_ENV]: value });

    assert.equal(policy.selling, true, value);
    assert.equal(policy.configured, true, value);
    assert.equal(policy.reason, "", value);
  }
});

test("any other explicit value keeps sales off and names the value", () => {
  for (const value of ["false", "0", "off", "disabled", "maybe"]) {
    const policy = readPlanSalesPolicy({ [PLAN_SALES_ENV]: value });

    assert.equal(policy.selling, false, value);
    assert.equal(policy.configured, true, value);
    assert.match(policy.reason, new RegExp(value), value);
  }
});

test("publishing a plan is refused while sales are off", () => {
  for (const current of [null, "draft", "archived"]) {
    const decision = decidePlanActivation({
      selling: false,
      current,
      next: "active",
    });

    assert.equal(decision.allowed, false, String(current));
    assert.match(decision.error, /sales are disabled/);
  }
});

test("editing or archiving an already-active plan stays allowed while off", () => {
  for (const next of ["active", "draft", "archived"]) {
    const decision = decidePlanActivation({
      selling: false,
      current: "active",
      next,
    });

    assert.equal(decision.allowed, true, next);
  }
});

test("draft and archived authoring stays allowed while sales are off", () => {
  for (const next of ["draft", "archived"]) {
    for (const current of [null, "draft", "archived"]) {
      const decision = decidePlanActivation({
        selling: false,
        current,
        next,
      });

      assert.equal(decision.allowed, true, `${String(current)} -> ${next}`);
    }
  }
});

test("enabled sales publish a plan from any prior state", () => {
  for (const current of [null, "draft", "active", "archived"]) {
    const decision = decidePlanActivation({
      selling: true,
      current,
      next: "active",
    });

    assert.equal(decision.allowed, true, String(current));
  }
});
