# FID: Machine-readable verification summary

**Filename:** `FID-2026-1103-136-verification-summary.md`
**ID:** FID-2026-1103-136
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

`npm run verify` emits a large mixed stream that is hard to summarize reliably.
Add a final machine-readable summary containing gate names, exit codes, test
totals, skips, build status, and known external blockers, while retaining the
full raw output for diagnosis.

## Impact Assessment

- **Affected components:** `package.json`, verification scripts, CI output,
  `scripts/`, documentation, and release receipts.
- **Risk:** medium evidence and operator-efficiency gap.

## Proposed Solution

1. **implemented (design):** define a stable schema with command, exit code,
   duration, test totals, skipped tests, and explicit unavailable-service state.
2. **implemented (design):** make each gate emit structured results without
   changing pass/fail semantics; preserve raw logs separately.
3. **implemented (design):** make `verify` fail if a required gate is absent or
   skipped unexpectedly and test malformed/partial output.

## Verification Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run test:http`
- `npm run test:recovery`
- `npm run verify`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** humans must parse long output and can miss skipped or unrun gates.
- **GREEN:** a stable summary is additive, explicit, and preserves raw evidence.
- **AUDIT:** inspect every command in `package.json` and the verify chain for
  exit-code propagation and output ownership.
- **ADVERSARIAL:** truncated logs, signal termination, timeout, skipped tests,
  malformed JSON, and a passing partial run must not report PASS.
- **CHANGE DELTA:** 8%; converged.

### Missed Questions

1. **Should the summary replace raw logs?** No; it supplements them.
2. **Should unavailable external services pass?** No; they must be explicit and
   fail required release gates.

## Implementation Evidence

- **Commit SHA:** `8bb2d20`.
- **Implementation:** `scripts/verify-summary.mjs` owns the stable schema, gate
  list and fail-closed derivation; `scripts/verify.mjs` runs every gate, writes
  one raw log per gate and `.verify/summary.json`, and exits non-zero for a
  missing gate, signal, non-zero exit or unexpected skip. `npm run verify` uses
  the runner.
- **Tests Added:** Yes — `tests/verify-summary.test.mjs` covers parsed totals,
  signal/missing exits, skipped required gates, missing entries and formatting.
- **Gate output:** check, 956 tests (955 pass, 1 skipped, 0 fail), quality,
  build, HTTP 751 checks and recovery pass at `35c1d35`.
- **Limitation:** the full `npm run verify` chain was not executed end-to-end in
  this session because its mandatory `test:postgres` gate requires Docker or a
  disposable database (FID-126). Each other gate was run individually; CI
  declares the same chain.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** the release receipt is machine-readable and cannot mask a
  skipped or missing gate; raw logs remain the diagnostic evidence.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-136-verification-summary.md`.
