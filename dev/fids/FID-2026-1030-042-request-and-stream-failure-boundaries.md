# FID: Validate request roots and surface failed stream settlement

**Filename:** `FID-2026-1030-042-request-and-stream-failure-boundaries.md`
**ID:** FID-2026-1030-042
**Severity:** high
**Status:** verified
**Created:** 2026-10-30
**Automation level:** 3
**YAGNI-Compliance:** Verified — reuse HTTP helpers, existing transactional store
and production HTTP harness; no new service or accounting table.

## Summary

Initial systems inspection found unchecked JSON roots in two routes and a
discarded streaming settlement exception. A valid JSON null is not an object;
an exception during financial writes must not be mistaken for completed usage.

## Environment

Windows, Node, TypeScript, production Next build, disposable SQLite and existing
HTTP suite. Current source derives from HEAD `443cde5` plus inherited changes.

## Detailed Description

### Problem, expected behavior and root cause

`lib/gateway.ts` casts request JSON to a record before `body.model`;
`app/api/admin/benchmarks/route.ts` casts before `body.force`. Null can throw
instead of producing a validation response. Reject non-object/array roots with
400, keeping authentication first and existing empty-body refresh behavior.

`lib/gateway-stream.ts` catches and discards `settleCall` exceptions, marks the
call settled, and closes the response before the write. With a SQLite trigger
that aborts usage insertion, the transaction rolls back but the response still
finishes normally. A failed accounting write must emit a safe diagnostic with
reservation identifiers and fail the stream; it must never debit twice or
release funds as if a failed transaction succeeded.

### Evidence

Source: `handleChatCompletions` JSON parse block; benchmark POST parse block;
stream `finish` catch and `controller.close()` before `finish("ok")`.
Runtime reproduction will run before production edits using the existing build.

## Impact Assessment

Affected: `lib/http.ts`, `lib/gateway.ts`, benchmark POST, stream relay,
`scripts/http-suite.mjs`, harness/checks and a new systems-checks module.
Risk: high because the stream termination path and financial failure behavior
change. Success JSON/SSE charges and both suites must still pass. This does not
invent a retry queue: storage-failure recovery and operator alert delivery remain
explicit launch acceptance requirements in the plan.

## Proposed Solution

1. Add HTTP regressions for non-object roots and injected stream write failure.
2. Share one object type guard; validate roots after auth and before fields.
3. Attempt stream settlement once; settle before closing; on failed write log
   a fixed diagnostic and identifiers, then throw a generic stream error.
   Preserve transaction rollback and handle upstream cancellation errors.
4. Verify unchanged success JSON/SSE settlement, no extra debit/usage after
   fault injection, pending hold visibility and a successful later request.
5. Run full gates, record evidence, commit and close against its real SHA.

## Verification Gates

- gate: lint — `npm run lint`
- gate: typecheck — `npm run typecheck`
- gate: test tests/http.test.mjs — `npm test`, shared object-guard cases
- gate: quality — `npm run quality`
- gate: build — `npm run build`
- gate: test_http — `npm run test:http`, new
  `scripts/http-suite/systems-checks.mjs` invoked by the existing checker
- gate: verify — `npm run verify`

## Perfection Loop

RED: source evidence above; runtime tests must demonstrate both failures.
GREEN: boundary guard, one settlement attempt, safe diagnostics and failed stream.
AUDIT: request tests assert no upstream calls or holds; SQLite fault tests assert
balance/ledger rollback and hold retention, not merely a changed HTTP status.
ADVERSARIAL: never log raw exception text, prompt, key or upstream headers;
do not retry a possibly completed debit; cancellation and upstream-read errors
must settle once and propagate a generic failure. Controller closes only after
successful settlement. Complete HTTP regression includes ordinary paid success.

Two final document review passes made no edits (0%, 0%). Plan converged before
test or production code changes. Runtime results may require self-correction.

Implementation audit correction: failing transport after forwarding `[DONE]`
still permits clients to accept success early. Hold only the terminal data line
until settlement commits; relay other complete lines as received and flush the
decoder at EOF. The HTTP failure check must retain partial output and assert
that it never contains `[DONE]`. This closes the acknowledgement gap.

## Implementation Evidence

### RED runtime receipt — before production edits

`node scripts/http-suite.mjs` exited 1 against the previously built tree:

```text
root statuses: null completion=500 benchmark=500
[] / "value" / 42 / true: completion=400 benchmark=200
normal paid SSE completes PASS; exact debit and single usage/ledger PASS
failed settlement completed=true, hold=147, usageDelta=0
failed settlement rolls back debit/usage/ledger PASS
later paid stream succeeds; unresolved reservation remains visible PASS
FAIL: completion rejects null root — expected 400, got 500
```

Both failures are demonstrated. Transaction rollback is retained by the repair;
the response and diagnostic behavior change. No retry/recovery service is claimed.

Steps 1–4 implemented: `lib/http.ts:9`, `lib/gateway.ts:130`, benchmark POST:34,
`lib/gateway-stream.ts:43-162`; `scripts/http-suite/checks.mjs:556` invokes
the regression module. Step 5 gates passed; committed closure follows.

2026-10-30 receipt: `npm run verify` exit 0; lint/typecheck clean, 209 tests
passed (0 failed/skipped), quality PASS (233 files), build pass, HTTP 138 checks
PASS, trial HTTP all checks PASS. Static audit plus manual re-read checked
once-only settlement, transactional rollback, terminal withholding, cancellation
and secret-free diagnostics against the regression assertions.

## Resolution

Implemented and verified; awaiting its implementation SHA for closure. No
durable-recovery service or live-service acceptance is claimed.

## Lessons Learned

A clean build and successful ordinary requests do not exercise malformed trust
boundaries or an accounting transaction that fails after output was generated.
