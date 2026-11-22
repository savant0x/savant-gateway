# FID: InferHub operational integration

**Filename:** `FID-2026-1122-002-inferhub-operational-integration.md`
**ID:** FID-2026-1122-002
**Severity:** high
**Status:** fixed
**Created:** 2026-11-22 19:10
**Automation level:** 3
**YAGNI-Compliance:** Pending

> **Project application (savant-gateway).** This repository uses npm, not Bun, and it does
> **not** ship `fid:verify`, `quality:report` beyond `npm run quality`, `scope:check` or
> `validate:repository`. The gates that actually exist are declared in `protocol.config.yaml`
> and repeated below. FID closure is checked by review against this template, the gate output
> and the commit recorded in the FID. `implemented` is a step status, never a FID status.

---

## Summary

Make the already-registered InferHub row fully operable **without a deposit**: three defects
that would otherwise make enabling it dishonest or unobservable are fixed, and nothing about
the provider's money path is claimed. Registration, the free-pool resale control, the
price-shape adapter and the review gate already exist (FID-2026-1120-001, FID-2026-1120-002)
and are not re-done here.

1. **The wallet is unreadable at this provider.** `fetchProviderBalance` calls
   `${baseUrl}/balance` (`lib/providers/request.ts:73-75`) — `https://api.inferhub.dev/v1/balance`,
   which does not exist — while the real read is `GET https://inferhub.dev/api/me` with a
   different shape (`balances`, not `balance_usd`). The seeded row also has
   `supports_balance = 0`, so the dashboard shows nothing at all.
2. **The provider's funding text reaches customers.** `safeUpstreamMessage` passes a 402 body
   through (`lib/gateway-refusal.ts:21-27`) and `failureStatus` keeps the status
   (`:30-32`), so a customer whose call we cannot serve is told to deposit USDC at a domain
   they have no account on.
3. **An in-stream provider error settles `ok` and bills an estimate.** `streamCompletion`
   settles `ok` on the `[DONE]` frame alone (`lib/storage/gateway/stream.ts:234-249`), and this
   provider reports failures as stream events, so a failed call can be charged.

The FID is deliberately scoped to *visibility and honesty*, because that is what stands
between the current state and an operator being able to judge the row on real numbers. A
funded call, a pinned bid and the `429 capacity_saturated` shape stay blocked on money and
remain FID-2026-1120-001 step 6.

## Environment

- **OS:** Windows 11, Git Bash
- **Language/Runtime:** Node 22.x, TypeScript strict, Next.js 16 App Router
- **Tool Versions:** npm; gates per `protocol.config.yaml`
- **Commit/State:** `c0ff625` (tree clean except one pre-existing untracked session summary)

## Detailed Description

### Problem

The provider can be enabled from the dashboard today, and doing so would produce three
behaviours the operator would see as bugs on the first day:

- **No wallet figure anywhere.** `providerBalanceState` returns `"unavailable"` whenever
  `supportsBalance` is false (`lib/provider-capital.ts:93`), so the capital panel reports
  nothing and the runway question — the whole reason to look at this provider's economics —
  cannot be answered from the console.
- **A bill we did not create, attributed to the customer.** A 402 from the upstream is passed
  to the customer with the provider's own words, and 402 means "you are out of credit" in our
  own contract (`lib/storage/gateway/paid.ts:68`), so the customer is told to fix something
  that is ours to fix.
- **A failed call charged at an estimate.** `settleCall(..., "ok")` runs whenever the transport
  completed and `[DONE]` arrived, regardless of an `error` object earlier in the stream.

### Expected Behavior

- The provider's balance is readable at its own host and path, recorded with an observation
  time, and shown by the same capital machinery as every other provider. An empty wallet reads
  `$0`, not `unavailable`.
- A provider-side funding failure is reported as our outage (`503`, fixed text), never as the
  customer's missing credit and never with the provider's deposit instructions.
- A stream that carries an error event settles `error` and bills nothing, and the customer
  receives an error event instead of a completion marker.

### Root Cause

The registry and the balance reader were built around one provider's shape — a relative
`/balance` path returning `balance_usd` — and the relay treats the protocol terminator as the
only completion signal. Both assumptions are singular where the code assumed universal.

### Evidence

Authenticated read-only observation, 2026-11-22 18:52 UTC (audit §1.1):

