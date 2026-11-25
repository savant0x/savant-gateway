# FID: The public catalog and content tags tell the reader the truth

**Filename:** `FID-2026-1125-001-catalog-and-content-display-truth.md`
**ID:** FID-2026-1125-001
**Severity:** medium
**Status:** converged
**Created:** 2026-11-25 15:10
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Seven presentation and identity faults on the public model surface, plus one on
the content ingest path. A column that no row could fill was hidden instead of
showing a dash, so a fetch failure and a feature that does not exist read the
same; every “vs OpenRouter” cell read a dash because the two sides keyed on
different publishers; a model printed its storage id, so a row sold from a
non-default provider read `inferhub/cc/claude-fable-5`; a million-token context
window printed as `1000000`; and the operator's source tags never reached
Hacker News items, HuggingFace or Trendshift, so those items could never match a
model by tag. The catalog also spent a column repeating a free-pool multiplier
the rate column already implies.

No price, markup, settlement, entitlement or routing rule changes. The stored id
stays the primary key and the routing key; only what a reader sees changes.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `8004a33` on `main`, with the change in the working tree

## Detailed Description

### Problem

**D1 — the benchmark and list-rate columns disappear when empty.** At `8004a33`,
`components/catalog/model-catalog-table.tsx` computed `showBenchmarks` from
“at least one row is measured” and `showComparison` from
`comparisonAvailable(matched, skus.length)`, then omitted the `<th>`, the `<td>`
and the footnote paragraph for either column. A reader cannot tell a hidden
column from an absent feature, and a temporary OpenRouter fetch failure became
invisible: the footnote that exists to say “the list could not be fetched” was
itself inside the hidden branch.

**D2 — every “vs OpenRouter” cell read a dash.** `upstreamSlug`
(`lib/price-comparison.ts`) stripped only a leading `free/`, while
`buildCatalogComparison` keyed the public list on `model.id.split("/").slice(1)`
— a vendor prefix removed from one side only. Our ids carry the provider's
publisher prefix (`cc/claude-fable-5`, `cx/gpt-5.6-luna`) and the public list
carries the vendor's (`anthropic/claude-fable-5`, `x-ai/gpt-5.6-luna`), so no
row ever matched and the comparison was structurally dead once D1 stopped
hiding it.

**D3 — the reader saw the storage id.** `components/catalog/catalog-row.tsx` and
`app/models/[...id]/page.tsx` printed `model.id`. With two providers that is
`inferhub/cc/claude-fable-5`: the upstream account's slug and the publisher's
path, neither of which names the model a customer buys.

**D4 — the model name could be a path.** `lib/providers/catalog.ts` used
`model.name.trim() || displayNameFromId(model.upstreamId)`, so a payload that
echoes its path as the name (`cc/claude-fable-5`) published a path as a product
name.

**D5 — the context window printed as a bare digit string.** `1000000` and
`256000` rendered unchanged in the catalog row, the model page heading,
description and capability list, the comparison table and the landing price
engine.

**D6 — the model page lost both facts the table carries.** The table shows an
AA Benchmark score and an OpenRouter list delta; the detail page showed neither,
so a reader who opened a model lost the comparison that led there.

**D7 — a column repeated what the rate column already said.** Weight printed
`3×` on free rows beside a rate cell already labelled “Free pool”, spending a
column on every row for one number, and sorted on a value only free rows carry.

**D8 — operator source tags reached only some ingest kinds.**
`lib/content/ingest-source.ts` passed `source.config.tags` into `parseFeedReport`
(RSS and YouTube) and `lib/content/hackernews.ts` merged its own, so HuggingFace
and Trendshift items arrived untagged and could not match a model by tag.
`lib/content/linking.ts` also auto-published only on a title match.

### Expected Behavior

1. A column that can be empty is rendered with a dash and explained, never
   removed, so “unmeasured” and “no such feature” stay distinguishable.
