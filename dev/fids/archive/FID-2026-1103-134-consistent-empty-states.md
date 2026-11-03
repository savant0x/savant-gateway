# FID: Consistent actionable empty states

**Filename:** `FID-2026-1103-134-consistent-empty-states.md`
**ID:** FID-2026-1103-134
**Severity:** low
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Signal, catalog, plans, and analytics use inconsistent empty states. A shared
pattern should distinguish no data, disabled, unavailable, and not-yet-loaded,
show freshness where meaningful, and provide the next valid action without
claiming behavior that is not available.

## Impact Assessment

- **Affected components:** public Signal/catalog pages, account plans, admin
  analytics, shared UI components and route tests.
- **Risk:** low usability and trust degradation.

## Proposed Solution

1. **implemented (design):** define a typed state taxonomy and shared visual
   contract for reason, timestamp, action, and accessibility text.
2. **implemented (design):** map each surface's actual data and permissions to
   the taxonomy; do not expose private failures publicly.
3. **implemented (design):** test disabled, empty, stale, unavailable, and
   populated states with keyboard and screen-reader assertions.

## Verification Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run test:http`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** similar user situations are described inconsistently and lack next
  actions.
- **GREEN:** one state model and shared component preserve honest per-surface
  messages.
- **AUDIT:** inventory empty branches in Signal, catalog, plans, and analytics;
  grep each production caller after implementation.
- **ADVERSARIAL:** permission denial, storage outage, stale data, zero values,
  disabled feature, and keyboard navigation must remain distinct.
- **CHANGE DELTA:** 7%; converged.

### Missed Questions

1. **Should every empty state have a button?** No; only when a valid next action
   exists for that viewer.
2. **Should timestamps be exact?** Use appropriate relative/freshness wording;
   avoid false precision.

## Implementation Evidence

- **Commit SHA:** `4b57ebe`.
- **Implementation:** `lib/surface-state.ts` defines the four labels (empty,
  disabled, unavailable, loading) and `components/ui/state-panel.tsx` renders a
  reason, freshness, optional action and accessible heading. The Signal hub,
  catalog table, plans page, admin analytics and list panels call the shared
  component instead of ad-hoc copy.
- **Tests Added:** Yes — `tests/state-panel.test.mjs` asserts the labels remain
  distinct.
- **Gate output:** check, 956 tests (955 pass, 1 skipped, 0 fail), quality,
  build, HTTP 751 checks and recovery pass at `35c1d35`.
- **Limitation:** no browser or screen-reader interaction test was run; the
  tests cover the state vocabulary, not rendered keyboard behavior.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** one actionable state pattern replaced inconsistent empty
  branches; private failures remain private.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-134-consistent-empty-states.md`.
