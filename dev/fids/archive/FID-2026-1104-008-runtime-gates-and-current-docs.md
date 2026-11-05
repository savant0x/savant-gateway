# FID: One runtime, one gate contract and current documentation

**Filename:** `FID-2026-1104-008-runtime-gates-and-current-docs.md`
**ID:** FID-2026-1104-008
**Severity:** medium
**Status:** closed
**Created:** 2026-11-04 17:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Three related claims drift from execution. `package.json` declares Node 22 while
CI and the workstation run Node 24. Local verify, CI and the pre-push hook each
carry a different gate list, and CI omits `storage:check` and `receipt:deploy`.
Current documentation and indices mix obsolete SQLite/Fly language and broken
paths with present instructions. The shared cause is a declared contract with no
executable check.

## Environment

- Windows; Node v24.21.0; Next.js 16.4.3; PostgreSQL.
- Repository HEAD `aef6730`.
- Baseline: release audit findings 10, 11 and 14.

## Detailed Description

### Problem

`package.json` has `engines.node: "22.x"`; `.github/workflows/ci.yml` and the
workstation run 24. Two workflows exist (CI and attribution), and the pre-push
hook adds gates the main CI job does not run. `scripts/verify.mjs` is a third
list.

`SCOPE.md:2559` and `CHANGELOG.md:1446` link
`../dev/audits/2026-10-31-a-z-quality-audit.md` from the repository root, which
resolves outside `dev/`. `knowledge.md` and several module headers retain
SQLite/Fly topology statements. `docs/README.md` labels historical files
correctly but has no executable check that current links resolve or that a new
doc is indexed.

### Expected Behavior

One supported runtime declared and enforced everywhere; one machine-readable gate
contract consumed by local verify, CI and pre-push; a repository check that
validates root-document links, FID registration and current-doc claims, with
historical docs explicitly labeled rather than rewritten.

### Root Cause

Gate lists and runtime policy are duplicated by hand, and documentation truth is
maintained by review only. Nothing fails when a list or a link drifts.

### Evidence

```text
package.json            engines.node 22.x
.github/workflows/ci.yml, .githooks/pre-push, scripts/verify.mjs  separate lists
SCOPE.md:2559, CHANGELOG.md:1446  ../dev/audits/... from repository root
docs/README.md          current vs historical labels, no link check
```

## Impact Assessment

### Affected Components

- `package.json`, `.github/workflows/ci.yml`, `.githooks/pre-push`,
  `scripts/verify.mjs`, `scripts/verify-summary.mjs`.
- `SCOPE.md`, `CHANGELOG.md`, `knowledge.md`, `docs/README.md`.

### Risk Level

- [x] Medium: reproducibility and trust in receipts; no runtime failure or data
  loss is asserted.

## Proposed Solution

1. **Operator runtime choice.** Pin Node 22 or 24 in `engines`, CI, Docker and
   docs. Prove a clean install and the full gate on the chosen version before
   closing; do not leave a declared range that no gate runs.
2. **One gate contract.** Export the ordered gate list from
   `scripts/verify-summary.mjs` and have `scripts/verify.mjs`, CI and pre-push
   consume it. Topology-specific setup may differ; the gate set may not. Add
   `storage:check` and `receipt:deploy` where they belong.
3. **Repository contract check.** Add one script that verifies active FID
   registration, ID uniqueness, allowed statuses, promised test paths, closure
   commit resolution, root-document link resolution and current-doc indexing.
   Wire it into `npm run verify`.
4. **Corrections, not rewrites.** Fix the two broken root-document links, label
   historical SQLite/Fly records with a dated banner, and keep the current index
   explicit. No historical receipt is rewritten as present truth.

### Verification

RED: CI and pre-push disagree on gates; the two root links do not resolve; the
declared runtime is not the one that runs. GREEN: one list consumed everywhere,
link check passes, a clean install and full gate pass on the pinned runtime.
The check must fail when a new active FID is missing from the register.

### YAGNI

No documentation generator, no new CI vendor, no rewrite of historical records.
One small script plus list extraction.

## Verification Gates

- gate: lint, typecheck, test, quality, build.
- gate: verify — `npm run verify:supabase`.
- gate: attribution — `npm run attribution`.

**Artifact:** `scripts/repository-contract-check.mjs` is implemented and wired as
`repository:check`, the fifth gate in `VERIFY_GATES`.

### Verification Receipt

- runtime: Node `v24.21.0`; `package.json`, `.nvmrc`, CI and `Dockerfile` all
  pin Node 24.
- clean install: `npm ci` exit 0 (488 packages, 1m); the subsequent gate run is
  the clean-install receipt.
- `npm run test:postgres` PASS — 4/4 tests, 0 skipped, against disposable
  PostgreSQL 17.6 on loopback (`gateway_verify`).
