# FID: InferHub router catalog — duplicate identities, publisher visibility and filters

**Filename:** `FID-2026-1125-003-inferhub-router-catalog-review.md`
**ID:** FID-2026-1125-003
**Severity:** high
**Status:** fixed
> The implemented steps are committed at `11a75de` and gated. `fixed` is the
> register's active implemented status
> (`scripts/repository-contract-check.mjs` admits `converged` or `fixed` for an
> active record); `closed` is a separate move that still needs a CHANGELOG entry
> and a move to `archive/`, and four decisions need the operator rulings named in
> Step Statuses. The 2026-11-26 ruling that InferHub is the only upstream makes
> those four rulings launch-critical rather than optional.
**Created:** 2026-11-25 00:00
**Automation level:** 3
**YAGNI-Compliance:** Verified — one derived field, one filter row, one prefix
table and their tests; no new table, module or dependency.

---

## Summary

InferHub is not a model provider: it is a router over many publisher accounts,
and its `/v1/models` sells one model from up to nine publishers at different
prices. The gateway already elects one row per route group, but the election is
invisible in `/admin/catalog` (every route prints the account slug `inferhub`)
and the identity key leaves twelve of the marketplace's 135 identities split
across separate published rows. This record measures both, makes the publisher a
first-class route fact with published/offer state and filters, folds the
publisher family spellings that made one model line look like several products,
and names the four decisions that a code change cannot make.

## Environment

- **OS:** win32 (Git Bash)
- **Language/Runtime:** Node v24.21.0, TypeScript strict
- **Tool Versions:** Next.js 16.4.6 (Turbopack), ESLint + Prettier, Node test runner
- **Commit/State:** implementation `11a75de` on top of `3b73d89`; the working
  tree is clean

## Detailed Description

### Problem

The operator reports four faults against a router upstream:

1. **Duplicate models** in the catalog.
2. **No filtering** over the imported catalog.
3. **No automatic cheapest selection.**
4. **No way to differentiate the upstream providers** behind one account.

Each claim was tested against the tree and the committed capture rather than
accepted as stated.

### Expected Behavior

One published row per model identity, a visible publisher and offer count so an
operator can tell eight offers from eight models, filters over the dimensions the
marketplace actually varies, and a serving route that follows the cheapest
offer — with the remaining money decisions explicit rather than implicit.

### Root Cause

Three separate causes, only one of which is a missing election.

- **The election exists.** `planModelRoutes` ranks servable rows by
  `routeCostMicros` and `compareRoutes`, and reconciliation writes
  `is_primary` and the winning `served_*` columns. `PUBLIC_MODEL_SCOPE` publishes
  only `is_primary = 1`. What is missing is *visibility*: `model-row.tsx`
  printed `servedProviderSlug ?? upstreamSlug` and
  `routes.map((r) => r.providerSlug)`, which is `inferhub` on every line, and
  `AdminModelSummary.isPrimary` was never rendered anywhere.
- **One provider row hides many publishers.** `ModelRouteSummary` carried
  `providerSlug` and `upstreamId` only. The publisher (`cc`, `cmc`, `zai`) is the
  first path segment of the upstream id, and the only code that knew the concept
  was a private `publisherPrefix` in `lib/model-family.ts`, used solely to reject a
  declared family that equalled the prefix.
- **The identity key is name-based and does not fold every spelling.** Proven by
  running the shipped `canonicalModelKey` over the committed 265-offer capture.

### Evidence

The shipped key over `docs/data/inferhub-offers.csv` (265 offers):

```text
offers 265 canonical groups 123
groups with >1 offer 66
9 kimi-k3 :: ali/kimi-k3 | alicn/kimi-k3 | cb/kimi-k3 | cbcn/kimi-k3 |
             cmc/moonshotai/Kimi-K3 | fw/kimi-k3 | kiro/kimi-k3 | moon/kimi-k3 | ocg/kimi-k3
8 deepseek-v4-1-flash :: alicn/deepseek-v4.1-flash | alicn/deepseek-v4.1-flash-1017 |
             alitp/deepseek-v4.1-flash | alitp/deepseek-v4.1-flash-1017 |
             cb/deepseek-v4.1-flash | cbcn/deepseek-v4.1-flash |
             cmc/deepseek/deepseek-v4.1-flash | ocg/deepseek-v4.1-flash
```

`docs/data/inferhub-price-sheet.csv` counts 135 identities over the same 265
offers, with 66 identities carrying more than one publisher and a maximum of 9
(`kimi-k3`). So the marketplace's own identity count exceeds the code's route
group count by twelve, and each of the twelve publishes as a duplicate row:

```text
ds/deepseek-flash          => deepseek-flash        (sheet identity: deepseek-v4-flash)
fw/deepseek-v4p1-flash     => deepseek-v4p1-flash   (sheet identity: deepseek-v4-1-flash)
cb/deepseek-v4.1-flash-sg  => deepseek-v4-1-flash-sg
cmc/deepseek/deepseek-v4.1-flash-fast => deepseek-v4-1-flash-fast
```

