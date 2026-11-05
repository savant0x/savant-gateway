# FID: Pricing command center

**Filename:** `FID-2026-1105-005-pricing-command-center.md`
**ID:** FID-2026-1105-005
**Severity:** medium
**Status:** closed
**Created:** 2026-11-05 18:13 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Converged design for an operator pricing command center. It ranks models by
realized contribution over a bounded UTC window, shows cost and comparison
freshness, and previews a price decision without writing one. The existing
recommendation and approval authority remains the only path that can change a
price. No price was changed, published or scheduled by this planning pass.

## Environment

- **OS:** Windows (win32), Git Bash.
- **Language/Runtime:** Node 24.x; TypeScript 5.9.3 strict; Next.js 16.4.3 App Router.
- **Tool Versions:** npm with the committed lockfile; PostgreSQL
  17.11.0-beta.19 disposable cluster, PGlite for local development.
- **Commit/State:** baseline `b24594b` on `main`. Pre-existing website-copy
  edits and two untracked conversation exports are preserved; this pass changes
  planning records only.

## Detailed Description

### Problem

The admin pricing surface has per-model recommendations and an approval flow,
but a single hypothetical scenario does not answer which models earn the most on
actual settled traffic. Model summaries, competitor observations and price
history are not joined with a common time window, cost source and coverage
denominator, so an operator cannot rank realized contribution or distinguish a
missing observation from a zero.

### Expected Behavior

An authenticated operator selects a bounded UTC window and sees a sortable,
paginated model table containing settled credit revenue, recorded upstream cost,
contribution, request count, token mix, current sell and cost rates, and the age
of any comparison. Unknown cost, absent benchmark and unobserved price remain
explicitly unknown rather than zero. Preview uses the current cost and price
versions, shows input and output prices plus margin, and labels any projection as
a historical-volume estimate that assumes demand is unchanged. Approval requires
a reason, reuses the existing decision endpoint and records before/after values
atomically; a preview whose inputs changed is rejected and must be re-run.

### Root Cause

The pieces exist but are not joined by one dated, coverage-aware projection.
`lib/catalog-economics.ts` deliberately treats its workload as hypothetical, so
it cannot be presented as realized profit. `recommendPrices` already owns target
margin math and the admin component already sends a required reason. The
analytics page already separates credit settlement from plan invoice cash.

### Evidence

