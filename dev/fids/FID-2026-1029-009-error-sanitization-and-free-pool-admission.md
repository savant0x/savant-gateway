# FID: Sanitize client errors and enforce free-pool admission control

**Filename:** `FID-2026-1029-009-error-sanitization-and-free-pool-admission.md`
**ID:** FID-2026-1029-009
**Severity:** high (D50), low (D6)
**Status:** verified
**Created:** 2026-10-29 12:05 EDT
**Automation level:** 3
**YAGNI-Compliance:** Verified
**Related records:** closes D6 and D50 from
`dev/audits/2026-10-29-d1-d50-audit-report.md`; independent of FID-2026-1029-007
(groups) and FID-2026-1029-008 (customer subscriptions).

Reference structure: `templates/FID-TEMPLATE.md`, read 2026-10-29. The repository
gates are `lint`, `typecheck`, `test`, `quality`, `build`, and `verify`.

## Summary

Two open findings remain from the D1–D50 reconciliation:

1. **D6** — local exception text can reach a public gateway caller (and admin
   callers) through a 502 or a 400 credit-grant response.
2. **D50** — free models have no admission control. Any authenticated key can
   call a free model without a per-user cap, and the gateway never consults the
   shared provider free pool it consumes.

This FID adds a single server-side error sanitizer and a SQLite-backed free-pool
gate with a daily weighted-token allowance per user, a provider-remaining floor,
pre-dispatch reservations, a `429` with reset metadata, and a throttled operator
log at a configurable provider threshold. Accounting stays in `usage_events`;
admission state lives in two new tables.

## Environment

- **OS:** Windows 11, Git Bash.
- **Runtime:** Node `v24.21.0`, npm `12.2.1`.
- **Tool Versions:** Next.js `16.4.3`, React `19.3.0`, HeroUI `3.2.7`,
  Tailwind CSS `4.3.3`, better-sqlite3 `13.0.3`, TypeScript `5.9.3`.
- **Commit/State:** working tree on `main` with the implementation described
  below uncommitted. No provider call was made while implementing this FID.

## Detailed Description

### Problem

**D6.** Before this change, [lib/gateway.ts](../../lib/gateway.ts) returned the raw
thrown `error.message` from the provider fetch, and
[app/api/admin/credit/route.ts](../../app/api/admin/credit/route.ts) returned the
grant failure message. `safeUpstreamMessage` already sanitized upstream HTTP 5xx
responses, so only local exception paths leaked. The provider-sync route returned
the raw sync failure message as a 502.

**D50.** `handleChatCompletions` branched on `isFreeCall(model)` and entered the
credit-hold path only when the call was **not** free. Free calls therefore had:

- no per-user daily cap;
- no check of `provider_status.subscription_tokens_remaining`, despite syncing
  it;
- no reservation, so concurrent free requests could each pass a stale check;
- no reset response, so a caller could not know when a cap lifts;
- no operator signal as the shared provider pool drained.

The upstream free pool is weighted: `free/gpt-6-luna` has `weight: 3`, and a
316-raw-token call advanced the provider counter by 948. The gateway records
weighted tokens after the fact but never gates on them.

### Expected Behavior

1. Every 5xx response and every unexpected local exception returns a fixed,
   generic client message. The detailed error is logged server-side only.
2. Validated 4xx input errors keep their specific messages.
3. A free call is admitted only when all of the following hold:
   - the provider has not reported `subscription.allowed === false`;
   - the effective provider remaining is at or above the configured floor, when
     the provider reports a remaining figure;
   - the user's daily weighted usage plus in-flight reservations plus this
     request's weighted estimate is within the daily allowance.
4. Admission reserves weighted tokens atomically before dispatch; settlement
   releases the reservation and records actual weighted usage.
5. A blocked call returns `429` (or `402` when configured) with a stable error
   type, `Retry-After`, and `X-RateLimit-Reset` for a per-user daily reset.
6. When the effective provider remaining crosses the alert threshold, one
   structured operator warning is logged per hour.
7. Free calls carry a bounded output budget so the reservation matches the
   maximum the upstream may return.

### Root Cause

D6: the rebuilt error path sanitized upstream HTTP failures but not local throws,
because the two paths were written at different times and no shared helper
existed.

