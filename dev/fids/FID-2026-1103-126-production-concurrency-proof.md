# FID: Production concurrency proof

**Filename:** `FID-2026-1103-126-production-concurrency-proof.md`
**ID:** FID-2026-1103-126
**Severity:** critical
**Status:** converged
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

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** not started; this is a converged implementation contract.
- **Archived:** no; remains active until implementation and verification.
