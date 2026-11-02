# FID: PostgreSQL pooler-safe session timeouts

**Filename:** `FID-2026-1102-109-postgres-pooler-session-timeouts.md`
**ID:** FID-2026-1102-109
**Severity:** high
**Status:** verified
**Created:** 2026-11-02 16:35
**Automation level:** 3
**YAGNI-Compliance:** Verified

> This FID records the production failure and the converged fix. Implementation
> and its receipt follow in this record; the FID is not closed until the commit
> and archive move exist.

---

## Summary

The Vercel production deployment now reaches PostgreSQL but every database-backed
route fails. The pool sends `statement_timeout` and
`idle_in_transaction_session_timeout` as libpq startup `options`, and Neon's
pooled endpoint (`PgBouncer`) rejects `options` with SQLSTATE `08P01`. The app
must apply those timeouts after a connection is established, through pg's
`onConnect` hook, so the same configuration works for direct and pooled
endpoints.

## Environment

- **OS:** Windows 11 host; Vercel Linux runtime
- **Language/Runtime:** Node.js 24, Next.js 16
- **Tool Versions:** `pg` 8.23.1, Neon Free through the Vercel Marketplace
- **Commit/State:** `2296f38` plus the Vercel environment changes made during
  this session

## Detailed Description

### Problem

`/api/health` returns 200 after `DATABASE_URL` was provisioned, but `/` and
`/models` return 500 and `/api/ready` returns 503 with
`storage: "unavailable"`.

### Expected Behavior

The pool connects through Neon's pooled endpoint, applies its session budgets,
and `/api/ready` reports `configuration: "ok"`, `storage: "ok"`,
`mode: "durable"`.

### Root Cause

`lib/storage/pg-pool.ts` puts server settings in the libpq startup packet:

```text
options=-c statement_timeout=15000 -c idle_in_transaction_session_timeout=30000
```

Neon documents that its pooled connection does not accept startup `options`.
The setting must be issued as SQL after the connection is established. pg-pool
supports an async `onConnect` hook that runs before the client is handed to the
caller, which preserves the ordering guarantee without a startup parameter.

### Evidence

```text
16:30:58 GET /
error: unsupported startup parameter in options: statement_timeout.
Please use unpooled connection or remove this parameter from the startup package.
https://neon.com/docs/connect/connection-errors#unsupported-startup-parameter
code: 08P01
```

```text
GET /api/health       200 {"status":"alive"}
GET /api/ready        503 configuration ok / storage unavailable
GET /                 500
GET /models           500
```

## Impact Assessment

### Affected Components

- `lib/storage/pg-pool.ts`
- `tests/db-adapter.test.mjs`
- `scripts/trial-http-suite.mjs`
- `scripts/http-suite/request-limit-checks.mjs`
- production readiness and every database-backed route

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [x] High: The deployed site cannot serve catalog or account pages
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Remove the startup `options` field from the pool configuration. Apply the two
session budgets with parameter-free `SET` statements in an async `onConnect`
hook. pg-pool waits for that hook before returning the client, so no user query
can overtake the settings. Keep the defaults and the connection cap unchanged.

### Steps

1. **converged — RED:** Record the live Neon `08P01` failure and the exact
   startup parameter.
2. **implemented — GREEN:** Both budgets now run in `onConnect`; the returned
   Pool config has no `options` field. The regression test asserts the absence.
3. **implemented — AUDIT:** Focused adapter tests, lint, typecheck, the full
   suite, quality and build pass.
4. **implemented — ADVERSARIAL:** The fake pool proves shape and ordering, not a
   real pooler handshake. The live `/api/ready` and `/models` remain the
   production receipt after the deploy.
5. **pending — DEPLOY:** Commit, push, redeploy, and record the live response.

### Verification

`tests/db-adapter.test.mjs` runs the real `buildPoolOptions` result and calls
its `onConnect` with a recording client. It asserts the two `SET` statements and
that `options` is absent. The live deployment must then return 200 from
`/api/ready` and render `/models`.