D50: free-model access was treated as unmetered. The catalog distinguishes free
from paid for pricing, but there was no entitlement or admission layer for free
access; usage recording was mistaken for control.

### Evidence

- `lib/gateway.ts` pre-change: provider-fetch `catch` returned
  `error instanceof Error ? error.message : "Could not reach the provider"`.
- `app/api/admin/credit/route.ts` pre-change: `catch` returned
  `error instanceof Error ? error.message : "Could not grant credit."`.
- `app/api/provider/sync/route.ts` pre-change: returned `error.message` with
  `status === 502`.
- `lib/gateway.ts` pre-change: `if (!free) { ...reservePaidCall... }` and no
  other free branch.
- `lib/store/provider.ts` stores `subscription_tokens_remaining`; pre-change
  `grep` found no read of it outside the provider card.
- `dev/audits/2026-10-29-d1-d50-audit-report.md` D6 and D50 sections.

## Impact Assessment

### Affected Components

- `lib/http.ts` — new `sanitizeError`.
- `lib/gateway.ts` — sanitized provider failure, free-pool admission.
- `lib/gateway-settle.ts` — carries the free reservation into settlement.
- `lib/gateway-stream.ts` — unchanged; settlement flows through `settleCall`.
- `lib/free-pool.ts` — new pure policy module.
- `lib/store/free-pool.ts` — new reservation, usage, provider-remaining, alert.
- `lib/store/usage.ts` — releases the free reservation in the usage transaction.
- `lib/store/settings.ts` — generic setting read/write for the alert throttle.
- `lib/db.ts` — `free_pool_usage`, `free_pool_reservations`.
- `app/api/admin/credit/route.ts`, `app/api/provider/sync/route.ts` — sanitized.
- `tests/free-pool.test.mjs`, `tests/http.test.mjs`.

### Risk Level

- [ ] Critical
- [x] High: unmetered free access could exhaust the provider free pool (D50)
- [x] Low: internal error text exposure (D6)

## Proposed Solution

### Approach

Add a pure policy module so the decision is testable without SQLite, and a
store module that supplies state and performs the reservation atomically.

### Steps

1. **implemented** — Add `sanitizeError(scope, error, clientMessage)` to
   `lib/http.ts`; it logs the stack and returns only the fallback message.
2. **implemented** — Use it in the provider-fetch `catch`, the admin credit
   grant failure (now `500`), and the provider-sync failure (config errors keep
   their `400` message).
3. **implemented** — Add `lib/free-pool.ts`: config parsing, weighted estimate,
   UTC reset helpers, and `decideFreeAdmission`.
4. **implemented** — Add `free_pool_usage` and `free_pool_reservations` to
   `lib/db.ts`.
5. **implemented** — Add `lib/store/free-pool.ts`: expired-reservation sweep,
   per-user and global reserved totals, effective provider remaining, hourly
   alert throttle, `reserveFreeCall`, and `settleFreeReservation`.
6. **implemented** — Wire admission into `handleChatCompletions` before payload
   construction; return the blocked decision with `Retry-After` and
   `X-RateLimit-Reset`.
7. **implemented** — Settle the reservation inside `recordUsage`’s transaction
   and carry it through `GatewayCallContext`.
8. **implemented** — Bound free output with `DEFAULT_OUTPUT_BUDGET` when the
   caller gave no `max_tokens`, keeping the reservation honest.
9. **implemented** — Unit tests for config, weighting, allowance boundaries,
   reservation counting, provider floor, provider block, alert flag, and reset.
10. **implemented** — Sanitizer tests for `Error` and non-`Error` throws.

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `FREE_DAILY_WEIGHTED_TOKENS` | `500000` | Per-user daily weighted-token allowance |
| `FREE_PROVIDER_REMAINING_FLOOR` | `1000000` | Stop free admission below this effective provider remaining |
| `FREE_PROVIDER_ALERT_THRESHOLD` | `2000000` | Log an operator warning at or below this effective remaining |

The provider remaining used for admission is:

```text
last synced subscription.tokens_remaining
  - weighted free tokens recorded since that sync
  - in-flight free reservations
```

If no remaining figure was ever synced, the per-user allowance still applies;
provider enforcement activates on the next successful sync. This is deliberate:
a provider outage must not silently disable the local cap.

