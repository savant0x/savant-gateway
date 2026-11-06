import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSummary,
  gateResult,
  parseTestTotals,
  summarizeRun,
  VERIFY_GATES,
} from "../scripts/verify-summary.mjs";

const OUTPUT = `✔ a test
ℹ tests 12
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
`;

// The concurrency gate is the one suite that may not skip at all.
const POSTGRES_OUTPUT = OUTPUT.replace("skipped 1", "skipped 0")
  .replace("pass 11", "pass 12");

function outputFor(name) {
  return name === "test:postgres" ? POSTGRES_OUTPUT : OUTPUT;
}

test("Node test totals are parsed, and non-test gates report null", () => {
  assert.deepEqual(parseTestTotals(OUTPUT), {
    total: 12,
    pass: 11,
    fail: 0,
    skipped: 1,
    cancelled: 0,
  });
  assert.equal(parseTestTotals("build succeeded"), null);
});

test("a skipped required gate fails even when the process exits zero", () => {
  const result = gateResult({
    name: "test:postgres",
    command: "npm run test:postgres",
    exitCode: 0,
    signal: null,
    startedAt: 0,
    finishedAt: 10,
    output: OUTPUT,
    allowSkips: false,
  });

  assert.equal(result.status, "failed_skip");
  assert.match(result.error, /cannot skip/);
});

test("a signal or a missing exit code cannot pass", () => {
  const signal = gateResult({
    name: "build",
    command: "npm run build",
    exitCode: null,
    signal: "SIGTERM",
    startedAt: 0,
    finishedAt: 5,
  });
  const missing = gateResult({
    name: "build",
    command: "npm run build",
    exitCode: null,
    signal: null,
    startedAt: 0,
    finishedAt: 5,
  });

  assert.equal(signal.status, "signal");
  assert.equal(missing.status, "missing");
});

test("the summary names every required gate and cannot pass when zero ran", () => {
  const empty = summarizeRun({
    gates: [],
    startedAt: 0,
    finishedAt: 10,
  });

  assert.equal(empty.status, "fail");
  assert.deepEqual(
    empty.missingGates,
    VERIFY_GATES.map((gate) => gate.name),
  );

  const all = VERIFY_GATES.map((gate) =>
    gateResult({
      name: gate.name,
      command: `npm run ${gate.script}`,
      exitCode: 0,
      signal: null,
      startedAt: 0,
      finishedAt: 1,
      output: outputFor(gate.name),
      allowSkips: gate.allowSkips,
    }),
  );
  const summary = summarizeRun({ gates: all, startedAt: 0, finishedAt: 10 });

  assert.equal(summary.status, "pass");
  assert.equal(summary.gates.length, VERIFY_GATES.length);
  assert.equal(summary.skippedGates.length, VERIFY_GATES.length - 1);
  assert.match(formatSummary(summary), /verify: PASS/);
});

test("a failed gate makes the run fail and is named in the summary", () => {
  const gates = VERIFY_GATES.map((gate) =>
    gateResult({
      name: gate.name,
      command: `npm run ${gate.script}`,
      exitCode: gate.name === "quality" ? 1 : 0,
      signal: null,
      startedAt: 0,
      finishedAt: 1,
      output: gate.expectsTests ? outputFor(gate.name) : "ok",
      allowSkips: gate.allowSkips,
    }),
  );
  const summary = summarizeRun({ gates, startedAt: 0, finishedAt: 10 });

  assert.equal(summary.status, "fail");
  assert.deepEqual(summary.failedGates, ["quality"]);
  assert.match(formatSummary(summary), /FAILED\s+quality/);
});

test("required test gates reject absent, empty and inconsistent evidence", () => {
  for (const output of [
    "No tests executed",
    OUTPUT.replace("tests 12", "tests 0"),
    OUTPUT.replace("pass 11", "pass 10"),
    OUTPUT.replace("fail 0", "fail 1").replace("pass 11", "pass 10"),
    OUTPUT.replace("cancelled 0", "cancelled 1").replace("pass 11", "pass 10"),
  ]) {
    const result = gateResult({
      name: "test",
      command: "fixture",
      exitCode: 0,
      startedAt: 0,
      finishedAt: 1,
      output,
    });

    assert.equal(result.status, "failed_evidence", output);
    assert.ok(result.error);
  }
});

test("TAP evidence is recognized when the test reporter runs without a TTY", () => {
  const output = OUTPUT.replaceAll("ℹ ", "# ");

  assert.deepEqual(parseTestTotals(output), parseTestTotals(OUTPUT));
});

test("multiple test-run summaries aggregate instead of using the first", () => {
  const first = OUTPUT;
  const second = OUTPUT.replace("tests 12", "tests 3")
    .replace("pass 11", "pass 2")
    .replace("skipped 1", "skipped 1");
  const aggregate = parseTestTotals(`${first}\n${second}`);

  assert.deepEqual(aggregate, {
    total: 15,
    pass: 13,
    fail: 0,
    skipped: 2,
    cancelled: 0,
  });
});

test("a skip in a later suite still fails the PostgreSQL gate", () => {
  const first = OUTPUT.replace("skipped 1", "skipped 0").replace(
    "pass 11",
    "pass 12",
  );
  const later = OUTPUT;
  const result = gateResult({
    name: "test:postgres",
    command: "fixture",
    exitCode: 0,
    signal: null,
    startedAt: 0,
    finishedAt: 1,
    output: `${first}\n${later}`,
    allowSkips: false,
  });

  assert.equal(result.status, "failed_skip");
});