The import run recorded in `docs/research/inferhub-upstream-audit.md` §4 lands
255 priced rows in 116 groups, so 139 of the imported rows are non-primary
offers — legitimate, but indistinguishable in the admin table before this change.

Before the change the admin catalog's row printed:

```text
inferhub
inferhub · inferhub · inferhub · inferhub · inferhub · inferhub · inferhub · inferhub
```

## Impact Assessment

### Affected Components

- `lib/model-identity.ts` — publisher derivation
- `lib/model-family.ts` — family prefixes, publisher comparison
- `lib/model-route-types.ts`, `lib/route-reconcile.ts` — publisher on a route summary
- `lib/types.ts`, `lib/projections.ts` — `servedUpstreamId` on the admin summary
- `components/admin/model-row.tsx`, `components/admin/models-table.tsx` — state, publisher, filters
- `tests/model-identity.test.mjs`, `tests/model-family.test.mjs`
- `docs/providers.md`

### Risk Level

- [x] High: duplicate published rows and an invisible election are money and
      honesty faults on a paid catalog; no data loss or security exposure.

## Proposed Solution

### Approach

Make the publisher a derived route fact and render the state the router already
computes. Fold only the family spellings that are provably one line. Do not
widen the identity heuristic, because a wrong merge serves one model under
another's name, and do not change the election blend or add failover without the
rulings those changes need.

### Steps

1. Add `publisherFromModelId(id, upstreamSlug)` to `lib/model-identity.ts`,
   skipping the account scope and a billing tier; reuse the same scope helper in
   `displayModelId`.
2. Carry `publisher` on `ModelRouteSummary` and fill it in `routesByGroup`.
3. Carry `servedUpstreamId` on `AdminModelSummary` so the serving route is
   identified by upstream id, not by an account slug every route shares.
4. Render `served by` / `offer from` and `N offers · publisher…` per row, and
   mark the elected row `published` when the group has more than one offer.
5. Add a `Published` filter, a publisher chip row scoped to the selected
   provider, and publisher matching in the search box.
6. Add family prefixes for `qwen`, `hy4`, `minimax`, `zai` and `k3`, and compare
   a declared family against the derived publisher instead of a private prefix.
7. Tests for both modules.
8. Record the four operator-blocked steps (Step Statuses below).

### Verification

- `tests/model-identity.test.mjs` — publisher derivation, tier skip, null cases.
- `tests/model-family.test.mjs` — publisher spellings share a family.
- `tests/store-admin-postgres.test.mjs`, `tests/route-reconcile.test.mjs` — the
  admin route list and the election still behave.

## Verification Gates

- gate: lint — `npm run lint`, zero warnings
- gate: typecheck — `npm run typecheck`
- gate: test tests/model-identity.test.mjs
- gate: test tests/model-family.test.mjs
- gate: test tests/store-admin-postgres.test.mjs
- gate: test tests/route-reconcile.test.mjs
- gate: quality — `npm run quality`
- gate: build — `npm run build`

### Verification Receipt

- verified: 2026-11-25T00:00:00Z
- lint: exit 0 (`eslint . --max-warnings=0`)
- typecheck: exit 0 (`next typegen && tsc --noEmit`)
- test tests/model-identity.test.mjs tests/model-family.test.mjs: exit 0, 17 pass / 0 fail
- test tests/store-admin-postgres.test.mjs tests/route-reconcile.test.mjs: exit 0, 18 pass / 0 fail
- quality: exit 0, `PASS (400-line ceiling, 721 files scanned)`
- build: exit 0, Next.js 16.4.6, 23 static pages generated
- not run: `npm test` in full, `npm run test:http`, `npm run test:postgres`,
  `npm run verify` — the remaining suites do not exercise the changed modules,
  and the full gate set is the closure step

## Perfection Loop

### Loop 1 — RED

- **RED:** `isPrimary` never rendered; every route printed the account slug;
  `ModelRouteSummary` had no publisher; the publisher concept lived in a private
  helper used only to discard a bad family; `kcai/k3.1-pro` was family `K3` while
  `cb/kimi-k3` was `Kimi`; `mm/MiniMax-M3` and `cb/minimax-m3` were two families.
- **GREEN:** steps 1–7 implemented.
- **AUDIT:** 17 module tests, 18 store/routing tests, lint, typecheck, quality and
  build all exit 0.
- **ADVERSARIAL:** "Does the pure helper leak into the client bundle?" It is
  imported by a `"use client"` component and imports only a type; the build
  compiles and the module has no runtime imports. "Can the publisher change
  routing?" No — it is only read by `routesByGroup`, the projection and the table;
  `isServableRoute` and `compareRoutes` never see it.
- **CHANGE DELTA:** n/a (single pass).

### Missed Questions

1. **Is a two-segment id always `publisher/model`?** No. `resolveModel` also reads
   a legacy `family-rest` alias (`claude-opus` → `claude/opus`). The helper is
   therefore documented as a label and a filter, never a route key, and it is
   used nowhere in resolution or pricing.
