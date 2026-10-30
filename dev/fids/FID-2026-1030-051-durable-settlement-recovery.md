# FID: Durable settlement and crash/expired-hold recovery

**Filename:** `FID-2026-1030-051-durable-settlement-recovery.md`
**ID:** FID-2026-1030-051
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-050
**YAGNI-Compliance:** Verified — one durable call/settlement identity over existing stores.

## Summary

Make financial completion replay-safe across process death, failed writes and
late/expired reservations. FID-042 delayed DONE and made failures observable;
this child supplies durable state, reconciliation and safe restart behavior.

## Environment

`lib/gateway.ts`, stream/settlement helpers, `lib/store/usage.ts`,
`lib/store/billing.ts`, subscription holds and durable trial reservations.

## Detailed Description

### Problem / expected behavior / root cause

The stream's once-only guard is memory-local. `recordUsage` has a trial replay
check but does not establish one durable settlement identity for every billing
source. `releaseExpiredHolds` deletes credit holds by time, including requests
whose outcome needs investigation. An elapsed TTL is not proof of no upstream work.

### Evidence

`lib/store/usage.ts:69-74` checks settled trial state; credit holds are removed
at :86. `lib/store/billing.ts:122-139` releases expired rows. The prior systems
HTTP fault left a 147-micro hold with no committed usage and an operator diagnostic.

## Impact Assessment

All billing sources, durable call schema, streams, recovery job and operator
reconciliation. Risk critical: duplicate debit, free served output or stranded
funds. Preserve customer ledger/history; do not replay an inference to recover billing.

## Proposed Solution

### Approach and steps

1. Persist a unique admitted-call identity, reservation links and route/price
   snapshot before dispatch. Bind usage/debit/entitlement settlement to that identity
   with a uniqueness rule and one atomic state transition.
2. Commit authoritative outcome and financial writes before DONE/JSON success;
   retry only known-uncommitted accounting, never blindly repeat model inference.
3. Separate unused/expired admissions from dispatched/unknown outcomes. Quarantine
   uncertain holds across restart until trusted evidence or an audited correction
   resolves them; never auto-refund served output on a timer.
4. Add bounded recovery/inspection and safe operator resolution. If storage cannot
   durably record an outcome, fail acknowledgment, stop unsafe new work and alert;
   do not claim exact lost usage can be reconstructed without provider evidence.

### Verification

Planned `tests/settlement-recovery.test.mjs`; extend `tests/trials.test.mjs`,
`tests/money.test.mjs` and HTTP failure checks. Kill/restart at admission,
dispatch, outcome and commit boundaries; assert one debit/usage and correct
hold state after duplicate callbacks/recovery. Intended chain: gateway/relay →
durable settlement store; startup/maintenance → same idempotent accounting path.

## Verification Gates

- gate: test tests/trials.test.mjs
- gate: test tests/money.test.mjs

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
planned `tests/settlement-recovery.test.mjs` and named existing tests. HTTP plus
disposable-process crash receipts must prove every interruption boundary, not
just caught exceptions. Recovery/backup coordination is 058/059.

## Perfection Loop

RED: memory-only completion and unsafe uncertainty at expiry. GREEN: durable
identity, atomic replay and quarantine. AUDIT: pending. ADVERSARIAL: disk failure
can prevent an outcome write; acknowledge neither success nor a guessed refund.
Five questions: every interruption, bounded retries, hostile disconnect/replay,
one financial transition and durable evidence that survives restart.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: durable state is monotonic and
idempotency is bound to call/account. Late callbacks cannot downgrade or debit
a committed outcome; duplicate/expired recovery attempts must prove this.
Final convergence checks are in the master planning-audit receipt.

Design only. Unknown outcomes remain explicit liabilities, not a hidden success
or fabricated zero. Final recovery behavior must be accepted before public traffic.

## Lessons Learned

Once-only execution in memory and exactly-once financial effects are different contracts.
