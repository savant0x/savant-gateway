# FID: Catalog and gateway query cost after multi-provider onboarding

**Filename:** `FID-2026-1124-005-catalog-gateway-query-cost.md`
**ID:** FID-2026-1124-005
**Severity:** high
**Status:** closed
**Created:** 2026-11-25 00:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Onboarding InferHub multiplied the catalog from tens of models to several
hundred and added a second provider scope to every read and write path. Six paths
that were linear in model count were never re-costed, and two of them are now
either a connection-pool risk or a multi-second write.

Measured shape, not guessed: `GET /v1/models` issues one `MODEL_SELECT` query per
catalog model when trials are enabled; a single Enable/Disable click issues one
`UPDATE` per row in `models`; a provider sync issues one `INSERT ... ON CONFLICT`
per model plus a full-table preload; and every completion runs a global
subscription sweep, two redundant provider reads and three settings reads.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `f2e1a53` on `main`, clean tree
- **Pool:** `lib/storage/pg-pool.ts` (10 connections by default)

## Detailed Description

### Problem

**D1 — `/v1/models` fans out one query per model.** The route maps every row
through a projection that awaits a database lookup
(`app/v1/models/route.ts:13`):

```ts
const models = await listModels();
const data = await Promise.all(models.map(openAiModelObject));
```

and the projection awaits the trial offer (`lib/openai-model.ts:13-15`):

```ts
id: model.id,
trial_paid_transition: await trialOffer(model.id),
```

`trialOffer` (`lib/storage/store/trial-offer.ts:26-33`) reads the source row
*unconditionally*, and the paid row when a pair exists:

```ts
const id = config.pairs[modelId];
const model = id ? await getModelForGateway(db, id) : undefined;
const source = config.enabled
  ? await getModelForGateway(db, modelId)
  : undefined;
```

With trials enabled that is one query per model (two per paired model) —
concurrently, from one request. `getModelForGateway` runs `MODEL_SELECT`
(`lib/storage/store/model-sql.ts:30-51`), which carries four correlated scalar
subqueries. `findPublishedModel` (`lib/openai-model.ts:43-46`) loads the entire
catalog and scans it in memory for a single-id retrieve:

```ts
return (await listModels()).find((model) => model.id === id) ?? null;
```

**D2 — every catalog edit rewrites every row.** `reconcileRoutesIn` selects the
whole table (`lib/storage/store/routes.ts:97`) and then updates *each member of
each group* regardless of whether the computed route differs
(`routes.ts:125-145`):

```ts
for (const members of Array.from(groups.values())) {
  const plan = planModelRoutes(members.map(toCandidate));
  ...
  for (const member of members) {
    ...
    await update.run(primary ? 1 : 0, ...);
  }
}
```

There are **13** call sites, including `setModelStatus` (`model-status.ts:123`),
`setModelPricing` (`models.ts:200`), `setModelGroup` (`models.ts:275`) and
`replaceModels` (`model-sync.ts:172`). So a single-row toggle costs
`rows(models) × RTT` — at 600 rows and a 15 ms round trip that is roughly nine
seconds inside one transaction (arithmetic, not a measurement).

**D3 — bulk operations are loops.** `setModelStatusBulk`
(`lib/storage/store/model-status.ts:196-203`) prepares one `UPDATE` and awaits it
per id; `setModelEligibilityBulk` (`eligibility.ts:132-153`) does the same with
one `INSERT ... ON CONFLICT` per id; `replaceModels`
(`model-sync.ts:144-168`) upserts one model per statement after preloading the
whole table (`model-sync.ts:43`):

```ts
for (const row of await db.prepare("SELECT * FROM models").all<ModelRow>()) {
  existing.set(row.id, row);
}
```

**D4 — the completion hot path repeats work.** Before the upstream call:
`resolveSubscriptionAccess` runs `sweepSubscriptions` for *every* caller
(`lib/storage/store/subscription-access.ts:105`), which executes two global
scans (`subscription-sweep.ts:19-33` and `:104-113`) even for a caller with no
subscription; `lib/storage/gateway/provider-call.ts:26` re-reads the provider
that `call.ts` already loaded; `getBannerConfig` performs two sequential
`settings` reads (`lib/storage/store/banner.ts:28,35`); and
`lib/storage/store/keys.ts:110` writes `last_used_at` on every authenticated
request.

