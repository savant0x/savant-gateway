# FID: [Short Description]

**Filename:** `FID-YYYY-MMDD-NNN-short-description.md`
**ID:** FID-YYYY-MMDD-NNN
**Severity:** critical | high | medium | low
**Status:** created | analyzed | converged | verified | closed
**Created:** YYYY-MM-DD HH:MM (actual time; never invent historical time)
**Automation level:** 1 | 2 | 3
**YAGNI-Compliance:** Pending | Verified | Debt-Incurred

Reference structure: `C:/Users/spenc/dev/savant-code/templates/FID-TEMPLATE.md`,
read 2026-10-28. This project uses npm and `protocol.config.yaml`; Savant's Bun
workspace gates and fingerprint tooling are not installed here. `fixed` is an
accepted legacy status, not a status for new plans. `implemented` is a step
status, never a FID status. Use `converged` before implementation; close and
archive only after implementation, actual verification and a local commit.

## Summary

Describe the observed finding and desired result in one paragraph.

## Environment

- **OS:** actual platform/version.
- **Language/Runtime:** installed language/runtime versions.
- **Tool Versions:** relevant installed tools.
- **Commit/State:** exact Git SHA and relevant pre-existing working changes.

## Detailed Description

### Problem

Describe observed behavior, including the failing case.

### Expected Behavior

Describe the behavior the implementation must establish.

### Root Cause

Explain the mechanism and evidence distinguishing it from other hypotheses.

### Evidence

Paste actual command output or current `file:line` with quoted code. Identify
historical evidence by date. Absence claims include the exact search command
and its exit/result. Mark inaccessible evidence `NEEDS-REVIEW`.

## Impact Assessment

### Affected Components

List real paths and production entry points, data/migration impact and dependencies.

### Risk Level

Select the matching severity and explain the consequence and containment.

- [ ] Critical: crash, data loss or security vulnerability.
- [ ] High: major feature broken.
- [ ] Medium: degraded behavior or missing verification.
- [ ] Low: minor or cosmetic issue.

## Proposed Solution

### Approach

Search for existing helpers first. Explain reuse, alternatives and robust
defaults. Address all applicable Five Questions in the governing protocol;
state concrete limits rather than claiming untested scale or security.

### Steps

Number each action. Before implementation identify it as planned. At closure
each is `implemented` or `blocked`; only a dated, verbatim operator ruling
can authorize a different disposition. A blocked step never means completed.

### Verification

Name existing tests/probes or exact new artifact paths. Every promised artifact
must exist and be exercised by a declared gate before verification is claimed.
Include failure, boundary and production-call tests, not only successful input.

## Verification Gates

List exact commands from `protocol.config.yaml` and applicable existing checks:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build` (includes contrast)
- `npm run progression` when progression/shared helpers are affected.
- `npm run balance` when economy calibration is affected.
- Exact feature test commands and environment, including an isolated database
  for any mutation test. Never run the world-resetting golden path on the save.
- Current source/call-graph searches and explicit document checks.

This project has `fid:verify`, `quality:report`, `scope:check` and
`validate:repository` commands. The verifier accepts an `echo-contract` with
registered gates, durable tests, production evidence/callers and a real commit.
Read `scripts/lib/{fid-contract,gate-registry}.ts` before declaring one. New
feature probes must be registered and runnable before a verification receipt
can claim them. `created`, `analyzed`, `converged` and `fixed` checks validate
planning structure only; they do not run implementation gates. Never create
a pretend fingerprint or point receipt tests at scratch artifacts. The build
gate registry and `npm run build` have distinct command lists; record which ran.

### Verification Receipt

Record execution date, exact commands, exit codes and relevant pasted output.
Distinguish fresh checks from historical browser/HTTP evidence and missing
checks. A closed historical receipt does not guarantee the current bytes.

## Perfection Loop

The loop audits this document before code. Initial authoring creates the baseline;
subsequent corrective passes have a measured character edit distance of at most
10% of the preceding document. Convergence needs two stable passes below 2%,
with no actionable plan findings. Maximum ten passes; escalate oscillation.
Receipt-only additions after implementation do not establish earlier convergence.

### Loop 1 — RED

- **RED:** observed defects with exact output or source quotes.
- **GREEN:** proposed changes and answered questions.
- **AUDIT:** static checks and independent manual challenge of the plan.
- **ADVERSARIAL:** failure/boundary/security and wiring counterexamples.
- **CHANGE DELTA:** baseline or measured change percentage with method.

### Missed Questions

List each overlooked question, answer from inspection, and incorporate the
answer in the solution. Cover ownership, retries, concurrency, migration,
failure handling, observability and honest UI claims where applicable.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] **Commit SHA:** exact existing implementation commit(s).
- [ ] **File:line ranges:** current key paths, lines and quoted implementation.
- [ ] **Gate output:** actual command output and exit codes.
- [ ] **Reproducibility:** exact searches and runtime commands/environment.
- [ ] **Step statuses:** every solution step accounted for.

### Code Verification Evidence

- [ ] Affected paths exist.
- [ ] Code matches the final solution, including documented corrections.
- [ ] Declared gates pass with output; missing gates are stated honestly.
- [ ] New/repaired production wiring has actual caller matches.
- [ ] FID status reflects code and verification rather than the original plan.

### Loop 2 — Independent audit and self-correction

- **RED:** remaining findings.
- **GREEN:** corrections or explicit absence of required corrections.
- **AUDIT:** evidence from a different method.
- **ADVERSARIAL:** strongest remaining counterexample and result.
- **CHANGE DELTA:** actual measured percentage; never an invented value.

### Loop 3 — Final convergence

- **RED:** final risks.
- **GREEN:** final corrections or unchanged stable plan.
- **AUDIT:** repeat independent review with actual evidence.
- **ADVERSARIAL:** unresolved limits and what verification does not prove.
- **CHANGE DELTA:** actual measured percentage and convergence decision.

## Resolution

- **Closed Date:** actual closure date/time; unknown historical time stays unknown.
- **Fix Description:** resulting behavior and limits.
- **Tests Added:** actual new/existing test paths and whether they ran.
- **Verification Evidence:** commands, outputs and dates.
- **Archived:** actual move date; do not invent a historical timestamp.

Move a verified closed FID to `dev/fids/archive/`, add CHANGELOG evidence and
record closure in the session summary. Never leave a closed FID in the active
directory. Preserve historical violations; a retrospective audit cannot make
an earlier scripted edit or implementation-before-plan compliant.

## Lessons Learned

Record the failure mechanism and the prevention rule, without attribution.
