# Session record: production deployment readiness (057)

**Session ID:** 2026-10-30-deployment-readiness
**Status:** implemented, verified, committed and pushed
**Initial commit:** `c37b798`
**Mode:** single-agent ECHO v0.1.2, strict, autonomy 3

## Intent before edits

Implement FID-2026-1030-057's deployable-production readiness: a validated
configuration at startup, truthful liveness/readiness, a canonical HTTPS origin,
the single-process SQLite topology, secure headers, and the documented ingress,
storage, secret and shutdown contract. Deployment, hosting provisioning, DNS,
secret injection and release remain unexecuted and require explicit operator
approval.

## Condition and dependency check

Source is at `c37b798`; no runtime source changed since the 047 implementation.
057 depends on 044 (open, operator-blocked), 047 (closed against `2ef2d74`) and
048 (converged, unimplemented). The parts that need 048's shared admission or
051's durable recovery jobs cannot be proven here and are recorded as open
dependencies with their specific contracts. Preparing artifacts is not deploying
them.

## Planned work

1. Pure production configuration validator with no-secret diagnostics: HTTPS
   canonical origin, absolute non-temporary SQLite path, configured admin
   session, single-process indicators, and no manual signal handler.
2. Startup gate via Next instrumentation (skipped during build) so an invalid
   production configuration fails before serving.
3. `/api/health` and `/api/ready`: readiness checks configuration, required
   schema and an actual rolled-back write; returns 503 when either is unavailable.
4. Baseline security headers and no framework banner.
5. Tests: planned `tests/production-config.test.mjs`; HTTP checks for health,
   readiness, headers, a storage-failure 503 and an in-flight SIGTERM drain.
6. Deployment runbook with the environment inventory, proxy/SSE requirements,
   single-process and shutdown behavior, dependency audit, and the operator
   inputs that remain missing.

## Verification

`npm run verify`, the new test file, `npm audit --omit=dev --audit-level=high`,
attribution and whitespace checks, then commit and normal push. No deployment.

## What is implemented

- [`lib/production-config.ts`](../../lib/production-config.ts): validator with
  issue codes only (no configured values) — HTTPS canonical origin, absolute
  non-temporary `DB_PATH`, configured admin session, single-process indicators,
  no manual signal handler, and an exact-opt-in `GATEWAY_DISPOSABLE_START=yes`
  disposable mode used by the mechanical suites (origin/ephemeral checks only;
  admin, process-topology and signal checks remain in force).
- [`instrumentation.ts`](../../instrumentation.ts): production startup gate;
  refuses to begin serving on an invalid configuration, skipped during build and
  non-production.
- [`app/api/health/route.ts`](../../app/api/health/route.ts): liveness only.
  [`app/api/ready/route.ts`](../../app/api/ready/route.ts): configuration +
  storage checks, required-table probe, rolled-back write probe, 503 when not
  ready, `mode: durable|disposable` disclosure, `no-store`.
- [`scripts/production-config-check.mjs`](../../scripts/production-config-check.mjs)
  + `npm run config:check` (wired into `verify`): the operator gate.
- [`next.config.mjs`](../../next.config.mjs): baseline
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy` on every route.
- [`docs/deployment-runbook.md`](../../docs/deployment-runbook.md): runtime
  contract, environment inventory, start/backup/restore procedures, ingress and
  SSE requirements, dependency audit disposition, and the missing operator
  inputs.

## Verification done

- `npm audit --omit=dev --audit-level=high`: `found 0 vulnerabilities`, exit 0;
  no high/critical finding needed a disposition.
- `npm run verify` exit 0 (pipefail preserved): lint + typecheck, `config-check:
  PASS (non-production)`, 228/228 unit tests (11 new in
  [`tests/production-config.test.mjs`](../../tests/production-config.test.mjs)),
  quality 238 files, clean build, main http-suite 185/185 PASS (new
  availability, degrade and security-header checks), trial-http-suite all PASS.
- The first verify run failed honestly: the trial suite's production server was
  refused by the new startup gate because it had no disposable opt-in. The gate
  worked as designed; the suite now declares `GATEWAY_DISPOSABLE_START=yes` and
  the admin credentials it still requires.

## Still open (not implementation gaps)

- Hosting/domain/TLS/persistent-volume/process-count operator decisions.
- 048's shared admission service for a multi-process future; do not scale the
  process count until it exists.
- Real ingress receipts for SSE flush/cancel and timeouts against the chosen
  host (unproducible locally).
- A live in-flight SIGTERM drain receipt (Windows verification is unreliable;
  the runbook documents the drain contract, and CI/Linux can exercise it).
- 044's commercial rulings; deployment itself remains gated on explicit
  operator approval via 062.