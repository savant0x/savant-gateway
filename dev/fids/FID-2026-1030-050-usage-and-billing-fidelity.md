# FID: Provider usage fidelity and exact billing semantics

**Filename:** `FID-2026-1030-050-usage-and-billing-fidelity.md`
**ID:** FID-2026-1030-050
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044
**YAGNI-Compliance:** Verified — extend existing usage/pricing and protocol adapters.

## Summary

Map actual provider billing fields to separately stored upstream cost, customer
charge and weighted entitlement consumption. Preserve exact micro-dollar math;
an estimated fallback must never masquerade as provider-reported usage.

## Environment

`lib/gateway-settle.ts`, `lib/pricing.ts`, `lib/providers/anthropic-response.ts`,
stream adapters and `lib/store/usage.ts`; existing money and translation tests.

## Detailed Description

### Problem / expected behavior / root cause

`readUsage` extracts prompt/input and completion/output counts; cost uses static
per-model rates. Provider-billed weighted/cached/reasoning/tool components need
an explicit contract. Missing/invalid fields must remain distinguishable from a
real zero. Customer price, upstream debit and allowance weighting are not one value.

### Evidence

`lib/gateway-settle.ts` computes cost and sell charge separately and falls back
to prompt/character estimates. `docs/launch-readiness.md` calls out exact
`usage.cost_tokens`; current named token extraction does not retain that field.
FID-042 proves ordinary paid SSE and fault handling, not all billing variants.

## Impact Assessment

JSON/SSE adapters, stored usage schema, settlement and public/account summaries.
Risk critical: underbilling, overbilling and quota drift. 044 supplies the rate
and customer-treatment decision; preserve integer math and current ledger semantics.

## Proposed Solution

### Approach and steps

1. Capture redacted real usage shapes per enabled wire protocol and model class;
   define input/output/cached/reasoning/tool and raw/weighted count semantics.
2. Extend shared parsing and additive usage snapshots to retain actual upstream
   fields and provenance. Refuse nonfinite/negative/out-of-domain counts and
   distinguish partial usage from authoritative complete usage.
3. Compute customer charges from approved sell-price rules and upstream cost
   from its actual billing contract; avoid double-counting cached/reasoning usage.
4. Apply identical rules to JSON/SSE/fallback/cancellation; label estimates and
   expose auditable source data without customer prompts or credentials.

### Verification

Extend existing `tests/money.test.mjs`, `tests/pricing.test.mjs`,
`tests/anthropic-translate.test.mjs`; planned `tests/usage-fidelity.test.mjs`.
Fixtures assert independent expected ledger/cost/quota values across unequal
rates and partial/missing usage. Intended chain: protocol adapters → shared
usage parser/pricing → settlement → stored snapshots → financial reconciliation.

## Verification Gates

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
the named existing files and planned `tests/usage-fidelity.test.mjs`; HTTP JSON/
SSE checks must reconcile exact amounts. Real provider field observations are
required before 062 can certify that provider's paid offering.

## Perfection Loop

RED: insufficient provider-billing fidelity proof. GREEN: explicit usage contract
and independently calculated expectations. AUDIT: pending. ADVERSARIAL: a huge,
partial or repeated usage frame must not silently become free or count twice.
Five questions: all billing classes, bounded numeric domains, hostile payloads,
centralized parsing and reproducible provenance over time.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: track completeness/provenance per
usage component; a missing output count cannot become authoritative zero just
because an input count exists. Test partial frames and estimation independently.
Final convergence checks are in the master planning-audit receipt.

Design only. A mock with 100 input/50 output proves arithmetic, not equivalence
with an upstream wallet debit. No unknown cost is fabricated as known zero.

## Lessons Learned

Exact arithmetic cannot repair incorrect token categories or unverified rate inputs.
