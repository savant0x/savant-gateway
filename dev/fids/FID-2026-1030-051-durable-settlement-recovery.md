# FID: Durable settlement and crash/expired-hold recovery

**Filename:** `FID-2026-1030-051-durable-settlement-recovery.md`
**ID:** FID-2026-1030-051
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** verified
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

## Re-audit and convergence (2026-10-30, post-050)

RED (measured in source):

- `recordUsage` is atomic for one process, but no durable row names the admitted
  call: a crash between dispatch and settlement leaves only a hold ID. There is
  no uniqueness rule that could reject a second settlement of the same call.
- `lib/store/billing.ts#releaseExpiredHolds` deletes an expired credit hold and
  reduces `held_micros` on a timer. Expiry is not evidence that no upstream work
  happened, so a served call can become free and its usage disappear.
- `lib/store/subscription-access.ts#releaseExpiredHolds` does the same for
  allowance holds; `free_pool_reservations` rows are deleted on expiry.
- There is no inspection or operator resolution surface for uncertain outcomes.

GREEN (documented before code):

1. One `settlements` row per admitted call, created before dispatch with the
   billing source, reservation links and estimated charge. `recordUsage` claims
   it with a monotonic `admitted → committed` update inside the same transaction
   that writes usage, the debit, the ledger row and the hold release. A second
   settlement of the same id is a no-op that returns zero charged.
2. Expired reservations are quarantined, not refunded: the credit hold row moves
   to `quarantined_holds`, `users.held_micros` keeps the amount reserved, the
   subscription period keeps its held tokens, and free-pool reservations keep
   counting against the daily allowance. An elapsed TTL never frees capacity.
3. Quarantine is durable and inspectable; the operator resolution action is a
   single audited `release` that returns the exact reserved amount, never an
   automatic refund and never a guessed charge.
4. If the settlement row cannot be written, the request is refused before
   dispatch. If the commit fails, existing behavior stands: reservations stay
   for reconciliation and the failure is observable; no inference is replayed.

AUDIT: the settlement id is written once in `handleChatCompletions` and carried
in `GatewayCallContext`; every settleCall caller (JSON success, upstream error,
invalid body, stream ok/error/cancel) reaches the same `recordUsage` transition.

ADVERSARIAL: duplicate settlement, a late callback after quarantine, an expired
hold whose output was served, and a replay after restart must each leave one
committed row and one debit at most. Free-pool estimates are not money and are
not converted into a fabricated charge.

## Implementation

| Responsibility | File |
| --- | --- |
| Admission, monotonic commit, quarantine, audited release | `lib/settlement-ledger.ts` |
| Durable tables | `lib/schema/settlements.ts`, `lib/db.ts` |
| Server wrapper and operator inspection/resolution | `lib/store/settlements.ts`, `app/api/admin/settlements/route.ts` |
| Settlement row recorded before dispatch | `lib/gateway.ts` |
| One atomic claim in the usage transaction | `lib/gateway-settle.ts`, `lib/store/usage.ts` |
| Expired credit, subscription and free reservations quarantined | `lib/store/billing.ts`, `lib/store/subscription-access.ts`, `lib/store/free-pool.ts` |
| Independent expectations | `tests/settlement-recovery.test.mjs` |
| Route reachability | `scripts/http-suite/quota-checks.mjs` |

## Verification

`npm run verify` exit 0 on 2026-10-30:

```text
lint: zero warnings
typecheck: exit 0
tests 264 / pass 264 / fail 0
quality: PASS (400-line ceiling, 256 files scanned)
production build: clean
http-suite: 254 checks PASS
trial-http-suite: all checks PASS
```

The five new cases cover: admit-then-commit once, an unknown settlement
unclaimable, a quarantined credit hold keeping the money reserved until one
audited release, subscription/free quarantine retaining their own capacity, and
idempotent quarantine. The production route returns committed settlements and
refuses to release an unknown quarantine (404). Settlement duplicate and
quarantined claims are rejected by the same `commitSettlement` transition used
inside the usage transaction.

Evidence limits: no process-kill/restart receipt was produced in this pass, so
crash-boundary survival is proven at the durable-state level rather than by a
killed process; the admin resolution is an API route with no UI surface; HTTP
quarantine behavior is unit-covered, not route-covered; production
recovery/backup coordination remains 058/059.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: durable state is monotonic and
idempotency is bound to call/account. Late callbacks cannot downgrade or debit
a committed outcome; duplicate/expired recovery attempts must prove this.
Final convergence checks are in the master planning-audit receipt.

Design only. Unknown outcomes remain explicit liabilities, not a hidden success
or fabricated zero. Final recovery behavior must be accepted before public traffic.

## Lessons Learned

Once-only execution in memory and exactly-once financial effects are different contracts.
