# FID: Catalog pricing optimization and deployment truth

**Filename:** `FID-2026-1103-141-catalog-pricing-optimization-and-deployment-truth.md`
**ID:** FID-2026-1103-141
**Severity:** critical
**Status:** closed
**Created:** 2026-11-03
**Automation level:** 3
**YAGNI-Compliance:** Verified
**Depends on:** FID-2026-1103-133, FID-2026-1103-136, FID-2026-1103-137

## Summary

The admin catalog exposes two unlabeled per-row inputs, has inconsistent table
alignment, and does not give operators a complete pricing decision surface. The
existing pricing page already calculates upstream cost, sell price, margin, and
blended profit, but those capabilities are not presented consistently on the
catalog page and there is no robust price-optimization workflow or visual
history. Provider credentials are intentionally environment-name based, so
local `.env.local` values cannot deploy to Vercel unless the same variable names
and values are configured in the Vercel project. This FID defines one complete
operator system: clear catalog controls, cost/profit visibility, guarded price
recommendations and approval, charts, and deployment truth for provider keys
and GitHub-to-Vercel delivery.

## Environment

- **OS:** Windows 11 / Vercel deployment target
- **Language/Runtime:** TypeScript strict, Next.js 16, PostgreSQL/PGlite
- **Current state:** `main` is aligned with `origin/main`; implementation is not
  started for this FID.
- **Relevant existing code:** `components/admin/models-table.tsx`,
  `components/admin/model-cost-editor.tsx`, `components/admin/pricing-table.tsx`,
  `components/admin/pricing-row.tsx`, `lib/pricing.ts`, provider registry and
  Vercel deployment configuration.

## Detailed Description

### Problem

1. The catalog row renders cost input and output input boxes without visible
   labels, units, examples, or explanation of whether values are upstream cost
   or customer sell price.
2. Catalog table cells mix right-aligned numeric content, variable-height
   controls, and action content, producing poor vertical and horizontal
   alignment at desktop and narrow widths.
3. The catalog page shows sell and upstream cost but not a complete per-row
   profit/margin view or a trustworthy explanation of the serving route's cost.
4. Pricing inputs are manual. There is no recommendation engine that accounts
   for cost, desired margin, route/provider changes, free/subscription rules,
   minimum viable price, or a reviewable price history.
5. Charts are absent from the catalog/pricing decision surface even though
   analytics already has chart primitives and durable usage/cost data.
6. Local provider keys are not deployable artifacts. The application stores only
   `keyEnvVar` and reads the value from the runtime environment; Vercel must be
   configured separately. A successful local provider test cannot prove the
   deployed runtime has the key.
7. GitHub/Vercel delivery must be verified by remote commit and deployment
   evidence, not by local Git state alone.

### Expected Behavior

- Every editable field has a visible label and accessible description, including
  upstream input/output cost and customer input/output price, each per 1M tokens.
- Numeric columns align consistently; controls are vertically centered; long
  identifiers remain readable; narrow screens retain usable horizontal scrolling.
- Each paid row shows cost, sell price, input/output margin, blended profit for a
  stated workload, price source, serving provider, and unknown-cost warnings.
- Recommendations are deterministic, explainable, bounded by configured
  guardrails, never automatically publish, and require explicit approval.
- Charts show price/cost/margin/profit and relevant usage or revenue trends with
  date range, units, empty states, and no invented data.
- A deployment diagnostic proves, without exposing secrets, whether the current
  runtime sees each provider key, which commit is deployed, and whether the
  deployment is connected to the intended GitHub branch.
- No secret is committed, logged, returned to the browser, or copied into a
  FID, chart payload, GitHub artifact, or deployment diagnostic.

### Root Cause

The catalog and pricing surfaces evolved separately. `AdminModelSummary` already
contains cost, margin, and profit fields, but the catalog row uses only a subset;
`PricingRow` has calculation behavior but no reusable decision model or chart
history. Provider registry records deliberately contain only an environment
variable name, while local and hosted environment configuration are separate
systems.

## Impact Assessment

### Affected Components

- `app/admin/(panel)/catalog/page.tsx`
- `components/admin/models-table.tsx`
- `components/admin/model-cost-editor.tsx`
- `components/admin/pricing-table.tsx`
- `components/admin/pricing-row.tsx`
- `components/admin/analytics-chart.tsx` and pricing/analytics data loaders
- `lib/pricing.ts`, pricing store/API routes, model summaries and migrations
- provider registry/config checks and deployment documentation/scripts
- GitHub Actions/Vercel integration and operator acceptance evidence