**D5 — provider list is N+1.** `listProviders` (`providers.ts:177-192`) calls
`getProviderRow` and `modelCount` per provider after already having read every
row in `listProviderRecords`.

### Expected Behavior

A read scales with the number of rows returned, not with an extra round trip per
row. A write touches only the rows whose derived state actually changed. The
completion path performs a bounded, provider- and caller-scoped set of reads.

### Root Cause

Every one of these was correct at one provider and tens of models: the constant
factors were invisible on a local PGlite handle. The catalog grew by an order of
magnitude and a second provider scope arrived, and none of the six paths was
re-costed against the new row count or the hosted round-trip cost.

### Evidence

```text
app/v1/models/route.ts:13            Promise.all(models.map(openAiModelObject))
lib/openai-model.ts:14               trial_paid_transition: await trialOffer(model.id),
lib/openai-model.ts:46               (await listModels()).find(...)
lib/storage/store/trial-offer.ts:31  ? await getModelForGateway(db, modelId)
lib/storage/store/routes.ts:97       const rows = await db.prepare(ROUTE_SELECT).all<RouteRow>()
lib/storage/store/routes.ts:130      for (const member of members) {
lib/storage/store/routes.ts:136        await update.run(
lib/storage/store/model-status.ts:199  for (const id of writable) {
lib/storage/store/eligibility.ts:143   for (const row of known) {
lib/storage/store/model-sync.ts:43     SELECT * FROM models
lib/storage/store/subscription-access.ts:105  await sweepSubscriptions(db, now);
lib/storage/gateway/provider-call.ts:26        const provider = await getProvider(db, model.upstreamSlug);
lib/storage/store/banner.ts:28,35              two getSetting calls
lib/storage/store/keys.ts:110                  UPDATE api_keys SET last_used_at = ?
lib/storage/store/providers.ts:183-189         getProviderRow + modelCount per provider
```

`reconcileRoutes` call sites (`grep -rn "reconcileRoutes(" lib`): `backfill.ts:52`,
`eligibility.ts:155,208`, `model-sync.ts:172`, `model-status.ts:123,207`,
`models.ts:124,200,275`, `pricing-approval.ts:123`, `providers.ts:268,289,312`.

## Impact Assessment

### Affected Components

- `app/v1/models/route.ts`, `app/v1/models/[id]/route.ts`, `lib/openai-model.ts`
- `lib/storage/store/trial-offer.ts`
- `lib/storage/store/routes.ts` (and the 13 callers)
- `lib/storage/store/model-status.ts`, `eligibility.ts`, `model-sync.ts`
- `lib/storage/store/subscription-access.ts`, `subscription-sweep.ts`
- `lib/storage/gateway/provider-call.ts`, `lib/storage/store/banner.ts`,
  `lib/storage/store/keys.ts`, `lib/storage/store/providers.ts`
- `lib/storage/store/model-sql.ts`

### Risk Level

- [x] High: D1 is a connection-pool exhaustion risk on the public catalog
      endpoint (10 connections, N concurrent queries, 5 s acquire timeout), and
      D2 turns one operator click into a multi-second lock-holding write at
      current catalog size.

## Proposed Solution

Five independently shippable slices. Each has its own test; the FID closes only
when all five are in.

### Slice 1 — catalogue reads without fan-out (D1)

1. Return `null` before any I/O when trials are disabled, and before the paid
   lookup when no pair exists, in `trialOffer` — the current order reads the
   source row before checking `config.enabled`.
2. Build the trial map for a whole page in one pass: a single `SELECT id, ...`
   restricted to the ids the caller already has, or — cheaper and sufficient —
   compute `trial_paid_transition` from the rows `listModels()` already returned,
   since the pair must share a provider. No extra query per model.
3. Give `findPublishedModel` its own single-id query instead of loading the
   catalog.

### Slice 2 — reconcile only what changed (D2)

Diff each member's computed route against the row's stored
`(is_primary, served_provider_slug, served_upstream_id, served_protocol,
served_cost_input_micros, served_cost_output_micros)` and skip the write when
they agree. `ROUTE_SELECT` already reads every column needed for the comparison,
so the change is local to `reconcileRoutesIn`. When many rows genuinely change
(a sync), batch them with one `UPDATE ... FROM UNNEST(...)`.

### Slice 3 — batched bulk writes (D3)

