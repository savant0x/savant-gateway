# FID: Launch offering, verified rates and provider economics

**Filename:** `FID-2026-1030-044-offering-and-economics.md`
**ID:** FID-2026-1030-044
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** none
**YAGNI-Compliance:** Verified — one offering/price authority, existing price math.

## Summary

Freeze what can honestly be offered and profitably served before activation.
Resolve actual upstream prices, resale permission, available limits and funding
requirements; research estimates and old wallet readings are not live evidence.

## Environment

Baseline `b0b65ac`; existing `docs/business-model.md`, dated provider-price
snapshot and `lib/pricing.ts`. Standing decisions: trials disabled, plans unsold.

## Detailed Description

### Problem / expected behavior / root cause

Price comparisons and proposed tiers grew before real paid acceptance. The
operator must approve the offering, charges and spend exposure against verified
provider contracts, not invented wholesale rates or assumed model equivalence.

### Evidence

`docs/launch-plan.md` phase 1 lists unresolved offering/rate/policy decisions.
`docs/data/provider-prices.json` is dated data, not a current provider guarantee.
`lib/price-comparison.ts` publishes a 3:1 illustrative blend; it is not measured
customer savings. `docs/subscriptions-decision.md` selects no plan sales.

## Impact Assessment

Public claims, catalog prices, settings, budget and downstream activation.
Risk high: wrong rates or unfunded obligations lose money. No credential values
are recorded; commercial decisions and external spend stay operator-controlled.

## Proposed Solution

### Approach and steps

1. Record dated provider permission, per-model price/usage definitions and real
   account limits in a redacted evidence ledger; distinguish unknown from zero.
2. Reconcile the existing economics model with fees, upstream spend, free-token
   exposure and customer credit liabilities; identify conservative traffic caps.
3. Obtain a dated operator decision on free versus trial, paid models/prices,
   top-up bounds, budget, fairness and conditional subscription offerings.
4. Feed approved values into existing settings/pricing helpers and child contracts;
   keep unsatisfied activation paths closed and remove unsupported public claims.

### Verification

Existing `tests/business-model.test.mjs`, `tests/pricing.test.mjs`,
`tests/price-comparison.test.mjs`: prove exact arithmetic, not real rates. Extend
them for approved constraints; record real rate provenance separately. Production
callers: admin pricing/settings → store prices → uncached gateway lookup; public
catalog derives claims from those same approved figures. Read-only calculations
must never run the document generator as an unreviewed file-edit transform.

## Verification Gates

- gate: test tests/business-model.test.mjs
- gate: test tests/pricing.test.mjs
- gate: test tests/price-comparison.test.mjs

Planning: source/decision/dependency audit under master 043. Implementation:
`npm run verify`; `npm test` runs the three existing named test files. Required
external receipt: dated permission, rate/limit observations and operator decision.

## Implementation Progress

2026-10-30. Implemented up to the operator decision boundary; this record stays
active and `converged`, not closed. No rate, fee, budget, permission or offering
was invented.

- `docs/offering-evidence.md` records the dated evidence ledger with separate
  observed, configured, unknown and decision-pending states, so an unknown value
  is never read as zero. Local readings recorded there: 45 catalog rows (11
  free-pool, 24 priced paid, 10 subscription-only), zero plan rows, a recorded
  $0.00 upstream wallet at 15 account RPM, $5.00 outstanding local credit, zero
  paid top-ups and no active price-claim approval.
- The existing economics are reconciled in that ledger as a sensitivity: required
  paid revenue `(F + E) / (m − f)` with the measured 23.2% margin and measured
  free exposure, leaving fee and fixed cost explicitly unknown. The conservative
  paid-traffic cap that follows from the recorded wallet is zero paid upstream
  spend until funding is observed.
- Activation paths remain closed and were verified: `tests/trials.test.mjs`
  proves trials default off with a zero grant budget and no paired models; the
  local `plans` table has no purchasable row; no subscription is offered.
- Declared gates pass on 2026-10-30: `node --test
  tests/business-model.test.mjs tests/pricing.test.mjs
  tests/price-comparison.test.mjs tests/trials.test.mjs` — 32 tests, 0 failures.
  The wider `npm run verify` receipt is recorded in the session summary.

**Blocked closure input (operator-only):** the six dated rulings listed in the
ledger: the free-versus-trial offering; approved paid models and prices; dated
resale permission and a confirmed per-model rate card; processing fee, refund,
reserve and credit-expiry policy; funded budget, operating reserve and low-balance
threshold; permission to publish savings claims. The item stays active and is
re-attempted when those rulings exist. No launch approval is claimed.

## Perfection Loop

RED: unverified rate/funding assumptions. GREEN: source-backed offering contract
and explicit approval before activation. AUDIT: pending. ADVERSARIAL: identical
input/output rates or a blend cannot establish provider identity or actual savings.
Five questions: bound spend at scale, account for every billing case, resist abuse,
retain price provenance and use one financial truth rather than copied tables.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: revalidate dated rates/limits against
the release candidate. A changed rate requires new evidence and explicit price
application; never silently overwrite purchased subscription snapshots. Final
convergence checks are recorded in the master planning-audit receipt.

The evidence ledger is implemented and committed; no offering, provider funding
or commercial claim is approved by this record. Closure still requires the dated
decisions above, and real paid acceptance remains 062.

## Lessons Learned

A numeric model can be internally consistent while its inputs are unverified.
