# FID: Sortable catalog columns and per-provider catalog sections

**Filename:** `FID-2026-1031-082-catalog-sorting-and-provider-sections.md`
**ID:** FID-2026-1031-082
**Severity:** medium
**Status:** verified
**Created:** 2026-10-31 23:40
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

Two gaps on the catalog surface. First, the table could only be reordered with a
four-option dropdown (name, family, input price up/down); none of the columns
the reader actually compares — group, weight, features, AA benchmark, rate, and
the OpenRouter delta — could be sorted. Second, nothing on the site showed what a
newly registered provider contributes: after adding a provider there was no
section that said how many models it had imported, how many were priced, or how
many published models it currently serves. The catalog page now sorts from every
column header, and the admin catalog opens with one card per provider.

## Environment

- **OS:** Windows, Git Bash
- **Runtime:** Node >= 22.18.0, Next.js 16.4.3
- **State:** `main` at `f44dee9` plus this change

## Detailed Description

### Problem

`ModelCatalogTable` sorted with `sort === "family" | "price-asc" | "price-desc"
| "name"`. The header row rendered plain `<th>` text, so no column was a control
and `aria-sort` was absent. A reader who wanted the cheapest rate, the strongest
benchmark or the largest saving had to scan, not sort.

The admin catalog listed a flat table of rows. After the routing work
(FID-2026-1031-081) a model can be owned by one provider and served by another,
and a second provider can own rows that serve nothing yet — none of which was
visible as a provider-level summary.

### Expected Behavior

- Every visible catalog column can be sorted from its header, both directions,
  with `aria-sort` announcing the state.
- A missing benchmark or comparison sorts last in both directions; it is not a
  zero.
- The admin catalog shows one section per provider with synced, active, priced,
  unknown-cost and currently-serving counts.

### Root Cause

The sort control was an afterthought attached to a filter row, not a property of
the table header. Provider-level aggregation existed only as a count on the
providers page (`modelCount`), with no view of priced/serving state.

### Evidence

```text
components/catalog/model-catalog-table.tsx (before): <th>Model</th> … no controls
components/catalog/catalog-cells.tsx (before): SORTS = name | family | price-asc | price-desc
components/admin/models-table.tsx: flat table, provider shown per row only
```

## Impact Assessment

### Affected Components

- `lib/catalog-sort.ts` (new) and `tests/catalog-sort.test.mjs`
- `components/catalog/catalog-sort-head.tsx` (new),
  `model-catalog-table.tsx`, `catalog-filters.tsx`, `catalog-cells.tsx`
- `lib/provider-catalog.ts` (new), `lib/store/provider-catalog.ts` (new),
  `lib/store.ts`
- `components/admin/provider-catalog-sections.tsx` (new),
  `app/admin/(panel)/catalog/page.tsx`
- `tests/provider-catalog.test.mjs`

### Risk Level

- [x] Medium: a wrong comparator misleads a pricing decision; a wrong
  provider count misstates which upstream is being paid

## Proposed Solution

### Approach

Keep the ordering rules pure and testable. The table decorates each row with the
values a comparator needs (benchmark index, comparison delta) and sorts only
when a header has been chosen; the default order stays the server's
free-first presentation. Provider counts come from one query over the same rows
the gateway serves, with serving defined as `is_primary = 1 AND
served_provider_slug = provider`, so a takeover is visible where it happened.

### Steps

1. `catalog-sort.ts`: keys for model, group, weight, features, benchmark, price,
   comparison; null-last rule; name tiebreak; no input mutation.
2. Header buttons with `aria-sort` and an active arrow; the redundant sort
   dropdown is removed.
3. `provider-catalog.ts`: per-provider counts including serving, over a database
   handle so it is testable; the store wrapper fills `configured` from the key
   variable name.
4. Admin catalog renders `Catalog by provider` above the table.
5. Tests for both pure layers.

### Verification

