# FID: Daily shared free-pool allocation

**Filename:** `FID-2026-1029-016-daily-free-pool-allocation.md`
**ID:** FID-2026-1029-016
**Severity:** high
**Status:** closed
**Created:** 2026-10-29 18:10
**Automation level:** 3
**YAGNI-Compliance:** Verified — reuses the existing admission transaction and
settings table; no background job, scheduler, or new service.

> **Sequencing disclosure.** The operator ordered this work and implementation
> was written in the same pass as the design. The Perfection Loop below records
> the converged design and the audit of the code that exists; it does not claim
> the code was written after a converged FID. This deviation is recorded rather
> than masked.

---

## Summary

Free models draw on one account-wide upstream pool of 20,000,000 weighted
tokens per UTC day. The gateway previously admitted each customer against a
fixed per-user allowance (`FREE_DAILY_WEIGHTED_TOKENS`, default 500,000) that
had no relationship to how many customers existed, so the sum of customer
allowances could exceed the upstream pool by an arbitrary factor. This FID
replaces that with a daily allocation: 90% of the configured daily pool is split
evenly across activated accounts, 10% is held back, allocation rows are durable
per UTC day, and an account added later can only take what is still
unallocated.

## Environment

- **OS:** Windows 11 (Git Bash), Node v24.21.0 local runtime
- **Language/Runtime:** TypeScript 5.9 strict, Next.js 16.4.3, SQLite via
  better-sqlite3 13.0.3
- **Commit/State:** `16e431f` at start, clean tracked tree

## Detailed Description

### Problem

`decideFreeAdmission` compared committed usage against
`config.dailyWeightedTokens` for every user independently
(`lib/free-pool.ts`). Nothing counted activated accounts or the aggregate
allocation, so N customers each received 500,000 weighted tokens regardless of
the 20,000,000 upstream limit. At 40 active customers the promises alone exceed
the daily pool.

### Expected Behavior

- The configured daily pool is the single source of truth.
- A configurable share (default 90%) is divided evenly across activated
  accounts.
- The remainder is a safety reserve that is never allocated.
- Each account's allocation is durable for the UTC day and never shrinks.
- Late accounts cannot oversell the pool.
- Operators can change the pool and share from the admin dashboard.

### Root Cause

The free-tier guardrail was written for a single-tenant console and was never
updated when customer accounts were added. Per-user constants do not compose
into an account-wide budget.

### Evidence

```text
16e431f..HEAD  lib/free-pool.ts:23  dailyWeightedTokens: 500_000
               lib/store/free-pool.ts  usedWeighted(userId, day) only
               no table, setting, or query counting active accounts or
               aggregate allocation
```

## Impact Assessment

### Affected Components

- `lib/allocation.ts` (new, pure config and split math)
- `lib/allocation-ledger.ts` (new, SQL over a `DatabaseHandle`)
- `lib/schema/allocations.ts` (new table)
- `lib/store/allocations.ts` (new, settings-aware wrapper)
- `lib/store/free-pool.ts` (admission now consumes the allocation)
- `lib/db.ts` (schema registration)
- `app/api/admin/gateway/route.ts`, `components/admin/gateway-settings.tsx`,
  `app/admin/(panel)/gateway/page.tsx`, `components/admin/admin-nav.tsx`
- `.env.example`

### Risk Level

- [x] High: without it, free promises exceed upstream capacity as the platform
  grows.

## Proposed Solution

### Approach

Keep one admission transaction. Inside it, resolve the account's allocation for
the UTC day (insert-if-missing), then evaluate the existing admission decision
against that number instead of the fixed constant. Allocation state lives in
`free_pool_allocations (day, user_id, allocated_tokens)`; usage stays in
`free_pool_usage`; in-flight holds stay in `free_pool_reservations`.

`allocationShare` = `min(floor(allocatable / activeAccounts),
max(0, allocatable - alreadyAllocated))`. This is monotonic: a grant is never
reduced, and the day's total never exceeds the allocatable share.

Settings `free_pool.daily_tokens`, `free_pool.allocation_bps`, and
`free_pool.allocation_enabled` override environment defaults; the environment
remains the fresh-install default. `FREE_DAILY_WEIGHTED_TOKENS` survives as the
fallback allowance when allocation is disabled.

### Steps

1. Add pure config/valuation math and unit tests. — implemented
2. Add the additive table and register it in `createDb`. — implemented
3. Grant the allocation inside `reserveFreeCall`'s immediate transaction. — implemented
4. Expose pool, share, allocated, used, and per-account rows in Admin → Gateway
   with PATCH validation. — implemented
