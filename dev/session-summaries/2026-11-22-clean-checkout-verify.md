# Full verification from a clean checkout of main

Operator instruction: "Do a full clean-checkout verification of `main` in a scratch
worktree to confirm every gate passes without untracked files." Automation level 3;
strict; single agent. Verification pass: no application code, schema, configuration,
price or test was changed. The only artifacts are this receipt and its evidence copies.

## Method

- Commit verified: `fbe43b7` (`docs(fids): reconcile register rows and record bodies
  with commits (FID-2026-1104-018)`), the tip of `main`.
- Checkout: `git worktree add --detach .scratch/verify-head HEAD`. `git status --short`
  in the worktree was **empty** before the run — no modified, staged or untracked file.
- Dependencies: `npm ci` from the committed lockfile, exit 0. npm 12.2.1 blocked three
  package install scripts (`@embedded-postgres/windows-x64` postinstall,
  `better-sqlite3` rebuild, `unrs-resolver` postinstall) because they are not covered by
  `allowScripts`. This did not matter: the pinned PostgreSQL 17 binaries ship inside the
  package (`native/bin/initdb.exe` present) and `test:postgres` passed below.
- Gate run: `npm run verify`, exit 0.
- `git diff --stat main .scratch/verify-head` is empty, so the worktree tree is byte-identical
  to the tree of `main` at that commit.

## Receipt

- Result: **PASS**, 12/12 gates, 173.2 s (2026-11-22T16:01:06Z to 16:04:00Z).
- Process exit: `VERIFY_EXIT=0`.
- `status: pass`, `missingGates: []`, `failedGates: []`, `skippedGates: []`.
- Evidence: `summary.json` plus gate logs copied to
  `.verify/clean-checkout-fbe43b7/` (ignored by git, as all `.verify/` output is).

| Gate | Status | Duration | Measured |
| --- | --- | --- | --- |
| `check` (lint + typegen + typecheck) | PASS, exit 0 | 23.3 s | zero warnings |
| `storage:check` | PASS, exit 0 | 0.3 s | — |
| `config:check` | PASS, exit 0 | 0.3 s | non-production |
| `repository:check` | PASS, exit 0 | 3.3 s | 12 gates, 12 active FIDs |
| `test` | PASS, exit 0 | 86.9 s | 1,191/1,191, **0 skipped** |
| `test:postgres` | PASS, exit 0 | 8.0 s | 20/20, **0 skipped** |
| `quality` | PASS, exit 0 | 0.4 s | 400-line ceiling |
| `build` | PASS, exit 0 | 16.6 s | — |
| `test:visual-builds-browser` | PASS, exit 0 | 13.8 s | — |
| `test:http` | PASS, exit 0 | 8.5 s | both suites |
| `test:recovery` | PASS, exit 0 | 11.3 s | — |
| `deployment:receipt` | PASS, exit 0 | 0.5 s | — |

`git status --short` in the worktree was **empty again after the run**: `npm run verify`
wrote only ignored paths (`.next/`, `.verify/`, `.scratch/`, `tsconfig.tsbuildinfo`), so
the checkout stayed clean and the result is attributable to the commit alone.

## What this proves

Every declared gate passes on exactly the committed tree, with no untracked file able to
supply a missing module — the condition that hid the omitted
`scripts/identity-calibration-proxy.mjs` before `3c4975d`. The suite runs without skips
because `verify` supplies the disposable PostgreSQL handle the 16 environment-gated cases
need.

## What this does not prove

- It is local. No hosted Vercel deployment, live upstream call, real payment settlement or
  operator acceptance was exercised.
- `test:load` was not run: it is deliberately outside `verify` and is an approval-gated
  release measurement (`npm run test:load:accept`).
- Launch readiness is unchanged: FID-2026-1103-127 still needs the operator's dated
  payment, recovery, alert, load and rollback observations and a go pinned to a release SHA.
- The concurrency and content proofs ran against the disposable cluster this run created;
  no managed or production database was touched.

## Observation, not a failure

`verify.mjs` emitted Node's `DEP0190` deprecation warning ("Passing args to a child process
with shell option true…"). It did not affect any gate: all twelve exited 0. It is recorded
here rather than changed, because altering the verification harness is a separate code
change that needs its own record.
