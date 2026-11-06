# FID: Atomic payment claim and fenced fulfillment

**Filename:** `FID-2026-1105-010-payment-claim-fencing.md`
**ID:** FID-2026-1105-010
**Severity:** high
**Status:** closed
**Created:** 2026-11-05 20:45 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

D52: competing retries can both claim a signed event, and a stale worker can
complete or mutate after ownership has moved. Design exclusive, fenced payment
processing for both live webhook paths; do not claim duplicate credit occurred.

## Environment

Windows, Node 24, PostgreSQL 17 and PGlite; baseline `4bd8c1b`.

## Detailed Description

### Problem

`lib/storage/ledger/payment-events.ts` reads status then updates by id alone;
concurrent first inserts can conflict and failed/stale retries can both win.
Complete/fail/quarantine only match id/status, not owner. The livemode mismatch
upsert can overwrite terminal state. `app/api/webhooks/stripe/route.ts` and
`app/api/webhooks/nowpayments/route.ts` invoke these methods; both perform
financial writes between claim and completion. `lib/storage/ledger/payments.ts`
duplicates the state machine and must be mapped before consolidation. The
original D52 barrier reproduced competing retries; no new reproduction is claimed.

### Expected Behavior

At most one current owner processes an event, and an expired owner cannot
perform financial writes or transition the event after another owner takes over.
Processed/quarantined states are terminal and mode mismatch cannot overwrite
them. Recoverable failures are observable and retryable without duplicate money.

### Root Cause and Evidence

Claim is a read-then-write without compare-and-swap; owner identity is absent
from financial operations and terminal updates. PostgreSQL 17 `INSERT ... ON
CONFLICT ... WHERE ... RETURNING` returns only rows actually inserted/updated:
https://www.postgresql.org/docs/17/sql-insert.html (Context7).

## Impact Assessment

High: payment event exclusion and subscription lifecycle. Top-up fulfillment
already locks its own row (`lib/storage/store/topups.ts`); that protection does
not establish safety for every webhook side effect. No production credentials,
payment, inference or external write is authorized in this planning pass.

## Proposed Solution

### Approach

Choose a single authoritative PostgreSQL claim implementation. Atomically
insert or reclaim only failed/expired claims and return a monotonically changing
ownership generation. Preserve terminal states and event environment identity;
first-insert races are normal loser outcomes. A worker locks and validates the
event row and its generation in the SAME database transaction as every financial
or entitlement mutation and its final state transition. Hold the row lock until
commit so a reclaimer cannot pass the fence during mutation. A stale owner must
not alter state or respond as if it credited. Route all Stripe and NOWPayments
branches, including exceptions and quarantine, through the same rule; inspect
non-claim status branches and alternate module consumers. No external network
call while holding a database transaction: extract/verify payload first, use
existing handle-aware transaction boundaries and prove nested store calls share
the same leased client. Do not claim that a separate pre-write token check fences
subsequent mutations. Return a retryable non-2xx with bounded Retry-After for an
in-flight claim or lost ownership; preserve terminal replay acknowledgement,
signature, amount, currency, environment and replay checks.
Different event IDs for the same invoice must serialize on the subscription row
and recheck invoice status inside that transaction; a unique invoice id alone
does not prevent two period-open operations. Lock event before user/subscription,
then use FID-009's subscription lock order. Legacy rows remain readable and
generation migration must never reactivate a terminal row.

### Steps

1. Inventory every event transition and handler side effect; select one authority.
2. Add atomic generation claim and transaction-scoped ownership fence; guard
   all state transitions and both webhook financial paths.
3. Add deterministic two-connection races and register the suite in
   `scripts/postgres-concurrency-proof.mjs`.
4. Prove route responses, rollback, recovery and no duplicate ledger effects.

### Verification

Use real disposable PostgreSQL and barriers: simultaneous first claim, failed
and stale retry, retry versus terminal commit, mismatch versus terminal event,
old worker blocked after reclaim, owner death/rollback, and crash after effect.
Prove one current owner and one financial/lifecycle effect; stale generation
cannot mutate, complete, fail or quarantine. Test both signed fixture webhooks,
replay and state/amount mismatch, without actual payments. Check nested store
transactions share a single leased client and do not deadlock.

## Verification Gates

- gate: lint — `npm run lint`.
- gate: typecheck — `npm run typecheck`.
- gate: test tests/ledger-postgres.test.mjs — existing, extend.
- gate: test tests/payment-claim-concurrency.test.mjs — planned.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: test:postgres — `npm run test:postgres` with planned suite registered.
- gate: test:http — `npm run test:http` on disposable PostgreSQL.
- gate: verify — `npm run verify` after implementation.

