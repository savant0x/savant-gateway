# FID: Release audit and guard integrity

**Filename:** `FID-2026-1104-001-release-audit-and-guard-integrity.md`
**ID:** FID-2026-1104-001
**Severity:** high
**Status:** verified
**Created:** 2026-11-04
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The release audit reproduced false passes in the launch receipt and verification
summary. An approval naming another SHA passes when the receipt's top-level SHA
matches HEAD; a required test gate with no test output passes on exit zero.
The baseline lint command also exits zero with six warnings despite the declared
zero-warning policy. Repair these bounded guard gaps and publish the wider audit.

## Environment

- OS: Windows; runtime Node v24.21.0, npm 12.2.1.
- Baseline: `d0c7861`; single-agent ECHO, strict, autonomy level 3.

## Detailed Description

### Problem and expected behavior

Approval, pinned receipt and HEAD must agree. Required test evidence must contain
a nonempty, internally consistent summary with zero failed/cancelled tests.
Lint warnings must fail every invocation of the shared lint script.

### Root Cause

`lib/launch-receipt.ts` validates approval SHA syntax but never compares it.
`scripts/verify-summary.mjs` declares `expectsTests` without enforcing it;
`scripts/verify.mjs` does not forward that field. `package.json` runs `eslint .`
without a warning ceiling.

### Evidence

Read-only probes on 2026-11-04 returned:

```text
Mismatched approval commit: {"status":"pass","missing":[],"failed":[],"leaks":[],"reasons":[]}
No test evidence: {"name":"test:postgres","status":"pass","exitCode":0,"tests":null}
Baseline lint: 6 problems (0 errors, 6 warnings); exit 0.
```

## Impact Assessment

Affected: receipt validator, shared lint command, verification summary/runner,
their existing tests, scope and audit records. No offering, runtime database,
external acceptance or deployment decision changes.

- [x] High: release evidence can report a false pass.

## Proposed Solution

1. Require approval SHA to match pinned SHA and HEAD; return stale on mismatch.
2. Resolve required test metadata from the gate registry and forward it from
   the runner. Reject missing, zero, inconsistent, failed or cancelled summaries;
   preserve explicit skip refusal and tolerate Node's spec and TAP reporters.
3. Add `--max-warnings=0` to lint and directly correct the six reported warnings.
4. Publish the audit with current verification, prioritized product proposals,
   evidence limits and explicit operator-owned release conditions. Correct exact
   active-FID scope registration and missing historical commit references.

Steps 1–3: implemented and verified. Step 4: report written; final load receipt
and documentary closure follow in the audit slice.

### Verification

Extend `tests/launch-receipt.test.mjs` for independent approval SHA mismatch.
Extend `tests/verify-summary.test.mjs` for absent/empty/failed/cancelled/inconsistent
summaries and TAP output; repair its existing inconsistent fixture (12 tests,
11 pass, zero skips) rather than accommodating false evidence.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: test tests/launch-receipt.test.mjs
- gate: test tests/verify-summary.test.mjs
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify:supabase` invokes the configured full gate on
  a generated disposable database; production is never the test target.
- gate: attribution — `npm run attribution`.

## Perfection Loop

### Loop 1 — RED / GREEN / AUDIT / ADVERSARIAL

- RED: exact probes above demonstrate two false passes and nonblocking warnings.
- GREEN: enforce existing intent at the shared authorities, with regressions.
- AUDIT: `scripts/launch-receipt.mjs` calls `evaluateReceipt`; `scripts/verify.mjs`
  calls `gateResult`; CI and pre-push invoke the package lint script.
- ADVERSARIAL: approval can be stale independently of the top-level pin; zero
  tests and synthetic nonzero totals must not satisfy proof; TAP output differs
  when subprocess stdout is piped. No tests depend on external observations.
- CHANGE DELTA: initial document; no implementation yet.

### Missed Questions

1. Does no test summary mean no tests? It means missing evidence, so fail closed.
2. Does a passing receipt authorize launch? No; real evidence and the operator
   remain the boundary, and no receipt will be created here.
3. Are product suggestions delivered features? No; the report marks them as
   proposals with measurable acceptance criteria.

### Loop 2 — Independent audit and self-correction

- RED: inspected reporter format and existing test fixture assumptions.
- GREEN: include TAP and spec output and exact total consistency in the design.
- AUDIT: registry, runner and both test modules were read completely; tests
  remain within the existing `npm test` glob.
- ADVERSARIAL: a non-test build needs no test summary; required gates do.
- CHANGE DELTA: 0% after reviewing this complete design.

### Loop 3 — Final convergence

- RED: no additional design correction found.
- GREEN: preserve the limited guard changes and evidence-backed report.
- AUDIT: no new route, store, duplicated validator or release authority.
- ADVERSARIAL: reject invalid evidence rather than claiming observed acceptance.
- CHANGE DELTA: 0%; document converged before implementation.

## Implementation Evidence

`npm run verify:supabase`: exit 0, 2026-11-04T14:57:28Z, 272.1s; all ten gates
PASS, 980/980 tests, 2/2 PostgreSQL proofs, zero skips, lint zero warnings.
Focused guard tests: 15/15. Commit and final report closure follow verification.

## Code Verification Evidence

The affected production files and existing test modules exist and were read.
The probes reproduce the defects; repaired behavior is not claimed yet.

## Resolution

Open implementation under the converged design. Audit report is a deliverable,
not a release authorization or a claim that every source file was read.

## Lessons Learned

Declared gate metadata must be consumed, and duplicated commit fields must be
compared, rather than validated independently.
