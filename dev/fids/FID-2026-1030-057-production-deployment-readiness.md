# FID: Secure persistent production deployment readiness

**Filename:** `FID-2026-1030-057-production-deployment-readiness.md`
**ID:** FID-2026-1030-057
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-047, FID-2026-1030-048
**YAGNI-Compliance:** Verified — support the real single-process SQLite topology.

## Summary

Prepare reproducible production configuration, ingress, persistent storage,
health/readiness and shutdown behavior. Hosting/domain/credentials are operator
inputs; preparing deployable artifacts is not permission to deploy them.

## Environment

`package.json`, lockfile, `next.config.mjs`, `lib/db.ts`, admin/customer cookie
guards and `.github/workflows/ci.yml`. Current start command is production `next start`.

## Detailed Description

### Problem / expected behavior / root cause

There is no recorded hosting/restore/proxy acceptance. SQLite is local and rate
buckets are process-local; multiple workers/replicas could multiply admission.
Readiness must reflect actual configuration/storage, not always-green fabricated health.

### Evidence

`lib/db.ts:17` reads DB_PATH; source initializes schema locally. CI runs Node 24
and full gates. `config/site.ts` falls back to localhost; a public origin must be
explicit. Current source inventory contains no dedicated production health/backup runner.

## Impact Assessment

Runtime/deploy artifacts, ingress, scheduler hooks, health, shutdown, permissions
and secret injection. Risk critical: lost data or multiplied upstream capacity.
044 selects limits; 047 defines proxy/auth trust; 048 defines safe process topology.

## Proposed Solution

### Approach and steps

1. Obtain hosting/domain/persistent-volume/process-count decisions; produce a
   reproducible artifact and environment-name inventory with startup validation.
2. Configure HTTPS canonical origin, trusted ingress headers, request caps, secure
   cookies, SSE buffering/timeouts and restricted admin/operator access.
3. Add protected readiness/liveness/maintenance wiring that reports unknown or
   unhealthy state truthfully; drain new admission on shutdown and preserve in-flight
   accounting. Wire quota/recovery jobs as real services, not detached assumptions.
4. Verify clean locked install/build/start, dependency vulnerability review with
   documented disposition, secret rotation, filesystem access and storage restart.

### Verification

Existing HTTP suites prove disposable production startup. Planned
`tests/production-config.test.mjs` covers missing/unsafe config, origin and
process topology. Real ingress receipts must show SSE flush/cancel and no auth
bypass; readiness must fail when storage/configuration is unavailable. Intended
callers: startup/readiness/drain → validated configuration and admission/recovery services.

## Verification Gates

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
planned `tests/production-config.test.mjs`; clean-install CI must pass. Controlled
hosting checks need operator access; final deployment still requires 062 approval.

## Perfection Loop

RED: absent recorded operational topology/ingress proof. GREEN: bounded supported
runtime and real readiness/drain. AUDIT: pending. ADVERSARIAL: platform autoscaling
can defeat process-local protection while every instance reports healthy.
Five questions: every startup/shutdown state, bounded process count, hostile
ingress, maintainable locked artifacts and observed persistence.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: production readiness rejects a
localhost canonical origin, unprotected defaults and missing persistent storage.
Test actual unsafe configuration failure rather than a permanently green probe.
Final convergence checks are in the master planning-audit receipt.

Design only. Do not publish a serverless/multi-replica deployment that contradicts
the storage/admission contract or expose a successful placeholder health endpoint.

## Lessons Learned

The deployed topology is part of the accounting and capacity correctness contract.