### Verification

- `npm run lint` — zero warnings.
- `npm run typecheck` — exit 0.
- `npm test` — all tests, including `tests/free-pool.test.mjs` and
  `tests/http.test.mjs`.
- `npm run quality` — 400-line ceiling.
- `npm run build` — exit 0.

## Verification Gates

- gate: lint — `npm run lint`
- gate: typecheck — `npm run typecheck`
- gate: test tests/free-pool.test.mjs — policy and reset coverage
- gate: test tests/http.test.mjs — sanitizer coverage
- gate: quality — `npm run quality`
- gate: build — `npm run build`
- gate: verify — `npm run verify` when the full set is claimed

### Verification Receipt

- verified: 2026-10-29T11:29:05-0400
- `npm run verify`: exit 0
- lint: exit 0, zero warnings
- typecheck: exit 0 (`tsc --noEmit`)
- test: 62 tests, 62 pass, 0 fail, 0 skipped
- quality: PASS (400-line ceiling, 127 files scanned)
- build: exit 0, 33 routes
- State: working tree on `48c21e1` plus these uncommitted changes. No commit
  exists yet, so the FID is `verified`, not `closed`.

## Non-Goals

- No distributed limiter. The reservation table is durable, but admission runs
  in a single app process against SQLite, consistent with accepted finding D23.
- No admin UI for free-tier limits. Limits are environment configuration; a
  settings surface belongs with FID-2026-1029-008’s plan controls.
- No external alert transport. The operator alert is a structured
  `console.warn` throttled to once per hour. Wiring it to email/Slack is a
  separate integration.
- No refund of weighted usage on provider failure beyond releasing the
  reservation. A call that produced no tokens records zero weighted tokens.

## Missed Questions

1. **Should the provider floor be checked before the user allowance?** Yes.
   A drained shared pool blocks everyone regardless of a user’s remaining
   allowance, and the message should say so rather than blame the user.
2. **What happens when a call settles with more tokens than reserved?** The
   actual weighted tokens are recorded; the user can exceed the daily cap by at
   most one request. Blocking mid-stream would truncate a response the customer
   already received and the provider already billed.
3. **Should free calls get a default `max_tokens`?** Yes. The reservation is
   computed from prompt plus output budget; without a bound, the estimate would
   understate the provider spend it is meant to control.
4. **Should expired reservations count against the provider pool?** No. They are
   swept before every decision and excluded by `expires_at > now`.

## Perfection Loop

### Loop 1 — RED

- **RED:** D6 leaks local exception text; D50 has no admission gate.
- **GREEN:** Sanitizer plus reservation-backed free admission.
- **AUDIT:** `npm test` 61/61 and `npm run typecheck` exit 0 at implementation
  time.
- **ADVERSARIAL:** Could two concurrent requests both pass the daily check? No:
  the decision and insert share one immediate SQLite transaction.
- **CHANGE DELTA:** new record; no prior text.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] **Commit SHA:** uncommitted at time of writing (`48c21e1` is the base)
- [x] **File:line ranges:** `lib/http.ts` sanitizer; `lib/free-pool.ts`;
  `lib/store/free-pool.ts`; `lib/gateway.ts` free branch; `lib/store/usage.ts`
  settlement; `lib/db.ts` free-pool schema
- [x] **Gate output:** `npm run verify` exit 0; 62/62 tests; quality PASS over
  127 files; 33-route build
- [x] **Reproducibility:** grep for `reserveFreeCall`, `free_pool_usage`,
  `sanitizeError`
- [x] **Step statuses:** steps 1–10 implemented

## Resolution

- **Closed Date:** not closed — closure is blocked on a commit and archive move
- **Fix Description:** see Proposed Solution
- **Tests Added:** `tests/free-pool.test.mjs`, two `tests/http.test.mjs` cases
- **Verification Evidence:** `npm run verify` exit 0, 62/62 tests, quality PASS
  over 127 files, 33-route build at 2026-10-29T11:29:05-0400
- **Archived:** not archived

## Lessons Learned

Error sanitization and admission control are cross-cutting concerns; one shared
helper and one policy module prevent the next route from re-implementing either
incorrectly. Free access is still access: if the provider bills a shared pool,
the gateway needs a gate, not only a ledger.
