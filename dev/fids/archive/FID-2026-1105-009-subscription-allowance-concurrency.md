# FID: Serialize subscription allowance admission

**Filename:** `FID-2026-1105-009-subscription-allowance-concurrency.md`
**ID:** FID-2026-1105-009
**Severity:** high
**Status:** closed
**Created:** 2026-11-05 20:45 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

D51: simultaneous subscription requests may both reserve the same remaining
weighted-token allowance. Design a transactionally serialized admission and
prove it against two independent PostgreSQL connections. This is planning only.

## Environment

Windows, Node 24, PostgreSQL 17 and PGlite; baseline commit `4bd8c1b`.

## Detailed Description

### Problem

`lib/storage/gateway/call.ts` invokes `resolveSubscriptionAccess` before
dispatch. In `lib/storage/store/subscription-access.ts`, the transaction reads
`openPeriodRow`, calls `decideAllowance`, inserts a hold, then updates the held
counter using only the period id. `subscription-rows.ts` does not lock the
period. `pg-adapter.ts` states `.immediate()` is an ordinary transaction.
The prior D51 audit recorded a controlled stale-read seam admitting two 80-token
holds against 100; this session has not repeated that seam on real PostgreSQL.

### Expected Behavior

At the admission linearization point, at most the available included allowance
is reserved. The loser receives the plan's existing block or credit-overage
decision. Past-due, inactive, uncovered and closed-period states retain their
existing semantics. Existing holds are never silently released.

### Root Cause and Evidence

Reading and incrementing in one PostgreSQL transaction does not serialize the
decision. PostgreSQL 17 Read Committed re-evaluates an UPDATE predicate after a
concurrent update commits; row locks block competing updates only until the
holder commits. Context7: https://www.postgresql.org/docs/17/transaction-iso.html
and https://www.postgresql.org/docs/17/explicit-locking.html.

## Impact Assessment

High: included allowance can be oversold and credit overage bypassed. Affected:
subscription access, lifecycle and settlement, schema/indexes if needed, gateway
call path, and real PostgreSQL concurrency tests. Changes are future work only.

## Proposed Solution

### Approach

Use a single transaction on the existing database handle: lock the subscription
row in a documented order with the open period (`FOR NO KEY UPDATE` where key
sharing requires it), re-read status, entitlement and current open period after
locking, evaluate current used plus held, insert the hold and update the same
period before commit. All lifecycle, close/renewal, settlement and quarantine
paths that touch those rows must be inventoried and made to follow one proven
lock order; do not assume a period-only lock protects cancellation or expiration.
Required order is existing settlement → user → subscription → period → hold →
quarantine; read identifiers without locking, then lock in that order and
revalidate. Adapt release, refresh, sweep and lifecycle, which differ today.
Lock rows in stable id order in multi-row work; no transaction may acquire an
earlier class after a later one. Use `FOR NO KEY UPDATE` for parent rows to
avoid blocking FK key-share checks. Prove this contract with two connections.
Include account deletion, key revocation and FK cascades in the lock inventory;
any incompatible path must be reordered or fail closed rather than bypass it.
If a lock-based design cannot preserve existing lifecycle without deadlock,
redesign and reconverge the FID, rather than silently weakening the invariant.
Keep existing behavior for `block`, credit overage, past due and no entitlement.
On rollback no hold or increment survives; failures fail closed.

### Steps

1. Map every subscription/period/hold/quarantine writer and establish one lock
   order, including FK lock interactions, sweep/revoke/renewal and admin
   entitlement refresh (`subscription-admin.ts` deletes snapshot models).
2. Add locked re-read and hold/counter update atomically; preserve policy.
3. Add deterministic independent-connection races and register them in
   `scripts/postgres-concurrency-proof.mjs`.
4. Verify production routing, HTTP outcomes, migration and full gates.

### Verification

With 100 included and two simultaneous 80-token estimates, prove exactly one
included hold and 80 held for both block and credit overage modes; repeat with
different keys and test rollback, same-period races, settlement/quarantine,
cancellation, past-due transition and rollover. Use barriers and bounded
timeouts, not sleeps; also race admin entitlement refresh against admission.
Assert no deadlock and no leaked holds. Register the real
two-connection test in the fail-closed PostgreSQL proof runner.

## Verification Gates

