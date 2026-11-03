# FID: Vercel Git install skips local hook wiring

**Filename:** `FID-2026-1103-140-vercel-git-install.md`
**ID:** FID-2026-1103-140
**Severity:** critical
**Created:** 2026-11-03
**Status:** converged
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The `prepare` script skipped hook wiring when `.git` was absent, which is true
for a CLI upload. A Git-connected Vercel build clones the repository and does
have `.git`, but the checkout is not a writable repository, so `git config`
exits 128 and the install fails before the build. The guard must identify the
deployment environment, not only the presence of Git metadata.

## Impact Assessment

- **Affected components:** `scripts/prepare.mjs`.
- **Risk:** critical: every GitHub-triggered production build fails at install.

## Proposed Solution

1. **implemented:** treat `VERCEL` or `CI` as a deployment and skip local hook
   wiring even when `.git` exists.
2. **implemented:** keep the local path unchanged: a writable checkout still
   configures `.githooks` and `.gitmessage`.
3. **implemented:** verify both branches directly with `VERCEL=1`, `CI=1` and a
   plain local run, then run lint and the pre-push gate.

## Verification Gates

- `VERCEL=1 node scripts/prepare.mjs` — exit 0
- `CI=1 node scripts/prepare.mjs` — exit 0
- `node scripts/prepare.mjs` — exit 0 locally
- `npm run lint`
- `npm run verify` via the pre-push hook

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** Vercel's Git clone failed with `Command failed: git config
  core.hooksPath .githooks` (exit 128) during `npm install`.
- **GREEN:** deployment detection is explicit; `existsSync(".git")` is no longer
  treated as proof of a writable local repository.
- **AUDIT:** only `scripts/prepare.mjs` wires hooks; the build itself does not
  depend on Git configuration.
- **ADVERSARIAL:** a local repo with `CI=1` must not mutate hooks; a Git clone
  with a read-only `.git` must not fail the install; a normal local install must
  still wire the hooks.
- **CHANGE DELTA:** 3%; converged.

### Missed Questions

1. **Should all errors from `git config` be swallowed?** No. A local checkout
   that fails to wire its own hooks should still surface the failure.
2. **Does this affect the commit or attribution guards?** No. They run locally
   and in CI, not during a Vercel install.

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** complete. The install skips hook wiring when `VERCEL` or
  `CI` is set; local installs are unchanged.
- **Evidence:** `VERCEL=1`, `CI=1` and a plain local run all exit 0; lint passes;
  the pre-push gate passes; Vercel production deployment
  `savant-gateway-2r5fkmdy3` built from GitHub commit `67551ea` and is Ready;
  `/api/ready` returns `200` with `storage: "ok"`.
- **Commit:** `67551ea`.
- **Archived:** yes.
