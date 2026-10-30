# FID: Completion rate limits at the gateway boundary

**Filename:** `FID-2026-1029-023-completion-rate-limits.md`
**ID:** FID-2026-1029-023
**Severity:** high
**Status:** closed
**Closed Against:** `2cac572`
**Archived:** 2026-10-30

Closure reconciliation: `lib/gateway.ts` calls `checkCompletionRate` before
subscription/free/credit reservation. Full `npm run verify` exited 0 on
2026-10-30 before subsequent systems repairs. This proves the implemented
free-shared/per-paid-key limiter, not aggregate cross-mode upstream admission;
that remaining launch requirement is explicit in `docs/launch-plan.md`.
**Created:** 2026-10-29 23:40
**Automation level:** 3
**YAGNI-Compliance:** Verified — one pure bucket, one gate module, two
environment variables. No database table, no scheduler, no dependency.

---

## Summary

The completions endpoint had no request-rate control at all. The upstream free
plan permits 15 requests per minute for the whole account, so a single free key
running parallel agents could consume the entire allowance and fail paying
customers with upstream 429s. Free traffic now draws from one shared bucket sized
below that ceiling (12 RPM by default), and every paid key gets its own bucket
(60 RPM by default).

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16 (node runtime)
- **Commit/State:** `3e8b509` + working tree

## Detailed Description

### Problem

`app/v1/chat/completions/route.ts` calls `handleChatCompletions` directly. The
only limiters in the repository were `lib/customer-rate-limit.ts` (signup, login,
top-up, subscription) and `lib/admin-rate-limit.ts` (admin session), none of
which touch inference. `providers.rpm = 15` records the upstream ceiling, and
nothing enforced it locally.

### Expected Behavior

- A free key is limited by a bucket shared with every other free key.
- A paid key is limited only by its own bucket.
- A throttled request returns `429` with `Retry-After`,
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Scope`.
- A throttled request never reserves credit, a free-pool slot, or a subscription
  allowance, and never reaches the provider.
- Limits are environment-tunable without a deploy of new logic, and a malformed
  value falls back to the default rather than disabling the control.

### Root Cause

The gateway was built for a single upstream key and a single trusted caller.
Abuse control was considered a later administrative concern, so the data path had
authentication but no throughput ceiling.

### Evidence

```text
providers row savant: rpm = 15, rpm_plan = 'free'
app/v1/chat/completions/route.ts   POST -> handleChatCompletions(request)
grep rate-limit  -> lib/customer-rate-limit.ts, lib/admin-rate-limit.ts only
```

## Impact Assessment

### Affected Components

- `lib/token-bucket.ts` (new, pure)
- `lib/gateway-rate-limit.ts` (new)
- `lib/gateway.ts` (admission order)
- `.env.example` (`FREE_SHARED_RPM`, `PAID_KEY_RPM`)
- `tests/rate-limit.test.mjs` (new)
- `knowledge.md`

### Risk Level

- [x] High: a limiter that is too tight breaks agent workloads; one that is too
      loose does not protect the upstream. Both are tunable without code changes.

## Proposed Solution

### Approach

`takeToken` implements the arithmetic with the clock injected, so refill, burst,
exhaustion and a backwards clock are testable without timers. Starting a bucket
full means the first burst is never throttled. `checkCompletionRate` owns the
process-local `Map` and picks the scope: `completion:free` for free traffic,
`completion:paid:<keyId>` for paid. The check runs after request validation and
before `resolveSubscriptionAccess`, so a rejected call holds nothing.

### Steps

1. Pure token bucket with `retryAfterSeconds`. — implemented
2. Scope selection, environment config, per-process bucket map. — implemented
3. Wire into `handleChatCompletions` before reservation; 429 shape with headers.
   — implemented
4. Environment defaults documented. — implemented
5. Unit tests for bucket arithmetic and scope isolation. — implemented

### Verification

- `tests/rate-limit.test.mjs` — 10 tests.
- HTTP: with `FREE_SHARED_RPM=3` and a scratch copy of the database, six free
  completions returned `429`; the first three from the existing free-pool guard
  and the last three from the limiter with
  `retry-after: 19`, `x-ratelimit-limit: 3`, `x-ratelimit-remaining: 0`,
  `x-ratelimit-scope: free`. The decreasing `Retry-After` is the bucket refilling.
- `npm run build`, `npm run lint`, `npm run typecheck` clean.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/rate-limit.test.mjs
- gate: test
- gate: build

### Verification Receipt

```text
node --test tests/rate-limit.test.mjs   10 tests, 10 pass
npm run lint                           0 errors, 0 warnings
npm run typecheck                      pass
npm run build                          pass
HTTP FREE_SHARED_RPM=3                 req4-6: 429 rate_limit_error,
                                       retry-after 20/20/19, limit 3, remaining 0
```

## Perfection Loop

### Loop 1 — RED

- **RED:** One free key can spend all 15 upstream RPM.
- **GREEN:** Shared free bucket below the ceiling, per-key paid buckets.
- **AUDIT:** The limiter sits before every reservation, so a 429 cannot strand a
  credit hold or a free-pool reservation.
- **ADVERSARIAL:** A per-process `Map` is lost on restart and does not span
  instances. Accepted for the current single-process deployment and stated in the
  module header rather than assumed away.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Should the limiter also cap aggregate paid traffic against 15 RPM? → Not yet.
   Free traffic is bounded at 12, leaving 3 RPM of headroom; capping paid
   customers would need a queue, not a bucket, and there are no paid customers to
   protect yet.
2. Does throttling consume a token when the call is later refused for quota? →
   Yes. The bucket protects upstream capacity and the request did arrive; refunding
   tokens would let a client probe the quota limit for free.
3. Subscription-included calls? → They take the paid bucket, because they are
   paying through a plan and must not be slowed by anonymous traffic.
4. Is `X-RateLimit-*` enough for clients? → It is the documented OpenAI-style
   trio plus a scope header, and `Retry-After` is authoritative.

### Implementation Evidence (REQUIRED for `closed`)

- [x] File:line ranges — `lib/token-bucket.ts:1-85`,
      `lib/gateway-rate-limit.ts:1-95`, `lib/gateway.ts:206-243`
- [x] Gate output — above
- [x] Reproducibility — `FREE_SHARED_RPM=3 npm start`, then loop completions
- [x] Step statuses — all implemented

## Resolution

- **Closed Date:** 2026-10-29
- **Fix Description:** Completions are rate limited before any reservation; free
  traffic shares a bucket under the upstream ceiling and paid keys are isolated.
- **Tests Added:** Yes — `tests/rate-limit.test.mjs` (10).
- **Verification Evidence:** Gate receipt and HTTP run above.
- **Archived:** pending

## Lessons Learned

The upstream ceiling is invisible until it is hit. Recording `rpm` on the provider
row was already the right habit; enforcing it locally is the part that turns a
provider fact into a product guarantee.
