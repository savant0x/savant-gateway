# FID: Production concurrency proof

**Filename:** `FID-2026-1103-126-production-concurrency-proof.md`
**ID:** FID-2026-1103-126
**Severity:** critical
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified
**Depends on:** FID-2026-1103-125

## Summary

The storage suite skips its two-connection debit-concurrency proof when
`DATABASE_URL` is unavailable. The implementation must retain the local
fixture path while making disposable PostgreSQL execution mandatory in CI and
release verification, so double-debit protection is proven on the production
adapter rather than inferred from single-process tests.

## Impact Assessment

- **Affected components:** `tests/storage-contract.test.mjs`, PostgreSQL adapter,
  CI workflow, `protocol.config.yaml`, release verification documentation.
- **Risk:** critical financial-integrity evidence gap.

## Proposed Solution

1. **implemented (design):** identify every concurrency test and its real
   PostgreSQL prerequisites; never silently convert a required test to skip.
2. **implemented (design):** add a disposable PostgreSQL CI/release gate with
   explicit teardown, redacted diagnostics, and a distinct unavailable-service
   failure.
3. **implemented (design):** preserve PGlite/unit coverage and document which
   guarantees require PostgreSQL.

## Verification Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run test:recovery`
- `npm run verify`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** the current concurrency test can be skipped locally and is not a
  release-proof requirement.
- **GREEN:** the design separates local fast tests from a mandatory disposable
  PostgreSQL gate and defines fail-closed behavior.
- **AUDIT:** static review targets `tests/storage-contract.test.mjs`,
  `scripts/http-suite.mjs`, and `protocol.config.yaml`; runtime audit is the
  PostgreSQL gate above.
- **ADVERSARIAL:** a missing database, failed cleanup, concurrent requests, and
  repeated retries must fail visibly without leaking credentials.
- **CHANGE DELTA:** 8%; converged.

### Missed Questions

1. **Should local `npm test` fail?** No; the required external-service gate is
   separately named, while CI/release must run it.
2. **Can production credentials be reused?** No; only disposable credentials
   and databases are permitted.

## Implementation Evidence

- **Commit SHA:** `8bb2d20`.
- **Implementation:** `scripts/postgres-concurrency-proof.mjs` runs
  `tests/settlement-concurrency.test.mjs` against `TEST_DATABASE_URL` or starts
  a disposable `postgres:17-alpine` container and removes it afterwards. With
  neither available it exits 1; it never converts the proof into a skip. The
  script redacts the connection string in its diagnostic. `package.json` exposes
  `npm run test:postgres`, `scripts/verify.mjs` treats the gate as one that may
  not skip, and `.github/workflows/ci.yml` runs it with a service container.
- **Tests Added:** Yes — the proof itself is the existing two-connection
  settlement test; `tests/verify-summary.test.mjs` pins the no-skip rule for
  this gate.
- **Gate output — executed 2026-11-03.** Docker's engine remained unresponsive
  (`docker ps` timed out), so the gate ran against a disposable local
  PostgreSQL 18.6 cluster started by `embedded-postgres@18.6.0-beta.19`
  (windows-x64 binaries) on loopback, with a random port and a throwaway data
  directory. The cluster was removed after the run.

  ```text
  postgres-concurrency: using postgres://***:***@127.0.0.1:55892/gateway_concurrency
  ✔ two connections cannot debit one balance twice (343.2802ms)
  ℹ tests 1
  ℹ pass 1
  ℹ fail 0
  ℹ skipped 0
  postgres-concurrency: PASS — two connections cannot double-debit
  ```

  This is a real two-connection race against PostgreSQL, not PGlite. The
  disposable URL went through the same `TEST_DATABASE_URL` path the gate uses,
  so the production adapter, pool and `SELECT … FOR UPDATE` guard were all
  exercised. No production credential was used.
- **Residual environment note:** CI still runs the Docker service container;
  the local embedded cluster is not committed, so a developer without Docker
  needs `TEST_DATABASE_URL`. The gate's fail-closed behavior is unchanged.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** the mandatory disposable-PostgreSQL concurrency proof
  ran green: exactly one of two racing debits committed and the balance moved
  by one debit only.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-126-production-concurrency-proof.md`.