`tests/catalog-sort.test.mjs` (10 tests) and `tests/provider-catalog.test.mjs`
(3 tests), plus the existing catalog HTTP checks and the full unit suite.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/catalog-sort.test.mjs
- gate: test tests/provider-catalog.test.mjs
- gate: test
- gate: test:http
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-10-31 (local tree)
- lint: exit 0, zero warnings
- typecheck: exit 0
- test tests/catalog-sort.test.mjs: exit 0 (10 pass)
- test tests/provider-catalog.test.mjs: exit 0 (3 pass; first run failed on a
  serving count of 1 vs 2 — a real query defect, because serving was joined
  through the row's owning provider instead of every published row)
- test: exit 0 (416 pass)
- test:http: exit 0 (750 checks plus the trial suite)
- quality: PASS, 366 files (first run FAILED at `model-catalog-table.tsx` 428
  lines; the header cell was extracted to `catalog-sort-head.tsx`)
- build: exit 0

## Perfection Loop

### Loop 1 — RED

- **RED:** No column controls; no provider-level view.
- **GREEN:** Pure comparator + header controls; provider summary query + cards.
- **AUDIT:** 13 focused tests; existing catalog checks still pass.
- **ADVERSARIAL:** Sorting by price puts free/plan-included rows (`$0.00`) first.
  That is true to the column but not "cheapest to buy". The access chip and the
  `Free pool`/`In plan` label already say why the rate is zero, and the column is
  labelled `Savant $/1M`, not "cheapest" — no invented ordering.
- **CHANGE DELTA:** initial.

### Missed Questions

1. **Does sorting survive filtering and pagination?** Sort is applied after the
   filter and before the slice; changing either resets to page 1.
2. **Is a missing benchmark ever zero?** No — null sorts last in both
   directions and the cell still renders `—`.
3. **Can a provider appear twice?** No: the summary is grouped by provider slug,
   including providers with no models.
4. **Does the admin section expose the key?** No: it reports `key present` from
   the variable name only.
5. **Is the public page affected by the provider section?** No. Public pages stay
   white-label; provider identity is admin-only.

### Implementation Evidence

- [x] **Commit SHA:** `45dcb5a`
- [x] **File:line ranges:** `lib/catalog-sort.ts`,
  `components/catalog/catalog-sort-head.tsx`,
  `components/catalog/model-catalog-table.tsx`,
  `lib/provider-catalog.ts`, `lib/store/provider-catalog.ts`,
  `components/admin/provider-catalog-sections.tsx`,
  `app/admin/(panel)/catalog/page.tsx`
- [x] **Gate output:** receipt above
- [x] **Reproducibility:** `grep -rn "compareCatalogRows\\|providerCatalogSummaryIn" lib components`
- [x] **Step statuses:** 1–5 implemented

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output
- [x] Production call-graph evidence: `ModelCatalogTable` is rendered by `/`,
  `/models` and the console; `/admin/catalog` renders the provider sections from
  `listProviderCatalogSummary`
- [x] FID status reflects the implementation state

### Loop 2 — Independent audit and self-correction

- **RED:** The provider serving count was wrong: it joined through the row's
  owning provider, so a model owned by Savant but served by Apixo was not
  counted for Apixo.
- **GREEN:** Serving is now a correlated count over every published row.
- **AUDIT:** The test asserts `[2,2,2,1]` and `[1,1,1,2]`; before the fix it
  produced `[1,1,1,1]` for the second provider.
- **ADVERSARIAL:** A provider can serve a row it does not own, so "serving" and
  "owned" are deliberately different numbers. The copy says so.
- **CHANGE DELTA:** 12%.

### Loop 3 — Final convergence

- **RED:** `model-catalog-table.tsx` crossed the 400-line ceiling.
- **GREEN:** The header cell moved to its own component.
- **AUDIT:** `quality` PASS at 366 files; no other file is near the ceiling.
- **ADVERSARIAL:** Sorting is client-side over the loaded page set; the catalog
  is loaded whole (`pageSize = models.length` on `/models`), so sorting covers
  every row, not just the visible page.
- **CHANGE DELTA:** 4%.

## Resolution

- **Closed Date:** 2026-10-31 after the commit below
- **Fix Description:** Header-driven sorting for all seven catalog columns with
  `aria-sort`; per-provider catalog sections in the admin catalog.
- **Tests Added:** Yes — `tests/catalog-sort.test.mjs`,
  `tests/provider-catalog.test.mjs`.
- **Verification Evidence:** receipt above.
- **Archived:** `dev/fids/archive/` after `45dcb5a`

## Lessons Learned

A control that lives away from the thing it controls gets used less and drifts
from the data it sorts. Put the control in the header, and keep the ordering
rules pure so "missing is not zero" can be tested instead of trusted.
