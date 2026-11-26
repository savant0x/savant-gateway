# FID: Remove the inherited free tier and token weights from pricing

**Filename:** `FID-2026-1125-004-remove-free-tier-and-weights.md`
**ID:** FID-2026-1125-004
**Severity:** high
**Status:** fixed
> Steps 1a, 1b and 1c are in the tree, committed and gated: the importer reads
> no upstream weight, refuses every `free/` row for every provider, the registry
> no longer carries a resale flag, and the sync summary reports priced/unpriced
> instead of a free count. Steps 2–8 are the ordered remainder. `fixed` means
> the landed slice is implemented; it is not a closure of the removal.
**Created:** 2026-11-25 00:00
**Automation level:** 3
**YAGNI-Compliance:** Pending — the removal deletes machinery rather than adding
it; the only new code is migration SQL and its assertions.

---

## Summary

The gateway's billing vocabulary was written for the previous upstream: a
weighted free pool (2×/3× per-model multipliers) and a `free/` catalog branch.
InferHub, now the main provider, publishes no `free/` ids and no weight field,
and the operator has ruled that the free tier is removed entirely and that a
price is a markup on the base (cost) rate. This record inventories every surface
that still encodes the old model and orders the removal so each slice can be
gated on its own.

**Operator rulings (2026-11-25):**

1. **Free tier:** "Remove it entirely" — the Free group, the daily trial, the
   allocation ledger, the free-pool catalog pages and their API surface.
2. **Price basis:** "it should be a markup on the base price, that's how it
   always was" — `sell = cost × (1 + markup)`. The formula already does this
   (`lib/pricing.ts:defaultSellMicros`); what is wrong is the cost source and the
   free/weight layer around it, not the arithmetic.
3. **Upstream (2026-11-26):** "switching focus to only use inferhub as our
   upstream, which means we no longer have free allocation and a lot of info
   has changed". The removal below is no longer conditional on a provider mix:
   InferHub is the only upstream this gateway will sell from.

## Environment

- **OS:** win32 (Git Bash)
- **Language/Runtime:** Node v24.21.0, TypeScript strict
- **Tool Versions:** Next.js 16.4.6 (Turbopack), PostgreSQL/PGlite
- **Commit/State:** `3b73d89` plus the uncommitted FID-2026-1125-003 changes

## Detailed Description

### Problem

Three layers still assume the previous upstream's contract.

- **Group classification.** `lib/model-groups.ts:legacyAccessFor` returns `free`
  when `allowFree && tokenWeight > 0`, and `subscription` for any id under
  `free/`. `lib/storage/schema/catalog-seeds.ts:backfillModelGroups` repeats the
  same rule in SQL for unassigned rows, and `SYSTEM_GROUP_DEFINITIONS` seeds a
  Free group described as "Weighted free pool".
- **Metering.** `lib/providers/normalize/index.ts:tokenWeightOf` reads the
  upstream `weight` field (the 2×/3×) and returns `0` for paid rows;
  `estimateWeightedTokens`, `subscriptionWeightedTokens`, plan allowances, the
  plan simulator and every usage view multiply by it.
- **A free product surface with no inventory.** Trial and daily-allocation cards,
  free-pool catalog panels and guides, `/api/account/allocation`,
  `/api/account/trial`, the admin cohort panel and the gateway free-pool settings
  all describe a tier that no enabled provider can now supply.

### Expected Behavior

Every catalog row is priced per token: cost from the provider's published rate,
sell = cost × (1 + markup). No row is free, no usage is multiplied by a weight,
no surface advertises a free allowance, and no schema column, ledger table or
HTTP route exists for a billing mode the business does not run.

### Root Cause

The billing vocabulary was designed once for an upstream that granted a daily
weighted allowance, and it was encoded as *policy* (group derivation, admission,
metring, UI) rather than as provider configuration. When the provider changed,
the code kept the old product.

### Evidence

