import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySourceFailure,
  publicHubEmptyExplanation,
  publicSourceAge,
  sourceGuidance,
  summarizePublicSources,
} from "../lib/content/source-guidance.ts";

const NOW = new Date("2026-11-03T12:00:00.000Z");

function source(overrides = {}) {
  return {
    id: "src_1",
    label: "Example",
    kind: "rss",
    enabled: true,
    status: "active",
    failureStreak: 0,
    lastFetchedAt: "2026-11-03T11:30:00.000Z",
    fetchIntervalMinutes: 60,
    lastError: null,
    ...overrides,
  };
}

test("freshness age is human-readable and never claims a future age", () => {
  assert.equal(publicSourceAge(null, NOW), "never");
  assert.equal(publicSourceAge("2026-11-03T11:59:40.000Z", NOW), "just now");
  assert.equal(publicSourceAge("2026-11-03T11:30:00.000Z", NOW), "30 min ago");
  assert.equal(publicSourceAge("2026-11-03T09:00:00.000Z", NOW), "3 h ago");
  assert.equal(publicSourceAge("2026-11-01T12:00:00.000Z", NOW), "2 d ago");
  assert.equal(publicSourceAge("2026-11-03T13:00:00.000Z", NOW), "just now");
});

test("the public summary counts each state and the latest success", () => {
  const summary = summarizePublicSources(
    [
      source(),
      source({
        id: "src_2",
        status: "error",
        failureStreak: 3,
        lastFetchedAt: "2026-11-03T10:00:00.000Z",
        lastError: "Upstream returned HTTP 403.",
      }),
      source({
        id: "src_3",
        lastFetchedAt: "2026-11-02T08:00:00.000Z",
      }),
      source({ id: "src_4", enabled: false, status: "disabled" }),
    ],
    NOW,
  );

  assert.equal(summary.total, 4);
  assert.equal(summary.current, 1);
  assert.equal(summary.attention, 1);
  assert.equal(summary.delayed, 1);
  assert.equal(summary.paused, 1);
  assert.equal(summary.lastSuccessAt, "2026-11-03T11:30:00.000Z");
});

test("failure classes are typed and do not echo the raw message", () => {
  assert.equal(classifySourceFailure("Upstream returned HTTP 500."), "http");
  assert.equal(classifySourceFailure("request timed out"), "network");
  assert.equal(classifySourceFailure("A YouTube channel id is required."), "config");
  assert.equal(classifySourceFailure("Unexpected token in XML"), "parse");
  assert.equal(classifySourceFailure("something odd"), "unknown");
  assert.equal(classifySourceFailure(null), "unknown");

  const guidance = sourceGuidance(
    source({
      status: "error",
      failureStreak: 4,
      lastError: "Upstream returned HTTP 403.",
    }),
    NOW,
  );

  assert.equal(guidance.state, "attention");
  assert.equal(guidance.failureClass, "http");
  assert.match(guidance.hint, /http/);
  assert.equal(guidance.hint.includes("403"), false);
  assert.match(guidance.action, /4xx/);
});

test("paused, delayed and never-fetched sources get distinct actions", () => {
  const paused = sourceGuidance(
    source({ enabled: false, status: "disabled" }),
    NOW,
  );
  const delayed = sourceGuidance(
    source({ lastFetchedAt: "2026-11-02T08:00:00.000Z" }),
    NOW,
  );
  const never = sourceGuidance(
    source({ lastFetchedAt: null }),
    NOW,
  );

  assert.equal(paused.state, "paused");
  assert.match(paused.action, /Re-enable/);
  assert.equal(delayed.state, "delayed");
  assert.match(delayed.hint, /No successful fetch/);
  assert.equal(never.state, "delayed");
  assert.match(never.hint, /No successful fetch has been recorded/);
});

test("the hub empty state reflects configured, paused, attention and current sources", () => {
  assert.match(publicHubEmptyExplanation([], NOW).title, /No sources/);
  assert.match(
    publicHubEmptyExplanation([source({ enabled: false, status: "disabled" })], NOW)
      .title,
    /paused/,
  );
  assert.match(
    publicHubEmptyExplanation(
      [source({ status: "error", failureStreak: 4 })],
      NOW,
    ).title,
    /need attention/,
  );
  assert.match(
    publicHubEmptyExplanation(
      [source({ lastFetchedAt: "2026-11-01T08:00:00.000Z" })],
      NOW,
    ).title,
    /delayed/,
  );
  assert.match(
    publicHubEmptyExplanation([source()], NOW).title,
    /no pieces/,
  );
});
