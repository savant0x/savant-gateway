# FID: Strengthen No-Agent-Attribution Enforcement

**Filename:** `FID-2026-1102-108-no-agent-attribution-enforcement-retrofit.md`
**ID:** FID-2026-1102-108
**Severity:** high
**Status:** verified
**Created:** 2026-11-02 00:00
**Automation level:** 3
**YAGNI-Compliance:** Verified

> Implementation is present in the working tree. The FID remains open until
> its commit and archive move.

---

## Summary

The gateway already has a partial no-coding-agent-attribution guard wired
through `package.json`, commit hooks, pre-push, and CI. Its enforcement is
narrower than Savant-Code's native system: it scans commit history or a commit
message, but does not scan governed Markdown records, does not centralize the
pattern vocabulary, and can report false positives for any robot emoji. This
FID defines a gateway-native retrofit that extracts Savant's enforcement idea
without importing Bun, TypeScript, workspace assumptions, or Savant-specific
paths. The implementation is recorded below and has passed its declared gates.

## Environment

- **OS:** Windows 10/11 host; hooks and CI must remain portable to Bash/Linux
- **Language/Runtime:** Node.js ESM, Node `>=22.18.0`, npm
- **Tool Versions:** ESLint 9, TypeScript 5.9, Node test runner, Next.js 16
- **Commit/State:** Gateway `main`; the working tree carries this retrofit and
  unrelated pre-existing changes committed separately

## Detailed Description

### Problem

The gateway's current `scripts/attribution-guard.mjs` detects selected agent
names in commit history and generated/co-author lines. The existing setup is
already wired by:

- `package.json:12-36` — `prepare` installs `.githooks`
- `.githooks/commit-msg:19` — commit-message guard
- `.githooks/pre-push:24-32` — pre-push guard plus project gates
- `.github/workflows/attribution-guard.yml:11-23` — full-history CI guard
- `protocol.config.yaml:106-114` — declared policy and enforcement points

The current guard does not match the stronger Savant design at
`savant-code/scripts/attribution-guard.ts`,
`savant-code/scripts/attribution-patterns.ts`, and
`savant-code/scripts/attribution-document-guard.ts`:

1. No governed-document scan exists for FIDs, session summaries, changelogs,
   or root governance records.
2. Pattern definitions and scanning behavior are combined in one small script,
   making drift likely as the gateway grows.
3. Any line containing `🤖` is reported, including quoted or ordinary prose.
4. The guard has no explicit range mode for the exact pushed commit range.
5. There is no focused gateway test suite for false positives, document fields,
   fenced blocks, or inline code spans.

### Expected Behavior

After the implementation recorded in this FID:

- no coding agent, agent vendor, bot, assistant, or harness may receive credit
  in gateway commit metadata or governed project records;
- the same canonical pattern vocabulary is used by commit and document scans;
- commit-message, exact-range, full-history, and document scans fail closed;
- legal/source/product attribution remains allowed where it is not coding-agent
  credit;
- quoted examples in fenced blocks and inline code are not falsely reported;
- all enforcement paths remain reachable from npm scripts, hooks, CI, and the
  repository's declared governance configuration.

### Root Cause

The gateway was bootstrapped with a minimal history/message guard before the
Savant document-surface guard and shared pattern architecture were available.
The resulting implementation is not missing a hook; it is missing the second
governed surface and a shared, context-aware scanning contract.

### Evidence

```text
Gateway package.json: scripts 12-36
Gateway scripts/attribution-guard.mjs: 1-61
Gateway .githooks/commit-msg: 1-19
Gateway .githooks/pre-push: 1-34
Gateway .github/workflows/attribution-guard.yml: 1-23
Gateway protocol.config.yaml: 106-114

Savant reference:
Savant scripts/attribution-guard.ts: 19-27, 84-141, 168-239
Savant scripts/attribution-patterns.ts: 21-141
Savant scripts/attribution-document-guard.ts: 15-31, 46-131, 176-232
```

## Impact Assessment

### Affected Components

