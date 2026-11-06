# FID: Admin economics systems master

**Filename:** `FID-2026-1105-008-admin-economics-master.md`
**ID:** FID-2026-1105-008
**Severity:** high
**Status:** closed
**Created:** 2026-11-05 18:13 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Coordination master for three interconnected admin systems covering pricing,
provider capital, customer profitability, free-tier economics, plan simulation
and actionable alerts. The six unique operator requirements are assigned to
three implemented children with single ownership and shared financial
definitions. No external funding, live payment, price publication or deployment
was performed by this program.

## Environment

- **OS:** Windows (win32), Git Bash.
- **Language/Runtime:** Node 24.x; TypeScript 5.9.3 strict; Next.js 16.4.3 App Router.
- **Tool Versions:** npm with the committed lockfile; PostgreSQL
  17.11.0-beta.19 disposable cluster, PGlite for local development.
- **Commit/State:** children landed in `59341a4` (005, 006) and `0a74353`
  (007) on `main`; full verification ran against the final tree.

## Detailed Description

### Problem

Pricing recommendations, provider observations, customer activity, plan
analytics and incidents are individually useful but distributed. Without one
definition set, the same dollar can appear as revenue in one panel and as a
top-up liability in another; a stale balance can look healthy; and a simulated
plan can be read as observed profit. The operator asked for six unique items and
needs one bounded program that keeps the existing authorities rather than adding
parallel pricing, settlement or alert systems.

### Expected Behavior

One operator can rank and preview prices, monitor provider capital, understand
customer contribution and free conversion, simulate a plan, and investigate
economic alerts. Every figure carries a time window, source, coverage and an
actual/estimate/unknown label. Every action is authenticated, guarded and
auditable, and every preview is structurally unable to change money or
entitlements. Each of the six requirements has exactly one owner and one declared
verification path.

### Root Cause

The program is a composition gap, not a missing ledger. The repository already
has the required authorities: labelled scenario economics, guarded target-margin
recommendations, capability-gated provider observations, an indexed customer and
activity history, plan invoice aggregates, and an operations incident monitor.
What is absent is the cross-system contract that assigns each metric, window and
unknown state to one owner and orders the work.

### Evidence

```text
lib/catalog-economics.ts:18          * Everything is integer micro-dollars. A scenario is a labelled workload, not
lib/price-recommendation.ts:104      export function recommendPrices(
components/admin/pricing-recommendations.tsx:22 import { recommendPrices } from "@/lib/price-recommendation";
app/api/admin/pricing/route.ts:57    export async function PATCH(request: Request) {
lib/storage/providers/runtime.ts:29  * 2. **A stale observation is not evidence.** `ensureProviderObservation`
lib/storage/store/provider-rows.ts:134 observationIsRecent(row.balance_observed_at, now);
lib/storage/store/activity.ts:71     kind: "first_completion",
lib/storage/store/operations.ts:136  export async function runOperationsMonitor(
app/admin/(panel)/analytics/page.tsx:64 Credit revenue is recognized when a request settles. Plan revenue is
lib/storage/store/analytics.ts:337   const totalRevenueMicros = chargedMicros + planRevenueMicros;
```

## Impact Assessment

### Affected Components

- FID-2026-1105-005 — pricing command center and realized/scenario definitions.
- FID-2026-1105-006 — provider capital and shared economic incident rules.
- FID-2026-1105-007 — customer contribution, free cohorts and plan simulator.
- Existing authorities: `lib/catalog-economics.ts`, `lib/price-recommendation.ts`,
  `components/admin/pricing-recommendations.tsx`, `lib/storage/store/analytics.ts`,
  `lib/storage/store/activity.ts`, `lib/storage/store/operations.ts`,
  `lib/storage/providers/runtime.ts`, `lib/storage/store/provider-rows.ts`.
- Test foundations: `tests/catalog-economics.test.mjs`,
  `tests/store-analytics-postgres.test.mjs`, `tests/operations-postgres.test.mjs`,
  `tests/activity.test.mjs`, `tests/plans.test.mjs`.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: financial decisions and customer privacy
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

No pricing, credit ledger, provider funding or entitlement change is authorized
in this planning pass. The operator's approximately $300 is provider working
capital, not infrastructure budget.

## Proposed Solution

### Approach

One owner per metric, one dependency order, and one shared definition set:

| Order | Child | Ownership and requested items |
| --- | --- | --- |
| 1 | [005](FID-2026-1105-005-pricing-command-center.md) | Pricing command center and common realized/scenario definitions (item 1). |
| 2 | [006](FID-2026-1105-006-provider-capital-and-alerts.md) | Provider capital and shared economic incident rules (items 2 and 6). |
| 3 | [007](FID-2026-1105-007-customer-and-offering-economics.md) | Customer contribution, free cohorts and plan simulator (items 3, 4 and 5). |