```text
GET https://inferhub.dev/api/me  (Bearer)  -> 200
{"id":"…","status":"active","roles":["consumer"],"balances":{}}

GET https://inferhub.dev/v1/me/usage (Bearer) -> 403 {"error":{"message":"access denied",…}}

fetchProviderBalance(provider)  -> GET https://api.inferhub.dev/v1/balance
lib/provider-quota.ts:73  if (!isProviderObject(value) || providerNumber(value.balance_usd) === null)
                                 ^^ requires balance_usd, which /api/me does not publish
```

Seeded row (`lib/storage/schema/catalog-seeds.ts:210-230`): `supports_balance = 0`,
`supports_subscription = 0`, `supports_pricing = 0`, `requires_model_review = 1`,
`resale_free_pool = 0`, `enabled = 0`.

## Impact Assessment

### Affected Components

- `lib/providers/types.ts`, `lib/providers/registry.ts` — provider record and input contract
- `lib/storage/schema/catalog.ts`, `lib/schema/providers.ts`,
  `lib/storage/schema/catalog-seeds.ts` — column, migration, seeded row
- `lib/storage/store/provider-rows.ts`, `lib/storage/store/providers.ts` — persistence
- `lib/providers/request.ts`, `lib/provider-quota.ts` — balance fetch and parse
- `lib/gateway-refusal.ts` — upstream status/message mapping
- `lib/storage/gateway/stream.ts` + a new stream-failure reader — settlement of error frames
- `components/admin/provider-form.tsx` — operator field

### Risk Level

- [x] High: two of the three defects misbill or misinform a paying customer.

## Proposed Solution

### Approach

Extend the existing readers rather than adding provider-specific branches (Law 13): one
optional absolute `balance_url` on the provider record, one parser that understands the second
documented shape, one status mapping change, one stream-failure reader. No slug conditions are
introduced anywhere.

### Steps

1. **`balance_url` column.** Nullable `TEXT` in both schema paths and the migration list
   (`ensureColumn`), with the same "an upgrade must not delete an existing value" rule as
   `resale_free_pool`. Persist through `createProvider`/`updateProvider`, expose on
   `ProviderRecord`/`ProviderInput`, and render as an optional field in the admin form with copy
   that says what it is for.
2. **Seed the honest capability.** The InferHub seed sets `supports_balance = 1` and
   `balance_url = 'https://inferhub.dev/api/me'`. A one-time migration applies the same to an
   existing seeded row only where it still looks seeded (`supports_balance = 0 AND balance_url IS
   NULL`), so an operator edit is never overwritten.
3. **Read the balance from the configured place.** `fetchProviderBalance` uses
   `provider.balanceUrl` when present (absolute URL, same headers, `redirect: "error"`), else the
   existing `${baseUrl}/balance`. `parseProviderBalance` accepts the second documented shape:
   `balances.consumer_balance` (string or number) as USD, every other field `null`, and an empty
   `balances` object reads `0`. A payload with neither shape still throws, so a broken provider
   cannot masquerade as `$0`.
4. **Never pass a provider 402 to a customer.** `failureStatus(402)` → `503` and
   `safeUpstreamMessage(402, …)` → fixed text ("Provider is temporarily unavailable"). 400 and
   429 keep their pass-through because they describe the customer's request.
5. **A stream error is not a completion.** New pure reader decides whether a frame carries an
   error object; the relay remembers the first one, settles `error` with that text, forwards
   `event: error` + `data: {error:{…}}` to the customer, and never forwards `[DONE]` for that
   response.
6. **Docs, tests, gates.** `docs/providers.md` records the balance path and the two new
   behaviours; `docs/business-model.md` drops the "no balance endpoint" caveat for this row;
   CHANGELOG and SCOPE are updated.
7. **Serialise schema application per process.** Found by the gate, not by the design: adding a
   column widened an existing race in which two handles in one process run `applySchema`
   concurrently and PostgreSQL aborts one with a deadlock (`40P01`) or a duplicate-type error
   (`23505`). `migrateDatabase` now queues migrations behind a module-level promise chain, which
   is correct for a single-process gateway; a second process would need an advisory lock and is
   not claimed.

### Registered work items (owned, active, not dropped)

The audit's remaining findings are work items this session owns. They are registered in
`SCOPE.md` as IA5-IA7 with their next action and evidence, and none is reclassified, deferred or
trimmed by this record:

- **IA5 — `usage.cost` persistence (audit F-2)** — a schema column plus reconciliation against
  `cost_micros`. It changes the billing truth after settlement, so it is the next engineering item
  and not a side effect of this FID.
- **IA6 — `/api/catalog` group notes and pooled-capacity display (audit F-8, F-20)** — an
  enrichment and display item; nothing in this record imports them.