- gate: lint — `npm run lint`.
- gate: typecheck — `npm run typecheck`.
- gate: test tests/store-subscriptions-postgres.test.mjs — existing, extend.
- gate: test tests/subscription-admission-concurrency.test.mjs — planned.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: test:postgres — `npm run test:postgres` with the planned suite registered.
- gate: test:http — `npm run test:http` on disposable PostgreSQL.
- gate: verify — `npm run verify` after implementation.

### Verification Receipt

- verified: 2026-11-05T21:27:00-05:00
- lint: exit 0
- typecheck: exit 0
- test tests/store-subscriptions-postgres.test.mjs: exit 0 (22/22 with the admin suite)
- test tests/subscription-admission-concurrency.test.mjs: exit 0 (4/4 on real PostgreSQL)
- quality: exit 0 (400-line ceiling, 650 files scanned)
- build: exit 0
- test:postgres: exit 0 (15/15 races across six suites, zero skips)
- test:http: exit 0 (718 main checks plus the trial suite on real PostgreSQL)
- verify: exit 0 (11/11 gates, 1,096/1,096 unit tests, zero skips)

## Perfection Loop

### Loop 1 — RED

- **RED:** unlocked read plus unconditional increment can oversubscribe.
- **GREEN:** lock, re-read, decide and update under one transaction.
- **AUDIT:** `subscription-access.ts` performs the decision inside the
  transaction, but `subscription-rows.ts` does not lock the period.
- **ADVERSARIAL:** FK locks and the lifecycle paths can deadlock or invalidate
  a pre-lock subscription read; the final design must prove order and recheck.
  `usage.ts` claims settlement before hold; `settlements.ts` releases quarantine
  before updating the period. The candidate order must include both paths.
- **CHANGE DELTA:** Initial draft; subsequent passes 3.54% and 2.58%.

### Loop 2 — AUDIT / ADVERSARIAL

Settlement precedes holds (`usage.ts`); release starts at quarantine
(`settlements.ts`). The required order moves both into one order and rechecks
discovered identities. FK compatibility and races are implementation gates,
not claimed results. Context7 confirms the relevant PostgreSQL lock behavior.

### Loop 3 — COMPLETE

Design converged; no code or concurrency proof is claimed by this status.

### Missed Questions

Does `.immediate()` lock PostgreSQL? No. Does an existing hold grant permission
to discard it at expiry? No. Does compiling prove admission safety? No.

### Implementation Evidence

- **Commit SHA:** `9f6548f` (`9f6548fc7d8aa651fce1c8785ba63f40d960744f`).
- **File:line ranges:** `lib/storage/store/subscription-locks.ts:15-129`
  defines the shared order; `lib/storage/store/subscription-access.ts:93-230`
  locks user, subscription, open period and hold before the allowance decision;
  `lib/storage/store/subscription-sweep.ts:96-164` rechecks each expiry
  candidate; `lib/storage/ledger/settlements.ts:214-283` releases quarantine in
  the same order. Lifecycle, admin and checkout writers use the helpers.
- **Gate output:** `npm run verify` exit 0 (11/11); `npm run test:postgres`
  exit 0 with 15/15 races and zero skips; `npm run test:http` exit 0 (718 main
  checks plus trial); the focused store suites are 22/22.
- **Reproducibility:** `rg "lockUser|lockSubscription|lockOpenPeriod"
  lib/storage` finds the helpers and every writer; `node --test
  tests/subscription-admission-concurrency.test.mjs` runs the four races against
  disposable PostgreSQL.
- **Step statuses:** 1 implemented (shared lock order and writer inventory); 2
  implemented (locked re-read and atomic hold); 3 implemented (registered
  independent-connection races); 4 implemented (production routing, HTTP,
  migration and full gates).

## Resolution

- **Closed Date:** 2026-11-05 21:27 America/New_York
- **Fix Description:** admission, sweep, lifecycle, admin and quarantine paths
  now share settlement → user → subscription → period → hold → quarantine and
  revalidate after locking. The allowance decision, hold insert and counter
  increment commit in one transaction.
- **Tests Added:** Yes — `tests/subscription-admission-concurrency.test.mjs`
  (four two-connection races) registered in the fail-closed PostgreSQL proof;
  `tests/settlement-concurrency.test.mjs` updated for the shared order.
- **Verification Evidence:** `npm run verify` PASS, 11/11 gates, 1,096/1,096
  tests, 15/15 PostgreSQL races, 718 HTTP checks plus trial, recovery 14/14;
  implementation commit `9f6548f`.
- **Archived:** 2026-11-05 21:27 America/New_York

## Lessons Learned

Atomic bookkeeping alone does not serialize a prior allowance decision.