- `package.json` script surface and existing `prepare` setup
- `scripts/attribution-guard.mjs`
- New gateway attribution pattern/document modules
- `.githooks/commit-msg`
- `.githooks/pre-push`
- `.github/workflows/attribution-guard.yml`
- `protocol.config.yaml`
- New attribution-focused tests under `tests/`
- Governed records under `dev/`, `docs/`, and selected root Markdown files

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: Permanent repository credit leakage or false enforcement at a
  repository boundary
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

## Proposed Solution

### Approach

Extract the invariant from Savant rather than copying its implementation:
one fail-closed attribution policy, one shared vocabulary, separate commit and
document scanning surfaces, explicit context masking, and independent tests.
Implement it in gateway-native Node ESM using the repository's existing npm
commands and file layout.

The implementation must preserve the gateway's legitimate domain attribution,
including source authors, benchmark/legal notices, provider data attribution,
and the public gateway owner. It must not treat the no-agent-credit policy as a
ban on all uses of the word “attribution.”

### Steps

1. **implemented — RED evidence:** Record the current gateway and Savant
   comparison, existing enforcement call graph, dirty-tree boundary, and exact
   source evidence in this FID.
2. **implemented — GREEN design:** Define a Node-native shared pattern module,
   a document scanner with fence/inline-code masking, explicit CLI modes, and
   gateway-specific governed paths. Do not add Bun or Savant workspace logic.
3. **implemented — AUDIT contract:** Require focused tests plus `npm run check`,
   `npm test`, `npm run quality`, and `npm run build` for implementation. Require
   actual hook, CI, package-script, and document-scan reachability evidence.
4. **implemented — ADVERSARIAL review:** Reject 1:1 copying, broad emoji
   matching, prompt-only enforcement, silent false-positive exemptions, and
   claims that a clean build proves hook or CI behavior.
5. **implemented — implementation:** Added shared patterns, the commit/range/
   history guard, the governed-document scanner with fence and inline-code
   masking, hook and CI wiring, and focused tests.

### Verification

`tests/attribution-guard.test.mjs` exercises credit detection, vendor-prose
false positives, fenced and inline-code masking, emoji handling, governed-path
inclusion/exclusion, and the message-file CLI. The shell paths are exercised
for exact-range, invalid-range, full-history, and document modes.

## Verification Gates

- `- gate: lint` — `npm run lint`
- `- gate: typecheck` — `npm run typecheck`
- `- gate: test` — `npm test`, including `tests/attribution-guard.test.mjs`
- `- gate: quality` — `npm run quality`
- `- gate: build` — `npm run build`
- `- gate: attribution` — `node scripts/attribution-guard.mjs --all` and the
  document-scan mode

### Verification Receipt

- verified: 2026-11-02T21:19:34Z
- lint: exit 0 (zero warnings)
- typecheck: exit 0
- test focused: exit 0 (5 attribution tests, 5 pass)
- test full: exit 0 (829 tests, 828 pass, 1 skipped)
- quality: exit 0 (PASS, 531 files scanned)
- build: exit 0 (Next.js production build)
- attribution full history: exit 0
- attribution exact range: exit 0 (`HEAD~1..HEAD`)
- attribution invalid range: exit 2 (fails closed)
- attribution governed documents: exit 0
- message-file CLI: exit 1 on a credit line, exit 0 without one
- not verified: a real GitHub Actions run and a push from a second clone

## Perfection Loop

### Loop 1 — RED

- **RED:** The gateway already has attribution enforcement, so blindly copying
  Savant would duplicate policy and risk breaking the gateway's npm/Node model.
  The actual gap is document-surface coverage, shared pattern ownership,
  context-aware matching, and focused tests. Existing dirty changes require
  path-scoped future edits.
- **GREEN:** The FID defines extraction of the policy invariant into gateway
  modules, with explicit preservation of domain/legal attribution and no change
  to application behavior.
- **AUDIT:** Source evidence confirms the existing package, hook, CI, and config
  wiring. Savant evidence confirms the reference architecture. No implementation
  gate is claimed.
- **ADVERSARIAL:** A minimal history-only guard can pass while an FID or session
  record credits an agent. Conversely, a naïve emoji or vendor scan can block
  legitimate prose. The proposed context-aware document contract addresses both
  failure modes.