- **IA7 — Keyless catalog preview (audit F-1)** — a sync-gate change with no bearing on serving.

### Blocked

- Funded call, pinned bid, `429 capacity_saturated` shape, `usage.cost` on the wire: all require
  a deposit and stay FID-2026-1120-001 step 6.

### Verification

- `tests/provider-balance-shape.test.mjs` (new) — both documented balance shapes parse; empty
  `balances` is `$0`; an unknown payload throws; a negative or non-numeric value throws.
- `tests/provider-inferhub-sync.test.mjs` (extended) — the seeded row reports
  `capabilities.balance = true` and `balanceUrl = https://inferhub.dev/api/me`, and the migration
  leaves an operator-edited row alone.
- `tests/gateway-refusal.test.mjs` (new) — 400/429 pass through, 402 becomes 503 with fixed text,
  5xx/401/403 stay masked.
- `tests/stream-failure.test.mjs` (new) — error frames are detected (object, string, null,
  `[DONE]` excluded), and a stream carrying one settles `error`.
- `tests/gateway-settlement-postgres.test.mjs` (extended) — a stream whose error event is
  followed by `[DONE]` settles `error`, charges `0`, sends `event: error` and no terminator.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings.
- gate: typecheck — `npm run typecheck`.
- gate: test tests/provider-balance-shape.test.mjs
- gate: test tests/gateway-refusal.test.mjs
- gate: test tests/stream-failure.test.mjs
- gate: test tests/gateway-settlement-postgres.test.mjs
- gate: test tests/provider-inferhub-sync.test.mjs
- gate: test tests/store-providers-postgres.test.mjs
- gate: quality — `npm run quality` (touches `components/` and `lib/`).
- gate: build — `npm run build`.

### Verification Receipt

- verified: 2026-11-22T19:52:00Z
- `npm run verify`: **PASS**, 12/12 gates, 169.0s
- check: exit 0
- storage:check: exit 0
- config:check: exit 0
- repository:check: exit 0 (13 active FIDs)
- test: exit 0 — **1203/1203 pass, 0 skipped**
- test:postgres: exit 0 — 20/20
- quality: exit 0 (400-line ceiling, 701 files)
- build: exit 0
- test:visual-builds-browser: exit 0
- test:http: exit 0
- test:recovery: exit 0
- deployment:receipt: exit 0
- summary: `.verify/summary.json`

## Perfection Loop

### Loop 1 — RED

- **RED:** Three enabling defects, each verified by reading the code rather than by inference:
  the balance path/shape mismatch (`lib/providers/request.ts:73`, `lib/provider-quota.ts:73`), the
  402 pass-through (`lib/gateway-refusal.ts:21-32`), and `ok` on `[DONE]` regardless of streamed
  errors (`lib/storage/gateway/stream.ts:234-249`). A fourth candidate — `requires_model_review`
  gaps — was rejected: that gate already denies `unknown` decisions
  (`lib/providers/eligibility.ts:105-128`).
- **GREEN:** Steps 1-6 above.
- **AUDIT:** Each claim traces to a file:line and to the authenticated observation in §1.1 of the
  audit. The balance reader is the only consumer of `supports_balance` in the capital path, so
  flipping it on has no other effect (`grep -rn "supportsBalance" lib/`).
- **ADVERSARIAL:** "Does `balance_url` create a second URL that can point at a credential leak?"
  It uses the same header builder and `redirect: "error"`, so the credential can only go to an
  operator-configured origin — the same trust boundary as `base_url`. "Does a 503 removal of 402
  hide a genuine customer-facing quota error?" No: upstream 402 is our account's funding, and our
  own insufficient-credit 402 is emitted by `lib/storage/gateway/paid.ts:68`, untouched.
- **CHANGE DELTA:** n/a (initial record).

### Missed Questions

1. *Should the balance read block calls when the wallet is empty?* No — `balance_usd` feeds
   capital/runway reporting only (`lib/provider-capital.ts:87-150`), never admission. Blocking on
   it would invent a control the operator did not ask for, and the honest signal is the upstream
   402 mapped to our 503.
2. *Should `supports_subscription` be enabled too?* No: `/v1/me/usage` answers 403 for a consumer
   role, so there is no subscription read to enable.
3. *Does the second balance shape belong in `parseProviderBalance` or a per-provider parser?* In
   the one parser, exactly as the price reader took a second shape in FID-2026-1120-002; a
   per-provider parser is the branch this codebase has spent two FIDs removing.
