# FID: Disposable PostgreSQL verification

**Filename:** `FID-2026-1103-155-disposable-postgres-verification.md`
**ID:** FID-2026-1103-155
**Severity:** critical
**Status:** converged
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The application is deployed and sandbox-wired, but local verification previously
failed where Docker/PostgreSQL was unavailable. This FID runs the mandatory
two-connection concurrency proof and full verification against disposable
PostgreSQL, with no production database reset and no real-money activity.

## Proposed Solution

1. Start Docker PostgreSQL 17 or provide `TEST_DATABASE_URL` for a disposable
   isolated endpoint; never use a production database.
2. Run `npm run test:postgres` and record the two-connection debit proof.
3. Run `npm run verify`, including HTTP, recovery, deployment receipt, and the
   machine-readable `.verify/summary.json`.
4. If a gate fails, preserve its log, classify the exact blocker, and repair
   only through a new converged implementation FID before rerunning.
5. Confirm the disposable database is dropped/cleaned and no production data or
   credentials appear in receipts.

## Verification Gates

- `npm run attribution`
- `npm run check`
- `npm run test:postgres`
- `npm run verify`
- `npm run test:recovery`
- `git diff --check`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** local environment lacks Docker/PostgreSQL, so the mandatory proof is
  not currently green.
- **GREEN:** the execution contract requires disposable PostgreSQL and fail-closed
  gates; PGlite is not accepted as a substitute for two connections.
- **AUDIT:** verify `scripts/postgres-concurrency-proof.mjs`, test database
  handling, verify gate order, and cleanup paths.
- **ADVERSARIAL:** production URL accidentally supplied, failed cleanup, skipped
  concurrency test, leaked connection string, and stale `.verify` receipt fail.
- **CHANGE DELTA:** 8%; converged.

### Loop 2 — Independent audit

- **RED:** a green unit suite could obscure a missing mandatory external gate.
- **GREEN:** `test:postgres` and `verify` both fail closed when unavailable.
- **AUDIT:** inspect package scripts and verify summary for explicit gate status.
- **ADVERSARIAL:** zero tests or signal termination cannot pass.
- **CHANGE DELTA:** 3%; converged.

### Loop 3 — Final convergence

- **RED:** no further actionable issue.
- **GREEN:** exact commands, environment boundary, and cleanup are specified.
- **AUDIT:** all five steps and receipts are named.
- **ADVERSARIAL:** no real money or production database is touched.
- **CHANGE DELTA:** 1%; converged.

### Missed Questions

1. **Can the deployed Supabase database be used?** No; use a disposable isolated
   database and never reset production.
2. **Can a skipped test be accepted?** No; the mandatory gate must pass.

## Implementation Evidence

- **Commit SHA:** none; planning contract only.
- **Step statuses:** all five steps are `implemented (design)`.
- **Archived:** no.

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** not started.
