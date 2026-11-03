# Session handoff: sandbox readiness and pricing verification

**Session ID:** 2026-11-03-sandbox-readiness
**Status:** handoff-ready
**Date:** 2026-11-03

## Purpose

This handoff gives the next agent the ordered contracts for completing the five
sandbox/deployment phases. This session created and converged the FIDs only. It
did not push, deploy, change prices, fund accounts, send payments, or use real
money.

## Required grounding

1. Read `AGENTS.md`, `ECHO-single-agent.md`, and
   `dev/echo-v0.1.2-single-agent.md` completely.
2. Read `protocol.config.yaml`, `SCOPE.md`, this handoff, and FIDs 152–156.
3. Inspect current Git status and remote before any push. Preserve unrelated
   changes, including the untracked conversation handoff if it remains present.
4. Do not print, copy, hash, commit, or place provider/payment secrets in any
   receipt or document.

## Ordered implementation sequence

1. **FID-152:** push intended commits, verify Vercel commit/branch/status, check
   hosted provider-key presence, run provider Test/Sync, and create a redacted
   receipt.
2. **FID-153:** pull current provider pricing, generate the complete sandbox
   economics/recommendation report, and review changes without auto-publishing.
3. **FID-154:** generate safe sandbox history, inspect scenario versus realized
   charts, and verify reconciliation/missing-data behavior.
4. **FID-155:** run `npm run test:postgres`, then `npm run verify` with disposable
   PostgreSQL. Docker or `TEST_DATABASE_URL` is required; do not use production.
5. **FID-156:** assemble the final redacted sandbox readiness receipt and present
   the explicit limitations and operator-owned launch boundary.

## Known environment facts

- The local full suite recently reported 959 tests, 958 passed, 1 skipped.
- The skipped test requires the separate PostgreSQL gate.
- `npm run test:postgres` previously failed because Docker was unavailable.
- `npm run verify` previously failed only at `test:postgres` and the trial HTTP
  suite for the same missing disposable PostgreSQL prerequisite; unit, build,
  quality, recovery, and ordinary HTTP checks passed.
- Sandbox/mock HTTP activity is allowed; real payment and funded production
  inference are not part of this handoff.

## Completion contract

The next agent must not claim completion from local unit tests alone. Each FID
needs its own implementation evidence, production call-graph check, exact gate
output, commit hash, and only then closure/archive treatment. FID-156 must state
that no real-money activity or launch approval occurred.
