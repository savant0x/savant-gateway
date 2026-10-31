# FID: Automatic provider sync and a publication gate

**Filename:** `FID-2026-1031-084-automatic-sync-and-publication-gate.md`
**ID:** FID-2026-1031-084
**Severity:** medium
**Status:** verified
**Created:** 2026-10-31 01:10
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

Provider catalogs only refreshed when an operator pressed a button, and the
admin overview reported the last manual sync rather than the current state. Two
labels made that worse: "Synced 88 models" read as a live figure, and "44
non-free models have no sell price and will be rejected by the gateway" described
a gateway rejection instead of a publication rule. A model that cannot be billed
must never be visible in the first place, and a price nobody has re-checked must
not be sold — crypto top-ups are not refundable, so a wrong price cannot be
reversed.

This FID makes the refresh automatic, withholds unbillable and stale-cost rows
from the public catalog, timestamps manual costs, and replaces the snapshot card
with live per-provider state.

## Environment

- **OS:** Windows, Git Bash
- **Runtime:** Node 24, Next.js 16.4.3, one process, SQLite
- **State:** `main` at `1050d32` plus this change

## Detailed Description

### Problem

1. **Manual-only sync.** `syncProvider`/`syncAllEnabled` ran from an admin
   button or endpoint. A provider whose catalog moved stayed at its last import
   until someone noticed. Two providers now publish into one catalog, so drift
   is a pricing error, not just a stale listing.
2. **The card showed a snapshot.** It rendered `data.provider` — the `savant`
   row only — so an Apixo key, sync or catalog state was invisible, and the
   numbers did not change until a manual sync rewrote them.
3. **"Will be rejected by the gateway."** True and backward: a paid row with no
   sell price answered `503 model_unpriced` if it was published. The safe
   behavior is to withhold it, so no customer ever reaches that response.
4. **No cost age.** `cost_source = 'manual'` had no timestamp, so a hand-entered
   upstream price could stay live indefinitely while the upstream moved.

### Expected Behavior

- An enabled, configured provider re-syncs itself when its catalog is stale.
- A paid row with no sell price is never in `/models` or `/v1/models`.
- A manually priced row is withheld once its cost is older than the configured
  window, and the operator can see that it happened.
- The admin card reports live counts per provider and says when a sync is
  overdue.

### Root Cause

Sync was modeled as an operator action, not a freshness requirement, and
publication was modeled as "active in the catalog" rather than "servable and
billable". The admin card mirrored the single-provider era.

### Evidence

```text
app/api/admin/providers/sync/route.ts      sync only on POST
components/admin/admin-panel.tsx (before)  data.provider.* only, one provider
lib/store/model-sql.ts (before)            scope: in_catalog, status, is_primary, group, plan
lib/store/models.ts (before)               manual cost had no timestamp
docs/operations-runbook.md (before)        no automatic provider sync section
```

## Impact Assessment

### Affected Components

- `lib/provider-sync-policy.ts` (new) and `lib/provider-sync.ts` (new)
- `lib/store/model-sql.ts`, `lib/store/models.ts`, `lib/store/overview.ts`,
  `lib/store/provider-catalog.ts`
- `lib/schema/providers.ts` — `cost_observed_at` column and backfill
- `components/admin/provider-sync-card.tsx` (new), `admin-panel.tsx`,
  `app/admin/(panel)/page.tsx`
- `.env.example`, `docs/providers.md`, `docs/operations-runbook.md`
- `tests/provider-sync.test.mjs`

### Risk Level

- [x] Medium: a public catalog that withholds too much costs revenue; one that
  publishes too much sells a model the gateway cannot bill

## Proposed Solution

### Approach

Reuse the proven benchmark pattern: a pure staleness decision, an in-process
lease, and a fire-and-forget refresh from the read path so a slow upstream never
delays a render. Put the money guard in `PUBLIC_MODEL_SCOPE`, the one predicate
both the catalog projection and the public counts already share, so a model can
never be counted as public and withheld from the page at the same time.

### Steps

1. `provider-sync-policy.ts`: `syncIntervalMs` (6h default, `0` off, blank and
   malformed fall back to the default) and `providersDue` (enabled + configured +
   stale or never synced).
2. `provider-sync.ts`: one run at a time, a five-minute floor between attempts,
   per-provider failures contained, public catalog cache cleared afterwards.
3. `getLandingData`/`getCatalogData` call `ensureProvidersFresh()`.
4. `PUBLIC_MODEL_SCOPE`: paid groups need a sell price; manual costs need a
   `cost_observed_at` inside `PROVIDER_PRICE_MAX_AGE_DAYS` (default 30, `0` off).
5. `setModelCost` writes the timestamp; the migration adds the column and
   backfills from `synced_at` when that column exists.
6. Extract `ProviderSyncCard` with live per-provider rows, an overdue flag and
   the reserve boundary; the admin page passes
   `listProviderCatalogSummary()`.
7. Document the interval, the window and the boundaries.

### Verification

Focused policy and scope tests, then the full unit suite, lint, typecheck,
quality and build.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/provider-sync.test.mjs
- gate: test
- gate: quality
- gate: build