2. **Should the customer see the publisher?** No. `/v1/models` publishes the
   display id and `owned_by: "savant-gateway"`; the publisher is a console fact
   only, which also keeps the upstream account out of a customer page.
3. **Does the family prefix table change an existing declared family?** Exact
   labels are consulted first, so `GPT`, `Claude`, `GLM` and the rest are
   untouched; only segments with no entry fall through to a prefix.
4. **Does the `Published` filter match the public catalog?** It matches
   `is_primary = 1`, which `PUBLIC_MODEL_SCOPE` also requires, so a filtered row
   still needs its group, price, eligibility and freshness to publish. The filter
   is a view of the election, not a publication override.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `11a75de` (`feat(admin): show publisher and published
      offers in the catalog`), which carries all twelve files in this record
- [x] **File:line ranges:** `publisherFromModelId` and the scope helper in
      `lib/model-identity.ts`; `FAMILY_PREFIXES` and `familyFromModelId` in
      `lib/model-family.ts`; `publisher` in `lib/model-route-types.ts` and
      `routesByGroup` in `lib/route-reconcile.ts`; `servedUpstreamId` in
      `lib/types.ts` and `toAdminModelSummary` in `lib/projections.ts`;
      `ModelRow` and `AdminModelsTable` in `components/admin/`
- [x] **Gate output:** receipt above
- [x] **Reproducibility:** `grep -rn "publisherFromModelId\|servedUpstreamId" lib components`
- [x] **Step statuses:** 1–7 `implemented`; 8 `blocked` (rulings below)

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted output
- [x] Production call-graph evidence: `listAllModels` → `routesByGroup` →
      `toAdminModelSummary` → `AdminModelsTable` → `ModelRow`
- [x] FID status reflects closure state — `fixed`, not `closed`

### Loop 2 — Independent audit and self-correction

- **RED:** the first edit left four Prettier warnings and the lint gate failed
  closed at `--max-warnings=0`; the admin table's publisher labels would not have
  been exercised by any existing test.
- **GREEN:** formatted by hand (no scripted transform over project files);
  publisher derivation and family folding each got dedicated cases, including the
  tier-prefixed `free/grok/grok-4.5` id.
- **AUDIT:** lint exit 0 after the correction; the 17 module cases and 18
  store/routing cases pass.
- **ADVERSARIAL:** the identity split is still live — this record does not claim
  to have merged the twelve split identities, and `docs/providers.md` now states
  the measured gap in the same words as this record.
- **CHANGE DELTA:** ≈15% (formatting and tests).

### Loop 3 — Final convergence

- **RED:** a reader could take "publisher is shown" as "publisher is verified".
  The value is derived from the id, and the marketplace does not prove which
  weights answered.
- **GREEN:** both the helper's doc comment and `docs/providers.md` call it a
  console label and a filter, and the existing provenance finding
  (`docs/research/inferhub-upstream-audit.md` F-13) stays the authority on the
  claim we make.
- **AUDIT:** `grep -rn "publisher" lib components/admin` shows the value is read
  only by the route summary and the table.
- **ADVERSARIAL:** none outstanding for the implemented scope.
- **CHANGE DELTA:** 5%.

## Step Statuses

| Step | Status | Detail |
| --- | --- | --- |
| 1–7 | implemented | See Implementation Evidence |
| Identity aliases | blocked | Merging `ds/deepseek-flash` with `alicn/deepseek-v4-flash` (and the other eleven) is an operator-authored identity decision: a wrong merge serves one model under another's name and misprices it. Needs the alias list, or approval of a curated table with a dated decision per merge. |
| Election blend | blocked | `routeCostMicros` ranks at 3 input : 1 output, while every price analysis in `docs/research/` uses 1 input : 4 output. On InferHub's output-heavy offers the two orders disagree, so changing it changes which publisher serves and what a call costs. Operator ruling required. |
| Failover | blocked | `planModelRoutes` returns a `ranking`, but a `429 capacity_saturated` from the elected publisher is returned to the customer; the next candidate is never tried. This is a hot-path change with its own settlement and reservation consequences, so it needs its own FID. |
| Stable published row | blocked | A group with no unscoped row publishes its cheapest offer (`lib/model-routing.ts`), so `is_primary` moves with the market. `plan_models.model_id` references the stored id, so an individually included plan model can drop out of `PUBLIC_MODEL_SCOPE` when the election moves. Needs the operator's choice: persist a representative row, or key plan inclusions to the route group. |

## Resolution

- **Closed Date:** not closed
- **Commit:** `11a75de`.
- **Fix Description:** publisher derivation and display, published/offer state,
  publisher and published filters, family prefix folding, and measured
  documentation of the identity gap.
- **Tests Added:** Yes — 3 publisher cases and 2 family cases.
- **Verification Evidence:** receipt above.
- **Archived:** not archived

## Lessons Learned

An election that exists only in a column is not a feature an operator can trust:
one provider row selling many publishers made every route print the same name, so
the dedupe looked like duplication. Surface the decision next to the rows it
decides, and measure an identity heuristic against the marketplace's own count
before calling the catalog deduplicated.