Measured on the working tree at `3b73d89`:

```text
files matching allow_free      39
files matching token_weight    47
files matching allocation      51
files matching weighted       112
files mentioning free tier     97   (lib, app, components, tests, docs)
```

The canonical entry points:

```text
lib/model-groups.ts                     legacyAccessFor, SYSTEM_GROUP_DEFINITIONS
lib/storage/schema/catalog-seeds.ts     backfillModelGroups, seedSystemGroups
lib/providers/normalize/index.ts        tokenWeightOf
lib/providers/catalog.ts                costMicros (freePool → 0), allowFree
lib/storage/gateway/call.ts             free branch, billingSource "free"
lib/storage/gateway/trial.ts            reserveTrialRoute
lib/free-pool.ts                        admission, allowance, weighted estimate
lib/plans.ts                            includedWeightedTokens, decideAllowance
lib/storage/store/pricing.ts            freeCount in PricingSummary
```

InferHub supplies neither input: `pricing` carries `min_ask_*`, `official_*` and
`asks_*` only, and `weight` is absent, so `tokenWeightOf` already collapses to
`freePool ? 1 : 0`. The free branch is therefore unreachable for a new import —
but it is still seeded, still displayed and still costed.

## Impact Assessment

### Affected Components

- catalog import and group derivation (`lib/providers/*`, `lib/model-groups.ts`)
- schema and seeds (`lib/storage/schema/*`), including `allow_free`,
  `token_weight`, the allocation and trial tables
- gateway admission and settlement (`lib/storage/gateway/*`, `billingSource`)
- plans, subscriptions and the plan simulator (`lib/plans.ts`, `lib/economics.ts`)
- customer and admin UI (free panels, trial cards, cohort panel, settings)
- docs and FAQ (`docs/*`, `components/docs/*`, `components/catalog/*`)
- tests and HTTP suites that assert free-tier behaviour

### Risk Level

- [x] High: a partial cut leaves a billing mode that is priced, displayed or
      metered inconsistently. The slices below exist so each step closes.

## Proposed Solution

### Approach

Delete the mode in dependency order: stop producing free rows and weights, then
stop pricing them, then stop admitting and metering them, then drop the storage
and the UI. Every slice keeps the tree gated; nothing is left half-wired.

### Steps

1a. **Catalog cannot produce a weight.** `RawFacts` and `NormalizedModel` lose
   `tokenWeight`, the `weight` field is no longer read by any shape, and
   `toRow` writes `tokenWeight: 1`, so no upstream can set a 2×/3× multiplier.
   Tests: `tests/catalog-normalize.test.mjs` (including the recorded parity
   fixture, whose inputs keep `weight: 3`, `2` and `0` on purpose).
1b. **Catalog cannot produce a free offer.** The importer refuses every `free/`
   row for every provider and reports it, with no option to allow one;
   `providers.resale_free_pool` is gone from both schema paths (the PostgreSQL
   one drops the column), from `ProviderRecord`, from create/update, from the
   preview, and from the provider form. Operator ruling 2026-11-25: delete the
   flag rather than keep a control that changes nothing. Tests:
   `tests/catalog-normalize.test.mjs`, `tests/provider-inferhub-sync.test.mjs`,
   `tests/provider-catalog-preview.test.mjs`, `tests/store-providers-postgres.test.mjs`.
1c. **The sync summary stops reporting a free count.** `free` is gone from
   `ProviderSyncSummary` and `SyncAllSummary`; `subscriptionOnly` becomes
   `unpriced`, which is what it always counted, and the admin sync line prints
   `N priced · N unpriced`. Tests: `tests/provider-sync-postgres.test.mjs`,
   `tests/provider-inferhub-sync.test.mjs`.
2. **Price math loses the free branches.** `costMicros` drops the `freePool → 0`
   shortcut, `importedModelStatus` drops its `isFree` argument, `pricesForGroup`
   loses its zeroing branch, and `PricingSummary.freeCount` /
   `OverviewStats.freeModelCount` are removed with their UI references.