2. Two ids that name the same weights compare equal regardless of which
   publisher prefix each side carries.
3. A page shows the model's own name. The stored id stays the routing key and is
   still what `/v1/models` publishes.
4. A declared name that is only a path falls back to a name built from the leaf.
5. A context window prints as readers say it; an unparseable value is left
   exactly as published.
6. The operator's tags apply to every kind the source produces.
7. An exact tag match may auto-publish on the same versioned, non-weak terms as
   a title match; excerpt and body text never do.

### Root Cause

Two different kinds of absence were collapsed into one condition (“no data” was
implemented as “no column”), and identity was compared on the stored string
instead of the thing it names. The displayed id is the storage key, which is
correct for routing and wrong for reading.

### Evidence

Read-only at `8004a33`, before the change:

```text
components/catalog/model-catalog-table.tsx:  const showComparison = comparisonAvailable(matched, skus.length);
components/catalog/model-catalog-table.tsx:  const showBenchmarks = measured > 0;
components/catalog/catalog-cells.tsx:        export function comparisonAvailable(matched, models) { return matched > 0 && models > 0; }
lib/price-comparison.ts:                     return upstreamId.trim().toLowerCase().replace(/^free\//, "");
lib/price-comparison.ts:                     const slug = upstreamSlug(model.id.split("/").slice(1).join("/"));
components/catalog/catalog-row.tsx:          {model.id}
lib/providers/catalog.ts:                    name: model.name.trim() || displayNameFromId(model.upstreamId),
lib/content/ingest-source.ts:                tags: source.config.tags,   // parseFeedReport only
lib/content/linking.ts:                      hit.evidence === "title",
```

After the change:

```text
lib/model-identity.ts:75           export function displayModelId(
lib/price-comparison.ts:84         export function upstreamSlug(upstreamId: string): string {
lib/price-comparison.ts:85           return canonicalModelKey(upstreamId.trim().replace(/^free\//, ""));
components/dashboard/format.ts:21  export function formatContextWindow(value: string | number | null | undefined) {
components/catalog/model-catalog-table.tsx:151  const columns = ["36%", "8%", "7%", "9%", "13%", "12%", "12%"];
lib/content/taxonomy.ts:105        export function applySourceTags(
lib/content/ingest-source.ts:259     item.tags = applySourceTags(item.tags, source.config.tags);
lib/content/linking.ts:187           (hit.evidence === "title" || hit.evidence === "tag"),
lib/providers/catalog.ts:25        function publicName(providerSlug: string, model: NormalizedModel) {
lib/types.ts:44                      upstreamSlug: string;
```

## Impact Assessment

### Affected Components

- `lib/model-identity.ts` — `displayModelId`
- `lib/price-comparison.ts` — the shared match key
- `lib/projections.ts`, `lib/types.ts` — `ModelSummary.upstreamSlug`
- `lib/providers/catalog.ts` — published model name
- `components/dashboard/format.ts` — `formatContextWindow`
- `components/catalog/*` — table, row, footnote, sort, benchmark card
- `app/models/page.tsx`, `app/models/[...id]/page.tsx`
- `components/compare/compare-rows.tsx`, `components/landing/model-price-engine.tsx`
- `lib/content/taxonomy.ts`, `lib/content/ingest-source.ts`, `lib/content/linking.ts`
- `components/content/coverage-panel.tsx`

### Risk Level

- [x] Medium: public-surface truth and content matching; no money math, routing
      or stored value changes.

## Proposed Solution

### Approach

One display projection and one match key, both shared. Nothing is duplicated per
page: `displayModelId` and `formatContextWindow` are the only formatters, and
`upstreamSlug` is the single comparison key for both sides of the public list.

### Steps

1. **Render the empty columns.** Remove `comparisonAvailable`, drop the
   `showBenchmarks`/`showComparison` conditionals from the table, the row and the
   footnote, fix the column widths, and let the footnote name the state:
   list unreachable, nothing matched, first sync running, or no source key.
