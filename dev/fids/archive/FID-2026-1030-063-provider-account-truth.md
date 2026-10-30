# FID: Fresh upstream account truth across display and admission

**Filename:** `FID-2026-1030-063-provider-account-truth.md`
**ID:** FID-2026-1030-063
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** closed
**Created:** 2026-10-30 15:42 UTC
**Automation level:** 3
**YAGNI-Compliance:** Verified — repair the existing provider observation path.

## Summary

Yesterday's exhausted quota is displayed as live after the actual upstream daily
reset and can reject inference today. Every explicit account check must obtain a
new upstream response. Failed checks must report unavailable, never old success.
This implements the demonstrated quota-refresh defect covered by launch child
049 without claiming its separate trial activation/allocation acceptance work.

## Environment

Windows, Node/npm, Next.js 16.4.3, SQLite, single process. Baseline `b9764fe`.
Two untracked research documents are operator work and remain untouched.
Single-agent ECHO v0.1.2, strict, session autonomy 3.

## Detailed Description

### Problem

The operator sees 19.6M used and 368.1K remaining while the provider dashboard
shows 0 used / 20M remaining. This can disable free inference after reset.

### Expected Behavior

Checking the account fetches its current upstream balance and quota; no TTL can
replace that read. Display observation/reset times and exact counts. If a check
fails, current figures become unavailable. Before free dispatch, acquire a new
quota observation and conservatively account for local usage and reservations.

### Root Cause

`lib/providers/sync.ts` updates account values only during catalog sync.
`lib/store/providers.ts` reads them indefinitely. `provider-card.tsx` calls them
live. `lib/store/free-pool.ts` uses `syncedAt` (catalog completion) as its usage
watermark and ignores daily reset for ordinary free admission. Numeric coercion
in `request.ts` maps null/blank/false to zero; unknown free quota can be admitted.

### Evidence

Read-only SQLite + authenticated GETs, with credentials kept in memory:

```text
2026-10-30T15:42:12.531Z local savant:
synced_at=2026-10-29T21:15:21.452Z
subscription_tokens_used=19631919 subscription_tokens_remaining=368081
local usage October 29: 954 weighted tokens across 3 calls
2026-10-30T15:42:13Z GET /subscription HTTP 200:
mode=free unlimited=false token_limit=20000000 tokens_used=0
tokens_remaining=20000000 allowed=true resets_at_utc=2026-10-31T00:00:00.000Z
GET /balance HTTP 200: balance_usd=0 rpm=15 rpm_plan=free
```

The fresh API agrees with the provider dashboard. The mismatch is the gateway's
old observation, not proof that the upstream API reports incorrect quota.

## Impact Assessment

### Affected Components

Provider parsing, additive schema/observation storage, runtime refresh and
catalog sync, operator account endpoint/card, admin/console initial reads,
public quota projections, free admission and its production HTTP tests.

### Risk Level

- [x] Critical: incorrect capacity can deny legitimate inference or over-admit.

No upstream inference or financial transaction is required for live proof.
No subscription or lifetime-trial entitlement is activated and no plan put on sale.

## Proposed Solution

### Approach

One account-refresh service owns balance/subscription observations independently
of catalog success. No success TTL reuse on checks; only in-flight work is
coalesced. A bounded SQLite lease fences late writers and fails unavailable
under contention; no cached result stands in for a check. Requests use no-store.

Strict finite numeric parsing preserves zero and rejects null/blank/boolean,
negative/unsafe/inconsistent counters. Unlimited requires an explicit boolean.
Persist request-start observation time, completion/check time, upstream reset,
unlimited and safe error metadata separately from catalog syncedAt. A free
observation expires by the earlier of its UTC day/reset/short safety lifetime.
Never locally manufacture a 20M refill when reset arrives.

Admission refreshes before free routing, then rechecks observation validity and
remaining minus local completions since request start and all live holds inside
the existing immediate transaction. Using request start deliberately overcounts
ambiguous overlapping consumption rather than reopening capacity; exact upstream
in-flight attribution is unavailable. Preserve holds across refresh and reset.
Reject unknown/stale capacity before dispatch and hold creation, with retry info.

Operator initial render and protected polling/manual account check use the same
service. Hide previous numbers during/after failed checks; show checked-at,
reset, exact upstream counts, and a separately labelled conservative admission
estimate. Public reads mask expired values and never label snapshots live.

Configuration edits invalidate observations and fence prior refresh writers.
Expired leases cannot publish late responses. A 30-second safety lifetime is
only a validity guard, never permission to reuse a prior check. Polling clears
old figures while checking and on transport failure. Account reads do not sync
or delist models. Providers without a quota API cannot authorize unknown free
capacity; paid routing retains its independent credit/price contract.

