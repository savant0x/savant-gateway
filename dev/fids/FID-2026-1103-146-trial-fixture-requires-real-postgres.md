# FID: Trial HTTP fixture requires real PostgreSQL

**Filename:** `FID-2026-1103-146-trial-fixture-requires-real-postgres.md`
**ID:** FID-2026-1103-146
**Severity:** high
**Status:** fixed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — one fixture flag, no application behavior.

## Summary

FID-144 made a real PostgreSQL endpoint available to the HTTP suites, but the
trial suite still fell back to the PGlite wire fixture when
`HTTP_TEST_DATABASE_URL` was unset. PGlite has one connection, so the
three-way concurrent trial check could silently exercise the wrong transaction
semantics again. The trial fixture must never make that substitution.

## Impact Assessment

- **Affected components:** `scripts/http-suite/db.mjs`,
  `scripts/trial-http-suite.mjs`, `docs/getting-started.md`.
- **Risk:** high — a local or future CI run without the variable could pass or
  fail for a fixture reason instead of proving the trial admission behavior.

## Proposed Solution

1. **implemented:** `startDatabaseServer` accepts `requireReal`. When set and
   no endpoint is supplied, it starts the same disposable `postgres:17-alpine`
   container as `test:postgres`; it never starts PGlite.
2. **implemented:** the trial suite passes `requireReal`, accepts
   `HTTP_TEST_DATABASE_URL` or the shared `TEST_DATABASE_URL`, and fails closed
   with an actionable message when neither the endpoint nor Docker exists.
3. **implemented:** the trial suite owns the database handle in its `try` block
   and closes the container, Next server and mock upstream in `finally`, so a
   startup failure does not leak them.
4. **implemented:** the main HTTP suite keeps the Docker-free PGlite default.

## Verification Gates

- `scripts/trial-http-suite.mjs` with a disposable endpoint
- `scripts/trial-http-suite.mjs` with no endpoint and no Docker, expecting a
  named failure
- `npm run test:http` with a disposable endpoint
- `npm run test:http` without an endpoint, expecting the trial suite to fail
  closed while the main suite still passes
- `npm run check`, `npm test`, `npm run quality`, `npm run build`
- GitHub Actions `ci` workflow on the fix commit

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** the trial fixture accepted the single-connection PGlite fallback
  even though the check needs concurrent transactions.
- **GREEN:** the trial suite now starts a disposable container or uses a
  supplied endpoint; PGlite is not reachable from that path.
- **AUDIT:** confirmed the main suite still uses PGlite, the pre-push and verify
  fallbacks supply `TEST_DATABASE_URL`, and the container helper is shared with
  the concurrency proof.
- **ADVERSARIAL:** no endpoint and no Docker, a supplied `TEST_DATABASE_URL`,
  a supplied `HTTP_TEST_DATABASE_URL`, a startup failure after the mock opens,
  and a container that must stop even when the Next server never starts.
- **CHANGE DELTA:** 4%; converged.

### Missed Questions

1. **Should the main HTTP suite also require real PostgreSQL?** No; its checks
   do not depend on concurrent transactions, and retaining PGlite keeps the
   main suite Docker-free.
2. **Should the trial suite guess an endpoint?** No; it accepts the two
   documented variables and otherwise starts an isolated container.

## Implementation Evidence

- **Commit SHA:** this commit (the first commit after `caa2a39`).
- **Local receipt:** the trial suite with `HTTP_TEST_DATABASE_URL` and with
  `TEST_DATABASE_URL` both ended `trial-http-suite: all checks PASS`, including
  `competing calls are refused without another trial PASS`. The main suite
  without an endpoint ended `750 checks PASS`. With neither variable and Docker
  unavailable, the trial suite exited 1 with the named real-PostgreSQL message.
- **CI receipt:** pending the push that carries this commit.
- **Archived:** no; closes after the CI run is green.

## Resolution

- **Convergence Date:** 2026-11-03
- **Fix Description:** the trial fixture now always obtains a real PostgreSQL
  endpoint, failing closed instead of silently using the single-connection
  PGlite fixture.
- **Archived:** no.
