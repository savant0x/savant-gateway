# FID: Per-account daily cap on the free pool

**Filename:** `FID-2026-1029-024-free-account-daily-cap.md`
**ID:** FID-2026-1029-024
**Severity:** high
**Status:** closed
**Closed Against:** `3395fc5`
**Archived:** 2026-10-30

Closure reconciliation: `lib/store/free-pool.ts` and
`lib/allocation-ledger.ts` call `accountDailyAllowance`. Full
`npm run verify` exited 0 on 2026-10-30 before subsequent systems repairs,
including `tests/allocation.test.mjs`. Historical policy estimates below are
not measured capacity guarantees.
**Created:** 2026-10-30 00:10
**Automation level:** 3
**YAGNI-Compliance:** Verified — one pure clamp, one setting, one field. No new
table, no scheduler, no per-request query.

---

## Summary

The free pool split 90% of the daily allowance evenly across activated accounts,
but nothing bounded what one account could spend from its share. On day one that
made a single account worth 18,000,000 weighted tokens, and it let a farm of
accounts each bank a share that no honest customer needed. A per-account daily
ceiling now clamps the effective allowance: the split still divides the pool, the
cap decides how much one identity may draw.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16, SQLite
- **Commit/State:** `2cac572` + working tree

## Detailed Description

### Problem

`lib/store/free-pool.ts` passed the account's allocation (or the fixed fallback)
straight into `decideFreeAdmission`. With one activated account, the allocation
for the day is the entire 18M allocatable pool. The even split cannot distinguish
a legitimate early customer from an attacker who registers ninety-nine more
accounts, because every account receives the same share.

### Expected Behavior

- Effective allowance = `min(share, cap)` when a cap is set.
- Cap `0` disables it and leaves the split as the only limit.
- A cap larger than the share never raises the allowance above the split.
- The cap applies whether allocation is enabled or the fixed fallback is in use.
- A missing or malformed cap is treated as disabled, never as a zero allowance
  that locks every account out.
- A refusal names the limit the caller hit: the per-account cap or the share.
- Admin → Gateway sets the cap; the summary shows the even share beside the
  effective, capped allowance.

### Root Cause

The allocation was designed as a fairness mechanism — how to divide a shared
pool — and the abuse question ("how much may one identity take?") was never
separated from it.

### Evidence

```text
before  lib/store/free-pool.ts   dailyAllowance = ensureDailyAllocation(...) | fallback
        lib/allocation.ts        config = { enabled, dailyPoolTokens, allocationBps }
after   lib/allocation.ts        accountDailyAllowance(config, share)
        lib/store/free-pool.ts   dailyAllowance = accountDailyAllowance(allocation, share)
data/gateway.db                 1 activated account -> 18,000,000 share
```

## Impact Assessment

### Affected Components

- `lib/allocation.ts` — `accountDailyAllowance`, default cap, environment read
- `lib/allocation-ledger.ts` — summary carries the share, the cap, and the
  effective allowance
- `lib/store/allocations.ts` — setting `free_pool.account_daily_cap`
- `lib/store/free-pool.ts` — admission clamp and the refusal message
- `app/api/admin/gateway/route.ts` — validation
- `components/admin/gateway-settings.tsx` — field and readout
- `.env.example`, `docs/business-model.md`, `tests/allocation.test.mjs`

### Risk Level

- [x] High: a cap that is too low silently kills the free tier; the default is
      stated, the admin field is explicit, and `0` removes it.

## Proposed Solution

### Approach

A pure clamp keeps the arithmetic in one place and makes the interaction between
split and cap testable. The admission transaction computes the share exactly as
before and then reduces it, so no additional query runs per request and the
existing usage and reservation accounting is untouched. The refusal message is
rewritten only when the cap is the binding limit, so a caller is never told the
wrong number.

### Steps

1. `accountDailyAllowance` plus `FREE_ACCOUNT_DAILY_CAP` (default 100,000). —
   implemented
2. Setting override and validation in the admin API. — implemented
3. Clamp at admission with a cap-specific refusal message. — implemented
4. Admin field, share-vs-effective readout, docs, `.env.example`. — implemented
5. Tests for clamp behaviour and the summary. — implemented

### Verification

- `npm test` — 167 tests pass, 5 new in `tests/allocation.test.mjs`.
- HTTP with `FREE_ACCOUNT_DAILY_CAP=1` on a scratch copy: a free completion
  returned `429` with
  `Daily per-account free cap reached (1 weighted tokens). Resets at 2026-10-30T00:00:00.000Z.`
- Admin override: `PATCH /api/admin/gateway {accountDailyCapTokens: 50000}`
  returned a summary with `perAccountTokens: 18000000` and
  `effectivePerAccountTokens: 50000`; `-5` returned `400`.
- `npm run lint`, `npm run typecheck`, `npm run build` clean.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/allocation.test.mjs
- gate: test
- gate: build

### Verification Receipt

```text
npm test              167 tests, 167 pass
npm run lint          0 errors, 0 warnings
npm run typecheck     pass
npm run build         pass
HTTP cap=1            feee call -> 429 "Daily per-account free cap reached (1 weighted tokens)"
admin PATCH 50000     cap 50000, effective 50000, share 18000000
admin PATCH -5        400
```

## Perfection Loop

### Loop 1 — RED

- **RED:** One account could draw the entire 18M daily pool.
- **GREEN:** Effective allowance clamped to the per-account cap.
- **AUDIT:** The clamp is applied in the same transaction that reads usage and
  reservations, so concurrent requests still cannot both pass the boundary.
- **ADVERSARIAL:** A `0` cap must disable, not forbid — a naive `min(share, 0)`
  would have locked every free account out. Covered by test.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Does the cap change the pool maths or the reserve? → No. It only lowers what
   one account may spend; unspent share stays unspent, which is the safe
   direction for a shared upstream.
2. Should the cap be per key as well? → No. Per key would reward creating more
   keys; the identity that costs us upstream capacity is the account.
3. What about trial accounts? → Trials keep their own lifetime ledger and ignore
   the daily cap, unchanged.
4. Why 100,000 as the default? → It matches the externally recommended policy and
   is roughly 10–14 heavy agent-days on a weight-1 row. It is a starting value,
   not a measured one, and the admin field exists because only traffic can settle
   it.

### Implementation Evidence (REQUIRED for `closed`)

- [x] File:line ranges — `lib/allocation.ts:11-60`, `lib/allocation-ledger.ts:41-52`,
      `lib/store/free-pool.ts:205-240`, `app/api/admin/gateway/route.ts:110-135`
- [x] Gate output — above
- [x] HTTP evidence — above
- [x] Step statuses — all implemented

## Resolution

- **Closed Date:** 2026-10-30
- **Fix Description:** One account may spend at most the configured daily cap of
  weighted tokens, applied on top of its share of the split.
- **Tests Added:** Yes — `tests/allocation.test.mjs` (+5).
- **Verification Evidence:** Gate receipt and HTTP run above.
- **Archived:** pending

## Lessons Learned

A fair split and an abuse ceiling answer different questions. Dividing a shared
pool fairly says nothing about how much one identity should be allowed to take,
and conflating the two made the first account of the day worth the whole pool.