## Verification Gates

- `- gate: lint` — `npm run lint`
- `- gate: typecheck` — `npm run typecheck`
- `- gate: test tests/db-adapter.test.mjs` — `node --test tests/db-adapter.test.mjs`
- `- gate: test` — `npm test`
- `- gate: quality` — `npm run quality`
- `- gate: build` — `npm run build`
- `- gate: test:http` — `npm run test:http`, local disposable PostgreSQL and
  the mock provider only; no real paid model is called
- `- gate: live` — `GET /api/ready` and `GET /models` on the production alias

## Verification Receipt

- verified: 2026-11-02T21:34:41Z
- focused test: exit 0 (15 tests, 15 pass)
- lint: exit 0 (zero warnings)
- typecheck: exit 0
- test full: exit 0 (829 tests, 828 pass, 1 skipped)
- quality: exit 0 (PASS, 531 files scanned)
- build: exit 0 (Next.js production build)
- HTTP: exit 0, both disposable suites pass; the trial suite uses `free/mock`
  and a local double, and no real provider or paid model is called. The
  paid-limit fixture now probes until its own bucket refuses instead of assuming
  a fixed 61st request lands inside one refill window.
- live: pending the deploy of this commit

## Perfection Loop

### Loop 1 — RED

- **RED:** The deployed process starts but storage is unavailable on every
  request. The runtime log names the rejected startup parameter, so this is not
  a missing schema or a bad password.
- **GREEN:** Remove the startup parameter and apply the same server-side budgets
  after connect.
- **AUDIT:** `lib/storage/pg-pool.ts` is the only place the startup packet is
  built; `lib/storage/database.ts` passes only the connection string.
- **ADVERSARIAL:** Removing the timeouts entirely would stop the errors but lose
  the statement and idle-transaction bounds. A one-off `SET` at module load
  would apply to one connection only. The hook is the narrow fix.

### Loop 2 — GREEN and audit

- **GREEN:** `buildPoolOptions` no longer returns `options`; `onConnect` awaits
  both `SET` statements. `createPostgresPool` passes the object to `pg.Pool`.
- **AUDIT:** `node --test tests/db-adapter.test.mjs` reports 15/15 passing. The
  regression test records the hook's statements and asserts the absence of
  `options`.
- **ADVERSARIAL:** pg-pool invokes `onConnect` before it resolves checkout, so a
  request cannot issue a query before the `SET`s complete. This ordering is
  covered by the library, not invented here.

## Missed Questions

1. **Should the app use the unpooled endpoint instead?** No. That would trade a
   production failure for a connection-scale limit. Pooled connections are the
   deployment contract.
2. **Can the timeouts be dropped on pooled connections?** They could, but the
   statement budget is a money-path safeguard. The same guarantees should hold
   on both endpoints.

## Implementation Evidence

- [ ] **Commit SHA:** pending; recorded when the implementation commit exists
- [x] **File:line ranges:** `lib/storage/pg-pool.ts:1-`,
  `tests/db-adapter.test.mjs`, `scripts/trial-http-suite.mjs`
- [x] **Gate output:** recorded in the Verification Receipt above
- [x] **Reproducibility:** the live `08P01` log and the pool source identify the
  same startup parameter
- [x] **Step statuses:** steps 1–4 implemented; step 5 pending deploy

## Resolution

- **Closed Date:** pending the implementation commit and archive move
- **Fix Description:** apply session budgets through pg's `onConnect` hook
- **Tests Added:** regression coverage in `tests/db-adapter.test.mjs`; the
  trial HTTP fixture pins `FREE_SHARED_RPM` and asserts both competing refusals
  without a second trial or credit spend; the paid-limit fixture probes until
  its own bucket refuses
- **Verification Evidence:** local gates pass; production receipt pending deploy
- **Archived:** not yet
