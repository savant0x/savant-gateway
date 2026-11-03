# FID: Repeatable disposable PostgreSQL for pushes

**Filename:** `FID-2026-1103-145-push-with-disposable-postgres.md`
**ID:** FID-2026-1103-145
**Severity:** medium
**Status:** fixed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified — one developer command, no application behavior.

## Summary

The pre-push hook requires a disposable `TEST_DATABASE_URL` for the
two-connection debit proof, and it reuses that endpoint for the HTTP suites.
Until now the operator had to start PostgreSQL by hand, export the variable,
run `git push`, and remember to stop the server. The manual steps produced a
one-off embedded cluster in `.verify/` during the 2026-11-03 release work.

## Impact Assessment

- **Affected components:** `package.json`, `scripts/with-disposable-postgres.mjs`,
  `scripts/disposable-postgres.mjs`, `scripts/postgres-concurrency-proof.mjs`,
  `docs/getting-started.md`, `README.md`.
- **Risk:** medium — an unset endpoint leaves the mandatory concurrency gate
  with no database, and a stale server or container consumes resources after
  the push.

## Proposed Solution

1. **implemented:** add `npm run push:postgres`, which starts a disposable
   `postgres:17-alpine` container on a reserved loopback port, exports
   `TEST_DATABASE_URL` (and `HTTP_TEST_DATABASE_URL` when unset) to the
   `git push` child, and stops the container in a `finally` block.
2. **implemented:** allow an already-running disposable endpoint through
   `TEST_DATABASE_URL`; validate the scheme and refuse a value equal to
   `DATABASE_URL`.
3. **implemented:** share the Docker start, readiness wait, URL redaction and
   cleanup helpers with `scripts/postgres-concurrency-proof.mjs` instead of
   copying them.
4. **implemented:** document the command and the existing-endpoint path.

## Verification Gates

- `npm run test:postgres` against a disposable endpoint
- `node scripts/with-disposable-postgres.mjs -- node -e "..."` with an
  existing disposable `TEST_DATABASE_URL`
- fail-closed check with no Docker and no endpoint
- `npm run check`, `npm test`, `npm run quality`, `npm run build`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** the push path requires manual server startup, environment export and
  shutdown; a missed step blocks the mandatory gate.
- **GREEN:** one command owns the container lifecycle and exports the endpoint
  for the push.
- **AUDIT:** the helper reuses the concurrency proof's container contract so the
  image, credentials and readiness wait cannot drift.
- **ADVERSARIAL:** Docker unavailable, endpoint equal to `DATABASE_URL`, a
  non-PostgreSQL URL, a signal from the push, a failing push, and a container
  whose readiness never arrives.
- **CHANGE DELTA:** 5%; converged.

### Missed Questions

1. **Should the script start an embedded server without Docker?** No; the
   project already declares Docker as the disposable path, and adding a native
   PostgreSQL dependency for a convenience command is not justified.
2. **Should the script accept a production URL?** No; it refuses equality with
   `DATABASE_URL` and warns that the HTTP suites reset schemas.

## Implementation Evidence

- **Commit SHA:** this commit (the first commit after `0a81400`).
- **Local receipt:** `npm run push:postgres -- --dry-run` with a disposable
  PostgreSQL 18.6 endpoint exported both `TEST_DATABASE_URL` and
  `HTTP_TEST_DATABASE_URL`; the pre-push hook ran every gate, including the
  two-connection proof (1/1) and both HTTP suites, then `git push --dry-run`
  reported `Everything up-to-date`. `npm run test:postgres` separately passed
  1/1 against the same endpoint. The no-Docker path exits 1 with the guidance
  message, a non-loopback endpoint is refused, an endpoint equal to
  `DATABASE_URL` is refused, and a failing child exit code is preserved.
- **Unverified:** the default Docker path, because this machine's Docker engine
  returns a 500 from `docker info`. The container lifecycle is the extracted
  helper also used by `test:postgres`; the supplied-endpoint path and the full
  push flow were exercised.
- **CI receipt:** pending the push that carries this commit.
- **Archived:** no; closes after the CI run is green.

## Resolution

- **Convergence Date:** 2026-11-03
- **Fix Description:** `npm run push:postgres` owns a disposable PostgreSQL
  container, exports its endpoint to `git push`, and cleans up; an existing
  disposable loopback endpoint can be supplied instead.
- **Archived:** no.
