/**
 * Machine-readable verification summary (FID-2026-1103-136).
 *
 * `npm run verify` used to be a shell chain: a human had to read the whole
 * stream to know which gate failed, and a skipped gate could scroll past
 * unnoticed. This module owns the stable summary shape and the parsing. It is
 * pure so the schema and the fail-closed rules can be tested without running a
 * gate.
 *
 * The raw output is still preserved, one log per gate. The summary supplements
 * that evidence; it never replaces it, and a partial or signal-terminated run
 * cannot report PASS.
 */

export const VERIFY_SUMMARY_SCHEMA = 1;

/**
 * Ordered gates. This list is the contract: the runner iterates it, the summary
 * names every entry, and a missing entry is a failure rather than an omission.
 * `expectsTests` tags the gates whose output carries a Node test summary, so a
 * silently skipped suite is visible.
 */
export const VERIFY_GATES = [
  { name: "check", script: "check", expectsTests: false },
  { name: "storage:check", script: "storage:check", expectsTests: false },
  { name: "config:check", script: "config:check", expectsTests: false },
  {
    name: "repository:check",
    script: "repository:check",
    expectsTests: false,
  },
  { name: "test", script: "test", expectsTests: true },
  {
    name: "test:postgres",
    script: "test:postgres",
    expectsTests: true,
    allowSkips: false,
  },
  { name: "quality", script: "quality", expectsTests: false },
  { name: "build", script: "build", expectsTests: false },
  { name: "test:http", script: "test:http", expectsTests: false },
  { name: "test:recovery", script: "test:recovery", expectsTests: false },
  {
    name: "deployment:receipt",
    script: "receipt:deploy",
    expectsTests: false,
  },
];

const TEST_TOTAL = /^(?:ℹ|#)\s+tests\s+(\d+)\s*$/m;
const TEST_PASS = /^(?:ℹ|#)\s+pass\s+(\d+)\s*$/m;
const TEST_FAIL = /^(?:ℹ|#)\s+fail\s+(\d+)\s*$/m;
const TEST_SKIPPED = /^(?:ℹ|#)\s+skipped\s+(\d+)\s*$/m;
const TEST_CANCELLED = /^(?:ℹ|#)\s+cancelled\s+(\d+)\s*$/m;

function count(pattern, output) {
  const match = pattern.exec(output);

  return match ? Number(match[1]) : null;
}

/** Node's test reporter summary, or null when the gate emits none. */
export function parseTestTotals(output) {
  const text = typeof output === "string" ? output : "";
  const total = count(TEST_TOTAL, text);

  if (total === null) return null;

  return {
    total,
    pass: count(TEST_PASS, text),
    fail: count(TEST_FAIL, text),
    skipped: count(TEST_SKIPPED, text),
    cancelled: count(TEST_CANCELLED, text),
  };
}

/**
 * One gate result. `status` is derived from the process outcome, never from the
 * text: a gate that printed "PASS" and exited 1 is failed.
 */
export function gateResult(input) {
  const exitCode = Number.isInteger(input.exitCode) ? input.exitCode : null;
  const signal = input.signal ?? null;
  const tests = input.output ? parseTestTotals(input.output) : null;
  const required = VERIFY_GATES.find((gate) => gate.name === input.name);
  const expectsTests = required?.expectsTests ?? input.expectsTests ?? false;
  const invalidEvidence = expectsTests && (
    tests === null ||
    tests.total === 0 ||
    [tests.pass, tests.fail, tests.skipped, tests.cancelled].some(
      (value) => value === null,
    ) ||
    tests.fail > 0 ||
    tests.cancelled > 0 ||
    tests.pass + tests.fail + tests.skipped + tests.cancelled !== tests.total
  );
  const skippedUnexpectedly =
    (required?.allowSkips ?? input.allowSkips) === false &&
    tests !== null && tests.skipped > 0;

  let status = "pass";

  if (signal !== null) status = "signal";
  else if (exitCode === null) status = "missing";
  else if (exitCode !== 0) status = "fail";
  else if (skippedUnexpectedly) status = "failed_skip";
  else if (invalidEvidence) status = "failed_evidence";

  return {
    name: input.name,
    command: input.command,
    status,
    exitCode,
    signal,
    durationMs: Math.max(0, input.finishedAt - input.startedAt),
    tests,
    log: input.log ?? null,
    error:
      status === "failed_skip"
        ? `${input.name} skipped ${tests.skipped} test(s); this gate cannot skip.`
        : status === "failed_evidence"
          ? `${input.name} lacks a complete, nonempty, successful test summary.`
          : null,
  };
}

const FAILED = new Set(["fail", "signal", "missing", "failed_skip", "failed_evidence"]);

export function summarizeRun({ gates, startedAt, finishedAt, logsDir = null }) {
  const missing = VERIFY_GATES.filter(
    (required) => !gates.some((gate) => gate.name === required.name),
  ).map((required) => required.name);
  const failed = gates.filter((gate) => FAILED.has(gate.status));
  const status =
    missing.length > 0 || failed.length > 0 || gates.length === 0
      ? "fail"
      : "pass";

  return {
    schema: VERIFY_SUMMARY_SCHEMA,
    status,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: Math.max(0, finishedAt - startedAt),
    gates,
    missingGates: missing,
    failedGates: failed.map((gate) => gate.name),
    skippedGates: gates
      .filter((gate) => (gate.tests?.skipped ?? 0) > 0)
      .map((gate) => ({
        name: gate.name,
        skipped: gate.tests.skipped,
      })),
    logsDir,
  };
}

function gateLine(gate) {
  const tests = gate.tests
    ? ` · ${gate.tests.pass}/${gate.tests.total} tests, ${gate.tests.skipped} skipped`
    : "";

  return `  ${gate.status.toUpperCase().padEnd(13)} ${gate.name.padEnd(15)} exit ${
    gate.exitCode ?? gate.signal ?? "none"
  }${tests}`;
}

/** The short human summary printed after the raw gate logs. */
export function formatSummary(summary) {
  const lines = [
    "",
    `verify: ${summary.status.toUpperCase()}`,
    ...summary.gates.map(gateLine),
  ];

  if (summary.missingGates.length > 0) {
    lines.push(`  MISSING       ${summary.missingGates.join(", ")}`);
  }

  if (summary.failedGates.length > 0) {
    lines.push(`  FAILED        ${summary.failedGates.join(", ")}`);
  }

  if (summary.skippedGates.length > 0) {
    lines.push(
      `  SKIPPED       ${summary.skippedGates
        .map((gate) => `${gate.name}:${gate.skipped}`)
        .join(", ")}`,
    );
  }

  lines.push(
    `  duration      ${(summary.durationMs / 1000).toFixed(1)}s`,
    `  summary       ${summary.logsDir ?? "not written"}`,
  );

  return lines.join("\n");
}