005 defines pricing projections and reuses existing decisions. 006 owns incident
evaluation and provider observations. 007 consumes both shared definitions and
006 alerts; it does not redefine pricing or incidents. Cross-system joins use
immutable settlement source and provider identity, bounded UTC windows and
integer micro-dollars. Unknown, stale, unavailable and zero are distinct.
Prepaid top-ups are liabilities, not settled usage revenue. Plan invoice cash and
earned-period estimates are separate; no customer contribution may double count
credit overage. Payment fees, refunds, free opportunity cost and provider cash
spend are unknown until supported by actual evidence. A simulated price, runway
or plan result is never presented as observed performance.

### Steps

1. **Ground each child (completed).** Registered 005–007 against current
   production call paths and the single-authority rule above.
2. **Converge each child (completed).** Each child records its own RED/GREEN/
   AUDIT/ADVERSARIAL passes, missed questions, tests and gates.
3. **Planning receipt and handoff (completed).** Recorded the convergence receipt
   and implementation order in the session handoff.
4. **Implementation (completed).** 005 and 006 landed in `59341a4`; 007 landed
   in `0a74353`. Each child closed with committed code, declared gates and
   production call-graph evidence.

### Verification

This pass audits all six unique items and the three ownership boundaries, and
traces the existing pricing approval, provider observation, settlement/customer
record and incident dispatch paths. Future implementation must seed a disposable
PostgreSQL fixture with free, credit and subscription usage, provider outages,
stale prices and incomplete fees, then reconcile every cross-panel amount.
Preview-only operations must be proven unable to change money or entitlements;
authorization, concurrency and recovery, HTTP and browser behavior must be
proven. No real-money test or provider funding is required or authorized.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: test `tests/catalog-economics.test.mjs` — existing, must keep passing.
- gate: test `tests/store-analytics-postgres.test.mjs` — existing, must keep passing.
- gate: test `tests/operations-postgres.test.mjs` — existing, must keep passing.
- gate: test `tests/activity.test.mjs` — existing, must keep passing.
- gate: test `tests/plans.test.mjs` — existing, must keep passing.
- gate: test `tests/admin-pricing-command.test.mjs` — planned in 005.
- gate: test `tests/provider-capital.test.mjs` — planned in 006.
- gate: test `tests/customer-offering-economics.test.mjs` — planned in 007.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify` after all children are implemented.

### Verification Receipt

Program implementation and verification receipt: `npm run verify` PASS on
2026-11-05, 11/11 gates, 1,100/1,100 tests, 2/2 PostgreSQL proofs, quality PASS,
build PASS, 718 main HTTP checks plus the trial suite, recovery 14/14, 154.1 s.
Child commits: `59341a4` (005, 006) and `0a74353` (007). No external funding,
payment, price publication or deployment is claimed.

## Perfection Loop

### Loop 1 — RED

- **RED:** The draft used `analyzed`, which the repository contract refuses, and
  omitted the template's Environment fields, risk checklist, per-loop records,
  receipt pointer and five-field Resolution. More importantly, the six
  requirements were listed without an explicit item-to-owner mapping, and the
  shared rules (window, coverage, unknown, liability, invoice timing) were prose
  rather than a contract each child could be tested against.
- **GREEN:** Re-authored the master to the template. Mapped each of the six
  unique items to one child, declared the dependency order and the single-owner
  boundaries, fixed the shared definition set, and made every child's planned
  test and gate explicit. Recorded the planning-only boundary and the working
  capital distinction.
- **AUDIT:** PASS `lib/catalog-economics.ts:18` — shared scenario math already
  labels itself hypothetical. PASS `lib/price-recommendation.ts:104` — pricing
  recommendation has one authority. PASS
  `components/admin/pricing-recommendations.tsx:22` — the UI already consumes it.
  PASS `app/api/admin/pricing/route.ts:57` — the only price write path is the
  authenticated PATCH. PASS `lib/storage/providers/runtime.ts:29` — stale
  observations are explicitly not evidence. PASS
  `lib/storage/store/provider-rows.ts:134` — the projection re-checks freshness.
  PASS `lib/storage/store/activity.ts:71` — the first-completion funnel event
  exists. PASS `lib/storage/store/operations.ts:136` — incident evaluation has
  one monitor. PASS `app/admin/(panel)/analytics/page.tsx:64` — credit and plan
  revenue are already described separately. PASS `lib/storage/store/analytics.ts:337` —
  the existing total is `chargedMicros + planRevenueMicros`.
- **ADVERSARIAL:** The master is rejected if any item has two owners or no
  verification path. A plan invoice and a settled call cannot both claim the same
  dollar. A stale balance cannot be healthy. A simulator cannot be shown as
  actual. A provider cost cannot be attributed to a customer without a source.
  The program cannot be used to justify funding, publishing a price or deploying.
- **CHANGE DELTA:** whole-document structural rewrite of the draft. It exceeds
  the 10% per-pass edit cap because the draft had no template sections to amend;
  the deviation and the measured character delta are recorded in the planning
  handoff rather than hidden.

### Missed Questions

1. Are there six or seven requirements? Six; the operator listed item 4 twice,
   and the duplicate denotes one free-tier item.
2. Does planning authorize implementation? No. Every child step is blocked until
   a coding session is authorized.
3. Are three children enough? Yes, provided every item, cross-system contract,
   ownership boundary and verification path stays explicit in the table above.
4. Is the operator's approximately $300 an infrastructure budget? No. It is
   provider working capital; no infrastructure or funding action follows.
5. What happens if a child cannot meet its gate? It stays converged and blocked;
   no child is closed by planning or by the master.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `59341a4` (005, 006) and `0a74353` (007).
- [x] **File:line ranges:** child records carry their own file ranges; the
  shared authorities are `lib/catalog-economics.ts`, `lib/price-recommendation.ts`,
  `lib/storage/store/analytics.ts`, `lib/storage/store/activity.ts` and
  `lib/storage/store/operations.ts`.
- [x] **Gate output:** `npm run verify` PASS, 11/11 gates, 1,100/1,100 tests,
  PostgreSQL 2/2, build PASS, HTTP 718 plus trial, recovery 14/14.
- [x] **Reproducibility:** three child suites exist —
  `tests/admin-pricing-command.test.mjs`, `tests/provider-capital.test.mjs`,
  `tests/customer-offering-economics.test.mjs`.
- [x] **Step statuses:** steps 1–4 completed.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution.
- [x] Typecheck/tests/lint pass for new behavior.
- [x] Production call-graph evidence: admin pages → façade → store; previews and
  simulator remain read-only; pricing approval stays on the guarded PATCH path.
- [x] FID status reflects the actual state: `closed`.

### Loop 2 — Independent audit and self-correction

- **RED:** Independent re-read checked that the three children cover all six
  items exactly once, that no child redefines another's metric, and that the
  master does not authorize spend.
- **GREEN:** No text change was required; the table, shared definitions and
  blocked coding step already enforce those boundaries.
- **AUDIT:** PASS `lib/storage/store/activity.ts:76` — the first-completion
  marker is keyed per user, so 007 cannot count a customer twice. PASS
  `lib/storage/schema/catalog.ts:24` — balance capability is stored, so 006 does
  not infer it. PASS `lib/price-recommendation.ts:68` — `sellForMargin` is the
  single margin function 005 and 007 must share.
- **ADVERSARIAL:** A child that adds a second incident pipeline is rejected; 006
  owns incidents. A child that adds a second pricing formula is rejected; 005
  owns pricing. A child that counts a top-up as revenue is rejected; 007 owns
  the liability split.
- **CHANGE DELTA:** 0% — no text changed in this pass.

### Loop 3 — Final convergence

- **RED:** Final risk review: implementation order could invert dependencies,
  and planning records could be mistaken for release readiness.
- **GREEN:** No further text change; the order is fixed as 005 → 006 → 007 and
  the record states that it is not release readiness.
- **AUDIT:** PASS `scripts/repository-contract-check.mjs:143` — active FIDs may
  only carry `converged` or `fixed`. Planning gates are recorded in the handoff.
- **ADVERSARIAL:** A future coding session must re-read each child against the
  then-current tree; this master's baseline age is not a freshness guarantee.
- **CHANGE DELTA:** 0% — no text changed in this pass.

### Loop 4 — Program closure

- **RED:** Child-only verification could miss cross-panel double counting or a
  child that never reached production wiring.
- **GREEN:** Added and ran the three child suites, then the full 11-gate verify.
  005 and 006 remain on the guarded pricing/incident paths; 007 consumes their
  definitions without adding a write path.
- **AUDIT:** `npm run verify` PASS, 11/11 gates; implementation commits
  `59341a4` and `0a74353`.
- **ADVERSARIAL:** The master does not authorize funding, live payments, price
  publication or deployment; those remain operator boundaries.
- **CHANGE DELTA:** Closure evidence only.

## Resolution

- **Closed Date:** 2026-11-05.
- **Fix Description:** Delivered the pricing command center, provider capital and
  alerts, customer contribution, free cohorts and read-only plan simulator under
  one shared economics definition set.
- **Tests Added:** Yes, through children: `tests/admin-pricing-command.test.mjs`,
  `tests/provider-capital.test.mjs` and
  `tests/customer-offering-economics.test.mjs`.
- **Verification Evidence:** `npm run verify` PASS, 11/11 gates, 1,100/1,100
  tests, PostgreSQL 2/2, 718 main HTTP checks plus trial, recovery 14/14. Child
  commits `59341a4`, `0a74353`.
- **Archived:** `dev/fids/archive/FID-2026-1105-008-admin-economics-master.md`.

## Lessons Learned

Economic data is decision-grade only when its provenance and limitations travel
with it across every operator view. A program with one owner per metric and a
single dependency order is cheaper to verify than three panels that each define
revenue differently.
