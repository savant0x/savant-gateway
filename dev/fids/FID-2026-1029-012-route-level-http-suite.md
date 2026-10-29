# FID: Route-Level HTTP Suite

**Filename:** `FID-2026-1029-012-route-level-http-suite.md`
**ID:** FID-2026-1029-012
**Severity:** high
**Status:** converged
**Created:** 2026-10-29 16:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

The repository verifies pure helpers, pricing math, schema behavior, and
provider translation with `node --test`, but it has no automated coverage of the
actual route handlers. Signup cookie issuance, customer session revocation,
cross-account key ownership, Stripe webhook idempotency, and paid-call
settlement were proven only by one-off manual receipts. This FID adds a
post-build HTTP gate that boots the production server against a disposable
database, seeds a mock upstream, and exercises those routes end to end.

## Environment

- **OS:** Windows 11 (development), Ubuntu (CI)
- **Language/Runtime:** TypeScript 5.9, Node.js >= 22.18.0, Node.js 24 in CI
- **Tool Versions:** Next.js 16.4.3, better-sqlite3 13.0.3, npm
- **Commit/State:** `96af080` (analytics closure), clean working tree apart
  from untracked local directories

## Detailed Description

### Problem

`npm test` runs `tests/*.test.mjs`, which import pure modules or build an
in-memory SQLite schema. The App Router route handlers are never invoked. The
existing manual receipt for customer authentication and the disposable-database
render receipt for analytics both exercised HTTP, but neither is repeatable by a
gate, and neither covers cross-account key isolation, webhook replay, or paid
settlement over HTTP. A regression in cookie flags, ownership checks, signature
verification, event idempotency, or debit math would pass every current gate.

### Expected Behavior

A single command after `npm run build` must:

1. Boot the production build on a loopback port with a disposable `DB_PATH`.
2. Exercise signup, session, logout, and login over HTTP, including cookie
   hardening and duplicate/foreign-origin rejection.
3. Prove that one customer cannot list or revoke another customer's API key,
   and that a foreign-origin key mutation is rejected.
4. Deliver a correctly signed Stripe `checkout.session.completed` event, assert
   the credit and ledger transition, replay the same event id, and assert no
   double credit. Reject an invalid signature and an amount mismatch.
5. Settle a paid gateway call through an in-process mock upstream and assert the
   exact debit, the usage row, the upstream key forwarding, and the model-id
   translation.
6. Reject an unfunded customer's paid call with `402` and leave no usage row.
7. Prove the admin session boundary: anonymous redirect, wrong-password
   rejection, hardened admin cookie, and an authenticated customer page.
8. Fail closed with server logs and the last mock request when any assertion
   fails, and always tear down the process, mock, and temporary database.

### Root Cause

Route-level verification requires a built application and a booted server. The
fast unit suite deliberately avoids both, and no separate gate was added when
the customer, billing, and provider routes landed. The gap is structural, not a
product bug.

### Evidence

```text
$ npm test
107 tests, 0 failures

$ grep -R "http-suite\|test:http" package.json .github/workflows .githooks
(no matches)

$ app/api/auth/signup/route.ts:80-85
const response = NextResponse.json({ customer }, { status: 201, ... });
return attachCustomerCookie(response, session.token);

$ app/api/webhooks/stripe/route.ts:310-312
if (!claimEvent(event.id, event.type)) {
  return Response.json({ received: true, replay: true });
}
```

The behavior exists in production code and is unverified by automation.

## Impact Assessment

### Affected Components

- `scripts/http-suite.mjs` and `scripts/http-suite/` (new)
- `package.json` (`test:http`, `verify`)
- `protocol.config.yaml` (declared gate)
- `.github/workflows/ci.yml` (CI step after build)
- `.githooks/pre-push` (local gate after build)
- `SCOPE.md`, `CHANGELOG.md`, `knowledge.md` (closure records)

No route handler, store module, schema, or UI component changes.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: Major feature broken, no workaround
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

The unverified surfaces include authentication, money movement, and key
ownership. A silent regression there is high impact.

## Proposed Solution

### Approach

Add a dedicated Node script that behaves like a small external client:

- **Disposable world.** `mkdtemp` holds the SQLite database; `next start` runs
  with `DB_PATH` pointing into it. The production build creates the schema on
  the first DB-touching request. The harness waits for `/api/auth/me` to answer
  (a `401` is ready), then polls the SQLite file for the `topups` table.
