# FID: Money integrity audit

**Filename:** `FID-2026-1029-029-money-integrity-audit.md`
**ID:** FID-2026-1029-029
**Severity:** high
**Status:** closed
**Closed Against:** `e56abf1`
**Archived:** 2026-10-30

Closure reconciliation: `lib/store/usage.ts` invokes `usageLedgerEntry` within
the settlement transaction; exact pricing and money tests exist. Full
`npm run verify` exited 0 on 2026-10-30 before subsequent systems repairs.
This closes the described ledger/math implementation, not the broader
stream-failure and recovery review now recorded under SCOPE H3.
**Created:** 2026-10-30 06:20
**Automation level:** 3
**YAGNI-Compliance:** Verified — four arithmetic/format fixes and one ledger row, no
new subsystem.

---

## Summary

A pass over every path that touches a dollar found one real accounting defect and
three places where the math or the presentation could disagree with itself.
Settled usage charges never reached `credit_ledger`, so the ledger the account
page promises is "every balance change" showed grants and top-ups only and its
running balance went stale the first time anyone spent credit. Money rendered at
two decimals, turning a $0.195 charge into `$0.20` and a real $0.000039 charge
into `$0.0000`. Sell prices and token costs were computed in float, which is one
micro off past 2^53, and plan prices were rounded to cents at checkout rather
than refused.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict (target es5, lib esnext), Next.js 16, better-sqlite3
- **Commit/State:** `f094348` + working tree

## Detailed Description

### Problem

1. `recordUsage` debited `users.credit_micros` and wrote no `credit_ledger` row,
   while `BillingHistory` states "Every balance change, newest first. Requests
   debit the settled charge". A customer could top up $10.00, make one call, and
   see a $9.80 balance beside a ledger whose last row still read $10.00.
2. `formatPreciseMoney` used two decimals above a cent and four below it, so
   `$0.195` printed `$0.20` and `$0.000039` printed `$0.0000` — a real charge
   displayed as free.
3. `computeTokenCostMicros` multiplied `tokens × price` in float. The product
   passes 2^53 once a large token count meets a large per-million rate and the
   result lands one micro off (found at 39,094,008 tokens × $76,444/1M).
4. `defaultSellMicros` used `cost * 1.3` and `Math.ceil`, which is float, not
   the exact rational markup.
5. `createPlanCheckout` used `Math.round(priceMicros / 10_000)`, so a plan priced
   with sub-cent precision would be charged a price the plan page never showed.

### Expected Behavior

- Every balance change is a ledger row whose `balance_after_micros` equals the
  balance the customer sees.
- A displayed amount is the amount charged, at micro precision.
- Arithmetic is exact for the whole supported domain, and refuses rather than
  rounds when a value is out of domain.
- A price that cannot be billed exactly is rejected at authoring time.

### Root Cause

Money was treated as presentation: charges wrote usage rows (the analytics
trail) and ledger rows were written only by the two "money in" paths. The
formatting and rounding helpers were written for the common case and never
tested against the sub-cent values the gateway actually bills.

### Evidence

Before the fix, a settled $0.000098 charge left this state:

```text
users.credit_micros      999902
credit_ledger rows       (none for this request)
usage_events.charged     98
```

After the fix, the same request through the real handler:

```text
users.credit_micros      999902
users.held_micros        0
credit_holds             0
usage_events             input 1000, output 500, charged 98, cost 75
credit_ledger            kind usage, amount -98, balance_after 999902
```

## Impact Assessment

### Affected Components

- `lib/store/usage.ts` — writes the ledger row inside the debit transaction
- `lib/usage-ledger.ts` — new pure helper for the row's arithmetic
- `lib/pricing.ts` — exact integer token cost and sell price
- `lib/plans.ts` — whole-cent plan price validation
- `lib/stripe-subscriptions.ts` — refuses a price Stripe cannot bill exactly
- `components/dashboard/format.ts` — exact micro-dollar rendering

### Risk Level

Medium. The ledger row is new writes on the hot settlement path; everything else
is arithmetic that produces the same values in the observed domain.

## Proposed Solution

### Approach

Make money integer end to end. Prices are integers in micro-dollars per million
tokens; charges are integers in micro-dollars; formatting reads those integers
directly instead of dividing into a float. Where a value cannot be represented
exactly, refuse it (plan prices) or clamp it (absurd token costs) rather than
silently rounding.

### Steps

1. `usageLedgerEntry(balanceBefore, charge, model)` returns the amount, the
   balance after, and a note; `recordUsage` reads the balance, debits, and
   inserts the row in one transaction.
2. `computeTokenCostMicros` uses BigInt with half-up division; `defaultSellMicros`
   uses integer ceil of `cost × (10_000 + bps) / 10_000`.
3. `formatMicros` renders the integer with two to six decimals and thousands
   separators; `formatPreciseMoney` delegates to it.
4. `readPlanValues` requires `priceMicros % 10_000 === 0`; `createPlanCheckout`
   throws instead of rounding.

### Verification

- `tests/money.test.mjs` — 14 tests: exact token cost across the domain, the
  past-2^53 regression pair, sell-price invariants, hold/charge equality, ledger
  reconciliation chains, exact rendering, top-up conversion, plan cent rules.
- `npx tsc --noEmit` clean, `npm test` 185/185.
- End-to-end through `handleChatCompletions` against an isolated DB copy with a
  mock upstream: 200, charged 98 micros, cost 75, balance 999,902, ledger row
  `usage` −98 with `balance_after` 999,902, no holds left.
- Insufficient-credit request: 402, balance untouched, no usage row, no ledger
  row, no hold leaked.

## Verification Gates

- `npx tsc --noEmit` — pass
- `npx eslint .` — pass
- `node --test tests/money.test.mjs` — 14/14
- `npm test` — 185/185
- Isolated end-to-end charge + reconciliation — pass

### Verification Receipt

```text
money.test.mjs   ℹ tests 14  ℹ pass 14  ℹ fail 0
npm test         ℹ tests 185 ℹ pass 185 ℹ fail 0

E2E 200  charged 98  cost 75  balance 1000000 → 999902
     ledger usage -98 balance_after 999902  (equals users.credit_micros)
     holds 0, held_micros 0
E2E 402  balance 10 unchanged, usage rows 1 (the first call), ledger rows 1, holds 0
```

## Resolution

Every charge now writes a reconcilable ledger row, the arithmetic is exact, and
money renders at its true precision.

## Lessons Learned

The ledger was written by the two paths that add money and never by the one that
takes it away, and the UI copy was the only place the missing rows showed. A
test that asserts a *reconciliation* (balance equals the last ledger row) catches
this class of defect where a per-function unit test cannot.

## Known Limits

- Charges made before this commit have no ledger row and are not backfilled, so
  historic ledger balances remain incomplete. Usage events are the complete
  record for those.
- `recordUsage` still lets a balance go negative by design: the hold is
  admission control, not a ceiling. A provider that reports more tokens than the
  estimate can overdraw the account, and the ledger now shows that honestly.
