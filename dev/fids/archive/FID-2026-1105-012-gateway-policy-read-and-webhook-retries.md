# FID: Resolve the gateway policy summary and prove webhook retry responses

**Filename:** `FID-2026-1105-012-gateway-policy-read-and-webhook-retries.md`
**ID:** FID-2026-1105-012
**Severity:** high
**Status:** closed
**Created:** 2026-11-05 22:05 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

The load-acceptance preflight exposed that `GET /api/admin/gateway` and the PATCH
response serialize an unresolved promise as `allocation: {}`. The admin page
awaits the same façade function and therefore did not catch the route defect.
This record fixes both responses, adds an HTTP assertion that would have caught
it, and adds signed in-flight Stripe and NOWPayments checks proving the existing
409 + `Retry-After` contract does not mutate credit or duplicate a top-up.

## Environment

- **OS:** Windows (win32), Git Bash.
- **Language/Runtime:** Node 24.x; TypeScript 5.9.3 strict; Next.js 16.4.3 App
  Router.
- **Tool Versions:** npm with the committed lockfile; PostgreSQL
  17.11.0-beta.19 disposable cluster; PGlite for local development.
- **Commit/State:** implementation `efd8cb5` on `main`; full verification and
  the load baseline ran against that commit. The untracked billing-concurrency
  handoff is preserved.

## Detailed Description

### Problem

`getAllocationSummary` became asynchronous when the store façade was ported to
PostgreSQL. The admin page awaits it, but both route responses pass the promise
directly to `Response.json`, which serializes it as an empty object. An operator
or preflight reading the API cannot see the effective pool, allocation basis,
account cap or observed-capacity state. The load gate fails before offering any
traffic because it correctly refuses to measure against an unreadable policy.

### Expected Behavior

Both route responses await the summary. `allocation` is an object with numeric
pool, basis and account-cap fields plus the observed-capacity state. A signed
webhook whose event is already claimed returns 409 with `Retry-After: 30` and
does not credit, duplicate a ledger row or change a top-up. A processed event
remains a replay and is acknowledged rather than reported as a conflict.

### Root Cause

The route was not updated when `getAllocationSummary` changed from a synchronous
store read to an async façade binding. TypeScript cannot reject a promise in a
`Response.json` object because the parameter is `unknown`.

### Evidence

```text
app/api/admin/gateway/route.ts:38
  allocation: getAllocationSummary(utcDay(), provider),
app/api/admin/gateway/route.ts:157
  allocation: getAllocationSummary(utcDay()),
lib/store-facade/operations.ts:35
  export const getAllocationSummary = bound(allocations.getAllocationSummary);
scripts/load-acceptance.mjs:196
  GET /api/admin/gateway?provider=load
load-acceptance FAIL: effective free-pool policy does not match the envelope:
  expected {"enabled":true,...}, server {}
```

## Impact Assessment

### Affected Components

- `app/api/admin/gateway/route.ts` — GET and PATCH policy responses.
- `scripts/http-suite/checks.mjs` — admin API and webhook coverage.
- `scripts/http-suite/seed.mjs` — claimed-event fixture helper.
- Existing authorities: `lib/store-facade/operations.ts`,
  `lib/storage/ledger/payment-events.ts`, both signed webhook routes.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: operator policy read is unusable through the API
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

The admin page already reads the correct summary, so the workaround is direct
page use. The API is still the documented preflight and operator surface.

## Proposed Solution

### Approach

Await the summary in both responses, then assert the resolved shape through the
existing HTTP suite. Add a disposable claimed-event fixture and deliver the same
signed Stripe and NOWPayments payloads; each must return 409 with retry guidance
and leave balances and top-up counts unchanged. Do not add a second claim path,
a test-only route or a production delay hook.

The lost-owner branch remains proven by the existing two-connection payment test:
the route's process transaction holds the event row lock, so no reachable HTTP
interleaving can change the generation between claim and effect. The FID records
that boundary rather than claiming a route test that cannot be induced without a
production code seam.

### Steps

1. Await `getAllocationSummary` in the GET and PATCH responses.
2. Add an authenticated HTTP check for the resolved allocation shape.
3. Add claimed-event fixtures and signed in-flight 409 checks for both providers.
4. Confirm the checks leave credit, top-up status and ledger counts unchanged.
5. Run the focused HTTP suite and the full verification gates.

### Verification

`npm run test:http` must include the admin allocation assertion and both 409
checks. `npm test` must keep the two-connection lost-owner proof green under
`npm run test:postgres`. `npm run verify` must pass after the route change. The
load preflight must then read the expected policy before the workload starts.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: test — `npm test`.
- gate: test tests/payment-claim-concurrency.test.mjs — existing two-connection
  lost-owner proof, run under `npm run test:postgres`.
