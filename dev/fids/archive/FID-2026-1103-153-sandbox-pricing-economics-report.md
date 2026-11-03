# FID: Sandbox pricing economics report

**Filename:** `FID-2026-1103-153-sandbox-pricing-economics-report.md`
**ID:** FID-2026-1103-153
**Severity:** high
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified
**Depends on:** FID-2026-1103-152

## Summary

The gateway already pulls upstream catalog data and computes guarded pricing
recommendations. Before any real-money activity, the operator needs a complete
sandbox report showing current cost, sell price, margin, route, recommendation,
and risk flags for every paid model. The report must recommend but never silently
change a price.

## Proposed Solution

1. Pull the latest provider catalogs and record source timestamps, route/provider,
   cost source, and stale/unknown-cost status.
2. Generate the existing recommendation output for paid rows using the configured
   target margin, scenario workload, rounding, price ceiling, and route semantics.
3. Compare current versus recommended prices and classify changes as safe,
   review-required, blocked, free, subscription, stale, or unknown.
4. Include input/output cost, sell price, margin, blended scenario profit,
   price-source, serving-provider, and explanation per row.
5. Export a redacted report and review the highest-impact price changes without
   approving or publishing them automatically.
6. Test the report against free, subscription, stale, unknown, route takeover,
   manual-price, zero-cost, and negative-margin cases.

## Verification Gates

- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run quality`
- `npm run build`
- `npm run test:http`
- `tests/catalog-economics.test.mjs`
- `tests/price-recommendation.test.mjs`
- `tests/pricing-decisions.test.mjs`

## Perfection Loop

### Loop 1 — RED/GREEN/AUDIT/ADVERSARIAL

- **RED:** automatic price sourcing exists, but the operator lacks one complete
  sandbox economics report and route-aware review.
- **GREEN:** reuse the shared economics projection and recommendation engine;
  separate scenario profit from realized profit.
- **AUDIT:** grep callers from catalog/pricing pages through recommendation and
  decision storage; verify no auto-publish path exists.
- **ADVERSARIAL:** stale costs, provider takeover, free rows, manual prices,
  rounding, ceilings, and missing usage must not produce false profit.
- **CHANGE DELTA:** 8%; converged.

### Loop 2 — Independent audit

- **RED:** a report could be numerically correct but operationally misleading if
  route and cost age are hidden.
- **GREEN:** route, cost source, timestamp, and blockers are required columns.
- **AUDIT:** compare the report contract with `lib/price-recommendation.ts`,
  `lib/pricing.ts`, and `AdminModelSummary`.
- **ADVERSARIAL:** no recommendation is eligible with stale or unknown cost.
- **CHANGE DELTA:** 3%; converged.

### Loop 3 — Final convergence

- **RED:** no further actionable issue.
- **GREEN:** report is sandbox-only, explainable, and approval-gated.
- **AUDIT:** all six steps and every promised test are named.
- **ADVERSARIAL:** no real-money execution is required or implied.
- **CHANGE DELTA:** 1%; converged.

### Missed Questions

1. **Should this change prices?** No; report first, approve explicitly later.
2. **What is profit?** Scenario profit is modeled; realized profit requires usage.

## Implementation Evidence

- **Commit SHA:** `7e24f0e`.
- **Files:** `lib/pricing-report.ts`, `lib/pricing-report-types.ts`,
  `lib/pricing-report-classify.ts`, `scripts/sandbox-pricing-report.mjs`,
  `tests/pricing-report.test.mjs`, `package.json` (`report:pricing`).
- **Step 1-4 implemented:** the report reads the PostgreSQL catalog without a
  migration or write, records provider `syncedAt` timestamps and the serving
  route, and emits cost, current sell, per-direction margin, scenario profit,
  guarded recommendation, class, blockers, warnings and explanation per row.
- **Step 5 implemented:** `npm run report:pricing` writes the redacted JSON and
  Markdown receipts at `dev/receipts/2026-11-03-sandbox/pricing-report.json` and
  `pricing-report.md`. The run classified 44 rows: 11 free, 10 subscription, 23
  safe, 0 review-required, 0 blocked. Modeled paid scenario profit was $3.33 at
  current prices and $5.71 at the 30% target recommendation. No price, decision
  row, provider row or catalog row was written.
- **Step 6 implemented:** `tests/pricing-report.test.mjs` covers free,
  subscription, stale, unknown, route takeover, manual price, zero cost,
  negative margin, price ceiling, out-of-catalog and deterministic sort/queue
  behavior. The named `catalog-economics`, `price-recommendation` and
  `pricing-decisions` suites are in the full test run.
- **Verification:** targeted report tests 10/10 pass; full `verify` 969/969 tests
  pass, 0 skipped, exit 0; `quality` PASS. The lint gate has zero errors and the
  six pre-existing warnings in untouched `lib/launch-receipt.ts` remain.
- **Secret boundary:** the report records database host/name (never the
  connection string), provider key variable names (never values or presence),
  and no payment/provider credentials.
- **Archived:** yes — moved to `dev/fids/archive/` after the verification commit.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** a read-only sandbox economics report now reuses the shared
  catalog projection and recommendation engine, classifies every row, and exports
  JSON/Markdown without any auto-publish path.
- **Verification Evidence:** `node --test tests/pricing-report.test.mjs` (10
  pass), `npm run verify` (969/969, all ten gates pass), and the two receipts in
  `dev/receipts/2026-11-03-sandbox/`.
- **Archived:** yes.
