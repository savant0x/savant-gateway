# FID: Credit reconciliation and auditable financial adjustments

**Filename:** `FID-2026-1030-052-credit-reconciliation-and-adjustments.md`
**ID:** FID-2026-1030-052
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** converged
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

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: reversals require original transaction
references and approved consumed-credit/dispute treatment. A refund must not
erase usage history or silently cancel an already incurred customer liability.
Final convergence checks are in the master planning-audit receipt.

Design only. Do not backfill guessed usage or claim gross top-ups are earned
revenue. Approved financial policy and real reversal evidence remain required.

## Lessons Learned

A balanced display is not reconciliation if records were fabricated to obtain it.
