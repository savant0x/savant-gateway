# Session summary: aggregate provider admission (048)

**FID:** FID-2026-1030-048
**Date:** 2026-10-30
**Implementation:** `e346b0a`
**Branch:** `main`

## Intent

Continue the provider-account handoff, whose next engineering priority was 048.
The task was to stop per-customer fairness limits from multiplying the real
serving account's capacity, without inventing a commercial rate ruling that
belongs to 044.

## Re-audit before implementation

063 made a current account observation available on explicit checks and free
admission, but paid and subscription traffic never refreshes. A hard "unknown
ceiling means 503" rule alone would therefore have stopped paid traffic whenever
the balance observation was older than 30 seconds. The converged trust order is
now: current upstream rpm, then the explicit `PROVIDER_SHARED_RPM` fallback,
then a 503 before any hold. Concurrency is a local gateway cap
(`PROVIDER_SHARED_CONCURRENCY`, default 4), not a claim about the account.

## Implementation

- `lib/provider-admission.ts` — secret-free identity (`origin|credential
  variable name`), ceiling trust, RPM bucket and in-flight counter per account,
  idempotent release, observable snapshot.
- `lib/gateway-provider-admission.ts` — lease acquisition and the truthful
  429/503 shape (`X-RateLimit-Scope`, limit, remaining, `Retry-After`).
- `lib/gateway.ts` — acquires before `resolveSubscriptionAccess`,
  `reserveTrialRoute` and `reservePaidCall`; releases in `finally`; hands the
  lease to the stream on success.
- `lib/gateway-stream.ts` — releases once in `finish()` for ok/error/cancel and
  on an empty upstream stream.
- `lib/gateway-paid.ts` — the existing paid reservation, extracted so
  `lib/gateway.ts` stays under the enforced 400-line ceiling.
- `tests/provider-admission.test.mjs` — nine cases including alias sharing,
  unknown identity/ceiling, shared ceiling across modes, concurrency and
  exactly-once release.
- HTTP fixture: the mock account declares its own rpm; one check sets a 1 RPM
  ceiling, proves the next call is refused with provider-scope headers, then
  restores and re-observes capacity.

## Receipt

`npm run verify` exit 0: lint zero warnings, typecheck, 251/251 tests, quality
PASS (400-line ceiling, 250 files), clean production build, 251 HTTP checks,
trial HTTP suite PASS. Route evidence is in `scripts/http-suite/quota-checks.mjs`;
local logs `data/048-verify.log` and `data/048-http.log` are ignored receipts.

## Limits and next

A concurrent-request 429 and a cancelled mid-stream call were not observed at
the route level; the cap and release paths are unit-covered. Multi-process
ceiling multiplication and measured peak capacity remain 057/060 acceptance
obligations. 044 still owns provider ceilings, rates and funding as an operator
ruling. With capacity now gated, 050 (usage/cost fidelity) → 051 (durable
settlement) are the next dependency-ordered items; the two untracked research
documents remain the operator's.