5. Document the variables in `.env.example`. — implemented

### Verification

`tests/allocation.test.mjs` (9 cases) covers defaults, env parsing, clamping,
even split, late-account capping, monotonic grants, active-account definition,
and the summary query.

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
- test: 133 tests, 133 pass, 0 fail (includes 9 allocation cases)
- quality: exit 0, PASS over 207 files
- build: exit 0, production build succeeded (route table includes
  `/admin/gateway` and `/api/admin/gateway`)

## Perfection Loop

### Loop 1 — RED

- **RED:** Per-user constants do not compose into an account-wide budget;
  nothing counts activated accounts; the admin cannot change the pool.
- **GREEN:** Allocation ledger + settings-aware config + admission integration.
- **AUDIT:** `allocationShare` caps by remaining allocatable tokens, so the
  sum of rows cannot exceed 90% of the pool. `ensureAllocation` is called inside
  an `.immediate()` transaction (`lib/store/free-pool.ts`), serializing the
  count/sum/insert.
- **ADVERSARIAL:** Lowering the pool mid-day can leave already-granted tokens
  above the new allocatable total; later accounts then receive 0. This fails
  closed and is asserted in the test.
- **CHANGE DELTA:** n/a (initial record).

### Missed Questions

1. What defines an "activated" account? → Active user with at least one active
   API key. Email verification does not exist, so it cannot be the gate.
2. What happens to unallocated shares when someone never calls? → They stay
   available to accounts added later that day; nothing rolls over to tomorrow.
3. Does a trial grant interact? → Trial mode keeps its own ledger and ignores
   the daily allowance; enabling both needs one shared capacity policy, which is
   still a launch gate.
4. Is the allocation a cap on usage or a promise? → Both: commitments are
   checked against it, and settlement records actual usage separately.

### Implementation Evidence (REQUIRED for `closed`)

- [x] Commit SHA: `58d5556` — `feat(gateway): allocate the daily free pool and add a context banner (FID-2026-1029-016)`
- [x] File:line ranges: `lib/allocation.ts`, `lib/allocation-ledger.ts`,
  `lib/schema/allocations.ts`, `lib/store/allocations.ts`,
  `lib/store/free-pool.ts` (allocation block inside `reserveFreeCall`),
  `lib/db.ts` (`allocationSchema` registration)
- [x] Gate output: pasted in the Verification Receipt
- [x] Reproducibility: `grep -rn "ensureDailyAllocation" lib` returns the
  admission call and the store definition
- [x] Step statuses: all five `implemented`

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output
- [x] Production call-graph: `reserveFreeCall` → `ensureDailyAllocation` →
  `ensureAllocation` → `allocationShare`
- [x] FID status reflects the implementation state

### Loop 2 — Independent audit and self-correction

- **RED:** First draft returned `9_000_000` for a second account after the pool
  was lowered to 1,000,000; the assertion, not the code, was wrong.
- **GREEN:** Corrected the expectation to 0 and documented why a grant cannot be
  clawed back.
- **AUDIT:** `node --test tests/allocation.test.mjs` passes all cases.
- **ADVERSARIAL:** A 0-token allocation produces a 429 with the allocation
  message; that is the intended fail-closed behavior.
- **CHANGE DELTA:** ~2%.

### Loop 3 — Final convergence

- **RED:** Cache of settings across requests could serve a stale pool after an
  admin edit.
- **GREEN:** Config is read inside the request transaction; no caching added to
  the admission path.
- **AUDIT:** `getAllocationConfig()` is called per admission; settings read is a
  single indexed primary-key lookup.
- **ADVERSARIAL:** Four extra reads per free request (config, count, sum,
  insert/select). Measured catalog query cost is ~150 µs; these are simpler
  queries on the same connection and are acceptable for a single-process
  gateway.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** 2026-10-29
- **Fix Description:** Daily allocation ledger, admission integration, admin
  controls, tests, environment documentation.
- **Tests Added:** Yes — `tests/allocation.test.mjs`.
- **Verification Evidence:** Verification Receipt above.
- **Archived:** 2026-10-29 — `dev/fids/archive/`

## Lessons Learned

A per-customer quota is not an account-wide budget. Any allowance that is
promised from shared capacity must be derived from that capacity and from the
number of recipients, and the derivation belongs in the same transaction as the
admission decision.