Replace the per-id loops with set-based statements:
`UPDATE models SET status = ? WHERE id = ANY(?::text[]) RETURNING id` for bulk
status; `INSERT ... SELECT ... FROM UNNEST(...) ON CONFLICT ... DO UPDATE` for
bulk eligibility and for the sync upsert (chunks of ~200). Restrict the sync's
preload to `WHERE upstream_slug = ?`.

### Slice 4 — bounded hot path (D4)

1. Move `sweepSubscriptions` off the per-request path: run it from the existing
   operations tick / cron route, and keep only the caller-scoped
   `activeSubscriptionRow` check inline.
2. Pass the already-loaded provider into `provider-call` instead of re-reading it.
3. Read the two banner settings in one statement (or a single settings read with
   a short TTL, invalidated by `saveSetting`).
4. Write `last_used_at` only when it is null or older than a fixed interval.

### Slice 5 — provider list in one pass (D5)

Compute each provider's status from the rows `listProviderRecords` already read,
and get counts from one `SELECT upstream_slug, COUNT(*) ... GROUP BY upstream_slug`.

### Also noted, not scheduled

`MODEL_SELECT`'s four correlated subqueries (`model-sql.ts:31-49`) are correct
and index-backed; converting them to joins is a readability win, not a
measurable one, and belongs to a later pass once slices 1-5 are measured. Recorded
here so the idea is not lost, and deliberately not claimed as a fix.

### Verification

- **Slice 1:** a test counting issued statements (the handle counts `prepare`
  calls) for one `GET /v1/models` with trials enabled and disabled, asserting the
  count is independent of the model count; plus an id-retrieve test.
- **Slice 2:** `tests/route-reconcile-diff.test.mjs` — a 500-row fixture where one
  row changes, asserting exactly one `UPDATE` statement is executed.
- **Slice 3:** existing bulk suites extended to assert one statement per call.
- **Slice 4:** an HTTP test asserting a completion for a caller without a
  subscription does not touch `subscription_holds`; a banner test asserting one
  settings read.
- **Slice 5:** `tests/provider-list-queries.test.mjs` asserting a constant
  statement count for 1 and for 20 providers.

Measurement before/after is by statement count and by `npm run test:load`
(operator-approved), not by a wall-clock guess.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/openai-model-list.test.mjs
- gate: test tests/route-reconcile-diff.test.mjs
- gate: test tests/provider-list-queries.test.mjs
- gate: test tests/model-status-bulk-postgres.test.mjs
- gate: test tests/model-eligibility-bulk-postgres.test.mjs
- gate: test:http (both HTTP suites)
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

`npm run verify` PASS 12/12 gates in 181.8 s on the closure tree: 1301/1301 tests, 0 skipped, PostgreSQL 20/20, quality 719 files, build PASS, both HTTP suites, recovery 15/15, recorded in `.verify/summary.json`. Every slice also carries its own focused receipt: typecheck exit 0, `eslint . --max-warnings=0` exit 0, and the statement-count suites named below. No wall-clock number is claimed as a measured improvement; the acceptance test is statement count.

## Perfection Loop

### Loop 1 — RED

- **RED:** six paths are linear in row count and two of them are on a public or
  per-request path. Evidence is the quoted statements above.
- **GREEN:** slices 1-5.
- **AUDIT:** the estimate in §Problem is labelled as arithmetic. The one real
  bound I can state without a benchmark is the statement count, which is why
  every slice's test asserts statements rather than milliseconds.
- **ADVERSARIAL:** the objection is that a pool of 10 is fine for one page load
  and that this is premature. Answer: `listModels()` is not cached across
  requests and `/v1/models` is the public catalogue endpoint, so the fan-out is
  per concurrent caller — two clients are already 2N queries. The second
  objection, that batching complicates `replaceModels`' preservation rules, is
  answered by keeping the rules and changing only the statement shape: the map
  key stays, the per-row decision stays, only the write becomes set-based.
- **CHANGE DELTA:** 0% — first pass.

### Missed Questions

1. **Is `listModels()` already cached?** It memoises the *public projection*;
   `trialOffer` sits outside that memo, which is why the fan-out survives.
2. **Can slice 2 skip `reconcileRoutes` entirely for a status toggle?** No: a
   status change can change which route wins, so the computation must run; only
   the redundant write is removed.
