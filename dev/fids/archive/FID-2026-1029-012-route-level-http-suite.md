# FID: Route-Level HTTP Suite

**Filename:** `FID-2026-1029-012-route-level-http-suite.md`
**ID:** FID-2026-1029-012
**Severity:** high
**Status:** closed
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

- verified: 2026-10-29, implementation committed as `4374c00`
- lint: `npm run lint` exit 0, zero errors, zero warnings
- typecheck: `npm run typecheck` exit 0
- test: `npm test` 107 passed, 0 failed, 0 skipped
- quality: PASS (400-line ceiling, 189 files scanned)
- build: `npm run build` exit 0, compiled successfully, 51 routes
- http: `npm run test:http` exit 0, 100 checks PASS
- verify: `npm run verify` exit 0
- negative control: changing the expected debit to `49_999_799` made the suite
  fail with `expected 49999799, got 49999800` and exit 1; the expectation was
  restored before the final run

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

### Loop 4 — Implementation and verification

- **GREEN:** Implemented the suite in four modules: `scripts/http-suite.mjs`
  (92 lines, orchestration), `scripts/http-suite/harness.mjs` (408 lines,
  workspace, ports, mock upstream, server lifecycle, HTTP helpers, cookies,
  assertions, signing), `scripts/http-suite/seed.mjs` (87 lines, provider/model
  and top-up seeding through a second connection), and
  `scripts/http-suite/checks.mjs` (552 lines, the scenarios). Wired
  `test:http` into `package.json`, `protocol.config.yaml`, CI after build, and
  the pre-push hook after build. No production code changed.
- **AUDIT:** The first run exposed a test-client defect: the suite sent the raw
  session token as the whole `Cookie` header, so `/api/auth/me` returned `401`.
  The route was correct; the client now sends `sg_session=<token>` and
  `sg_admin=<token>`. After the fix, `npm run test:http` exited 0 with 100
  checks. `npm run verify` exited 0: lint clean, typecheck clean, 107/107 unit
  tests, quality PASS over 189 files, 51-route build, 100 HTTP checks.
- **ADVERSARIAL:** The negative control above proves an incorrect money
  expectation fails the gate rather than passing on status codes alone. The mock
  upstream returns `401` unless the gateway forwards
  `Bearer <HTTP_SUITE_PROVIDER_KEY>`, so a missing key forward becomes a `502`
  and fails the settlement checks. Replay is checked by balance, paid top-up
  count, and ledger count, not only by the response body. The amount-mismatch
  event proves the expected-amount guard leaves the top-up pending.
- **CHANGE DELTA:** 6% from the converged FID (implementation detail, the
  session-header correction, and the negative control).

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `4374c00` — `test(http): add route-level HTTP suite
  (FID-2026-1029-012)`
- [x] **File:line ranges:**
  - `package.json:17` — `test:http`; `package.json:19` — `verify` appends it.
  - `protocol.config.yaml:34` — `test_http` gate declaration.
  - `.github/workflows/ci.yml:29` — CI step after build.
  - `.githooks/pre-push:30` — local gate after build.
  - `scripts/http-suite.mjs:41-72` — spawn, readiness, schema, seed, checks,
    summary.
  - `scripts/http-suite/harness.mjs:77-163` — mock upstream; `165-197` — server
    spawn; `199-223` — readiness; `225-254` — schema wait; `330-364` — cookie
    assertions; `366-372` — webhook signing; `392-408` — teardown.
  - `scripts/http-suite/seed.mjs:3-32` — provider/model seed; `34-45` — pending
    top-up; `47-86` — ledger and usage readers.
  - `scripts/http-suite/checks.mjs:101-254` — signup/session/logout/login;
    `256-291` — key isolation; `293-392` — webhook credit/replay/invalid/mismatch;
    `394-481` — settlement and unfunded rejection; `483-542` — admin session;
    `544-552` — scenario order.
- [x] **Gate output:** `npm run verify` exit 0 with the exact counts in the
  Verification Receipt; the HTTP suite printed 100 `PASS` lines and
  `http-suite: 100 checks PASS`.
- [x] **Reproducibility:** `npm run build && npm run test:http` reproduces the
  result from a clean tree; grep for `test:http` finds the four wiring points
  above, and grep for `runChecks` finds the orchestrator call and the definition.
- [x] **Step statuses:**
  1. harness module — implemented
  2. seed module — implemented
  3. checks module — implemented
  4. orchestrator — implemented
  5. package and verify wiring — implemented
  6. config, CI, and pre-push wiring — implemented
  7. verification, closure, archive, and records — implemented

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution: a post-build process gate,
  disposable database, second-connection seeding, local mock upstream, signed
  webhook events, and HTTP assertions.
- [x] Typecheck, tests, lint, quality, build, and the HTTP gate pass with the
  pasted output in the Verification Receipt.
- [x] Production call-graph evidence: `test:http` is declared in
  `package.json:17`, invoked by `package.json:19`, `ci.yml:29`, and
  `pre-push:30`; `scripts/http-suite.mjs:61` calls `runChecks`, defined at
  `scripts/http-suite/checks.mjs:544`.
- [x] FID status reflects the implementation state: implemented, verified, and
  closed against `4374c00`.

## Resolution

- **Closed Date:** 2026-10-29 16:40
- **Fix Description:** Added a post-build HTTP suite that boots the production
  server against a disposable database, seeds one mock provider and one paid
  model through a second SQLite connection, and exercises 100 checks across
  signup/session/logout/login, cross-account key ownership, signed webhook
  credit and replay, invalid signature and amount mismatch, paid-call
  settlement, unfunded rejection, and the admin session boundary. Wired
  `test:http` into `package.json`, `protocol.config.yaml`, CI after build, and
  the pre-push hook after build. No production code changed.
- **Tests Added:** `scripts/http-suite.mjs` plus `harness.mjs`, `seed.mjs`, and
  `checks.mjs`; 100 route-level assertions. The existing 107 unit tests are
  unchanged.
- **Verification Evidence:** `npm run verify` exit 0: lint and typecheck clean,
  107/107 unit tests, quality PASS over 189 files, 51-route build, and 100 HTTP
  checks. The negative control failed at `49_999_799` with `expected 49999799,
  got 49999800` and exited 1 before being restored.
- **Archived:** `dev/fids/archive/FID-2026-1029-012-route-level-http-suite.md`
- **Commit:** `4374c00`

## Lessons Learned

A green unit suite is not coverage of the route layer. Authentication, key
ownership, webhook idempotency, and money math need a real server, a disposable
database, and a deterministic upstream; the cheapest reliable place for that is
a post-build gate that behaves like an external client.
