# FID: Sandbox pricing history and charts

**Filename:** `FID-2026-1103-154-sandbox-pricing-history-and-charts.md`
**ID:** FID-2026-1103-154
**Severity:** medium
**Status:** closed
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

- **Commit SHA:** `7e24f0e`.
- **Files:** `scripts/sandbox-chart-receipt.mjs`, receipts at
  `dev/receipts/2026-11-03-sandbox/charts.json`, `charts.html` and
  `charts-run.log`.
- **Steps 1-2 implemented:** the receipt seeds only a disposable database and
  labels every observation `synthetic-sandbox`. Two price approvals go through
  `setModelPricing`, so the price update and its `pricing_decisions` audit row
  commit together; no audit table is written around the production path.
- **Step 3 implemented:** two synthetic credit calls are admitted with
  `openCallSettlement` and settled with `settleCall`, exercising the production
  usage/ledger path. No provider was called and no real money moved.
- **Step 4 implemented:** the run rendered the margin distribution, approved
  price history, route mix and 30-day daily-money series into `charts.html` with
  units, source, date range and explicit empty behavior. The production React
  charts remain build-gated rather than browser-rendered.
- **Step 5 implemented:** reconciliation is exact. 2 usage rows produced
  $114,400 charged and $35,200 upstream cost; the analytics total and the daily
  series both equal those integers. 2 approvals equal 2 price-history changes.
  The unused paid model is absent from `analytics.models`, not shown as zero
  profit. Empty margin/history inputs return zero rows and the explicit empty
  state is recorded.
- **Step 6 implemented:** database `gateway_chart_1793749036008` was created on
  the configured Supabase cluster, used only for this run, and dropped in the
  runner's `finally` block. `charts-run.log` records both the create and drop.
- **Verification:** `charts.json` reports `reconciliation.exact: true`; full
  `verify` passed 969/969 unit tests and `tests/pricing-chart-data.test.mjs` and
  `tests/measurement-decisions.test.mjs` are in that run. `quality` PASS.
- **Archived:** yes — moved to `dev/fids/archive/` after the verification commit.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** a disposable-database chart receipt now populates pricing,
  usage, cost, revenue and route series through production write paths, renders
  them with explicit semantics, reconciles every total, and records cleanup.
- **Verification Evidence:** `dev/receipts/2026-11-03-sandbox/charts.json`
  (`exact: true`, seven checks), `charts.html`, `charts-run.log`, full `verify`
  (969/969, all gates pass).
- **Archived:** yes.
