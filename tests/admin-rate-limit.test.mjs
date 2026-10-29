import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimiter } from "../lib/admin-rate-limit.ts";

test("the limiter allows attempts until the threshold", () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
  const now = 1000;

  assert.equal(limiter.check("ip", now).allowed, true);
  limiter.fail("ip", now);
  assert.equal(limiter.check("ip", now).allowed, true);
  limiter.fail("ip", now);

  const blocked = limiter.check("ip", now);

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
});

test("the window expires and a success clears failures", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });

  limiter.fail("ip", 0);
  assert.equal(limiter.check("ip", 500).allowed, false);
  assert.equal(limiter.check("ip", 1000).allowed, true);

  limiter.fail("ip", 2000);
  limiter.reset("ip");
  assert.equal(limiter.check("ip", 2200).allowed, true);
});