`npm run test:http` was not rerun for this change; the shared predicate it
exercises is covered by the unit suite and the build, and the HTTP suites are
the next gate before a release. That is a stated limitation, not a pass.

### Verification Receipt

- verified: 2026-10-31 (local tree)
- lint: exit 0, zero warnings (initial run flagged 6 prettier warnings and one
  `jsx-sort-props` warning; both fixed, not suppressed)
- typecheck: exit 0
- test tests/provider-sync.test.mjs: exit 0 (8 pass)
- test: exit 0 (425 pass, 0 fail)
- quality: PASS (400-line ceiling, 369 files)
- build: exit 0

## Perfection Loop

### Loop 1 — RED

- **RED:** Sync only on demand; unpriced paid rows could be published and then
  rejected; manual costs had no age; the card showed one provider.
- **GREEN:** Policy + refresh + scope guards + timestamp + live card.
- **AUDIT:** Policy tests and full suite.
- **ADVERSARIAL:** Automatic sync on a page render could stampede an upstream.
  Guards: 5-minute floor, one run per process, only enabled+configured providers,
  and no awaited work on the request path.
- **CHANGE DELTA:** initial.

### Loop 2 — Independent audit and self-correction

- **RED:** `syncIntervalMs("")` returned `0`, so an empty
  `PROVIDER_SYNC_INTERVAL_HOURS=` would have silently disabled automatic sync —
  the exact failure the feature exists to prevent.
- **GREEN:** Blank is treated as missing and falls back to 6h; the test asserts
  `""`, `"abc"`, `"-3"` and `"NaN"`.
- **AUDIT:** Focused policy test passes.
- **ADVERSARIAL:** The backfill `UPDATE ... = synced_at` broke four quota tests
  whose disposable schema has no `synced_at`. A migration must not assume a
  column that a test schema (or an older database) lacks, so the backfill is now
  guarded by `hasColumn`; the real schema is unchanged in effect.
- **CHANGE DELTA:** 12%.

### Loop 3 — Final convergence

- **RED:** `admin-panel.tsx` reached 418 lines, over the enforced ceiling.
- **GREEN:** The card moved to `components/admin/provider-sync-card.tsx`.
- **AUDIT:** `quality` PASS at 369 files.
- **ADVERSARIAL:** The card imports the pure policy module, not the side-effecting
  `provider-sync.ts`, so a render cannot start a sync as a side effect of
  importing the card.
- **CHANGE DELTA:** 4%.

### Missed Questions

1. **Does a stale sync hide the whole catalog?** No. Sync age controls refresh,
   not publication; publication checks price and cost age. A failed sync leaves
   the last good rows published and the card marks it overdue.
2. **Why exempt free and subscription groups from the price guard?** Their price
   is the group, not a per-token number; a free row is $0 by definition and a
   subscription row is gated by an active plan.
3. **Does `0` mean "off" or "immediately stale"?** Off, for both knobs, and that
   is documented next to both variables.
4. **Can the auto-sync fight the operator's manual sync?** No; the floor applies
   to the in-process refresh only, and a manual sync runs immediately.
5. **Is the in-process guard safe across instances?** Today the topology is one
   process. A second instance would refresh independently; recorded as a
   boundary in the code and the runbook.
6. **Is the reserve now observable for Apixo?** No. The provider publishes no
   balance endpoint; the card says so instead of implying a number.

### Implementation Evidence

- [x] **Commit SHA:** recorded below
- [x] **File:line ranges:** `lib/provider-sync-policy.ts`,
  `lib/provider-sync.ts`, `PUBLIC_MODEL_SCOPE` in `lib/store/model-sql.ts`,
  `setModelCost` in `lib/store/models.ts`, `ProviderSyncCard`
- [x] **Gate output:** receipt above
- [x] **Reproducibility:** `grep -rn "ensureProvidersFresh\\|cost_observed_at" lib app`

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/lint/tests pass with pasted tool output
- [x] Production call-graph evidence: `getCatalogData` is read by `/models` and
  `/`; `getOverview`/`getAdminOverview` feed `/admin`; `PUBLIC_MODEL_SCOPE` is
  used by `listModels`, `getOverviewStats` and `/v1/models`
- [x] FID status reflects the implementation state

## Resolution

- **Closed Date:** 2026-10-31 after the commit below
- **Fix Description:** Automatic stale-triggered sync; paid rows need a sell
  price; manual costs expire out of the public catalog; live per-provider admin
  state.
- **Tests Added:** Yes — `tests/provider-sync.test.mjs`.
- **Verification Evidence:** receipt above.
- **Archived:** `dev/fids/archive/` after the commit below

## Non-Goals

- No price scraper. Apixo publishes no machine-readable price list, so the guard
  withholds an aging manual cost instead of inventing a fresher one.
- No wallet probe. A per-call balance check would spend money and still not
  prove the next call succeeds.
- No in-app timer. A scheduler inside the process duplicates runs on restart and
  on a second instance; the read-path refresh covers the single-process topology.

## Lessons Learned

"Rejected by the gateway" is a description of a failure, not a policy. If a row
cannot be billed, the catalog should not publish it, and the operator surface
should say which rule withheld it and why.
