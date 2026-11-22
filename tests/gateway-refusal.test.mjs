import assert from "node:assert/strict";
import test from "node:test";

import {
  failureStatus,
  safeUpstreamMessage,
} from "../lib/gateway-refusal.ts";

/**
 * What an upstream status may tell a customer (FID-2026-1122-002).
 *
 * 400 and 429 describe the customer's own request, so they survive with the
 * provider's text. 402 does not: it means our account with that provider cannot
 * pay, and passing it through both mislabels an outage as the customer's missing
 * credit and forwards instructions to deposit funds at a site they have no
 * account on.
 */
test("a provider funding failure is our outage, not the customer's credit", () => {
  assert.equal(failureStatus(402), 503);
  assert.equal(
    safeUpstreamMessage(402, "insufficient balance — deposit USDC to continue"),
    "Provider is temporarily unavailable",
  );
});

test("a request-shaped status keeps its text", () => {
  assert.equal(failureStatus(400), 400);
  assert.equal(failureStatus(429), 429);
  assert.equal(safeUpstreamMessage(400, "context length exceeded"), "context length exceeded");
  assert.equal(safeUpstreamMessage(429, "slow down"), "slow down");
});

test("a provider-side status is masked and mapped", () => {
  assert.equal(failureStatus(500), 502);
  assert.equal(failureStatus(404), 502);
  assert.equal(safeUpstreamMessage(500, "internal stack trace"), "Provider request failed");
  assert.equal(safeUpstreamMessage(401, "invalid api key"), "Provider request failed");
  assert.equal(safeUpstreamMessage(403, "forbidden"), "Provider request failed");
  assert.equal(safeUpstreamMessage(400, ""), "Provider request failed");
});
