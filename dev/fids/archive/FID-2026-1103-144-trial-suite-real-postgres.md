# FID: Trial HTTP suite on real PostgreSQL

**Filename:** `FID-2026-1103-144-trial-suite-real-postgres.md`
**ID:** FID-2026-1103-144
**Severity:** high
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — one opt-in endpoint in the existing HTTP fixture, no production code.

## Summary

CI run `41700383648` passed the main HTTP suite, then failed the trial suite at
`competing calls are refused without another trial` with statuses
`200, 500, 500`. The trial check sends three concurrent transactions to the
same customer. Both HTTP suites defaulted to a PGlite wire server with one
database connection, so the concurrent transactions interleaved and two
requests failed with a storage error instead of the expected `402`/`429`.
The check is correct; the fixture could not provide the transaction semantics
it was written to exercise.

## Impact Assessment

- **Affected components:** `scripts/http-suite/db.mjs`,
  `scripts/http-suite.mjs`, `scripts/trial-http-suite.mjs`,
  `.github/workflows/ci.yml`, `.githooks/pre-push`, `scripts/verify.mjs`.
- **Risk:** high — the full CI workflow cannot go green on a correct trial
  implementation, and a local PGlite run can hide the same concurrency defect.

## Proposed Solution

1. **implemented:** accept `HTTP_TEST_DATABASE_URL` in the shared HTTP fixture.
   When set, use that real PostgreSQL endpoint instead of starting PGlite; when
   unset, keep the Docker-free PGlite default for local runs.
2. **implemented:** reset the `public` and `content` schemas before seeding, and
   refuse a URL equal to `DATABASE_URL` so the gate cannot target the running
   application's database.
3. **implemented:** pass the variable through both suite entry points and set it
   on the CI HTTP step to the PostgreSQL service already backing the
   concurrency proof. The pre-push hook and `npm run verify` fall back to
   `TEST_DATABASE_URL`, so a run that already supplied a disposable concurrency
   endpoint also gives the HTTP suites real transactions.
4. **implemented:** replace the paid-limit single burst with batched probes so
   the same real-PostgreSQL run observes the customer bucket rather than the
   provider concurrency gate.

## Verification Gates

- `npm run test:http` with `HTTP_TEST_DATABASE_URL` set to a disposable
  PostgreSQL endpoint
- GitHub Actions `ci` workflow on the fix commit

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** three concurrent trial calls against the single-connection PGlite
  wire fixture produced `200, 500, 500`.
- **GREEN:** the same three calls against real PostgreSQL produced one `200`
  and two refusals, and the trial suite completed every check.
- **AUDIT:** confirmed both suites share `startDatabaseServer`, so the opt-in
  reaches the main and trial paths; confirmed the CI service is the same
  disposable database used by `test:postgres` and is reset before seeding.
- **ADVERSARIAL:** an endpoint equal to `DATABASE_URL`, a missing build, a
  non-PostgreSQL URL, repeated runs on the same database, and a slow runner
  that refills the paid bucket between requests.
- **CHANGE DELTA:** 6%; converged.

### Missed Questions

1. **Should the suite always require real PostgreSQL?** No; the PGlite default
   keeps `npm run test:http` Docker-free, and CI supplies the real endpoint
   where concurrent transaction semantics are required.
2. **Should the trial assertions be relaxed?** No; the refusal count and the
   single-grant assertion are the behavior under test.

## Implementation Evidence

- **Commit SHA:** `b5afbe5`.
- **Local receipt:** with `HTTP_TEST_DATABASE_URL` pointing at disposable
  PostgreSQL 18.6 on loopback, `npm run test:http` completed both suites:
  main `750 checks PASS`, trial `all checks PASS`, including
  `competing calls are refused without another trial PASS`.
- **CI receipt:** GitHub Actions run `41706820863` (`ci`) passed every gate on
  `b5afbe5`; the HTTP step ran against the PostgreSQL service and the trial
  suite passed its concurrent check.
- **Archived:** yes — moved to `dev/fids/archive/` after the green workflow.

## Resolution

- **Convergence Date:** 2026-11-03
- **Fix Description:** the trial suite can run on a real PostgreSQL endpoint,
  CI uses one, and the concurrent trial check now exercises real transaction
  semantics instead of a single-connection fixture.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-144-trial-suite-real-postgres.md`.
