# FID: Allocation banking blocks same-day signups

**Filename:** `FID-2026-1029-019-allocation-join-rebalance.md`
**ID:** FID-2026-1029-019
**Severity:** high
**Created:** 2026-10-29 19:05
**Automation level:** 3
**YAGNI-Compliance:** Verified — no scheduler, no new table, no second admission
path; the existing grant row is rebalanced in place.
**Status:** verified

---

## Summary

FID-2026-1029-016 granted each activated account a durable share of the daily
allocatable pool and never reduced it. The first account of the UTC day
therefore received the entire 90% share, and any account that activated later
the same day received `min(fairShare, allocatable - allocated) = 0`. A new
customer signing up after the first caller would see a zero free allowance
until the next UTC midnight, which contradicts the operator's requirement to
grow organically by spreading the pool across registered accounts.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16, SQLite
- **Commit/State:** `58d5556` (FID-016 implementation)

## Detailed Description

### Problem

`ensureAllocation` inserted the first account's row with the whole allocatable
pool and returned existing rows unchanged. With one active account, that row is
18,000,000; with a second account added at noon, the day's `allocatedOn` is
already 18,000,000 and `allocationShare` caps the newcomer at 0.

### Expected Behavior

An account that activates mid-day receives an even share of the pool whenever
capacity is actually unspent. Existing grants shrink toward the new fair share
to make room, but never below what the account has already used or holds, so a
grant can only be reduced when the reduction is backed by unused capacity.

### Root Cause

The grant was modelled as an irreversible claim. Even division of a fixed pool
requires the divisor to be able to change without over-committing, so grants
must be revisable down to committed usage.

### Evidence

```text
tests/allocation.test.mjs before the fix:
  u1 alone  -> 18,000,000
  u2 joins  -> 0
```

## Impact Assessment

### Affected Components

- `lib/allocation-ledger.ts` (`ensureAllocation` rebalance)
- `tests/allocation.test.mjs`
- Records that described grants as never shrinking

### Risk Level

- [x] High: a launch-day signup receives no free access even though 90% of the
  pool is unspent.

## Proposed Solution

### Approach

On a first request for a day, if the account has no row:

1. Compute `fairShare = floor(allocatable / activeAccounts)`.
2. For every existing row that day, lower it to
   `min(existing, max(fairShare, used + held))`. Committed usage and live holds
   are a hard floor.
3. Sum the rows and grant the newcomer `min(fairShare, allocatable - sum)`.

Only shrinking is performed, so total grants never exceed the allocatable
share. If the pool is genuinely consumed, the newcomer still receives 0, which
is correct.

### Steps

1. Add a used-plus-held lookup per row. — implemented
2. Rebalance existing rows before the insert. — implemented
3. Replace the oversell test and add rebalance cases. — implemented
4. Correct the records that claimed grants never shrink. — implemented

### Verification

`tests/allocation.test.mjs` (11 cases): an unspent 18M grant becomes 9M when a
second account joins; a 12M used grant stays 12M and the newcomer receives 6M;
a third account rebalances 9M/9M to 6M/6M/6M; totals never exceed 18M.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/allocation.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-10-29
- lint: exit 0, zero warnings
- typecheck: exit 0
- test: 135 tests, 135 pass, 0 fail (11 allocation cases)
- quality: exit 0
- build: exit 0

## Perfection Loop

### Loop 1 — RED

- **RED:** First account banks the day; later signups receive zero.
- **GREEN:** Rebalance existing grants to the new fair share before inserting.
- **AUDIT:** Only reductions are applied; each reduction is floored at
  `used + held`; the newcomer is capped by the post-rebalance remainder.
- **ADVERSARIAL:** A pool lowered after grants is still not clawed back below
  committed usage, and a newcomer can receive 0 when the day is truly spent.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Should an existing account's grant ever increase when accounts leave? → No.
   This FID only reduces grants; increasing them would reintroduce
   over-commitment without a new admission decision.
2. Does rebalancing affect settled usage? → No. `free_pool_usage` is untouched;
   only the grant row changes.
3. Can rebalancing starve the joiner? → Only when the remainder is genuinely
   zero, which means the pool was consumed.

### Implementation Evidence (REQUIRED for `closed`)

- [x] Commit SHA: recorded at closure
- [x] File:line ranges: `lib/allocation-ledger.ts` (`usedAndHeld`,
  `ensureAllocation` rebalance block)
- [x] Gate output: Verification Receipt
- [x] Reproducibility: `grep -n "fairShare" lib/allocation-ledger.ts`
- [x] Step statuses: all four `implemented`

### Code Verification Evidence

- [x] Files exist
- [x] Implementation matches the Proposed Solution
- [x] Gates pass
- [x] Call graph: `reserveFreeCall` → `ensureDailyAllocation` → `ensureAllocation`
- [x] Status reflects the tree

### Loop 2 — Independent audit and self-correction

- **RED:** `usedAndHeld` read `.total` from an absent usage row.
- **GREEN:** Treat a missing row as zero.
- **AUDIT:** All 11 allocation cases pass.
- **ADVERSARIAL:** Rebalancing runs inside the caller's immediate transaction,
  so two simultaneous joins serialize.
- **CHANGE DELTA:** ~3%.

### Loop 3 — Final convergence

- **RED:** Records still claimed "grants never shrink".
- **GREEN:** CHANGELOG, SCOPE, knowledge, launch-readiness, and the session
  summary now state the rebalance rule; FID-016 carries a pointer to this record.
- **AUDIT:** `grep -rn "never shrink"` returns no current claim outside this FID.
- **ADVERSARIAL:** A first account that used the whole pool still blocks later
  accounts, which is the truthful outcome.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** pending closure commit
- **Fix Description:** Existing daily grants are rebalanced down to the new fair
  share, floored at recorded usage plus holds, before a joining account's grant.
- **Tests Added:** Yes — two rebalance cases and revised oversell expectations.
- **Verification Evidence:** Verification Receipt above.
- **Archived:** pending closure commit

## Lessons Learned

An even division of a shared pool is a function of the current divisor. Storing
the quotient as an irreversible claim turns a fair share into a land grab.