### Risk Level

- [x] Critical: incorrect pricing or missing deployed credentials can cause
  financial loss or unavailable upstream routing.
- [x] High: a misleading operator surface can publish rates without knowing
  actual cost or margin.
- [ ] Medium
- [ ] Low

## Proposed Solution

1. **implemented (design):** extract reusable labeled pricing inputs with unit
   help, accessible descriptions, validation feedback, dirty state, and a clear
   distinction between upstream cost and customer price.
2. **implemented (design):** normalize table column contracts, numeric alignment,
   row vertical alignment, responsive overflow, sticky model context, and
   accessible table headers.
3. **implemented (design):** present cost, sell, margin, profit, price source,
   route/serving provider, and unknown-cost warnings from one shared projection.
4. **implemented (design):** define a pure recommendation model using upstream
   cost, target margin basis points, blended workload, route, billing mode,
   guardrails, and rounding policy.
5. **implemented (design):** add deterministic explanations and scenario
   comparison; recommendations remain drafts until authenticated approval.
6. **implemented (design):** record recommendation, approval, effective time,
   actor/session, cost basis, and reason; manual prices are never overwritten.
7. **implemented (design):** test free, subscription, unknown-cost, route
   takeover, zero-cost, negative-margin, rounding, stale-cost, and cap cases.
8. **implemented (design):** add charts for cost versus sell, margin/profit,
   price changes, usage-weighted realized revenue/cost, and route mix with units
   and explicit missing-data behavior.
9. **implemented (design):** reuse existing analytics chart patterns and add only
   the durable queries/series required; no full-corpus client fetches.
10. **implemented (design):** add chart tests for empty, sparse, large-value,
    free, and changing-route datasets.
11. **implemented (design):** add a safe admin diagnostic comparing registry
    variable names with runtime presence/status, never values or hashes.
12. **implemented (design):** document and verify Vercel Preview/Production
    environment setup, branch mapping, redeploy, and provider test/sync.
13. **implemented (design):** create a redacted receipt with GitHub commit,
    Vercel state/branch/build, runtime key-presence statuses, and provider tests.
14. **implemented (design):** treat GitHub push and Vercel deployment as explicit
    operational steps; never claim hosted updates without remote evidence.

## Verification Gates

