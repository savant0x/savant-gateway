# FID: Sandbox pricing economics report

**Filename:** `FID-2026-1103-153-sandbox-pricing-economics-report.md`
**ID:** FID-2026-1103-153
**Severity:** high
**Status:** converged
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

- **Commit SHA:** none; planning contract only.
- **Step statuses:** all six steps are `implemented (design)`.
- **Archived:** no.

## Resolution

- **Convergence Date:** 2026-11-03
- **Implementation:** not started.
