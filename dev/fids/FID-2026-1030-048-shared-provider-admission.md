# FID: Aggregate provider admission across billing modes

**Filename:** `FID-2026-1030-048-shared-provider-admission.md`
**ID:** FID-2026-1030-048
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044
**YAGNI-Compliance:** Verified — one provider-wide gate around existing admission.

## Summary

Enforce serving-provider RPM and concurrency regardless of free, trial,
subscription or prepaid billing. Per-customer fairness must not multiply the
actual upstream account's capacity or consume money before an upstream slot exists.

## Environment

`lib/gateway-rate-limit.ts`, `lib/gateway.ts`, provider runtime metadata and
free/subscription/credit reservations. Historical 15 RPM is not a current contract.

## Detailed Description

### Problem / expected behavior / root cause

Current free traffic shares one bucket while paid keys each get their own
(`checkCompletionRate`). There is no aggregate paid/subscription provider bucket.
An included subscription can pass its allowance while exceeding serving capacity.
Expected: all dispatches pass the same serving-account ceiling and bounded
concurrency; a local refusal never strands a financial/allowance reservation.

### Evidence

`lib/gateway.ts` calls rate limiting before `resolveSubscriptionAccess`, but
scope selection is free versus key. `docs/subscriptions-decision.md` and SCOPE B7
record the cross-mode gap. Provider rows store RPM but do not enforce its aggregate.

## Impact Assessment

Hot request path, streaming lifetime and cancellation. Risk critical: incorrect
release can admit too many calls; too-tight limits can starve paid customers.
044 approves provider account ceilings and fairness; no unbounded queue is introduced.

## Proposed Solution

### Approach and steps

1. Define one admission identity per shared upstream account, not merely per
   model/customer key. Multiple registry rows sharing credentials must not multiply it.
2. Extend the existing limiter/admission boundary with provider-wide RPM and
   concurrency caps, keeping account/key fairness underneath that ceiling.
3. Acquire before financial/allowance holds or release every acquired resource
   on later rejection. Release concurrency exactly once on JSON/SSE/error/cancel.
4. Make unavailable/unknown limits fail according to an approved conservative
   policy; expose truthful 429/503 retry guidance and actual admission metrics.

### Verification

Extend `tests/rate-limit.test.mjs`; planned `tests/provider-admission.test.mjs`.
Real HTTP concurrency tests mix free/paid/trial/subscription, aliases, rejected
holds, timeout and cancellation. Intended chain: gateway resolves serving route
→ shared provider admission → existing billing reservation → dispatch → release.
Trial paid fallback must acquire the serving route's correct ceiling.

## Verification Gates

- gate: test tests/rate-limit.test.mjs

Planning audit under 043. Implementation: `npm run verify`, `npm test` including
planned `tests/provider-admission.test.mjs`. HTTP proof requires aggregate peak
within approved limits and zero leaked/negative slot counts; load proof is 060.

## Perfection Loop

RED: independent paid keys bypass the account ceiling. GREEN: one serving-account
gate and once-only slot lifecycle. AUDIT: pending. ADVERSARIAL: a second registry
alias or billing-mode switch must not create fresh capacity. Five questions:
bound aggregate work, cover all terminations, resist alias abuse, centralize
ownership and expose evidence rather than assumed headroom.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: no configured trusted ceiling means
503 before dispatch, not unlimited capacity. Registry aliases must explicitly
share a stable serving-account admission identity without persisting secrets.
Final convergence checks are in the master planning-audit receipt.

Design only. Single-process deployment remains the supported initial topology;
057/060 must prove the process count and prevent accidental limit multiplication.

## Lessons Learned

Customer fairness limits cannot substitute for an upstream account capacity limit.