4. *What should the customer see on a mid-stream error?* An `event: error` frame with our text and
   no `[DONE]`, so a client cannot mistake a partial answer for a completed one.

## Resolution

- **Closed Date:** 2026-11-22 19:52
- **Fix Description:** The InferHub row can be enabled from the dashboard and is honest before a
  single dollar is deposited: its wallet is read from its own `balance_url` and parsed from
  `balances.consumer_balance`; an upstream 402 becomes our 503 with our text; an in-stream
  provider error settles `error`, charges nothing and reaches the customer as `event: error`
  rather than `[DONE]`; and schema migrations from two handles no longer race.
- **Tests Added:** Yes — `tests/provider-balance-shape.test.mjs`,
  `tests/gateway-refusal.test.mjs`, `tests/stream-failure.test.mjs`, plus additions in
  `tests/provider-inferhub-sync.test.mjs`, `tests/gateway-settlement-postgres.test.mjs` and
  `tests/store-providers-postgres.test.mjs`.
- **Verification Evidence:** `npm run verify` PASS — 12/12 gates, 1203/1203 tests, 0 skipped.
- **Archived:** not yet: the record is `fixed` and moves to `archive/` with the commit that
  closes it.

### Loop 2 — Independent audit and self-correction

- **RED:** The first `npm run verify` after implementation **failed two gates**:
  `repository:check` (`dev/fids/README.md does not register active FID-2026-1122-002`) and `test`
  (`tests/content-link-concurrency.test.mjs:25` — `deadlock detected`, `40P01`, raised inside
  `ensureColumn`, `lib/storage/schema/columns.ts:45`). Both are consequences of this change: the
  register entry was missing, and the added column widened a migration race that an earlier run
  had already shown as `23505 duplicate key … pg_type_typname_nsp_index`.
- **GREEN:** Registered the FID and added step 7: `migrateDatabase` serialises schema application
  per process (`lib/storage/schema/index.ts:67-86`), and a rejected migration is caught so the
  queue cannot poison later runs (`:82`).
- **AUDIT:** `repository-check: PASS (13 active FIDs)`; the second full `npm run verify` is
  **PASS** with 1203/1203 tests and 0 skipped.
- **ADVERSARIAL:** "Does the queue serialise unrelated databases and slow boot?" It orders
  migrations instead of overlapping them, adds no wait to a single handle, and the gateway runs
  one process — the cost is bounded and the alternative is a schema transaction aborted at
  random. "Does the client-disconnect path still settle?" Yes: `gateway-settlement-postgres`
  passes 10/10 in the same run.
- **CHANGE DELTA:** ~8% of the FID text (one step, the verification list, this loop).

### Loop 3 — Final convergence

- **RED:** Residual risks, named rather than hidden: the second balance shape is proven by unit
  fixtures, not by a live funded read; the stream-failure rule is proven by a synthetic upstream,
  not by this provider on the wire; `balance_url` is operator-supplied, so a wrong URL fails a
  refresh rather than a call.
- **GREEN:** No code change. `docs/providers.md` states each limit in the same words used here,
  and the audit's F-4, F-5 and F-9 dispositions now read "fixed by FID-2026-1122-002".
- **AUDIT:** Claim-to-code check: `balance_url` exists in both schema paths
  (`lib/storage/schema/catalog.ts:29,151`, `lib/schema/providers.ts:53`) and is seeded with the
  vendor URL (`lib/storage/schema/catalog-seeds.ts:223-228`); the record exposes it
  (`lib/providers/types.ts:32`, `lib/storage/store/provider-rows.ts:99`); the read prefers it
  (`lib/providers/request.ts:71-77`); the parser accepts the wallet shape
  (`lib/provider-quota.ts:85,117`); 402 maps to 503 (`lib/gateway-refusal.ts:23,38`); the relay
  remembers the first failure and suppresses what follows
  (`lib/storage/gateway/stream.ts:105,178,209,260-262`); the reader is `lib/stream-failure.ts`.
- **ADVERSARIAL:** "Could a 402 from another provider now hide a real customer-side quota
  message?" No: our own 402 is produced by the credit path (`lib/storage/gateway/paid.ts:68`) and
  never passes through `failureStatus`.
- **CHANGE DELTA:** 0% (documentation only).

## Lessons Learned

A FID written and implemented in one pass is a design record, not a convergence. The gate found
what the design review did not: a missing register entry and a migration race this change made
likelier. The loop's value is in running the gates **between** writing the steps and claiming
them, not in documenting that they were considered.
