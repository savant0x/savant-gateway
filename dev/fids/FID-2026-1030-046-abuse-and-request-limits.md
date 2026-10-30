# FID: Abuse controls and bounded request resources

**Filename:** `FID-2026-1030-046-abuse-and-request-limits.md`
**ID:** FID-2026-1030-046
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044
**YAGNI-Compliance:** Verified — extend current rate/resource guards, no fake risk score.

## Summary

Bound signup, recovery, key creation and inference resource use at real trust
boundaries. A per-key paid bucket cannot defend against key multiplication or
unbounded request bodies; deployment controls must agree with application limits.

## Environment

`lib/customer-rate-limit.ts`, `lib/gateway-rate-limit.ts`, key routes and
`lib/gateway.ts`; process-local fixed windows and buckets exist today.

## Detailed Description

### Problem / expected behavior / root cause

Current controls are process-local and client identity trusts forwarded IP
headers (`lib/customer-rate-limit.ts:30`). They need explicit proxy trust,
account/key ceilings and bounded body/output/stream resource semantics.
Existing controls are partial implementations, not an absent limiter.

### Evidence

Signup checks a client window; paid inference buckets use key ID. FID-042
validated two JSON roots, but signup/login still cast parsed bodies before
field access. Extend the shared guard to actual request boundaries rather than
claiming every route was repaired by the earlier targeted fix.

## Impact Assessment

Auth/account/admin/inference routes and hosting request caps. Risk high: limits
can lock out real customers or multiply upstream exposure. Approved values come
from 044; proxy trust wiring is coordinated with 047/057.

## Proposed Solution

### Approach and steps

1. Inventory every write endpoint's schema, byte limits, authentication order,
   attempts and persistence; reuse `isJsonObject` and current validation helpers.
2. Add account-level key/creation/dispatch bounds and capped request/stream sizes;
   reject invalid or excessive output budgets before any hold or provider request.
3. Make client identity derive only from approved ingress behavior; define
   restart/multi-process policy and bounded cleanup of limiter state.
4. Return honest 400/413/429 responses with retry guidance; test slow/large input,
   key churn and account farms without introducing a pretend fraud service.

### Verification

Extend existing `tests/rate-limit.test.mjs`, `tests/http.test.mjs` and real HTTP
checks for primitives/null across routes, forged IP headers, request/output caps,
key multiplication and no hold/provider dispatch on refusal. Planned
`tests/request-limits.test.mjs` covers resource-bound arithmetic. Intended callers:
route parsers/account key writes → shared guards; gateway → bounded admission.

## Verification Gates

- gate: test tests/rate-limit.test.mjs
- gate: test tests/http.test.mjs

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
existing named tests and planned `tests/request-limits.test.mjs`. HTTP and ingress
receipts must agree on status/size boundaries and restart behavior.

## Perfection Loop

RED: partial abuse coverage and trusted-header ambiguity. GREEN: explicit bounded
contracts at account and request boundaries. AUDIT: pending. ADVERSARIAL: one
account with many keys must not gain capacity. Five questions: bounded memory and
work, all malformed shapes, hostile client identity, shared validation and clear limits.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: bound JSON depth/items, tool/media
payloads and completion multiplicity before reservation. Reject unsupported
multi-completion requests until usage/price accounting covers every choice.
Final convergence checks are in the master planning-audit receipt.

Design only. No unchosen CAPTCHA, fingerprinting or external fraud platform is
assumed; any such addition needs an operator policy and a real integration.

## Lessons Learned

Request-rate limits, resource limits and identity abuse controls solve different problems.
