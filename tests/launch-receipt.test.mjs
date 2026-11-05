import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCEPTANCE_ITEMS,
  evaluateReceipt,
  findSecretLeaks,
  RECEIPT_SCHEMA,
} from "../lib/launch-receipt.ts";

const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);

function item(overrides = {}) {
  return {
    status: "pass",
    observedAt: "2026-11-03T12:00:00.000Z",
    operator: "operator",
    evidence: ["req_123", "https://status.example/incident/1"],
    ...overrides,
  };
}

function receipt(overrides = {}) {
  return {
    schema: RECEIPT_SCHEMA,
    pinnedSha: SHA,
    items: Object.fromEntries(
      ACCEPTANCE_ITEMS.map(({ id }) => [id, item()]),
    ),
    approval: {
      decision: "go",
      decidedAt: "2026-11-03T12:30:00.000Z",
      operator: "operator",
      sha: SHA,
      cohort: "8 concurrent customers",
      spendCapUsd: 25,
    },
    ...overrides,
  };
}

const HEAD = { headSha: SHA, env: {} };

test("a complete pass tied to HEAD passes", () => {
  const verdict = evaluateReceipt(receipt(), HEAD);

  assert.equal(verdict.status, "pass");
  assert.deepEqual(verdict.missing, []);
  assert.deepEqual(verdict.reasons, []);
});

test("funded inference is not a required launch observation", () => {
  assert.deepEqual(
    ACCEPTANCE_ITEMS.map(({ id }) => id),
    ["payment", "recovery", "alert", "load", "rollback"],
  );
});

test("a missing or malformed item keeps the receipt incomplete", () => {
  const data = receipt();
  delete data.items.alert;

  const missing = evaluateReceipt(data, HEAD);
  assert.equal(missing.status, "incomplete");
  assert.deepEqual(missing.missing, ["alert"]);

  data.items.alert = item({ evidence: [] });
  const unproven = evaluateReceipt(data, HEAD);
  assert.equal(unproven.status, "incomplete");
  assert.match(unproven.reasons.join(" "), /alert: evidence/);
});

test("a failed item or a no-go decision blocks the receipt", () => {
  const failed = receipt();
  failed.items.load = item({ status: "fail" });

  assert.equal(evaluateReceipt(failed, HEAD).status, "blocked");
  assert.deepEqual(evaluateReceipt(failed, HEAD).failed, ["load"]);

  const noGo = receipt({
    approval: { ...receipt().approval, decision: "no-go" },
  });

  assert.equal(evaluateReceipt(noGo, HEAD).status, "blocked");
});

test("an approval pinned to another commit is stale", () => {
  const verdict = evaluateReceipt(receipt({ pinnedSha: OTHER }), HEAD);

  assert.equal(verdict.status, "stale");
  assert.match(verdict.reasons.join(" "), /not the running commit/);
});

test("an independently stale approval cannot authorize the current pin", () => {
  const data = receipt();
  data.approval.sha = OTHER;

  const verdict = evaluateReceipt(data, HEAD);

  assert.equal(verdict.status, "stale");
  assert.match(verdict.reasons.join(" "), /approval.sha/);
});

test("a secret rejects the receipt and the report names only the path", () => {
  const secret = "sk_live_".concat("z".repeat(24));
  const data = receipt();
  data.items.payment = item({ evidence: [secret] });

  const verdict = evaluateReceipt(data, {
    headSha: SHA,
    env: { STRIPE_SECRET_KEY: secret },
  });

  assert.equal(verdict.status, "leaked");
  assert.match(verdict.leaks.join(" "), /items\.payment\.evidence\[0\]/);
  assert.doesNotMatch(JSON.stringify(verdict), new RegExp(secret));
});

test("known environment values are detected without prefix heuristics", () => {
  const value = "plain-".concat("q".repeat(16));
  const leaks = findSecretLeaks(
    { notes: `pasted ${value} here` },
    { ADMIN_PASSWORD: value },
  );

  assert.deepEqual(leaks, [
    "receipt.notes contains a configured secret value",
  ]);
});

test("an unsupported schema is invalid rather than pass", () => {
  const verdict = evaluateReceipt(receipt({ schema: 99 }), HEAD);

  assert.equal(verdict.status, "invalid");
  assert.match(verdict.reasons.join(" "), /schema must be/);
});
