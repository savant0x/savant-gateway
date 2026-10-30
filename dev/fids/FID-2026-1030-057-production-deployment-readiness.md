# FID: Secure persistent production deployment readiness

**Filename:** `FID-2026-1030-057-production-deployment-readiness.md`
**ID:** FID-2026-1030-057
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** implemented (deployment pending 062 approval)
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

## Implementation receipt (2026-10-30)

Implemented with deployment unexecuted, per operator instruction.

- **Validator + startup gate:** [`lib/production-config.ts`](../../lib/production-config.ts)
  issues codes only (origin_missing/insecure/loopback/invalid, db_missing/
  memory/relative/ephemeral, admin_unconfigured, multi_worker,
  manual_signal_handler — no configured value is ever echoed).
  [`instrumentation.ts`](../../instrumentation.ts) refuses a production start
  that cannot honour the contract; skipped during build and non-production.
  Mechanical suites run disposable production starts under an exact opt-in
  (`GATEWAY_DISPOSABLE_START=yes`) that leaves admin/topology/signal checks in
  force and is disclosed on `/api/ready` and by `npm run config:check`.
- **Truthful health:** `/api/health` claims liveness only,
  [`/api/ready`](../../app/api/ready/route.ts) checks configuration, required
  tables and a rolled-back write, returns 503 `not_ready` when either fails and
  is never cached.
- **Security headers:** `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy` on every route.
- **Operator gate:** `npm run config:check`, wired into `verify`.
- **Runbook:** [`docs/deployment-runbook.md`](../../docs/deployment-runbook.md)
  — runtime contract, environment inventory, start/backup/restore, ingress and
  SSE requirements, `0 vulnerabilities` audit disposition, and the missing
  operator inputs.
- **Verified:** `npm run verify` exit 0 (lint, typecheck, `config-check PASS`,
  228/228 unit tests with 11 new in
  [`tests/production-config.test.mjs`](../../tests/production-config.test.mjs),
  quality 238 files, build, http-suite 185/185 PASS with truthful-negative
  storage-degrade and header checks, trial-http-suite PASS). Dependency audit:
  `npm audit --omit=dev --audit-level=high` → 0 vulnerabilities.
- **Open (require operator/other FIDs, not claimed here):** hosting, domain,
  TLS, persistent volume and process-count decisions; 048's shared-admission
  service before any process scaling; 051's recovery jobs as real services;
  live ingress SSE/time-out receipts against the chosen host; a live in-flight
  SIGTERM drain receipt (Windows cannot exercise it — CI/Linux item). Final
  deployment approval remains 062. Nothing was deployed, funded or published.

## Lessons Learned

The deployed topology is part of the accounting and capacity correctness contract.


The deployed topology is part of the accounting and capacity correctness contract.
