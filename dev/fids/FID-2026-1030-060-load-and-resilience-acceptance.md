# FID: Measured load, capacity and resilience acceptance

**Filename:** `FID-2026-1030-060-load-and-resilience-acceptance.md`
**ID:** FID-2026-1030-060
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-046, FID-2026-1030-048, FID-2026-1030-049, FID-2026-1030-050, FID-2026-1030-051, FID-2026-1030-055, FID-2026-1030-057, FID-2026-1030-058, FID-2026-1030-059
**YAGNI-Compliance:** Verified — bounded workload and failure harness, no speculative scale claims.

## Summary

Measure the supported deployment's actual service envelope and verify graceful
refusal/recovery under mixed traffic and failures. Approve traffic limits from
evidence, not from per-key defaults or a claim to support arbitrary scale.

## Environment

Existing HTTP harness/mocks, actual production artifact, SQLite storage and
admission/observability/recovery contracts from preceding children.

## Detailed Description

### Problem / expected behavior / root cause

Unit/HTTP correctness receipts do not establish throughput, stream concurrency,
memory, storage contention or recovery time. Historical upstream 15 RPM and a
large free pool cannot be translated into thousands of concurrent usable accounts.

### Evidence

`scripts/http-suite/harness.mjs` already provides disposable servers/providers.
`lib/gateway-rate-limit.ts` is process-local. Launch plan phase 3 requires load
measurements and phase 6 requires a bounded initial cohort/spend approval.

## Impact Assessment

Test harness, runtime sizing, provider headroom and launch thresholds. Risk high:
unbounded probes can spend real funds or exhaust customer capacity. Fixture load
is isolated; real provider probes require an approved budget and schedule.

## Proposed Solution

### Approach and steps

1. Specify an operator-approved envelope: serving account RPM/concurrency, local
   request/stream/body bounds, storage/resource budget, latency/error and recovery targets.
2. Run bounded ramp/burst/steady/mixed-billing workloads with slow/long streams,
   cancellations, key churn and competing reservations on production-equivalent storage.
3. Inject provider 429/5xx/timeouts, malformed/truncated source, quota reset,
   process crash, database contention/full storage and alert failure; reconcile
   every admitted call's final accounting or explicit quarantine.
4. Publish measured safe traffic cap, bottlenecks, headroom and no-go thresholds;
   prove shedding/drain and restore behavior rather than hiding failures behind retries.

### Verification

Planned `tests/capacity-invariants.test.mjs` for admission invariants; a bounded
load/fault runner must be added to an explicit documented gate before use.
Existing `npm run test:http` remains regression. Intended callers: workload →
real production endpoints → admission/settlement; monitors observe the same events.
Record peak admitted work, refusals, latency, resources and ledger reconciliation.

## Verification Gates

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
planned `tests/capacity-invariants.test.mjs`. The load receipt is additional and
must identify artifact/config/storage, workload/budget, targets and measured results;
passing local mocks does not establish real upstream performance.

## Perfection Loop

RED: no measured safe envelope. GREEN: bounded acceptance workload with financial
invariants and real targets. AUDIT: pending. ADVERSARIAL: load can appear healthy
by dropping requests or skipping settlement; reconcile admitted and rejected work.
Five questions: all failure modes, safe aggregate scale, hostile saturation,
reproducible harness and evidence-based limits over marketing capacity claims.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: independently count offered,
admitted, rejected, settled and quarantined calls. A run cannot pass throughput
by rejecting everything or hiding unresolved financial outcomes behind retries.
Final convergence checks are in the master planning-audit receipt.

Design only. If measured targets fail, repair before acceptance; do not lower an
approved promise silently or claim a different environment proves production capacity.

## Lessons Learned

Capacity is a measured envelope with rejection and recovery semantics, not a token count.