3. **Does moving `sweepSubscriptions` lose a safety net?** It must remain
   reachable without a scheduler — the cron route plus the admission path for a
   caller who *has* an active subscription keeps the guarantee. A deployment
   without cron keeps expiring the caller's own row inline, which is the part
   that protects money.
4. **Why not cache the whole catalog?** Because prices and status are operator
   editable and a stale price is a billing error; the memo already has explicit
   invalidation and adding a second cache would double the invalidation surface.

### Loop 2 — Independent audit and self-correction

- **RED:** slice 1 as first drafted proposed batching `trialOffer` into one
  `IN (...)` query per page. Re-reading `trial-offer.ts:20-24` shows the offer
  must come from a *different row* (the paid counterpart) that may belong to a
  different group and price — still the same provider. A page-level query is
  therefore correct only if it is keyed by provider scope, not by id list; the
  corrected step says "compute from the rows already returned, or one query
  keyed by provider", and the test asserts the count, not the strategy.
- **GREEN:** slice 1 step 2 rewritten.
- **AUDIT:** slice 3's `ANY(?::text[])` form is PostgreSQL-specific, which is
  consistent with the rest of `lib/storage/*` (the SQLite store is retired for
  the live path) but must not be introduced into any module still shared with
  the PGlite test harness without checking it — PGlite accepts the same syntax.
- **ADVERSARIAL:** "slices 1-5 could be one FID each." They could; they share one
  cause (row-count growth) and one verification style (statement count), so the
  record keeps them together but requires five separate implementations, five
  tests and five commits.
- **CHANGE DELTA:** ~10%.

### Loop 3 — Final convergence

- **RED:** residual risk that slice 2's diff silently keeps a stale
  `served_cost_*` when a cost changed but the route did not.
- **GREEN:** the diff compares all six route columns, including both served cost
  columns, so a cost change always writes.
- **AUDIT:** `reconcileRoutesIn` remains the single place that decides routes, so
  the diff cannot diverge from the rule.
- **ADVERSARIAL:** "none of this is proven slow on the target deployment."
  Correct, and that is why nothing here is claimed as a measured regression: the
  defects are structural (per-row round trips, global scans per request) and the
  acceptance test is statement count, which is deployment-independent.
- **CHANGE DELTA:** <2% — converged.

## Resolution

- **Closed Date:** 2026-11-25
- **Fix Description:** five slices, each shipped and tested separately.
  **1** (`e497824`): a disabled trial and an unpaired id refuse before any I/O,
  a page's offers are read in one statement, and the published retrieve reads
  one scoped row instead of loading the catalogue. **2** (`034b9ed`):
  reconciliation compares the six stored route columns it already reads and
  writes only the rows that differ. **3** (`e49996f`, `692ceb2`): bulk status is
  one `UPDATE … WHERE id IN`, bulk eligibility is one multi-row upsert per 200
  rows, and the sync upsert flushes in chunks of 200 with the per-row
  preservation rules unchanged. **5** (`f018d33`): the provider list reads its
  rows once and takes every count from one grouped query. **4** (this closure
  commit): `sweepSubscriptions` moved from every completion to the operations
  tick, with the caller's own period boundary still checked at admission and
  under the lock; the loaded provider is passed into `callProvider` instead of
  re-read; the banner reads its text and switch in one statement; and
  `last_used_at` is written at most once per five minutes.
- **Tests Added:** 12 cases — four in `tests/openai-model-list.test.mjs`, one in
  `tests/route-reconcile-diff.test.mjs`, two in
  `tests/provider-list-queries.test.mjs`, one in the sync suite, one in each
  bulk suite, and two in `tests/banner-read.test.mjs` — all asserting issued
  statements rather than milliseconds.
- **Verification Evidence:** `npm run verify` PASS 12/12 gates, 1301/1301 tests,
  PostgreSQL 20/20, 181.8 s; focused typecheck, repo lint and the named suites
  all exit 0. No hosted load measurement is claimed; `test:load` remains an
  operator-approved release gate.
- **Archived:**
  `dev/fids/archive/FID-2026-1124-005-catalog-gateway-query-cost.md`

## Lessons Learned

A path that is O(rows) in round trips is invisible at 40 rows and hostile at 600.
When a change multiplies the row count or adds a provider scope, the review must
re-cost every read and write that loops over rows — and the durable guard is a
test that asserts statement count, because wall-clock numbers do not survive a
change of deployment.