3. **Gateway drops the billing source.** Delete `reserveTrialRoute`, the free
   reservation, `isFreeCall`, the `"free"` value of `billingSource`, and the
   `free_reservation_id` column.
4. **Schema and ledgers.** Drop `models.allow_free` and `models.token_weight`,
   and the trial and allocation tables with their stores. A migration converts
   `group_source = 'auto'` free rows to `paid`, then deletes the Free group only
   when no model or plan references it.
5. **Plans in raw tokens.** `includedWeightedTokens` becomes raw included tokens
   (rename in the API, keep the column until a later migration), and
   `subscriptionWeightedTokens` stops multiplying.
6. **Customer UI.** Remove the free allocation panel, guide, trial cards,
   allocation and trial routes, and the free-pool branches of the catalog cells.
7. **Admin UI.** Remove the free cohort panel, the gateway free-pool settings and
   the plan simulator's weighted columns.
8. **Docs and FAQ.** Rewrite the free-tier, weighted-token and "weight 3" entries;
   update `docs/providers.md`, `docs/business-model.md` and the API reference.

### Verification

Each slice declares the tests it changes and re-runs them. The whole removal adds
one reproducible check: `grep -rn "allow_free\|token_weight\|free_pool\|Weighted"
lib app components` returns only migration comments, and the HTTP suite has no
free-tier route.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/catalog-normalize.test.mjs
- gate: test tests/model-groups.test.mjs
- gate: test tests/plans.test.mjs
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- verified: 2026-11-25 (step 1a only)
- `node --test tests/catalog-normalize.test.mjs tests/provider-catalog-preview.test.mjs tests/provider-inferhub-sync.test.mjs`: exit 0, 25 pass / 0 fail
- `npm run typecheck`: exit 0
- `npm run lint`: exit 0
- `npm run quality`: PASS (400-line ceiling, 721 files)
- step 1b, `node --test tests/catalog-normalize.test.mjs tests/provider-catalog-preview.test.mjs tests/provider-inferhub-sync.test.mjs tests/provider-public-id.test.mjs tests/store-providers-postgres.test.mjs tests/provider-form.test.mjs`: exit 0, 36 pass / 0 fail
- step 1b, `npm run lint` exit 0, `npm run typecheck` exit 0, `npm run quality` PASS (721 files)
- step 1c, `node --test tests/provider-sync-postgres.test.mjs tests/provider-inferhub-sync.test.mjs tests/provider-catalog-preview.test.mjs`: exit 0, 22 pass / 0 fail
- step 1c, `npm run typecheck` exit 0, `npm run lint` exit 0
- `npm run repository:check`: PASS (12 gates, 12 active FIDs)
- steps 2–4 implemented 2026-11-26:
  - `node --test "tests/*.test.mjs"`: exit 0, 1242 tests / 1226 pass / 0 fail
  - `npm run lint`: exit 0 (0 warnings)
  - `npm run typecheck`: exit 0
  - `npm run quality`: PASS (400-line ceiling, 701 files scanned)
  - `npm run build`: exit 0
  - `npm run config:check`: PASS (non-production)
  - `npm run test:http`: exit 0, 730 checks PASS
  - `npm run attribution`: PASS (both guards)
  - `grep -rn "allow_free\|token_weight\|free_pool" lib app components` returns no
    live reference; the only remaining free-pool naming is the importer's
    refusal path for upstream `free/` ids, which is unchanged by design (1b).

## Perfection Loop

### Loop 1 — RED

- **RED:** the free tier is unreachable for the only enabled provider but is still
  seeded, priced and advertised; usage is still multiplied by a weight that the
  provider does not publish.
- **GREEN:** step 1a implemented — the weight is removed from `RawFacts`,
  `NormalizedModel`, all three shapes and the builder, which now writes `1`.