- gate: test_http — `npm run test:http` includes the new route checks.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify`.

### Verification Receipt

Pending implementation.

## Perfection Loop

### Loop 1 — RED

- **RED:** The route returned a promise, the load gate refused to measure, and
  no HTTP check asserted the API's resolved allocation shape.
- **GREEN:** Await both summaries and make the HTTP suite prove the operator
  surface and the two signed in-flight responses.
- **AUDIT:** `app/admin/(panel)/gateway/page.tsx:23` awaits the same function, so
  the page path and the route path diverged. `lib/store-facade/operations.ts:35`
  confirms the façade binding is async.
- **ADVERSARIAL:** A 409 must not be mistaken for a successful replay; credit and
  top-up state must remain unchanged. A processed event must still be a replay.
- **CHANGE DELTA:** new record.

### Missed Questions

1. Does TypeScript catch a promise in `Response.json`? No; the body is `unknown`.
2. Is the admin page broken? No; it awaits the summary. Only the route is.
3. Can an HTTP request reach the route's lost-owner branch? Not without a
   controllable interleaving; the event row lock prevents a second reclaimer
   from changing the generation while the first owns it. The ledger test covers
   that branch with two real connections.
4. Does an in-flight 409 credit anyone? No; the claim fails before effects.
5. Does the load gate need a relaxation? No; it was correctly refusing an
   unreadable policy.
6. Was a checkout-versus-grant route test added? No. The HTTP fixture keeps plan
   sales disabled, so the checkout route refuses with 403 before any checkout or
   grant can race. The existing two-connection subscription-store proof remains
   the race coverage; enabling sales would require a Stripe test double and is
   not claimed here.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `efd8cb5` (5 files, +388/−5).
- [x] **File:line ranges:** `app/api/admin/gateway/route.ts:38` and `:157`
  await the summary; `scripts/http-suite/seed.mjs:97-123` seeds and removes a
  claimed event; `scripts/http-suite/checks.mjs:501-593` proves both in-flight
  409 paths; `scripts/http-suite/checks.mjs:766` asserts the admin policy shape.
- [x] **Gate output:** `npm run verify` PASS, 11/11 gates, 1,100/1,100 tests,
  PostgreSQL 2/2, quality 658 files, build PASS, 736 main HTTP checks plus trial,
  recovery 14/14, 148.7 s. Load baseline PASS, 123/123 checks.
- [x] **Reproducibility:** `rg "seedClaimedPaymentEvent|deletePaymentEvent"`
  finds the fixture in `scripts/http-suite`; `rg "await getAllocationSummary"`
  finds both route responses.
- [x] **Step statuses:** steps 1–5 implemented. The checkout route race remains
  policy-gated off as answered in Missed Questions 6.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution.
- [x] Typecheck/tests/lint pass for new behavior.
- [x] Production call-graph evidence: `GET/PATCH /api/admin/gateway` → awaited
  `getAllocationSummary`; both webhook routes → `claimPaymentEvent` → 409 branch.
- [x] FID status reflects the actual state: `closed`.

### Loop 2 — Independent audit and self-correction

- **RED:** The first draft implied a route-level lost-owner test. The route holds
  the event row lock through processing, so that interleaving is not reachable
  through HTTP without a test-only production seam.
- **GREEN:** Scope the route checks to in-flight 409 and keep lost ownership on
  the real two-connection ledger proof.
- **AUDIT:** `lib/storage/ledger/payment-events.ts:217-223` selects the event
  `FOR UPDATE` before work; `tests/payment-claim-concurrency.test.mjs` already
  proves a stale generation cannot run effects.
- **ADVERSARIAL:** The suite must remove its claimed fixtures so a later retry
  does not see a synthetic in-flight event.
- **CHANGE DELTA:** new record; no implementation yet.

### Loop 3 — Final convergence

- **RED:** Final risk review: the route fix could be applied without a regression
  check, and the webhook checks could assert only the status code.
- **GREEN:** The plan asserts the resolved object shape, retry header, balance,
  top-up status and ledger count for both providers.
- **AUDIT:** `scripts/http-suite/checks.mjs:381` owns webhook checks;
  `scripts/http-suite/checks.mjs:591` owns admin checks.
- **ADVERSARIAL:** A terminal processed event must remain a 200 replay; the new
  fixture uses a separate event id so it cannot alter that assertion.
- **CHANGE DELTA:** new record.

### Loop 4 — Implementation closure

- **RED:** The first HTTP assertion expected a 20M pool from the `mock` provider,
  which has no current free-subscription observation; the correct value there is
  zero. The shape assertion still caught the original `{}` defect.
- **GREEN:** Kept the resolved-object, numeric-pool, allocation-basis and
  capacity assertions on `mock`; the load fixture reads back 20M because it has
  a current subscription observation. Both signed in-flight providers return 409
  with `Retry-After: 30` and no financial mutation.
- **AUDIT:** `npm run test:http` PASS, 736 checks; `npm run verify` PASS, 11/11
  gates; load preflight then measured 123/123 checks.
- **ADVERSARIAL:** A replay after a processed event remains a 200 replay; the
  in-flight fixture is removed in `finally` so it cannot affect later checks.
- **CHANGE DELTA:** implementation and test additions, not a design rewrite.

## Resolution

- **Closed Date:** 2026-11-05.
- **Fix Description:** Awaited both admin gateway summaries, added the resolved
  policy assertion, and added signed in-flight 409 checks for Stripe and
  NOWPayments without financial mutation.
- **Tests Added:** Yes; six Stripe assertions, six NOWPayments assertions and six
  admin policy assertions in the existing HTTP suite.
- **Verification Evidence:** implementation `efd8cb5`; `npm run verify` PASS
  11/11 gates, 1,100 tests, PostgreSQL 2/2, HTTP 736 plus trial, recovery 14/14;
  load baseline 123/123 at 118.44 rps steady and p95 175.36 ms.
- **Archived:** `dev/fids/archive/FID-2026-1105-012-gateway-policy-read-and-webhook-retries.md`.

## Lessons Learned

An async façade transition can leave a route serializing a promise while its
page awaits correctly. API-level assertions, not only page tests, are required
for every operator read path.