2. **Key the comparison on the leaf.** Route `upstreamSlug` through
   `canonicalModelKey` (already the routing identity) and key the public list
   with the whole id instead of a hand-stripped one.
3. **Show the model's own name.** Add `displayModelId(id, upstreamSlug)`: strip
   the provider scope, strip a publisher path, keep a `free/` or `subscription/`
   tier because two SKUs of one weights family must stay apart. Carry
   `upstream_slug` into `ModelSummary` so the component can do it without a
   second lookup.
4. **Name a model by its leaf.** `publicName` drops a declared name that starts
   with the provider slug and falls back to the leaf title when the declared name
   is a path.
5. **Format the window once.** `formatContextWindow` renders `1M`/`256K` through
   the existing compact formatter, accepts an already-suffixed value, and returns
   anything unparseable unchanged; use it in all five places that print a
   window.
6. **Put the two facts on the detail page.** `ModelBenchmarkCard` reads the same
   `listBenchmarks` and `getOpenRouterModels` sources the table reads, and says
   “not measured”, “no exact counterpart” or “list could not be fetched” instead
   of a dash with no reason.
7. **Drop the redundant column.** Remove the Weight column and the `weight` sort
   key; the rate cell already states free-pool billing and the detail page still
   prints the multiplier.
8. **Apply source tags to every kind.** `applySourceTags` merges publisher tags
   first, then the source's, and `ingestSource` applies it after any fetch shape,
   so HuggingFace and Trendshift items carry the operator's tags. An exact tag
   match joins `title` as auto-publishable evidence under the same versioned and
   non-weak guard.
9. **Show the tags where they matched.** `CoveragePanel` renders up to three
   tags per linked item, linking to their topic pages.

### Verification

Unit coverage for the pure rules, and the full gate set for the surfaces:

- `tests/model-display-id.test.mjs` — publisher path, provider scope, `free/`
  tier retention, an unscoped id.
- `tests/price-comparison.test.mjs` — a publisher prefix is not part of the key;
  a namespaced catalog row matches the public list; only an exact slug matches.
- `tests/content-source-tags.test.mjs` — merge order, publisher tags first,
  de-duplication across case.
- `tests/content-link-eval.test.mjs` — an exact tag match links and
  auto-publishes when the policy allows it.
- `tests/catalog-sort.test.mjs` — the `weight` key is gone and the remaining
  keys keep their directions.

### Non-goals

- `/v1/models` keeps publishing the stored id: it is the string the gateway
  resolves and the string key entitlements are recorded under. A bare id there
  needs a coordinated rename across `models`, `plan_models` and the live
  association tables, and that is a separate, much larger change.
- No new data source. The card reads the benchmark and OpenRouter lists the
  catalog already reads and fails open to a dash.
- No change to ingest policy defaults: an operator must still enable
  auto-publish for tag evidence to review a suggestion automatically.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/model-display-id.test.mjs
- gate: test tests/price-comparison.test.mjs
- gate: test tests/content-source-tags.test.mjs
- gate: test tests/content-link-eval.test.mjs
- gate: test tests/catalog-sort.test.mjs
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- `npm run lint` exit 0; `npm run typecheck` exit 0 (`next typegen` + `tsc --noEmit`).
- `npm run quality` PASS, 400-line ceiling, 720 files scanned.
- `npm test` 1310 tests, 1294 pass, 0 fail, 16 skipped, 104.4 s.
- `npm run verify` and `npm run build` are recorded below at closure.

## Perfection Loop

### Loop 1 — RED

- **RED:** eight defects, each traced to a quoted line at `8004a33`; three of
  them (D1, D2, D3) compound, because the columns hid a comparison that could
  never have matched and the id shown was the storage key.