### Verification Receipt

- verified: 2026-11-05T21:27:00-05:00
- lint: exit 0
- typecheck: exit 0
- test tests/ledger-postgres.test.mjs: exit 0 (generation-aware claims and terminal fences)
- test tests/payment-claim-concurrency.test.mjs: exit 0 (4/4 on real PostgreSQL)
- quality: exit 0 (400-line ceiling, 650 files scanned)
- build: exit 0
- test:postgres: exit 0 (15/15 races across six suites, zero skips)
- test:http: exit 0 (718 main checks plus the trial suite; signed Stripe and NOWPayments fixtures)
- verify: exit 0 (11/11 gates, 1,096/1,096 unit tests, zero skips)

## Perfection Loop

### Loop 1 — RED

- **RED:** claim race, terminal overwrite and unfenced stale worker.
- **GREEN:** atomic ownership generation and event-locked financial transaction.
- **AUDIT:** both webhook routes call the unguarded production state machine;
  the top-up writer independently uses `FOR UPDATE`.
- **ADVERSARIAL:** a token checked before a separate transaction is a TOCTOU
  gap; in-flight 2xx acknowledgement may suppress a retry after owner death.
  Route outcomes and the crash recovery contract require explicit proof.
  `subscription-lifecycle.ts` checks invoice status before its transaction;
  distinct event IDs can name one invoice, so serialize and recheck invoice
  and subscription state inside the effect transaction as well.
- **CHANGE DELTA:** Initial draft; subsequent passes 5.79% and 0.07%.

### Loop 2 — AUDIT / ADVERSARIAL

The event lock encloses effect and terminal transition; invoice recheck also
serializes distinct event IDs. `topups.ts` separately locks each top-up.
Lost ownership returns retryable failure. Real crash/race proofs remain gates.

### Loop 3 — COMPLETE

Design converged; no code or live payment is claimed by this status.

### Missed Questions

Does one successful event claim prove money changed? No. Does top-up locking
protect subscription lifecycle writes? No. Can an expired worker finish? No.

### Implementation Evidence

- **Commit SHA:** `9f6548f` (`9f6548fc7d8aa651fce1c8785ba63f40d960744f`).
- **File:line ranges:** `lib/storage/ledger/payment-events.ts:41-250` owns the
  atomic generation claim, fenced terminal transitions and the event-row lock;
  `lib/storage/schema/billing.ts:253` adds `claim_generation`;
  `app/api/webhooks/stripe/route.ts:53-160` and
  `app/api/webhooks/nowpayments/route.ts:101-206` route every effect through the
  fence; `lib/stripe-webhook.ts:116-274` isolates event interpretation.
- **Gate output:** `npm run verify` exit 0 (11/11); `npm run test:postgres`
  exit 0 with 15/15 races and zero skips; `npm run test:http` exit 0 with the
  signed webhook fixtures; `tests/ledger-postgres.test.mjs` passes in the full
  1,096-test run.
- **Reproducibility:** `rg "claim_generation|processPaymentEvent" lib app tests`
  finds the claim authority, both routes and the four race proofs; `node --test
  tests/payment-claim-concurrency.test.mjs` runs against disposable PostgreSQL.
- **Step statuses:** 1 implemented (single claim authority and effect
  inventory); 2 implemented (atomic generation claim and event-lock fence); 3
  implemented (registered stale-owner, terminal and shared-invoice races); 4
  implemented (route responses, rollback, recovery and full gates).

## Resolution

- **Closed Date:** 2026-11-05 21:27 America/New_York
- **Fix Description:** one atomic claim statement inserts or reclaims only
  failed/stale events and returns a monotonically increasing generation. Every
  financial or entitlement effect and its terminal transition run under the
  event-row lock; terminal states are never overwritten, and a stale owner
  cannot mutate or respond as if it credited. Both webhook routes return 409
  with bounded `Retry-After` for in-flight or lost ownership.
- **Tests Added:** Yes — `tests/payment-claim-concurrency.test.mjs` (four
  two-connection races, including distinct events for one invoice) registered in
  the fail-closed PostgreSQL proof; `tests/ledger-postgres.test.mjs` updated for
  generation-aware transitions.
- **Verification Evidence:** `npm run verify` PASS, 11/11 gates, 1,096/1,096
  tests, 15/15 PostgreSQL races, 718 HTTP checks plus trial, recovery 14/14;
  implementation commit `9f6548f`. No live payment or external fulfillment is
  claimed.
- **Archived:** 2026-11-05 21:27 America/New_York

## Lessons Learned

Lease ownership must fence the business mutation, not only the claim row.
