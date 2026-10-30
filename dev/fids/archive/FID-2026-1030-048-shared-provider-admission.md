# FID: Aggregate provider admission across billing modes

**Filename:** `FID-2026-1030-048-shared-provider-admission.md`
**ID:** FID-2026-1030-048
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** closed
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044
**YAGNI-Compliance:** Verified — one provider-wide gate around existing admission.
**Archived:** 2026-10-30 — implementation `e346b0a`; receipt above from that tree.

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

`lib/gateway.ts` called rate limiting before `resolveSubscriptionAccess`, but
scope selection was free versus key. `docs/subscriptions-decision.md` and SCOPE B7
record the cross-mode gap. Provider rows stored RPM but never enforced its aggregate.

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
- gate: test tests/provider-admission.test.mjs

Implementation: `npm run verify`, `npm test`. HTTP proof requires aggregate
refusal through the production route with truthful headers and recovery; load
peak and multi-process behaviour belong to 060/057.

## Perfection Loop

### Re-audit before implementation (post-063, 2026-10-30)

RED: 063 changed account refresh to run on every explicit check and on free
admission, and made `status.rpm` current only while the balance observation is
fresh. The original plan's "trusted ceiling" therefore had a working source on
the free path but none on paid/subscription paths, where no refresh runs.
A strict "unknown means 503" rule would have refused paid traffic whenever the
balance observation was older than 30 seconds and no fallback was configured.
Catalog `synced_at` remains an unrelated clock and was not reused.

GREEN: observed current rpm wins; an explicit operator ceiling
(`PROVIDER_SHARED_RPM`) is the documented fallback for accounts that publish
none; neither means 503 before any hold. Concurrency is a local guardrail
(`PROVIDER_SHARED_CONCURRENCY`, default 4), labelled as a gateway cap rather than
an upstream claim. Identity is `origin|credential-variable-name`, so aliases on
one account share one ceiling and no secret is read, hashed or stored.

AUDIT: grepped the production caller — `handleChatCompletions` acquires before
`resolveSubscriptionAccess`, `reserveTrialRoute` and `reservePaidCall`. The trial
paid fallback is validated to keep the same `upstreamSlug`, so it spends the
ceiling already acquired. The streaming relay takes ownership of the release and
releases in `finish()` for ok/error/cancel; JSON paths release in `finally`.

SELF-CORRECT: the first draft pushed `lib/gateway.ts` to 441 lines, over the
enforced 400-line ceiling. Extracted the gate boundary
(`lib/gateway-provider-admission.ts`) and the existing paid reservation
(`lib/gateway-paid.ts`) rather than raising the ceiling or inlining a suppression.

ADVERSARIAL: a second registry row with a path variant shares the identity; a
different credential variable or origin does not. A malformed base URL yields no
identity and refuses. Release is idempotent, so double release cannot admit
extra calls or drive the counter negative.

Five questions: bound aggregate work (yes), cover all terminations (JSON,
upstream error, invalid body, stream ok/error/cancel), resist alias abuse (shared
identity), centralize ownership (one module, one release), expose evidence
(headers and `providerAdmissionSnapshot`) rather than assumed headroom.

## Implementation

| Responsibility | File |
| --- | --- |
| Identity, ceiling trust, RPM/concurrency slots, idempotent release | `lib/provider-admission.ts` |
| HTTP refusal shape and lease acquisition | `lib/gateway-provider-admission.ts` |
| Acquisition before every hold, release on every exit | `lib/gateway.ts` |
| Stream owns and releases the slot on ok/error/cancel | `lib/gateway-stream.ts`, `lib/gateway-settle.ts` |
| Paid reservation extracted to hold the file ceiling | `lib/gateway-paid.ts` |
| Unit evidence | `tests/provider-admission.test.mjs` |
| Production-route evidence and tight-ceiling fixture | `scripts/http-suite/quota-checks.mjs`, `scripts/http-suite/harness.mjs` |
| Configuration | `.env.example` (`PROVIDER_SHARED_RPM`, `PROVIDER_SHARED_CONCURRENCY`) |

## Verification

`npm run verify` exit 0 on 2026-10-30:

```text
lint: zero warnings
typecheck: exit 0
tests 251 / pass 251 / fail 0
quality: PASS (400-line ceiling, 250 files scanned)
production build: clean
http-suite: 251 checks PASS (was 242)
trial-http-suite: all checks PASS
```

Route-level proof in the disposable production build: with the mock account
declaring 1 RPM, the first call is admitted, the next is refused with 429,
`X-RateLimit-Scope: provider`, `X-RateLimit-Limit: 1`, a positive
`Retry-After` and `rate_limit_error`; restoring a generous ceiling and
re-observing it admits traffic again. No hold is created for a refused call.

Evidence limits: a concurrent-request 429 at the route level and a real
cancellation mid-stream were not observed in this receipt; the concurrency cap
and release paths are unit-covered. Multi-process ceiling multiplication and
measured peak capacity remain 057/060 acceptance obligations. The mock declares
its own generous ceiling so unrelated checks are not throttled; the tight case
is exercised deliberately.

## Resolution

Verified implementation of the converged design. Design only for the topology:
single-process deployment remains the supported initial topology; 057/060 must
prove the process count and prevent accidental limit multiplication.

## Lessons Learned

Customer fairness limits cannot substitute for an upstream account capacity limit.
