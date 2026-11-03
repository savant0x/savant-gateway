# FID: Sandbox pricing history and charts

**Filename:** `FID-2026-1103-154-sandbox-pricing-history-and-charts.md`
**ID:** FID-2026-1103-154
**Severity:** medium
**Status:** converged
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified
**Depends on:** FID-2026-1103-153

## Summary

Pricing charts are wired, but meaningful history requires safe sandbox
observations. This FID populates and reviews price-decision, usage, cost,
revenue, margin, profit, and route-mix series without using real money, while
keeping modeled scenario data separate from realized settlement data.

## Proposed Solution

1. Establish a disposable/sandbox dataset and label every generated observation.
2. Record recommendation and approval history only through the production
   decision path; do not write directly around audit storage.
3. Exercise safe mock/sandbox inference and settlement paths to create usage and
   realized cost/revenue observations.
4. Render pricing and analytics charts with explicit units, date range, source,
   sparse/empty behavior, and route changes.
5. Compare chart totals against ledger/usage projections and confirm no missing
   values become zero profit.
6. Remove or isolate disposable observations according to existing test-data
   policy and preserve the redacted chart receipt.

## Verification Gates

- `npm test`
- `npm run test:http`
- `npm run test:recovery`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `tests/pricing-chart-data.test.mjs`
- `tests/measurement-decisions.test.mjs`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** empty chart history can be mistaken for zero economics.
- **GREEN:** scenario and realized series are separate and every chart declares
  source and missing-data semantics.
- **AUDIT:** trace chart data from storage through pricing and analytics pages.
- **ADVERSARIAL:** sparse days, route changes, free calls, failed settlements,
  large values, and deleted disposable data must remain honest.
- **CHANGE DELTA:** 8%; converged.

### Loop 2 — Independent audit

- **RED:** generated sandbox rows could contaminate operator economics.
- **GREEN:** mark disposable observations and isolate them by dataset/receipt.
- **AUDIT:** verify recovery and reconciliation before/after the exercise.
- **ADVERSARIAL:** a failed cleanup must be visible and must not be presented as
  production history.
- **CHANGE DELTA:** 3%; converged.

### Loop 3 — Final convergence

- **RED:** no further actionable issue.
- **GREEN:** charts are evidence tools, not automatic price controls.
- **AUDIT:** all six steps and chart test artifacts are named.
- **ADVERSARIAL:** no real payment, funding, or live customer traffic required.
- **CHANGE DELTA:** 1%; converged.

### Missed Questions

1. **Can sandbox usage count as real profit?** No; it is labeled synthetic or
   sandbox and excluded from production economics.
2. **Should charts auto-refresh provider prices?** No; sync and reporting are
   explicit, preserving source timestamps.

## Implementation Evidence

- **Commit SHA:** none; planning contract only.
- **Step statuses:** all six steps are `implemented (design)`.
- **Archived:** no.

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** not started.
