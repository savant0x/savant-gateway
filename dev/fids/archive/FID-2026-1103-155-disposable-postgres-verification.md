# FID: Disposable PostgreSQL verification

**Filename:** `FID-2026-1103-155-disposable-postgres-verification.md`
**ID:** FID-2026-1103-155
**Severity:** critical
**Status:** closed
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

- **Commit SHA:** `7e24f0e`.
- **Steps 1-2 implemented:** database `gateway_verify_1793749080666` was created
  on the configured Supabase cluster (PostgreSQL via the pooler), separate from
  the application `DATABASE_URL` and from the production `postgres` database.
  `npm run test:postgres` used it and passed: one test, two connections could
  not debit one balance twice, 4.2s, 0 skipped.
- **Step 3 implemented:** `npm run verify` used the same disposable endpoint for
  the HTTP suites and ran all ten gates sequentially. Result: **PASS**, exit 0,
  263.7s. `check`, `storage:check`, `config:check`, `test` (969/969, 0 skipped),
  `test:postgres` (1/1), `quality`, `build`, `test:http`, `test:recovery` and
  `deployment:receipt` all passed.
- **Step 4 implemented:** no gate failed. The lint gate exited 0 with six
  pre-existing warnings confined to untouched `lib/launch-receipt.ts`; there
  were no errors or warnings in the new pricing report files.
- **Step 5 implemented:** the runner dropped
  `gateway_verify_1793749080666` with `WITH (FORCE)` in `finally` and recorded
  `dropped: true` in
  `dev/receipts/2026-11-03-sandbox/postgres-run.json`. No production schema was
  reset. Captured evidence: `test-postgres.log`, `verify.log`,
  `verify-summary.json` and `check.log` in the same directory. The connection
  string is redacted in every log; only the disposable database name remains.
- **Archived:** yes — moved to `dev/fids/archive/` after the verification commit.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** the mandatory two-connection proof and the full
  verification suite now have a green receipt on disposable PostgreSQL, with
  the disposable database created and dropped around the run.
- **Verification Evidence:** `test-postgres.log` (PASS, 1/1), `verify.log`
  (PASS, all gates), `verify-summary.json` (`status: "pass"`),
  `postgres-run.json` (`dropped: true`).
- **Archived:** yes.