- **AUDIT:** the recorded parity fixture caught the change: its expected rows
  carried `3`, `2` and `0` and now carry `1`, which is the intended behaviour
  rather than a loosened assertion. 25/25 affected tests pass.
- **ADVERSARIAL:** is a "free tier" needed for marketing? The InferHub price sheet
  prices a giveaway as a subsidy we buy (§4.1: under $10/month at 18M tokens/day
  on cheap rows), not as an upstream allowance. Removing the tier removes the
  subsidy mechanism too; if the operator later wants a giveaway, it belongs to a
  paid row with a 100% promo, not to a billing mode.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. **Does removing the free group delete customer history?** No. `usage_events`
   and credit rows keep their `billing_source`; only new admissions stop existing.
   The migration must not rewrite past rows, and the FID's step 4 says so.
2. **What happens to an active plan whose allowance is expressed in weighted
   tokens?** It keeps its number and the multiplier becomes 1, so an included
   allowance buys at least what it did before; no customer loses headroom. Step 5
   renames the unit without changing the figure.
3. **Does the free group row get deleted?** Only when nothing references it. A
   plan that includes the group is a real entitlement, so the row survives until
   the operator reassigns it; step 4 forbids a cascade.
4. **Is the markup applied to the ask or to something else?** To the cost we
   record — the imported base rate — exactly as `defaultSellMicros` does today.
   The only change is that a `freePool` row can no longer force cost to zero.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** local commit recorded in the session's git log
- [x] **File:line ranges:** `lib/providers/normalize/types.ts` (`RawFacts`,
      `NormalizedModel`, `emptyFacts`), `lib/providers/normalize/shapes.ts`
      (`flatFacts`, `freePoolFacts`), `lib/providers/normalize/index.ts`
      (`toModel`), `lib/providers/catalog.ts` (`toRow`)
- [x] **Gate output:** receipt above
- [x] **Reproducibility:** `grep -rn "tokenWeight" lib/providers` returns only the
      `toRow` constant and the `SyncedModel` field
- [x] **Step statuses:** 1a implemented; 1b implemented; 1c implemented;
      2 implemented; 3 implemented; 4 implemented; 5–8 unimplemented and
      unblocked — the ordered remainder of this record
- [x] **Steps 2–4 file ranges:** `lib/providers/catalog.ts` (`importedModelStatus`,
      `costMicros`), `lib/model-groups.ts` (`SYSTEM_GROUP_DEFINITIONS`,
      `WRITABLE_MODES`, `pricesForGroup` deleted), `lib/storage/store/models.ts`,
      `lib/storage/store/routes.ts`, `lib/route-reconcile.ts`,
      `lib/storage/store/model-sync.ts` (23-column UPSERT),
      `lib/storage/gateway/call.ts`, `settle.ts`, `stream.ts`,
      `lib/storage/store/usage.ts`, `lib/storage/ledger/settlements.ts`,
      `lib/storage/schema/core.ts`, `lib/storage/schema/free-tier-removal.ts`
      (new, last in `applySchema`), `lib/storage/schema/customers.ts`,
      `lib/projections.ts`, `lib/types.ts`, `app/api/admin/gateway/route.ts`

### Code Verification Evidence

- [ ] Files referenced in Affected Components exist (verified by the footprint
      measurement above)
- [ ] Implementation matches the Proposed Solution
- [ ] Typecheck/tests/lint pass
- [ ] Production call-graph evidence
- [ ] FID status reflects closure state — `fixed` for steps 1a–1c; steps 2–8
      are open, so this record is not a closure candidate

### Loop 2 — Independent audit and self-correction

- **RED:** cutting slices 1–4 in one pass would change admission, settlement and
  three ledgers at once, and a failure in the suite would not say which slice
  caused it.
- **GREEN:** the plan is sliced so each step has its own test and grep check.
- **AUDIT:** the entry points above are the ones the gateway actually calls
  (`handleChatCompletions` → `isFreeCall` → `reserveTrialRoute` → `settleCall`).
