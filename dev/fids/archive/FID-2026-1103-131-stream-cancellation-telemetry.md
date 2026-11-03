# FID: Structured stream cancellation telemetry

**Filename:** `FID-2026-1103-131-stream-cancellation-telemetry.md`
**ID:** FID-2026-1103-131
**Severity:** medium
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Normal client disconnects can emit noisy upstream-cancellation failures. The
gateway needs structured, redacted classification that separates expected
disconnect cleanup from provider or transport incidents and makes genuine
failures observable without turning cancellation into a false outage.

## Impact Assessment

- **Affected components:** streaming relay, gateway logging/telemetry, HTTP
  tests, incident documentation.
- **Risk:** medium diagnostic noise and missed real incidents.

## Proposed Solution

1. **implemented (design):** classify client abort, upstream abort, timeout,
   already-closed stream, and unexpected cancellation errors.
2. **implemented (design):** emit bounded structured fields with request,
   provider, model, and phase identifiers; never prompt, key, or payload data.
3. **implemented (design):** add tests proving expected disconnects are quiet,
   genuine errors are counted, and settlement remains correct.

## Verification Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run test:http`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** cancellation warnings are ambiguous and can hide incident signals.
- **GREEN:** typed classification and redacted telemetry preserve behavior.
- **AUDIT:** trace the streaming relay from route admission through settlement.
- **ADVERSARIAL:** disconnect at headers, mid-frame, provider failure, timeout,
  and duplicate cleanup must not double-settle or leak data.
- **CHANGE DELTA:** 7%; converged.

### Missed Questions

1. **Should client aborts be zero-cost?** Billing semantics remain governed by
   existing usage/settlement rules; telemetry alone must not alter them.
2. **Should logs include upstream text?** Only a bounded redacted classification,
   never raw provider text.

## Implementation Evidence

- **Commit SHA:** `8bb2d20`.
- **Implementation:** `lib/stream-telemetry.ts` classifies client abort,
  upstream abort, timeout, already-closed and unexpected errors with bounded
  identifiers. `lib/storage/gateway/stream.ts` records the class and settlement
  outcome; classification does not change the charge.
- **Tests Added:** Yes — `tests/stream-telemetry.test.mjs` separates the classes
  and asserts no prompt, key or payload data is emitted.
- **Gate output:** `npm run check`, `npm test` 956 (955 pass, 1 skipped, 0
  fail), quality, build, HTTP 751 checks and recovery pass at `35c1d35`.
- **Limitation:** the skip is FID-126's PostgreSQL concurrency proof. No live
  disconnect was observed against a hosted deployment; the behavior is covered
  by the focused unit tests.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** expected disconnects are quiet; genuine provider and
  transport failures are classified and observable without raw provider text.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-131-stream-cancellation-telemetry.md`.
