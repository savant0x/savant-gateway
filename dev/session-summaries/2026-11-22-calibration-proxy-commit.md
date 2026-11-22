# Committed the loopback calibration proxy (FID-2026-1122-001)

Operator instruction: "Fix the missing committed calibration proxy: register the
work item and commit `scripts/identity-calibration-proxy.mjs` so a clean clone of
`main` passes `npm test`." Automation level 3; strict; single agent.

## Initial state

- `main` at `15b41fa` (docs(fids): pin the InferHub sync receipt to its commit).
- Working tree held two untracked files: `scripts/identity-calibration-proxy.mjs`
  and `dev/session-summaries/2026-11-13-full-verify-at-head.md`.
- No source line was edited during this session. The whole change is a commit of
  an existing, verified artifact plus the records that own it.

## Finding

`tests/identity-calibration-proxy.test.mjs:21` imports
`../scripts/identity-calibration-proxy.mjs`. Commit `495e8b3` — the InferHub
free-pool gate, FID-2026-1120-001 — added that test along with
`lib/identity/calibration/arms.ts` and `lib/identity/calibration/proxy.ts` from
FID-2026-1110-002 step 4, and left the script itself untracked and unignored.
`git cat-file -e HEAD:scripts/identity-calibration-proxy.mjs` exited 128 at
`15b41fa`, so a clean checkout of `main` would fail the declared test gate. The
1,191-test verify receipt on disk was sound only for a tree that held the
untracked file.

## Commits

- `3c4975d` — `fix(calibration): commit the loopback calibration proxy
  (FID-2026-1122-001)`. Adds the 299-line script; registers the new FID,
  corrects the register counts (180 → 181 archived, 193 → 194 allocated, 13
  active) and the FID-2026-1110-002 next-action row; adds the `SCOPE.md` session
  item `CP1`; appends the changelog entry.
- `7b88c4e` — `docs(fids): close FID-2026-1122-001 at 3c4975d
  (FID-2026-1122-001)`. Fills the verification receipt, moves the record to
  `dev/fids/archive/`, returns the counts to 12 active / 182 archived / 194
  allocated and adds the closure paragraph to the register.

## Verification

Run in the working tree before the fix commit:

| Gate | Result |
| --- | --- |
| `npm run check` (lint `--max-warnings=0`, typegen, `tsc --noEmit`) | exit 0, zero warnings |
| `npm run repository:check` | PASS — 12 gates, 13 active FIDs, links consistent |
| `npm run attribution` | guard PASS, document guard PASS |
| `npm run quality` | PASS — 400-line ceiling, 700 files |
| `node --test tests/identity-calibration-proxy.test.mjs` | 13/13, 0 fail, 0 skipped |
| `npm test` | 1,191 tests, 1,175 pass, 0 fail, 16 skipped (PostgreSQL-gated; `TEST_DATABASE_URL` unset), 90.1 s |

Commit-only proof, run at 14:24Z inside a detached worktree of `3c4975d` whose
`git status --short` was empty (no untracked file to hide behind):

- `git cat-file -e HEAD:scripts/identity-calibration-proxy.mjs` — exit 0.
- `node --test tests/identity-calibration-proxy.test.mjs` — 13/13, 0 fail.

After the closure commit, `npm run repository:check` reports PASS with 12 active
FIDs, and the archive check resolves the `3c4975d` closure reference.

## What this session does not cover

- `npm run verify` was not run: the full 12-gate set (disposable PostgreSQL,
  HTTP, recovery, build, browser matrix) takes roughly three minutes and the
  changed path is a script plus documentation. The last full receipt remains the
  2026-11-20 run recorded in `.verify/summary.json`.
- `test:load` was not run; it is outside `verify` and needs operator approval.
- No calibration run, certificate or probe was sent. FID-2026-1110-002 steps 5–9
  remain `blocked` on an operator-supplied upstream, credential and two routing
  model ids.
- `dev/session-summaries/2026-11-13-full-verify-at-head.md` is still untracked.
  It was present before this session and was left untouched; committing or
  discarding someone else's untracked receipt is not this record's decision.

## Lessons

A gate run in a working tree is not evidence about the commit. Three of four
step-4 files went in through a `git add` that mixed an unrelated FID's paths, and
every gate stayed green because the untracked fourth file sat in the same
directory the gates ran in. The habit that catches it: for each import a new
commit delivers, ask `git cat-file -e <commit>:<path>`, and run the suite once in
a worktree of the commit rather than only in the working tree.

## Next

1. FID-2026-1110-002 step 5 (collection) once the operator supplies an upstream,
   credential and two routing model ids.
2. FID-2026-1120-001 steps 5–7 once the funding decision and a measured bid
   figure exist.
3. FID-2026-1103-127 needs the operator's five dated observations and a go
   pinned to a release SHA; launch remains no-go.