- **Second connection seeding.** `lib/db.ts` imports `server-only`, so the
  suite seeds through `better-sqlite3` directly: one enabled provider row
  pointing at the mock, one paid model row, and pending top-up rows owned by the
  signed-up customer.
- **Mock upstream.** An in-process `node:http` server listens on loopback and
  serves `POST /chat/completions`. It rejects any request whose
  `Authorization` header is not the exact expected provider key, and returns a
  deterministic completion with `usage.prompt_tokens = 100` and
  `usage.completion_tokens = 50`. It records the last request body so the suite
  can assert model-id translation.
- **Webhook signing.** Sign `"<timestamp>.<raw body>"` with HMAC-SHA256 using
  the disposable `STRIPE_WEBHOOK_SECRET` and send `t=<timestamp>,v1=<hex>`.
  This is the same scheme the Stripe SDK verifies, without a network call.
- **Assertions.** A shared `check(label, condition, detail)` prints exactly one
  `http-suite: <label> PASS` line per passing check and throws with the label and
  observed value on failure.
- **Teardown.** Close the mock, terminate the server (SIGTERM; Windows
  `taskkill /T /F` fallback), wait briefly, and remove the temp directory.
  Failure output includes the server log tail and the mock's last request.

The suite is intentionally not part of `npm test`: unit tests must stay fast and
build-independent. It is also not a second implementation of business rules; it
asserts externally observable contracts.

### Steps

1. Add `scripts/http-suite/harness.mjs`: temp dir, ephemeral port, mock
   upstream, server spawn/readiness, HTTP helpers, cookie extraction, assertion
   helper, teardown.
2. Add `scripts/http-suite/seed.mjs`: schema wait and seed the provider, model,
   and pending top-ups through a second SQLite connection.
3. Add `scripts/http-suite/checks.mjs`: the ordered scenarios for signup/session,
   key isolation, webhook credit/replay/invalid/amount-mismatch, paid
   settlement, unfunded rejection, and admin auth.
4. Add `scripts/http-suite.mjs`: orchestration and failure reporting.
5. Add `"test:http": "node scripts/http-suite.mjs"` and append
   `npm run test:http` to `verify` after `npm run build`.
6. Add the gate to `protocol.config.yaml`, the CI workflow after build, and the
   pre-push hook after build.
7. Run `npm run verify`, record the receipt, close and archive this FID, and
   update the changelog, knowledge, and scope records.

### Verification

- The suite exits `0` only when every check passes.
- `npm run verify` exits `0`, including the new post-build gate.
- A deliberately wrong expectation is observed to fail during development
  (not committed); the failure path prints the label and logs.
- The gate is reachable: `package.json`, CI, and the pre-push hook each contain
  the exact command, verified by grep.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: test — `npm test`, all existing suites.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: http — `npm run test:http`, after build.
- gate: verify — `npm run verify`, now including the HTTP gate.

### Verification Receipt

- verified: pending implementation
- lint: pending
- typecheck: pending
- test: pending
- quality: pending
- build: pending
- http: pending
- verify: pending

## Perfection Loop

### Loop 1 — RED

- **RED:** The route layer is untested. The four named B2 gaps are real:
  signup cookies, cross-account key ownership, webhook replay, and paid
  settlement. The admin boundary was also only manually verified. All are
  reachable only with a booted server and a production build.
- **GREEN:** Use a disposable database and a post-build process gate rather than
  expanding the unit suite. Seed through a second SQLite connection because the
  app's DB module is server-only. Use a local mock upstream so settlement math is
  deterministic and no provider credit is spent. Sign webhook payloads locally.
