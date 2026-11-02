import assert from "node:assert/strict";
import test from "node:test";

import {
  digestDay,
  digestWindow,
  isDigestDay,
  recentDigestDays,
} from "../lib/content/digest.ts";

test("digest days are UTC calendar days", () => {
  assert.equal(digestDay("2026-11-02T23:59:59.999Z"), "2026-11-02");
  assert.equal(digestDay("2026-11-03T00:00:00.000Z"), "2026-11-03");
  assert.equal(digestDay("not a date"), null);
});

test("digest windows cover exactly one UTC day", () => {
  assert.deepEqual(digestWindow("2026-11-02"), {
    since: "2026-11-02T00:00:00.000Z",
    until: "2026-11-03T00:00:00.000Z",
  });
  assert.equal(digestWindow("2026-02-30"), null);
  assert.equal(digestWindow("02-11-2026"), null);
  assert.equal(isDigestDay("2026-11-02"), true);
});

test("recent digest days are newest first and bounded", () => {
  const days = recentDigestDays(3, new Date("2026-11-02T15:00:00.000Z"));

  assert.deepEqual(days, ["2026-11-02", "2026-11-01", "2026-10-31"]);
  assert.equal(recentDigestDays(100, new Date("2026-11-02T15:00:00.000Z")).length, 31);
});