- **CHANGE DELTA:** Initial FID construction; no prior FID baseline.

### Loop 2 — Independent audit and self-correction

- **RED:** The first design could be misread as authorizing implementation and
  could overstate the exact future file set.
- **GREEN:** The FID explicitly marks implementation as blocked by the current
  operator instruction, labels future gates as unrun, and keeps the proposed
  paths architectural rather than claiming new files exist.
- **AUDIT:** The current tree contains `scripts/attribution-guard.mjs` but no
  gateway attribution test suite or additional attribution module, confirming
  that implementation claims would be false.
- **ADVERSARIAL:** The proposed document scan must not scan third-party content
  indiscriminately. Future implementation must define governed roots and
  exclusion rules, with tests for quotations and source/legal attribution.
- **CHANGE DELTA:** Minor clarification pass; below the 10% per-pass FID limit.

### Loop 3 — Final convergence

- **RED:** The first implementation could count any vendor mention as credit and
  could miss a credit hidden in an FID or session record.
- **GREEN:** The implementation uses credit-cue-plus-agent matching, masks code
  before scanning, excludes research copies, and wires the document surface into
  the pre-push hook and CI. FID status is `verified`, not yet `closed`.
- **AUDIT:** `npm run lint`, `npm run typecheck`, the full unit suite, quality and
  build pass. The message, range, history and document modes were exercised.
- **ADVERSARIAL:** A manual `--range` still depends on the local `origin/main`
  ref; the hook falls back to full history when that ref is absent. The CI
  workflow is the independent full-history check.

### Missed Questions

1. **Does the gateway need Savant's Bun scripts?** No. The gateway is Node/npm;
   only the enforcement invariant and tested behavior should be adapted.
2. **Does `package.json` alone provide the feature?** No. It only exposes setup
   and commands; the guard, document scanner, hooks, CI, and tests are the
   behavior.
3. **Should all attribution be prohibited?** No. The rule concerns coding-agent
   credit. Human, source, legal, provider, and product attribution remain valid.
4. **Does this FID authorize implementation?** The operator explicitly
   authorized the retrofit after convergence; the implementation and its
   receipt are recorded here.
5. **Can a passing commit-history scan prove the repository is clean?** No. The
   governed document surface must also be scanned and failures must fail closed.

## Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** recorded by the implementation commit; this FID moves to
  `dev/fids/archive/` when that commit is made
- [x] **File:line ranges:** `scripts/attribution-patterns.mjs:1-`,
  `scripts/attribution-guard.mjs:1-`, `scripts/attribution-document-guard.mjs:1-`,
  `.githooks/pre-push`, `.github/workflows/attribution-guard.yml`,
  `package.json`, and `protocol.config.yaml`
- [x] **Gate output:** recorded in the Verification Receipt above
- [x] **Reproducibility:** `npm run attribution` and
  `node --test tests/attribution-guard.test.mjs` reproduce both surfaces
- [x] **Step statuses:** steps 1–5 implemented

## Code Verification Evidence

- [x] Files referenced in the current-state evidence exist.
- [x] Existing guard paths are reachable from `prepare`, commit-msg, pre-push,
  CI, and protocol configuration.
- [x] Implementation paths are wired from `package.json`, the commit-msg hook,
  the pre-push hook, and GitHub Actions.
- [x] Focused tests and all declared gates passed; the receipt above records
  the commands and their exit status.
- [ ] A real GitHub Actions run remains to be observed after the push.

## Resolution

- **Closed Date:** pending the implementation commit and archive move
- **Fix Description:** shared credit patterns, explicit guard modes, governed
  document scanning with code masking, hook/CI wiring, and focused tests
- **Tests Added:** Yes — `tests/attribution-guard.test.mjs`
- **Verification Evidence:** see the Verification Receipt above
- **Archived:** not yet; active until the commit is recorded and this record is
  moved to `dev/fids/archive/`

## Lessons Learned

An enforcement feature is a call graph, not a package script. The gateway
already had a functioning first layer, so the correct retrofit is to strengthen
its governed surfaces and false-positive behavior while retaining Node/npm and
the gateway's own attribution semantics.