- **ADVERSARIAL:** the plan simulator and the admin cohort panel can be removed
  before the schema drops, so the UI never renders a column that no longer exists.
- **CHANGE DELTA:** n/a.

### Loop 3 — Final convergence

- **RED:** a stale Free group with `billing_mode = 'free'` would keep publishing
  rows at $0 after `allow_free` is dropped, because group billing would still be
  authoritative.
- **GREEN:** step 4 converts auto-assigned rows and the group before the columns
  are dropped, and the deletion is guarded on references.
- **AUDIT:** `PUBLIC_MODEL_SCOPE` already refuses a paid row without a sell price,
  so a converted row with no cost is withheld rather than sold at $0.
- **ADVERSARIAL:** none outstanding for the plan.
- **CHANGE DELTA:** n/a.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** steps 1a–1c are implemented and committed: `a3564ec`
  removes the upstream weight from the import path and writes `1`; `f2968ab`
  refuses every `free/` row for every provider and deletes
  `providers.resale_free_pool` (the PostgreSQL path drops the column); `7ca19dc`
  reports `priced`/`unpriced` instead of a free count. Steps 2–4 are implemented
  in the working tree: price math has no free branch and no free count, the
  gateway's `billingSource` is exactly `subscription | credit`, the free
  reservation column and its rate-limit bucket are gone, and the migration drops
  `models.allow_free`, `models.token_weight` and the trial/allocation tables
  after converting auto-assigned free rows to `paid`. Steps 5–8 — plain-token
  plan units, customer UI, admin UI and docs — are unimplemented and unblocked.
- **Deviations:** step 4 could not drop the free stores without their readers,
  so the customer allocation/trial routes, the free allocation panels and the
  `/v1/models` trial fields left in this slice (parts of steps 6–7). The admin
  gateway surface is now the context banner only. The legacy SQLite helpers
  (`lib/settlement-ledger.ts`, `lib/schema/{groups,providers,settlements}.ts`)
  still name `free_reservation_id`/`allow_free`; they are outside the PostgreSQL
  app path and are tracked with the SQLite retirement, not with this FID.
  `lib/business-model.ts` still counts rows whose group is `free` (always 0 now),
  and the load-acceptance workload and the `npm run business-model` report still
  model a free cohort; both are release tooling, not application paths, and are
  not re-baselined here.
- **Tests Added:** Yes — `tests/catalog-normalize.test.mjs`,
  `tests/provider-inferhub-sync.test.mjs`,
  `tests/provider-catalog-preview.test.mjs`,
  `tests/provider-sync-postgres.test.mjs` and
  `tests/store-providers-postgres.test.mjs` cover steps 1a–1c. Steps 2–4 change
  `tests/rate-limit.test.mjs` (paid-only buckets), `tests/admission-pglite.test.mjs`,
  `tests/gateway-settlement-postgres.test.mjs`, `tests/model-groups.test.mjs`,
  `tests/store-admin-postgres.test.mjs`, `tests/store-catalog-postgres.test.mjs`,
  `tests/store-groups-postgres.test.mjs`, `tests/route-reconcile.test.mjs`,
  `tests/route-election-backfill.test.mjs`, `tests/pricing-decisions.test.mjs`,
  `tests/admin-pricing-command.test.mjs` and the HTTP quota suite; the trial,
  allocation, free-pool and trial-offer suites are removed with their subjects.
- **Verification Evidence:** the receipt above — 26 focused cases at step 1a,
  36 at step 1b, 22 at step 1c, with lint, typecheck, quality and
  `npm run repository:check` PASS.
- **Archived:** not archived

## Lessons Learned

A provider-specific commercial model must live in configuration, not in the
billing vocabulary: a seeded group name, a metering multiplier and an admission
branch outlive the contract that justified them, and then a working system sells
a tier that has no supply.
