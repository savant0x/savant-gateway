# FID: Abuse controls and bounded request resources

**Filename:** `FID-2026-1030-046-abuse-and-request-limits.md`
**ID:** FID-2026-1030-046
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** verified
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
- gate: test tests/request-limits.test.mjs

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

Implementation verified 2026-10-31. No unchosen CAPTCHA, fingerprinting or
external fraud platform is assumed. Hosted ingress acceptance remains a tracked
observation; the deployed proxy must strip/set its selected client-IP header.

## Lessons Learned

Request-rate limits, resource limits and identity abuse controls solve different problems.

## Execution audit — 2026-10-31

RED: `gateway.ts` reads an unbounded body; `readRequestedOutputBudget` treats
invalid supplied values as absent; `n` is forwarded although only one choice is
priced; paid buckets use key IDs; key creation has no ceiling; both login
boundaries trust arbitrary forwarded headers. Fixed-window and token-bucket
maps retain inactive identities indefinitely. Stream buffers have no byte cap.

GREEN: one streaming JSON reader limits bytes (64 KiB for management, 2 MiB for
inference), read time (10 seconds), depth (32) and node count (20,000). Validate
completion multiplicity, message/tool counts and both output aliases before any
reservation. Preserve the existing 65,536 output ceiling and 60 RPM paid limit,
sharing the paid bucket by account. Bound keys to 10 active and 20 issued/hour
inside one immediate transaction. Use only an explicitly configured ingress IP
header, otherwise a shared untrusted-client bucket. Never trust forwarding lists
without an ingress policy. Bound limiter maps at 10,000 identities with expired
entry cleanup and fail-closed saturation. Bound SSE frames to 1 MiB and total
response bytes to 32 MiB, cancelling and settling observed usage on failure.

AUDIT: callers are gateway admission, auth/account/admin parsers, account key
creation and stream relay; existing helpers are extended rather than duplicated.
New `tests/request-limits.test.mjs` and production HTTP probes must show 400/413/
429, no provider call and no financial/settlement row on invalid inference.
Test key churn, IP spoofing, chunked over-limit input and slow input separately.
Add `gate: test tests/request-limits.test.mjs` to the verification contract.

ADVERSARIAL: Content-Length is advisory; count actual stream bytes. Reject both
invalid output aliases even when the other alias is valid. Do not evict a live
bucket to admit a new attacker identity. Enforce key counts in the transaction,
so concurrent issuance cannot exceed the ceiling. Ingress must strip and set its
selected IP header; configuration alone is not proof of hosted ingress safety.

Convergence pass 1: no further design corrections (0%). Pass 2: no further
design corrections (0%). Implementation may proceed; live ingress acceptance
remains an explicit hosted observation.

## Implementation receipt — 2026-10-31

`lib/request-limits.ts` owns bounded UTF-8 reads, deadlines, JSON structure and
completion validation. Every JSON mutation route calls `readJsonObject`; Stripe
uses `readBoundedText` so signature verification receives unchanged raw text.
`lib/store/account.ts` enforces issuance inside an immediate transaction;
`gateway.ts` supplies `auth.userId` to account dispatch limiting. Admin login
reuses the customer ingress-identity helper. Limiter maps fail closed when full.
`gateway-stream.ts` caps actual response bytes and UTF-8 frame bytes and cancels
upstream on failure. FAQ and `.env.example` describe the new behavior.

`npm run verify` exit 0: 335 unit tests, quality PASS (308 files), production
build, main HTTP 609 checks PASS, trial HTTP all checks PASS, recovery drill PASS
(8 concurrent writes, 1929ms). That run reported one formatting warning; the
line was formatted directly and a clean lint check is required before commit.
Initial HTTP probe failed because its seeded session was not a valid production
token and its account lacked a password hash; fixed the fixture, then reran the
whole HTTP gate and the full verification. No authentication bypass was added.

Reachability: `rg 'readJsonObject|readBoundedText' app/api lib/gateway.ts` finds
every body-reading boundary; `rg 'request\.(json|text)\(' app/api lib/gateway.ts`
returns no matches. HTTP checks prove refused inference creates no credit hold,
settlement or provider call; concurrent issuance yields exactly ten active keys,
hourly churn refuses, and two paid keys still exhaust one account's RPM.

Post-format lint: `npm run lint` exit 0, no errors or warnings. Manual audit
matched each route's authentication order, parser error path, transaction limits
and stream ownership against this contract. No secrets or request content enter
the new diagnostics. Hosted evidence is registered as `FID-2026-1030-046-INGRESS`.
