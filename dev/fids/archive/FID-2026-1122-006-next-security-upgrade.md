# FID-2026-1122-006 — Next.js security upgrade 16.4.3 → 16.4.6

**Filename:** `FID-2026-1122-006-next-security-upgrade.md`
**ID:** FID-2026-1122-006
**Severity:** high
**Status:** closed
**Created:** 2026-11-22 25:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

> **Project application (savant-gateway).** npm, Next.js 16 App Router, single application process.
> Claims below are the ones the gates and the CLI output support, no more.

## Operator Request

> "Run `next upgrade --agent=security` and follow its instructions."

## Problem Statement

The installed Next.js version, 16.4.3, is listed by the registry advisory feed, so
`next upgrade --agent=security` resolves it to 16.4.6 and prints a plan. The plan
has four obligations: check for duplicate work first, install the exact target
version, set `experimental.agentUpgrade` to `"security"` in the app's Next config,
and verify with the app's own gates before delivering.

## Duplicate check (completed before any file changed)

- **Local and remote branches:** `main` only, local and `origin/main` both at
  `31a22e3`; no branch names a Next upgrade.
- **Local and remote commits:** `git log` back to `07894b6` shows no version bump;
  `package.json` was still `16.4.3` and the lockfile agreed.
- **Open pull requests:** `gh pr list --state open --limit 100` returned `[]`.
- **Markers:** `grep -rn "next-upgrade"` outside `node_modules` found none.

No equivalent work existed, so the upgrade proceeded.

## Changes

1. `package.json` — `next` `16.4.3` → `16.4.6` (exact, matching the project's
   pinned style). `package-lock.json` — the corresponding `next` and `@next/*`
   resolutions, nothing else.
2. `next.config.mjs` — `experimental.agentUpgrade: "security"`, the policy the CLI
   and build nudge read (`node_modules/next/dist/lib/upgrade/nudge.js:102`,
   `dist/build/index.js:545`). No other configuration was touched.

## Verification

Run in a dedicated worktree (`../gateway-next-upgrade`, branch
`chore/next-16.4.6-security`) so the working checkout stayed untouched, as the
upgrade instructions require when the repository is under Git.

- `npx next --version` → **Next.js v16.4.6**
- `npm run lint` → exit 0, zero warnings
- `npm run typecheck` → exit 0
- `npm run config:check` → PASS (non-production)
- `npm run verify` → **PASS, 12/12 gates, 1240/1240 tests, 0 skipped** (185.0s)

## Observation recorded, not acted on

This npm release gates dependency install scripts behind an approval list
(`npm install-scripts`). A fresh install blocked the postinstall of
`@embedded-postgres/windows-x64`, the native build of `better-sqlite3` and the
`unrs-resolver` postinstall; approving them locally added an `allowScripts`
block to `package.json`. That block is **not** part of this upgrade and is not
committed — the working checkout does not carry it either, so the repository's
behaviour is unchanged. It is recorded here because a clean install on this npm
version will hit the same block, and the two test suites that need those native
builds (`test:postgres`, and the sqlite-backed tests) cannot run until the
scripts are approved.

## Follow-up (same day)

`@next/eslint-plugin-next` was still pinned at 16.4.3 while `next`, `@next/env`
and `@next/swc-win32-x64-msvc` were 16.4.6 — the one member of the Next family the
version bump missed. Aligned to 16.4.6 on 2026-11-22; `npm run lint` clean and
`npm run verify` PASS (12/12 gates, 1240/1240 tests) afterwards.

## Resolution

- **Implementation commit:** `e3955db` and `35ebeb2`.

- **Closed Date:** 2026-11-22 25:35
- **Fix Description:** Next.js raised from 16.4.3 to 16.4.6 for the published
  advisory, with `experimental.agentUpgrade: "security"` set so the upgrade
  policy is declared in the tree instead of implied.
- **Tests Added:** None — a dependency patch with no application code change; the
  existing 1240 tests are the evidence.
- **Verification Evidence:** `npm run verify` PASS, 12/12 gates, 1240/1240 tests,
  0 skipped, in `../gateway-next-upgrade`.
- **Archived:** 2026-11-22 25:40 EST