Operator steering adds daily trial credits backed by this shared daily pool.
Reuse the existing allocation/usage/hold ledger, cap its configured pool against
fresh observed daily capacity, rebalance unspent grants when that cap changes,
and show each customer's weighted-token credits and observed reset. Retain the
standing reserve and per-account cap; do not enable lifetime trials or turn
token credits into money. Extend `tests/allocation.test.mjs` and HTTP coverage.
The supplied provider email describes sandbox quota and commercial PAYG, not a
confirmed rate card. Record it in the offering evidence ledger.

Implementation build discovery: startup instrumentation statically imports Node
modules into the Edge bundle and production path validation triggers whole-tree
tracing. Correct with a Node-runtime conditional dynamic import and the existing
turbopackIgnore path convention; verify a warning-free production build.

### Steps

1. Register trace/design and run the document Perfection Loop before source edits.
2. Implement strict parsing, additive metadata and fenced account refresh;
   reuse it from catalog sync without changing the catalog on account checks.
3. Wire fresh account reads and free admission, safe reset/unknown/floor handling,
   truthful UI and projections; preserve billing sources and existing ledgers.
4. Verify regressions, production call graph, live read-only account comparison,
   all gates and committed closure records.

### Verification

`tests/quota-refresh.test.mjs`: payload semantics, freshness/reset and in-memory
SQLite leases/fencing, failures, migration and conservation. Extend
`tests/free-pool.test.mjs` for unknown capacity and post-reservation floor.
Production HTTP checks in `scripts/http-suite/quota-checks.mjs` reproduce the
19.6M→0 reset without catalog sync, check failure masks/rejections, unknown and
unlimited semantics, concurrent refreshes and holds, and rendered truthful UI.
Existing trial HTTP gate verifies the trial-disabled and explicit trial branches.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings
- gate: typecheck — `npm run typecheck`
- gate: test tests/quota-refresh.test.mjs — `npm test`
- gate: test tests/free-pool.test.mjs — `npm test`
- gate: test tests/allocation.test.mjs — `npm test`
- gate: quality — `npm run quality`
- gate: build — `npm run build`
- gate: test_http — `npm run test:http` after build
- gate: verify — `npm run verify`

Also `node scripts/attribution-guard.mjs` and `git diff --check`.
Context7 `/vercel/next.js` fetched 2026-10-30: explicit `cache: no-store` fetches
the source on every request. Fresh API evidence above is separate from fixtures.

## Perfection Loop

### Loop 1 — RED / GREEN

RED: proven yesterday snapshot; unchecked null coercion and unknown admission.
GREEN: the single observation path and all steps above are the proposed repair.
AUDIT: production caller inventory confirms card → overview → stored provider;
sync → fetchProviderSubscription; admission → providerRemaining → syncedAt.
ADVERSARIAL: a successful catalog request cannot establish a quota observation;
a quota timeout cannot refill or silently authorize the free pool.
CHANGE DELTA: initial document, no implementation written.

### Missed Questions

1. Can cached success satisfy the operator's requirement? No: fetch each check.
2. Does failed catalog sync invalidate fresh quota? No: independent clocks.
3. Can concurrent completions be hidden by a late refresh? No: start watermark
   plus retained holds is conservative; lease ownership fences late writers.
4. Can expired/yesterday/unlimited/null imply a refill? Only an explicit fresh
   unlimited response bypasses a finite cap; all other unknown states block.

### Implementation Evidence

Steps 1–4 implemented and verified. Implementation commit:
`d31d9e0d6980245e2732b9f03ec9e69983acbcd5`.
Callers: `lib/gateway-trial.ts:54`, `app/api/provider/runtime/route.ts:25`,
`app/api/account/trial/route.ts:14`; observation math `lib/quota-ledger.ts:96`.

```text
npm run verify: exit 0, 2026-10-30
lint: zero warnings; typecheck: exit 0; config-check: PASS (non-production)
tests 242 / pass 242 / fail 0
quality: PASS (400-line ceiling, 247 files scanned)
build: Compiled successfully; no warnings
http-suite: 242 checks PASS
trial-http-suite: all checks PASS
```

## Resolution

Implemented and verified; the live local check at 16:09:18 UTC returns HTTP 200,
$0 balance, 0 used / 20M remaining, reset October 31 00:00 UTC.
- **Closed Date:** 2026-10-30 16:17 UTC
- **Archived:** 2026-10-30 16:17 UTC
Two stable document passes and measured correction are recorded in
`dev/audits/2026-10-30-provider-account-truth.md` before source edits.

## Lessons Learned

A catalog synchronization timestamp is not an account observation clock.
