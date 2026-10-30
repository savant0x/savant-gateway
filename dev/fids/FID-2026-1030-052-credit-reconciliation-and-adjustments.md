# FID: Credit reconciliation and auditable financial adjustments

**Filename:** `FID-2026-1030-052-credit-reconciliation-and-adjustments.md`
**ID:** FID-2026-1030-052
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** verified
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-050, FID-2026-1030-051
**YAGNI-Compliance:** Verified — extend existing ledger, no parallel customer balance.

## Summary

Prove customer balances and liabilities reconcile to durable ledger/usage/payment
records, and provide auditable corrections/refund/dispute effects rather than
direct balance edits or misleading revenue totals.

## Environment

`lib/store/billing.ts`, `lib/store/usage.ts`, `lib/usage-ledger.ts`,
top-up/subscription stores and `lib/analytics.ts`.

## Detailed Description

### Problem / expected behavior / root cause

FID-029 added usage debits to the ledger, but its archived Known Limits says
earlier charges lack ledger rows. Refund/credit-note automation and plan revenue
reversal are not implemented. Current analytics cannot prove net cash or reserve
coverage without approved refund/dispute treatment and reconciliation boundaries.

### Evidence

`dev/fids/archive/FID-2026-1029-029-money-integrity-audit.md`: historic ledger
incompleteness and intentional negative balances. `knowledge.md`: paid invoice
cash remains recorded after a refund. Existing exact amount helpers are real.

## Impact Assessment

Ledger migrations, correction permissions, customer history, refunds/disputes,
revenue/cost reports and operating reserve visibility. Risk critical: altering
financial history or spending customer liabilities. Operator approves policy;
external refunds require explicit financial authority.

## Proposed Solution

### Approach and steps

1. Define reconciliation equations for current credit, held/quarantined amounts,
   usage debits, grants, payments, reversals and customer liabilities.
2. Establish a dated opening-balance baseline for legacy gaps from authoritative
   records; never invent historical rows or change balances just to make reports agree.
3. Add purpose-bound, idempotent, permission-checked adjustment/refund/dispute
   records with references, amounts and audit reason; append reversals, not deletes.
4. Make account/admin/analytics views distinguish cash, prepaid liability,
   recognized usage, plan revenue, refunds and upstream cost; surface discrepancies.

### Verification

Extend `tests/money.test.mjs`, `tests/revenue.test.mjs`, `tests/analytics.test.mjs`;
planned `tests/credit-reconciliation.test.mjs`. Test duplicate/reordered corrections,
overdrawn accounts, partial refunds, legacy baseline and sum-to-balance invariants.
Intended callers: settlement/top-up/admin-authorized corrections → shared ledger;
reconciliation read model → admin financial views and monitoring.

## Verification Gates

- gate: test tests/money.test.mjs
- gate: test tests/revenue.test.mjs
- gate: test tests/analytics.test.mjs

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
the named existing files and planned `tests/credit-reconciliation.test.mjs`.
Disposable DB receipts must reconcile independently calculated totals and prove
cross-account correction denial; real payment reversals are accepted by 053/062.

## Perfection Loop

RED: legacy ledger gaps and missing reversal semantics. GREEN: opening baseline,
append-only adjustments and explicit accounting clocks. AUDIT: pending.
ADVERSARIAL: payment retry or an operator double-click must not create funds.
Five questions: all balance states, bounded reconciliation, fraud-resistant
permissions, durable history and shared arithmetic rather than report-specific truth.

## Re-audit and convergence (2026-10-30, post-051)

RED (measured in source):

- `credit_ledger` has no reference column, so an operator refund sent twice by a
  retry or a double click would credit twice; there is no refund or credit-note
  path at all, only positive grants and usage debits.
- No code compares `users.credit_micros` with the ledger sum, and legacy gaps
  have no recorded opening baseline, so a report could only "agree" by
  fabricating rows.
- Admin surfaces show grants and usage but not the reconciliation difference,
  quarantined reserve or top-up totals.

GREEN (documented before code):

1. `credit_ledger.reference` with a unique partial index is the adjustment
   identity: the same reference with the same user and amount is an idempotent
   no-op; the same reference with different terms is a conflict.
2. Refunds are positive ledger entries bounded by current credit, so a refund
   can never create a negative balance. Adjustments may be signed for
   corrections, with the same non-negative floor. Rows are appended, never
   updated or deleted.
3. Reconciliation is one equation per account and in total:
   `baseline + SUM(ledger.amount_micros) == users.credit_micros`. A baseline is
   an explicit, dated operator record used only for legacy gaps; it is never a
   fabricated transaction. The read model also reports usage debits, paid
   top-ups, active holds and quarantined reserve.
4. An admin view and API expose totals and per-account differences, so a
   discrepancy is visible rather than tuned away.

AUDIT: `applyAdjustment` is the only writer of refund/adjustment rows and is
called from one authenticated route; the reconciliation read is used by the
admin page. Reconciliation arithmetic is shared between the totals and rows.

ADVERSARIAL: duplicate reference, conflicting reference, refund larger than the
balance, zero/negative refund, overdrawn account, legacy gap and baseline
replacement must each leave one honest row set.

## Implementation

| Responsibility | File |
| --- | --- |
| Adjustment identity, idempotent append, bounds, baseline, equation | `lib/reconciliation.ts` |
| Ledger reference index and baseline table | `lib/schema/credits.ts`, `lib/db.ts` |
| Server read/write wrappers | `lib/store/reconciliation.ts` |
| Admin API | `app/api/admin/reconciliation/route.ts`, `app/api/admin/adjustments/route.ts` |
| Admin view of totals, differences and refunds | `app/admin/(panel)/reconciliation/page.tsx` |
| Independent expectations | `tests/credit-reconciliation.test.mjs` |
| Route reachability | `scripts/http-suite/quota-checks.mjs` |

## Verification

`npm run verify` exit 0 on 2026-10-30:

```text
lint: zero warnings
typecheck: exit 0
tests 272 / pass 272 / fail 0
quality: PASS (400-line ceiling, 262 files scanned)
production build: clean
http-suite: 260 checks PASS
trial-http-suite: all checks PASS
```

The eight new cases cover: a balanced account, a legacy gap left visible
until an explicit baseline (with zero fabricated ledger rows), one append per
reference with an unchanged balance on replay, reference conflicts across
amount and user, refunds bounded by current credit with partial refunds
allowed, an overdrawn account that stays balanced and cannot be debited further
below zero, invalid input refused before any write, and the read-model totals
for usage, top-ups, holds, quarantine and adjustments. The production route
appends one correction, refuses the replay as a duplicate, and leaves the
balance unchanged.

Evidence limits: no real Stripe refund or dispute is executed; external
financial authority remains the operator's and 053/062 acceptance. Analytics
revenue totals do not yet net refunds — that presentation and the
consumed-credit treatment remain open with 053/056. Baselines are recorded
through the authenticated API, not a form. Historic ledger gaps are surfaced,
never backfilled.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: reversals require original transaction
references and approved consumed-credit/dispute treatment. A refund must not
erase usage history or silently cancel an already incurred customer liability.
Final convergence checks are in the master planning-audit receipt.

Design only. Do not backfill guessed usage or claim gross top-ups are earned
revenue. Approved financial policy and real reversal evidence remain required.

## Lessons Learned

A balanced display is not reconciliation if records were fabricated to obtain it.