```text
lib/catalog-economics.ts:18   * Everything is integer micro-dollars. A scenario is a labelled workload, not
lib/catalog-economics.ts:42   /** Profit for the labelled 1M-in + 1M-out scenario. */
lib/price-recommendation.ts:104 export function recommendPrices(
lib/price-recommendation.ts:199 reason: `Target ${(input.targetMarginBps / 100).toFixed(1)}% margin on ${input.costSource} cost, rounded up to the nearest ...
components/admin/pricing-recommendations.tsx:22 import { recommendPrices } from "@/lib/price-recommendation";
app/api/admin/pricing/route.ts:57 export async function PATCH(request: Request) {
app/admin/(panel)/analytics/page.tsx:64 Credit revenue is recognized when a request settles. Plan revenue is
lib/storage/store/analytics.ts:337 const totalRevenueMicros = chargedMicros + planRevenueMicros;
```

## Impact Assessment

### Affected Components

- `components/admin/pricing-recommendations.tsx` — existing preview and approval UI.
- `app/api/admin/pricing/route.ts` — existing authenticated decision endpoint.
- `lib/price-recommendation.ts` — existing target-margin recommendation authority.
- `lib/catalog-economics.ts` — labelled scenario math reused for preview.
- `lib/storage/store/analytics.ts` and `app/admin/(panel)/analytics/page.tsx` —
  settled credit revenue, plan invoice cash and their separation.
- Tests: `tests/pricing-decisions.test.mjs`, `tests/catalog-economics.test.mjs`,
  `tests/store-analytics-postgres.test.mjs`; new
  `tests/admin-pricing-command.test.mjs` at implementation time.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: financial display and an approval path that can change sell prices
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

The high rating is about misstatement and unauthorized price change, not about
data loss: the design is read-only except through the existing guarded endpoint.

## Proposed Solution

### Approach

Keep historical settled amounts immutable. Aggregate settled credit charges and
recorded costs by settled model, provider and UTC window, and expose the count
of rows whose cost is unknown instead of imputing a value. Plan invoice cash is
never allocated to individual calls without an explicit, labelled allocation, so
it is excluded from per-model contribution. Benchmark comparisons require a
matched model or SKU, currency, input/output unit and observation time; any
mismatch renders the comparison blank. Preview and approval share
`sellForMargin`/`recommendPrices` and the same rounding policy. Approval carries
the observed price version, cost version and recommendation inputs; the PATCH
handler rejects a stale or mismatched preview atomically and requires a
re-preview. Manual prices stay manual and every decision records before/after,
reason and actor through the existing audit history.

### Steps

1. **Bounded projection (complete).** Define one indexed, window-bounded
   aggregate over settled usage and recorded cost, including unknown-cost coverage.
2. **Rank and compare (complete).** Add sorting, pagination, tie-breaking and
   dated benchmark states to the pricing view.
3. **Guarded preview (complete).** Add a preview that uses current versions,
   labels historical-volume assumptions and performs no write.
4. **Guarded approval (complete).** Reuse the existing decision endpoint with
   version checks, mandatory reason and atomic before/after history.
5. **Honest states (complete).** Render unknown, stale, unavailable and zero as
   distinct states with keyboard and mobile support.

### Verification

Seed settled rows with known and unknown costs, free/credit/subscription
sources, changing prices, ties and an empty window. Reconcile every ranking to
existing analytics totals; prove unknown is not rendered as zero, a mismatched
benchmark is not compared, preview never writes, and a concurrent price change
rejects a stale approval. Exercise sorting, pagination, keyboard operation,
mobile layout and the stale/unknown states. Each promised test path must exist
and run before closure.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: test `tests/catalog-economics.test.mjs` — existing, must keep passing.
- gate: test `tests/pricing-decisions.test.mjs` — existing, extend.
- gate: test `tests/store-analytics-postgres.test.mjs` — existing, extend.
- gate: test `tests/admin-pricing-command.test.mjs` — planned; must exist and
  run before closure.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify` after implementation.

### Verification Receipt

Implementation record. `npm run verify` passed 11/11 gates on 2026-11-05:
1,075/1,075 tests with zero skips, PostgreSQL 2/2, quality PASS (647 files),
build PASS, 776 HTTP checks plus the trial suite, and recovery 14/14 in 155.5 s.
Implementation commit `59341a4`; `.verify/summary.json` holds the per-gate logs.

## Perfection Loop

### Loop 1 — RED

- **RED:** The draft used `analyzed`, a status the repository contract refuses
  for an active FID, and lacked the template's Environment fields, risk
  checklist, per-loop records, receipt pointer and five-field Resolution. Its
  planned test did not exist while the document still had to converge. Realized
  revenue, recorded cost, plan invoice cash and a hypothetical scenario were
  described but not separated as data contracts, and preview freshness was not
  testable.
- **GREEN:** Re-authored the record to the template. Named settled credit charge
  as the only realized per-call revenue; excluded plan invoice cash from
  per-model allocation; made unknown coverage a count rather than an imputation;
  required matched benchmark dimensions; made preview read-only and approval
  version-checked; declared the planned test and all gates.
- **AUDIT:** PASS `lib/price-recommendation.ts:104` — `export function recommendPrices(`
  is the existing margin authority, so the design extends rather than replaces it.
  PASS `components/admin/pricing-recommendations.tsx:22` — the UI imports that
  same function. PASS `app/api/admin/pricing/route.ts:57` — the authenticated
  `PATCH` endpoint already exists. PASS `lib/catalog-economics.ts:18` — the
  scenario is explicitly "a labelled workload, not" realized revenue. PASS
  `app/admin/(panel)/analytics/page.tsx:64` — credit revenue and plan revenue are
  already described separately. PASS `lib/storage/store/analytics.ts:337` —
  `chargedMicros + planRevenueMicros` is the existing total, so per-model views
  must not add plan cash again.
- **ADVERSARIAL:** Double counting subscription invoices is rejected by excluding
  plan cash from per-model contribution. Treating an absent cost as zero is
  rejected by the unknown-coverage count. Using a changed route's cost for
  historical usage is rejected by persisting the settled cost with the usage row.
  A stale approval is rejected by version comparison inside the PATCH handler.
  A mismatched or undated competitor row renders as blank, never as a saving.
  Ties use a stable secondary key so pagination cannot duplicate a row.
- **CHANGE DELTA:** whole-document structural rewrite of the 90-line draft. It
  exceeds the 10% per-pass edit cap because the draft had no template sections to
  amend; the deviation and the measured character delta are recorded in the
  planning handoff rather than hidden.

### Missed Questions

1. Is a 1M-in/1M-out scenario actual profit? No. It is a labelled hypothetical
   and must never be ranked as realized contribution.
2. Is plan invoice cash attributable to a model? Not without an explicit
   allocation. It is shown separately and excluded from per-model totals.
3. Can preview apply a price? No. Only the existing PATCH path can, after a
   reason and a fresh-version check.
4. What happens when cost is unknown? The row reports unknown coverage and
   contribution is not fabricated; the operator sees a partial total.
5. Does a benchmark alone justify a price? No. It is one dated input alongside
   cost, margin and realized traffic.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `59341a4`.
- [x] **File:line ranges:** `lib/pricing-command.ts:1-308` (window, sort,
  pagination, version and projection), `lib/storage/store/pricing-command.ts:1-203`
  (credit-only grouped read), `lib/storage/store/pricing-approval.ts:1-126`
  (conditional version-checked update), `app/api/admin/pricing/route.ts:1-248`
  (PATCH version enforcement), `components/admin/pricing-command.tsx:1-324`,
  `components/admin/pricing-volume-cell.tsx:1-42`,
  `components/admin/pricing-recommendations.tsx:1-397` (projection and expected
  version), `app/admin/(panel)/pricing/page.tsx` (window and volume wiring).
- [x] **Gate output:** `npm run verify` PASS — 11/11 gates, 1,075/1,075 tests,
  2/2 PostgreSQL, quality PASS (647 files), build PASS, 776 HTTP checks plus the
  trial suite, recovery 14/14, 155.5 s.
- [x] **Reproducibility:** `node --test tests/admin-pricing-command.test.mjs
  tests/pricing-decisions.test.mjs tests/store-analytics-postgres.test.mjs`;
  then `npm run verify`.
- [x] **Step statuses:** steps 1–5 complete. No price was published outside the
  guarded approval path; the command center and preview are read-only.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist (`app/api/admin/pricing/route.ts`,
  `components/admin/pricing-recommendations.tsx`, `lib/price-recommendation.ts`,
  `lib/catalog-economics.ts`).
- [x] Implementation matches the Proposed Solution: credit-only realized totals,
  unknown-cost coverage, read-only preview, version-checked approval and atomic
  decision history.
- [x] Typecheck, tests, lint, quality and build pass for the new behavior.
- [x] Production call-graph evidence: pricing page → `getPricingCommand`;
  approval PATCH → `approvePricingRecommendation` → conditional UPDATE and
  `recordPricingDecision` in one transaction.
- [x] FID status reflects the actual state: `closed`, archived after the
  verified implementation commit.

### Loop 2 — Independent audit and self-correction

- **RED:** Independent re-read against the template and the cited files looked
  for a revenue definition that could double count, a preview that could write,
  and an approval that could race.
- **GREEN:** No text change was required; the excluded plan cash, read-only
  preview and version check already cover those paths.
- **AUDIT:** PASS `lib/storage/store/analytics.ts:133` — plan revenue is summed
  from invoices (`SUM(i.amount_micros)`), not from per-call charges, confirming
  the two series are independently sourced. PASS `lib/price-recommendation.ts:68`
  — `sellForMargin(costMicros, marginBpsTarget)` is the shared arithmetic the
  preview must call.
- **ADVERSARIAL:** A refund or negative adjustment after settlement must remain
  visible; the design reports it from the ledger rather than recomputing revenue.
  A competitor price in another currency stays blank. A manual price is not
  overwritten by a recommendation.
- **CHANGE DELTA:** 0% — no text changed in this pass.

### Loop 3 — Final convergence

- **RED:** Final risk review: the projection could become an unbounded scan, and
  an unknown total could be mistaken for a complete one.
- **GREEN:** No further text change; the bounded UTC window, indexed aggregate
  and explicit coverage count are already requirements.
- **AUDIT:** PASS `scripts/repository-contract-check.mjs:143` — active FIDs may
  only carry `converged` or `fixed`, so this record's status is contract-valid.
  Planning gates are recorded in the handoff.
- **ADVERSARIAL:** If implementation cannot keep the projection bounded, the
  correct outcome is a smaller window or an indexed rollup, not an unbounded
  request path. If coverage is partial, the UI must say so.
- **CHANGE DELTA:** 0% — no text changed in this pass.

### Loop 4 — Implementation

- **RED:** The first implementation grew
  `components/admin/pricing-recommendations.tsx` to 415 lines, over the enforced
  400-line ceiling, and the extracted projection cell needed a formatting-only
  correction before lint was clean.
- **GREEN:** Extracted `components/admin/pricing-volume-cell.tsx`; kept the
  preview read-only; put the four previewed version integers in the approval
  body and in the conditional `UPDATE ... WHERE`; returned 409 on a zero-row
  update without writing a decision.
- **AUDIT:** PASS `tests/admin-pricing-command.test.mjs` proves credit-only
  totals, unknown-cost exclusion, stable sorting, pagination, projection math
  and stale-version refusal; `tests/store-analytics-postgres.test.mjs`
  reconciles command revenue with analytics; `tests/pricing-decisions.test.mjs`
  proves a stale approval writes no second decision.
- **ADVERSARIAL:** A cost or sell change between preview and approval is a
  conflict, not a reprice. A deleted model is reported with unknown cost even
  though its persisted charge is retained, so contribution is never fabricated.
- **CHANGE DELTA:** implementation only; the converged design was not re-scoped.

## Resolution

- **Closed Date:** 2026-11-05.
- **Fix Description:** Added the realized pricing command center, credit-only
  windowed aggregation with unknown-cost coverage, a historical-volume preview
  and version-checked approval. Manual edits remain on the existing path; no
  plan cash was allocated to models and no price was published outside approval.
- **Tests Added:** Yes — `tests/admin-pricing-command.test.mjs`; extended
  `tests/pricing-decisions.test.mjs` and `tests/store-analytics-postgres.test.mjs`.
- **Verification Evidence:** `npm run verify` PASS (11/11 gates, 1,075/1,075
  tests, 155.5 s) at implementation commit `59341a4`; details in `CHANGELOG.md`
  and `.verify/summary.json`.
- **Archived:** `dev/fids/archive/FID-2026-1105-005-pricing-command-center.md`.

## Lessons Learned

Realized contribution, invoice cash and a labelled workload are three different
facts. A pricing view is only decision-grade when each figure carries its window,
source and coverage, and when the only write remains the guarded approval path.
