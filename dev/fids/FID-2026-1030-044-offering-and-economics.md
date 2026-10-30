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

Planning: source/decision/dependency audit under master 043. Implementation:
`npm run verify`; `npm test` runs the three existing named test files. Required
external receipt: dated permission, rate/limit observations and operator decision.

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

Design only. No new offering, provider funding or commercial claim approved by
this record. Closure requires committed contract changes and decision evidence;
real paid acceptance remains 062.

## Lessons Learned

A numeric model can be internally consistent while its inputs are unverified.
