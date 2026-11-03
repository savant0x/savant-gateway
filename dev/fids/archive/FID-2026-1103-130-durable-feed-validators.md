# FID: Durable feed validators

**Filename:** `FID-2026-1103-130-durable-feed-validators.md`
**ID:** FID-2026-1103-130
**Severity:** low
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Conditional feed validators currently live in a bounded process-local cache.
Restarts and multiple instances lose ETag/Last-Modified state, causing avoidable
downloads. Durable validator metadata should be introduced only behind a
measured need and must not change content correctness.

## Impact Assessment

- **Affected components:** feed transport, content source schema/store, ingest
  cycle, cache tests and operational metrics.
- **Risk:** low now; medium cost/scaling risk if topology expands.

## Proposed Solution

1. **implemented (design):** measure validator hit rate, restart cost, payload
   volume, and instance topology before adding storage.
2. **implemented (design):** if thresholds are met, store bounded validators by
   source with ownership, expiry, and atomic update semantics.
3. **implemented (design):** keep 304-without-body fail-closed and test restart,
   concurrent fetch, stale validator, and source deletion paths.

## Verification Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run test:recovery`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** process-local state is lost on restart and cannot coordinate instances.
- **GREEN:** measurement precedes schema work; correctness remains independent
  of cache hits.
- **AUDIT:** inspect transport, source lifecycle, migration and metrics callers.
- **ADVERSARIAL:** stale validators, 304 cache misses, races, and deleted rows
  must never publish incorrect content.
- **CHANGE DELTA:** 6%; converged.

### Missed Questions

1. **Is durable state automatically required now?** No; the measurement gate is
   an explicit prerequisite.
2. **Can validators contain content?** No; only protocol validator metadata.

## Implementation Evidence

- **Commit SHA:** `d701ce6`.
- **Implementation:** `lib/content/validator-measurement.ts` models the
  conditional-fetch workload and the restart failure mode, and
  `scripts/feed-validator-measurement.mjs` renders the decision. Default workload
  (16 sources, 24 cycles/day, 1 cold start, 120 KB feeds): 95.8% validator hit
  rate, 42.11 MiB/day saved, 0 MiB restart penalty, 1.83 MiB for durable bodies.
  Decision: `process-local-cache`.
- **Why no schema:** durable validator metadata alone cannot help, because a
  restart would receive a 304 without a cached body and the fetcher fails
  closed. Storing bodies is below the 50 MiB review threshold.
- **Tests Added:** Yes — `tests/measurement-decisions.test.mjs` pins the
  decision rule and the fail-closed reasoning.
- **Gate output:** check, 956 tests (955 pass, 1 skipped, 0 fail), quality,
  build, HTTP 751 checks and recovery pass at `35c1d35`.
- **Limitation:** the workload is synthetic and `restartsPerDay` is a
  deployment assumption; a hosted measurement can replace it without changing
  the decision rule.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** measured decision to keep the process-local cache; no
  durable validator schema was added because the measurement does not justify it.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-130-durable-feed-validators.md`.