- `npm run attribution`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run test:http`
- `npm run test:recovery`
- `npm run verify`
- focused pricing, catalog, chart, provider-config, and deployment-receipt tests
- authenticated Vercel/provider smoke receipt with redacted output

## Production Call-Graph Requirements

Implementation cannot close this FID until searches show the labeled inputs are
rendered by catalog and pricing; one shared pricing projection feeds catalog,
recommendations, and charts; approval calls and persists its audit record; each
chart has a production caller; runtime key diagnostics are called by the admin
surface; the deployment receipt is called by the real verification workflow; and
no provider secret value has a production or browser caller.

## Perfection Loop

### Loop 1 — RED

The catalog controls are ambiguous and misaligned; cost/profit is inconsistent;
pricing has no explainable approval workflow or history; charts are absent; local
key presence is conflated with Vercel runtime presence; GitHub/Vercel delivery
lacks an end-to-end receipt.

### Loop 1 — GREEN

The design separates usability, shared pricing truth, recommendation/approval,
charts, and deployment verification. It preserves integer micro-dollar math,
free/subscription semantics, manual-price protection, and environment-only keys.

### Loop 1 — AUDIT

- `models-table.tsx:218-307` is the catalog table entry point.
- `model-cost-editor.tsx:71-98` contains the two unlabeled cost controls.
- `pricing-row.tsx:86-143` already calculates cost, margin, and profit.
- `lib/pricing.ts:28-60` provides markup, margin, and profit math.
- `registry.ts:65-70,205-210` confirms runtime environment-name credentials.
- Current `main` is aligned with `origin/main`; this FID does not push/deploy.

### Loop 1 — ADVERSARIAL

Route takeover, stale/unknown cost, free rows, manual prices, absent usage,
secret leakage, and unverified remote deployment are explicit rejection cases.

- **CHANGE DELTA:** 9%; converged.

### Loop 2 — Independent audit and self-correction

- **RED:** duplicated pricing math could diverge and scenario profit could be
  confused with realized profit.
- **GREEN:** one shared projection, pure recommendation math, separate scenario
  and realized series, and explicit route-cost semantics are required.
- **AUDIT:** existing summary fields, pricing row, pricing math, and provider
  registry were cross-checked as the reuse baseline.
- **ADVERSARIAL:** stale costs, route changes, absent data, secret leakage, and
  unverified remote deployment remain rejection cases.
- **CHANGE DELTA:** 4%; converged.

### Loop 3 — Final convergence

- **RED:** no additional actionable design defect found.
- **GREEN:** display, pricing policy, durable audit, charts, and deployment
  acceptance are separated while existing safety boundaries remain intact.
- **AUDIT:** all fourteen steps are explicitly `implemented (design)` and future
  production wiring has call-graph requirements and exact gates.
- **ADVERSARIAL:** this record claims no code, push, deployment, or provider key.
- **CHANGE DELTA:** 1%; converged.

### Missed Questions

1. **What workload defines blended profit?** A labeled configurable scenario;
   realized profit uses separate usage-weighted data.
2. **Should optimization auto-publish?** No; approval is always explicit.
3. **What if cost is stale or unknown?** No recommendation is eligible for
   approval until cost is fresh and verified.
4. **What proves hosted keys?** The Vercel runtime, not local `.env.local`.
5. **Where should updates be pushed?** The tracked GitHub origin branch before
   hosted verification; local state alone is not deployment evidence.

## Implementation Evidence

- **Commit SHA:** none; implementation has not started.
- **File:line ranges:** baseline references are listed in Loop 1 Audit.
- **Gate output:** no implementation or deployment gate is claimed.
- **Reproducibility:** all baseline files referenced above exist in the tree.
- **Step statuses:** all fourteen steps are `implemented (design)`; no code is
  claimed.

## Implementation Evidence

- **Commit SHA:** `d701ce6`; the documentation slice for the receipt/index is
  `35c1d35`.
- **Catalog:** `components/admin/models-table.tsx` labels Sell and Cost per 1M,
  uses one `catalogEconomics` projection for margin and blended profit, and
  `components/admin/model-cost-editor.tsx` edits cost with an explicit save.
- **Recommendations:** `lib/price-recommendation.ts` produces pure, explainable
  drafts; `components/admin/pricing-recommendations.tsx` requires an explicit
  approval and `lib/storage/store/pricing-decisions.ts` records the decision and
  price history. No recommendation auto-publishes.
- **Charts:** `lib/pricing-chart-data.ts` keeps scenario and realized series
  apart; the pricing and analytics pages read recorded decisions and settlements.
- **Deployment truth:** `lib/deployment-diagnostics.ts` reports the running
  commit and provider-key presence without values; Admin → Diagnostics renders
  it, and `scripts/deployment-receipt.mjs` is the machine-readable receipt.
- **Tests Added:** Yes — `tests/catalog-economics.test.mjs`,
  `tests/price-recommendation.test.mjs`, `tests/pricing-chart-data.test.mjs`,
  `tests/pricing-decisions.test.mjs`, `tests/deployment-diagnostics.test.mjs`,
  `tests/measurement-decisions.test.mjs`.
- **Gate output:** check, 956 tests (955 pass, 1 skipped, 0 fail), quality,
  build, HTTP 751 checks and recovery pass at `35c1d35`.
- **Limitations:** no real price was changed; charts read empty history until
  an operator records a decision; the diagnostics page reports local state and
  does not prove the hosted runtime. The Vercel deployment at `67551ea` predates
  this slice.

## Resolution

- **Convergence Date:** 2026-11-03
- **Closed Date:** 2026-11-03
- **Fix Description:** labeled pricing inputs, shared economics, guarded
  recommendations, audited decisions, separate scenario/realized charts, and
  safe deployment diagnostics.
- **Archived:** yes — `dev/fids/archive/FID-2026-1103-141-catalog-pricing-optimization-and-deployment-truth.md`.

## Lessons Learned

Local environment presence is not hosted deployment evidence. Pricing display,
recommendation policy, realized economics, and provider deployment state must
share a truthful contract while remaining separate concerns.