- `npm run test:http` PASS — main suite 776 checks; trial suite all checks,
  against disposable PostgreSQL (`gateway_http`).
- `npm run verify` PASS — 11/11 gates; `test` 1,019/1,019, 0 skipped; duration
  126.6s; receipt `.verify/summary.json`. The first full run exposed a trial
  reservation/settlement deadlock; it was fixed and is recorded in
  FID-2026-1104-014.
- `npm run check`, `npm run quality`, `npm run build`, `npm run storage:check`,
  `npm run config:check`, `npm run repository:check` and
  `npm run test:recovery` 14/14 all PASS.
- managed host: `npm run verify:supabase` was not run because the configured
  endpoint uses a self-signed chain and no trusted CA is configured; the gate
  was not weakened. The real-PostgreSQL receipt is a disposable localhost
  cluster, not a managed-host claim. Live TLS acceptance remains in
  `FID-2026-1104-007-LIVE`.

## Perfection Loop

### Loop 1 — RED

- **RED:** runtime mismatch, three gate lists, unresolved links, unindexed docs.
- **GREEN:** pinned runtime, one contract, executable repository check.
- **AUDIT:** the two links resolve outside `dev/` from the root; CI omits two
  declared gates.
- **ADVERSARIAL:** a shared list can still be skipped by a caller that does not
  fail closed. CI must assert the gate count and names, not just exit status.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Which runtime?** Operator choice. 22 matches the declaration; 24 matches
   current CI. Either is acceptable only when every surface runs it.
2. **Should historical docs be updated?** No; add a dated banner and a current
   index, preserving the record.
3. **Can the link check run without a build?** Yes; it is filesystem and text
   only, so it belongs before the expensive gates.
4. **Does `receipt:deploy` belong in CI?** Only where deployment metadata is
   available; otherwise run it in the deploy workflow and state why.

### Loop 2 — Independent audit and self-correction

- **RED:** a generated gate list could silently drop a gate removed by accident.
- **GREEN:** the contract names required gates and the summary asserts the count.
- **AUDIT:** `verify-summary.mjs` already models gate results and skips.
- **ADVERSARIAL:** documentation checks can become a second source of truth.
  The check should validate links and registration, not restate policy.
- **CHANGE DELTA:** 5%.

### Loop 3 — Final convergence

- **RED:** the repository check could pass while current docs still name SQLite.
- **GREEN:** add an explicit current-doc claim test for the selected topology.
- **AUDIT:** the check reads paths, not prose quality; manual review remains for
  meaning.
- **ADVERSARIAL:** a passing link check is not proof that a claim is true.
  Document that boundary in the check's output.
- **CHANGE DELTA:** 0%; converged before code.

## Implementation Evidence

Implemented in commit `941c60f`.

- Runtime: Node 24 selected; `package.json` `engines.node`, `.nvmrc`, CI and
  `Dockerfile` all match. `docs/project-status.md` already records Node 24.
- Gate contract: `VERIFY_GATES` in `scripts/verify-summary.mjs` now includes
  `repository:check`; `scripts/verify.mjs` iterates it, while CI and the
  pre-push hook call `npm run verify` instead of restating the list.
- Repository check: active FID registration and uniqueness, allowed active
  statuses, promised test paths for implemented records, archived closure
  commit resolution, root-document links, docs indexing and current-topology
  claims.
- Corrections: root links in `SCOPE.md` and `CHANGELOG.md`; historical SQLite/Fly
  banners and current wording; unindexed docs added to `docs/README.md`.

## Code Verification Evidence

- [x] Gate list is consumed, not duplicated by CI or pre-push.
- [x] The check fails on an unregistered active FID, a broken root link, an
  unindexed doc and the three stale current claims it names.
- [x] A passing check is documented as path/link validation, not prose review.
- [x] Status reflects reality: `closed` with the clean-install, full-gate and
  real-PostgreSQL receipts recorded above.

## Resolution

- **Convergence Date:** 2026-11-04 17:10
- **Commit:** `941c60f`
- **Closure Date:** 2026-11-04
- **Verification:** clean `npm ci` and full `npm run verify` PASS on Node 24
  against disposable PostgreSQL 17.6; 11/11 gates, 1,019/1,019 tests, 0
  skipped, two-connection proof 4/4, 776 main HTTP checks plus the trial suite,
  and recovery 14/14. The managed `verify:supabase` wrapper remains unrun
  because no trusted CA is configured for its self-signed chain; live TLS
  acceptance stays in `FID-2026-1104-007-LIVE`.
- **Next action:** none for this record. The trial deadlock found during the
  first full run is fixed in `FID-2026-1104-014`.
- **Archived:** 2026-11-04; moved to `dev/fids/archive/`.

## Lessons Learned

A declared contract with no executable check is documentation, not a guarantee.
