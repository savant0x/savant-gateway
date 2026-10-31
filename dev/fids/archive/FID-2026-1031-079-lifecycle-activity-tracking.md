# FID-2026-1031-079 — Lifecycle activity tracking

- **Status:** closed
- **Severity:** medium
- **Created:** 2026-10-31
- **Closed:** 2026-10-31
- **Commit:** `7996124`
- **Automation:** 3
- **Depends on:** none
- **Related:** FID-2026-1030-059 (observability)

## 1. Summary

Add an append-only `activity_events` table and an admin read surface for
customer and money lifecycle events: signup, login, logout, key creation and
revocation, credit grant and adjustment, top-up creation and paid fulfillment,
and (once FID-078 lands) promo creation and redemption.

The log records identifiers and amounts, never prompts, completions, API keys,
passwords, session tokens, full promo codes, or provider credentials. The
gateway's request log remains the request-level record; this table is the
business-lifecycle record an operator can read without joining five tables.

## 2. Environment

Windows 11, Node 24.21.0, Next 16.4.3, SQLite `better-sqlite3`, admin session
guards from `lib/admin-auth.ts`.

## 3. Problem / expected behavior

**Observed.** Signup, login, key creation, credit grants, top-ups, and
settlements write to their own tables or only to stdout. There is no single
ordered view of "what happened to this account" and no durable record of an
admin credit adjustment beyond the ledger note. Debugging a customer report
means reading `users`, `api_keys`, `credit_ledger`, `topups`, and logs.

**Expected.** Every listed lifecycle action appends one row with actor, kind,
entity type/id, optional allowlisted metadata, and UTC timestamp. Admin
`/admin` shows the latest events, and `GET /api/admin/activity` returns a
bounded list. A failed business operation writes no success event.

## 4. Root cause

The schema grew feature by feature. Each feature wrote its own state and, at
most, a stdout line. No shared append-only event table was introduced because
nothing needed to read across features until the operator console arrived.

## 5. Impact

- **Affected:** store write paths, admin overview, one new API route.
- **Unaffected:** gateway request handling, billing math, provider routing.
- **Risk:** logging too much. Metadata is allowlisted and size-bounded; secrets
  and content are rejected by construction.

## 6. Proposed implementation

1. `lib/schema/activity.ts`: table plus indexes on `(user_id, created_at)` and
   `(kind, created_at)`.
2. `lib/activity.ts`: `insertActivity`, `ACTIVITY_KINDS`,
   `sanitizeActivityMetadata`. Metadata accepts only scalar values under an
   allowlist of keys, at most 1,000 serialized bytes; unknown or secret-shaped
   keys throw.
3. `lib/store/activity.ts`: `listActivity(limit, filters)` joins the customer
   email; bounded to 100; newest first.
4. Instrument:
   - `createCustomer` (signup)
   - login success and logout (session routes)
   - `createCustomerApiKey`, `revokeCustomerApiKey`
   - `grantCredit`, `adjustCredit`
   - `createTopup`, `markTopupPaid`
   - promo create/redeem in FID-078
5. `GET /api/admin/activity` with `guardAdminApi`, `limit` 1–100, optional
   `userId` and `kind`.
6. `components/admin/activity-panel.tsx` and an admin overview section.
7. Tests: schema exists, signup/login/key/credit/topup events appear, metadata
   rejects a secret key, limit caps at 100, order is newest first, and a failed
   operation writes no event.
8. HTTP suite: admin activity route requires a session, returns events after a
   seeded action.
9. Docs: admin console walkthrough and operations runbook note.

## 7. Verification gates

```bash
node --test tests/activity.test.mjs
npm run lint
npm run typecheck
npm run quality
npm run build
npm run test:http
```

## 8. Perfection Loop

### RED

- No `activity_events` table.
- No unified admin view.
- A credit adjustment has no durable actor record.

### GREEN

- Each listed action writes one row.
- The admin panel and API return the same ordered data.
- Failed operations (duplicate email, invalid key id, rejected promo) write no
  success event.

### AUDIT

- No API key, password hash, session token, prompt, completion, or full promo
  code is stored in metadata.
- Metadata values are scalars and bounded.
- Inserts happen in the same transaction as the business change where the
  business change is transactional.
- The API requires an admin session and is same-origin guarded.
- `limit` is clamped, not trusted.

### ADVERSARIAL

- **Failed insert:** if the activity insert throws inside a transaction, the
  business change rolls back rather than silently losing its audit row.
- **Metadata injection:** a key named `password`, `token`, `secret`, `key`, or
  `authorization` is rejected.
- **Huge metadata:** over 1,000 bytes is rejected.
- **Pagination:** absent or hostile `limit` returns a bounded default.
- **Deletion:** the table is append-only; no update or delete helper exists.
- **PII:** only customer email is shown in the admin list; no content.

### Missed questions

- Does this duplicate request logs? Request logs are per-call; this is
  per-business-action and survives log rotation.
- Does it need retention controls? Not for this scaffold; the table has no
  unbounded payload and an index for pruning later. A retention job is a
  separate operations decision.
- Is an activity insert allowed to break a customer action? Only if the action
  is transactional; for login/logout it is best-effort and a failure must not
  block the session. That asymmetry is explicit in the code.

## 9. Non-goals

- Full request tracing, OpenTelemetry, or log shipping.
- Customer-facing activity history.
- Retention automation or export UI.
- Capturing prompts or completions.

## 10. Implementation evidence

- `lib/schema/activity.ts` creates the append-only table and both indexes.
- `lib/activity.ts` owns the kind vocabulary, scalar/allowlist metadata
  validation, the 1,000-byte bound, insertion and `queryActivity` with bounded
  limit and newest-first ordering. `lib/store/activity.ts` is the server-only
  wrapper.
- Instrumented: signup (transactional), login/logout (best-effort), customer
  key create/revoke (transactional), credit grant (transactional), credit
  adjustment (transactional), top-up create/paid (transactional), promo create/
  redeem (transactional).
- `GET /api/admin/activity` is session-guarded, same-origin, filters by user or
  kind and clamps `limit` to 100. `components/admin/activity-panel.tsx` renders
  the latest events on `/admin`.
- `tests/activity.test.mjs` (4 tests) covers append/read order, limit clamping,
  filters, metadata rejection, best-effort rollback and vocabulary coverage.
  The HTTP promo suite asserts a `promo.redeemed` event is readable and does not
  contain the full promo code.

Verification: `npm test` 394 pass; `npm run build` 0; `npm run test:http` 750
checks + trial suite PASS; lint/typecheck/quality PASS. Login/logout writes are
intentionally best-effort so an audit failure cannot block a session; money and
account writes roll back with their event.

## 11. Closure

Closed against `7996124` on 2026-10-31. Retention, export and production-size
growth remain a watch item (`FID-2026-1031-079-RETENTION`), not part of this
implementation.
