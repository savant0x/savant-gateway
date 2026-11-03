# FID: Durable feed validators

**Filename:** `FID-2026-1103-130-durable-feed-validators.md`
**ID:** FID-2026-1103-130
**Severity:** low
**Status:** converged
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

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** not started.
- **Archived:** no.