- **GREEN:** steps 1-9.
- **AUDIT:** every claim is a line in the pre-change tree, quoted above. The
  comparison failure is proved by the new test that fails against the old key
  (`cc/claude-fable-5` vs `anthropic/claude-fable-5` matched nothing) rather
  than by inspection alone.
- **ADVERSARIAL:** the strongest counter-argument is that hiding an empty column
  is the honest choice, because a column of dashes looks broken. Rejected: the
  column is not empty, the source was unreachable or nothing matched, and those
  are different facts a reader is entitled to see. A dash plus a stated reason
  is more honest than a missing column that cannot be told apart from an
  unimplemented feature.
- **CHANGE DELTA:** 0% — first pass.

### Missed Questions

1. **Does dropping the Weight column lose information?** No: the rate cell
   already says "Free pool" for those rows, the multiplier is still on the model
   page, and no sort depends on it after the key is removed.
2. **Can `displayModelId` collide two rows into one name?** Yes, deliberately for
   two SKUs of the same weights, which is why a `free/` or `subscription/` tier
   is kept. The link target and the visit still use the stored id, so two rows
   with one display name remain separately reachable.
3. **Does a tag-based auto-publish widen what can publish itself?** No: it
   reuses the same `versioned && !weak` guard as a title match. A tag is
   normalized at ingest and must equal a full alias, so it is at least as
   deliberate as a title. Excerpt and body evidence still cannot self-publish.
4. **Does the detail page now read two more sources per request?** Yes, and both
   fail open. `listBenchmarks` is one indexed read and `getOpenRouterModels` is
   the cached public list the catalog page already uses. The page is dynamic, so
   this is two reads on a detail view, not on the catalog list.

### Loop 2 — Independent audit and self-correction

- **RED:** step 1 as first drafted kept the footnote's structure and flipped only
  the two booleans, which left the "source key not configured" paragraph
  claiming the column was hidden — false once the column always renders.
- **GREEN:** every footnote branch states the dash it now produces, and the
  benchmark paragraph is chosen by `(benchmarkStatus?.matched ?? 0) > 0`, so the
  text follows the data rather than the layout.
- **AUDIT:** `grep -n "showComparison\|showBenchmarks" app components lib`
  returns only the `CatalogFilters` call site, which passes the loaded state as
  `comparisonLoaded`; the old predicates are gone rather than renamed.
- **ADVERSARIAL:** "a dashboard table whose columns never change width is worse
  than one that adapts." Answered: the widths are now fixed at one set
  (`36/8/7/9/13/12/12`) and the table stops reflowing between loads, which is
  the better of the two behaviours for a comparison table.
- **CHANGE DELTA:** ~9% of this record (the footnote branches and the widths).

### Loop 3 — Final convergence

- **RED:** residual risk that `formatContextWindow` mangles a value the provider
  published in a form the formatter does not recognise.
- **GREEN:** a suffixed value (`256K`) is passed through with its unit
  uppercased, a finite positive number is compacted, and anything else —
  including an em dash or a sentence — is returned exactly as published.
- **AUDIT:** `formatContextWindow` has four branches and no throw path;
  `Number("")` is caught by the empty-string guard before it.
- **ADVERSARIAL:** "the compact formatter rounds, so `131072` reads `131K`, which
  is not the advertised number." Accepted: the catalog is a comparison surface
  and the exact figure remains one click away in the model page's capability
  list, which states the window again; rounding is the display convention in
  every other column of the same table.
- **CHANGE DELTA:** <2% — converged.

## Resolution

- **Closed Date:**
- **Fix Description:**
- **Tests Added:**
- **Verification Evidence:**
- **Archived:**

## Lessons Learned

“No data” is not “no column”, and a comparison that silently matches nothing is
indistinguishable from a comparison that found nothing to compare. Both are
absence rendered as absence-of-surface, which the reader cannot audit. The same
mistake has a second shape here: the identity used to look a thing up was also
the identity printed for a human, and the two are not the same string.