- **AUDIT:** The route contracts inspected for this FID:
  - `app/api/auth/signup/route.ts:33-93` — same-origin check, limiter, validation,
    `201` with `attachCustomerCookie`, duplicate `409`.
  - `app/api/auth/logout/route.ts:16-28` — same-origin, revoke, clear cookie.
  - `app/api/auth/me/route.ts:11-19` — `401` anonymous, customer + account
    summary when signed in.
  - `app/api/account/keys/route.ts:11-44` — list/create scoped by `customer.id`.
  - `app/api/account/keys/[id]/route.ts:11-26` — revoke scoped by
    `revokeCustomerApiKey(customer.id, id)`, `404` when not owned.
  - `app/api/webhooks/stripe/route.ts:278-331` — config, signature, text body,
    signature verification, event claim, replay response.
  - `lib/store/topups.ts:104-190` — single-transaction status transition,
    balance update, ledger row, amount/currency checks.
  - `lib/gateway.ts:148-381` and `lib/gateway-settle.ts:147-196` — API-key auth,
    model resolution, hold, upstream call, usage settlement.
  - `lib/providers/request.ts:59-79` — `baseUrl + path` and provider key header.
  - `lib/admin-auth.ts:23,47-49` — loopback bypass compiled out in production;
    anonymous page redirect to `/admin/login`.
- **ADVERSARIAL:** A suite that asserts only status codes could pass with broken
  money math. The settlement checks assert the exact 200-micro debit, the
  zeroed hold, and the persisted usage row. A replay check that only asserts the
  second response could pass with double credit; the suite asserts the balance,
  the paid top-up count, and the ledger count. A key test that only checks
  listing could pass with a broken DELETE; the suite asserts the cross-account
  `404` and the continued presence of the key.
- **CHANGE DELTA:** 0% (initial convergence).

### Missed Questions

1. **Should the suite run in `npm test`?** No. It needs a production build and a
   booted server; folding it in would make every unit run slow and order-bound.
   It is a separate post-build gate.
2. **Can the suite import the app's store modules to seed?** No. `lib/db.ts` and
   the store modules import `server-only`, and importing them would bypass the
   route boundary. A second SQLite connection is the honest seam.
3. **Does `DB_PATH` survive Next.js env loading?** Yes. Process environment
   variables take precedence over `.env.local` in Next.js; the receipt already
   proved this with a disposable database.
4. **How is the webhook signature produced without Stripe credentials?** The
   verifier only needs the shared secret and the `t.payload` HMAC. Real test
   credentials are unnecessary for signature behavior; they remain required
   only for creating a real Checkout session (B1).
5. **How is the paid call kept deterministic?** The mock upstream returns a
   fixed `usage` object; the model prices are seeded so input 100 and output 50
   produce exactly 200 micros. The suite asserts the upstream received the
   provider key and the translated upstream model id.
6. **What happens on Windows when the server does not exit?** Teardown sends
   SIGTERM, then uses `taskkill /pid <pid> /T /F` if the process is still alive.
   Cleanup errors are reported but do not replace the primary assertion failure.
7. **Does the suite spend real money or touch the real database?** No. It uses a
   temp directory, a loopback mock, and disposable Stripe secrets. The real
   `data/gateway.db` and `.env.local` credentials are never read.
8. **What proves the gate is wired, not just present?** Grep for `test:http` in
   `package.json`, CI, and the pre-push hook, plus a real `npm run verify` run
   that executes the suite.

### Loop 2 — Independent audit and self-correction

- **RED:** The first draft risked a flaky boot and silent cleanup failures.
- **GREEN:** Readiness is a bounded poll with an early-exit check; teardown is in
  `finally`; logs are captured to files and printed only on failure.
- **AUDIT:** The design uses only Node builtins plus `better-sqlite3`, already a
  runtime dependency. No new package is added.
- **ADVERSARIAL:** The mock rejects a wrong provider key, so a missing forward
  becomes a `502` and a failed settlement check rather than a false pass.
- **CHANGE DELTA:** 4% (failure-path detail).

### Loop 3 — Final convergence

- **RED:** Residual risk is port collision and environment drift.
- **GREEN:** Ephemeral ports are allocated by binding and closing a `net`
  server; all required environment values are set explicitly on the child.
- **AUDIT:** The suite asserts production cookie flags, so a non-production boot
  fails loudly instead of weakening the check.
- **ADVERSARIAL:** The amount-mismatch event proves the expected-amount guard in
  `fulfillTopup` is exercised, not just the happy path.
- **CHANGE DELTA:** 2% (converged).

## Resolution

- **Closed Date:** pending
- **Fix Description:** pending
- **Tests Added:** pending
- **Verification Evidence:** pending
- **Archived:** pending

## Lessons Learned

A green unit suite is not coverage of the route layer. Authentication, key
ownership, webhook idempotency, and money math need a real server, a disposable
database, and a deterministic upstream; the cheapest reliable place for that is
a post-build gate that behaves like an external client.
