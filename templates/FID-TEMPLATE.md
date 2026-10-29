# FID: [Short Description]

**Filename:** `FID-YYYY-MMDD-NNN-[short-description].md`
**ID:** FID-YYYY-MMDD-NNN
**Severity:** critical | high | medium | low
**Status:** created | analyzed | fixed | verified | converged | closed
> (`converged` is the correct pre-implementation status per
> FID-2026-0915-004; `fixed` is deprecated-but-accepted legacy language —
> do not use it for new FIDs. The receipt contract still keys to
> `fixed | verified` so archived records remain valid.)
**Created:** YYYY-MM-DD HH:MM
**Automation level:** 1 | 2 | 3
> (Authority this FID needs to be actioned **without asking**: `1` approval-gated,
> `2` within approved scope, `3` fully automatable. The session ceiling is
> `protocol.config.yaml` → `session.autonomy_level`; an item is actioned without
> approval only when its level is ≤ the session level. No level lifts the G-laws,
> credential handling, Law 3, or the project-directory boundary — see
> "Automation Levels" in the governing protocol.)
**YAGNI-Compliance:** Pending | Verified | Debt-Incurred

> **Project application (savant-gateway).** This repository uses npm, not Bun,
> and it does **not** ship `fid:verify`, `quality:report` beyond
> `npm run quality`, `scope:check`, or `validate:repository`. The gates that
> actually exist are declared in `protocol.config.yaml` and repeated below.
> FID closure is checked by review against this template, the gate output, and
> the commit recorded in the FID. `implemented` is a step status, never a FID
> status. Use `converged` before implementation and close only after the code,
> the gates, and a local commit exist.

---

## Summary

One-paragraph description of the finding.

## Environment

- **OS:** [OS and version]
- **Language/Runtime:** [Language and version]
- **Tool Versions:** [Relevant tool versions]
- **Commit/State:** [Git SHA or state description]

## Detailed Description

### Problem

What is the issue? What behavior was observed?

### Expected Behavior

What should happen instead?

### Root Cause

What is the underlying cause?

### Evidence

Include logs, screenshots, code snippets, or test output.

```text
[Paste evidence here]
```

## Impact Assessment

### Affected Components

- [Component 1]
- [Component 2]

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [ ] High: Major feature broken, no workaround
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

## Proposed Solution

### Approach

How should this be fixed?

### Steps

1. [Step 1]
2. [Step 2]
3. [Step 3]

### Verification

How will we confirm the fix works?

> Every promised test artifact must name its repo-relative
> `tests/*.test.mjs` path, and that path must also appear under Verification
> Gates. This project has no stamping tool; the reviewer checks that every
> promised test exists and actually ran (`node --test tests/` runs all of them).

## Verification Gates

Declare the gates that prove this FID's claimed verification against the
current tree. Use the exact commands from `protocol.config.yaml`:

- `- gate: lint` — `npm run lint`, zero warnings.
- `- gate: typecheck` — `npm run typecheck`.
- `- gate: test tests/http.test.mjs` — one line per test file, using the real
  repo-relative path. `npm test` runs the whole directory.
- `- gate: quality` — `npm run quality`; mandatory for any FID that touches
  `app/`, `components/`, `config/`, or `lib/`.
- `- gate: build` — `npm run build`.
- `- gate: verify` — `npm run verify`, when the full set is claimed.

Record a receipt with the date, each command, its exit code, and the relevant
output. There is no fingerprint tool: the paste and the commit are the
receipt. Any edit after verification means the evidence is historical and must
be re-run before the claim is repeated.

```markdown
## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/http.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: YYYY-MM-DDTHH:MM:SSZ
- lint: exit 0
- typecheck: exit 0
- test tests/http.test.mjs: exit 0
- quality: exit 0 (400-line ceiling)
- build: exit 0
```

## Perfection Loop

### Loop 1 — RED

- **RED:** [Issues identified]
- **GREEN:** [Fixes applied]
- **AUDIT:** [Verification results]
- **ADVERSARIAL:** [Independent challenge]
- **CHANGE DELTA:** [Percentage of FID text changed]

### Missed Questions

> Surface every question that should have been asked when this FID was created, answer it with the most robust default
> derivable from inspection, and fold the answer back into the relevant sections.

1. [Missed question → answer]
2. [Missed question → answer]

### Implementation Evidence (REQUIRED for `closed`)

> A FID **cannot** be set to `closed` without this section filled. No silent
> deferrals — every step must be `implemented`, `blocked`, or `deferred`
> (operator-approved only).

- [ ] **Commit SHA:** The exact commit(s) where implementation landed
- [ ] **File:line ranges:** Specific files and line numbers of the key changes
- [ ] **Gate output:** Pasted output from typecheck/tests/lint proving the implementation is clean
- [ ] **Reproducibility:** Another agent can grep for the changes and find matches in the working tree
- [ ] **Step statuses:** Every Proposed Solution step is marked `implemented`, `blocked`, or `deferred` (operator-approved)

### Code Verification Evidence

> Before marking status as `fixed` or `verified`, verify that referenced code exists. FID metadata is a claim; code is
> ground truth.

- [ ] Files referenced in Affected Components exist
- [ ] Implementation matches the Proposed Solution
- [ ] Typecheck/tests/lint pass with pasted tool output
- [ ] Production call-graph evidence is present for new or repaired wiring
- [ ] FID status reflects the actual implementation state

> Every PASS and FAIL in AUDIT cites `path/to/file.ts:LINE` plus quoted code or exact command output. Absence-shaped
> checks paste the exact search and mark out-of-reach evidence `NEEDS-REVIEW`.

### Loop 2 — Independent audit and self-correction

- **RED:** [Remaining issues]
- **GREEN:** [Corrections applied]
- **AUDIT:** [Independent evidence]
- **ADVERSARIAL:** [Residual challenge]
- **CHANGE DELTA:** [Percentage]

### Loop 3 — Final convergence

- **RED:** [Final risks]
- **GREEN:** [Final corrections]
- **AUDIT:** [Final independent evidence]
- **ADVERSARIAL:** [Final challenge]
- **CHANGE DELTA:** [Percentage]

## Resolution

- **Closed Date:** YYYY-MM-DD HH:MM (set when closure is independently verified)
- **Fix Description:** [What was changed]
- **Tests Added:** [Yes/No — describe]
- **Verification Evidence:** [Commands and results]
- **Archived:** YYYY-MM-DD HH:MM (set when moved to `dev/fids/archive/`)

> When status is set to **closed**, move this file to `dev/fids/archive/` and append an entry to `CHANGELOG.md`.

## Lessons Learned

What can we learn from this finding and how can we prevent similar issues?
