# FID: Catalog table clarity and the landing comparison

**Filename:** `FID-2026-1029-025-catalog-table-clarity.md`
**ID:** FID-2026-1029-025
**Severity:** medium
**Status:** closed
**Closed Against:** `ab73f5a`
**Archived:** 2026-10-30

Closure reconciliation: `app/page.tsx` builds catalog comparisons and the
landing model grid passes them to the shared table; provider catalog tests
exist. Full `npm run verify` exited 0 on 2026-10-30 before subsequent systems
repairs. Later catalog FIDs supersede the historical five-column layout.
**Created:** 2026-10-30 00:55
**Automation level:** 3
**YAGNI-Compliance:** Verified — same component, five columns instead of nine, no
new page and no new data source.

---

## Summary

The catalog table had nine columns inside a capped scroll box, printed
`not listed` in every row on the landing page because that page never received
the benchmark, and rendered a single flat price as two identical numbers. The
table is now five columns, unclipped, height set by its rows instead of an inner
scrollbar, and the comparison columns appear only when a comparison actually
exists. The landing page now passes the benchmark it was missing.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16
- **Commit/State:** `3395fc5` + working tree

## Detailed Description

### Problem

1. `components/landing/model-grid.tsx` called `ModelCatalogTable` without
   `comparisons`, so `matched` was 0 and all 44 rows printed `not listed`.
2. Nine columns forced a `78rem` minimum inside a `68rem`-tall scroll box: a
   horizontal scrollbar on 1280px screens and a cut-off table.
3. A paid row whose input and output rates are equal rendered `$2.60` twice, and
   an upstream row with a zero output rate rendered `$0.00`, which reads as free
   completion tokens.
4. Family, context, tools and weight each held a column for one short value.

### Expected Behavior

- The landing `#models` table shows the same comparison as `/models`.
- No horizontal or vertical scrollbar at desktop widths; the page scrolls.
- One number per price cell when input and output are equal, two when they
  differ, and a dash when a rate does not exist.
- `not listed` never appears; a missing comparison is a dash, and an unavailable
  benchmark hides the comparison columns with a one-line explanation.
- Mobile keeps the table inside its card with a scrollable region rather than
  widening the document.

### Root Cause

The table grew a column per data point while the landing page kept calling it
with the arguments it had before comparisons existed.

### Evidence

```text
before  model-grid.tsx      <ModelCatalogTable models pageSize />   (no comparisons)
        savant.css          .catalog-table { min-width: 78rem }
        row markup          Family | Context | Tools | Weight columns
        drex-v2.0           sell_input 52000, sell_output 0 -> rendered $0.00
after   model-grid.tsx      comparisons + benchmarkFetchedAt threaded from app/page.tsx
        savant.css          min-width 46rem (40rem below 1024px)
        row markup          Model (+ family · context · id) | Group | Savant | OR | vs list
```

## Impact Assessment

### Affected Components

- `components/catalog/model-catalog-table.tsx` — layout, `RateCell`, pills
- `components/landing/model-grid.tsx`, `landing-page.tsx`, `app/page.tsx`
- `lib/providers/catalog.ts` — zero output rate falls back to the input rate
- `styles/savant.css`
- `tests/provider-catalog.test.mjs` (+2)

### Risk Level

- [x] Medium: the catalog is the pricing surface; a wrong or hidden price is a
      commercial problem even when the code is fine.

## Proposed Solution

### Approach

Fold the one-value columns into the model cell's meta line, keep group, weight
and capability icons in one cell, and give prices their own columns with a single
`RateCell` that decides between one number and two. The delta becomes a pill on
input with the output difference in its tooltip, which removes the second delta
line entirely. `comparisonAvailable` treats zero matches as "benchmark missing",
because 44 rows against a 456-entry list overlapping zero times is not a real
state.

The zero-output rule is applied at ingest, where it belongs: no upstream sells
completion tokens for free, so a published `0` is a missing figure and falls back
to the input rate. A malformed figure still makes the row unknown, which keeps
the existing pricing guard honest.

### Steps

1. Five-column layout with colgroup widths and no inner scroll. — implemented
2. `RateCell` for equal/different/missing rates. — implemented
3. Comparison hidden when unavailable, with an explanation instead of 44
   `not listed` cells. — implemented
4. Landing page fetches the cached benchmark and threads it to the table. —
   implemented
5. Zero output rate falls back to input at ingest, with tests. — implemented

### Verification

- `npm test` — 169 pass (2 new catalog tests).
- Browser at 1280px: `/models` and `/#models` both render 5 columns, 44 rows,
  table width 1197 inside a 1197 region — no horizontal or vertical scrollbar,
  document overflow 0, 18 delta pills on the landing page, summary reads
  "34 compared with OpenRouter · 16 below its list price".
- Browser at 390px: region 339px scrolls its 726px table, the card does not
  overflow, document overflow 0.
- `npm run lint`, `npm run typecheck`, `npm run build` clean.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/provider-catalog.test.mjs
- gate: test
- gate: build

### Verification Receipt

```text
npm test                169 tests, 169 pass
npm run build           pass
/#models @1280          5 headers, 18 pills, scrollX false, docOverflow 0
/#models @390           inner scroll only, cardOverflow 0, docOverflow 0
"not listed" occurrences 0
```

## Perfection Loop

### Loop 1 — RED

- **RED:** Landing page printed `not listed` for all 44 rows and the table
  scrolled inside its own box.
- **GREEN:** Benchmark threaded through, five columns, no inner scroll.
- **AUDIT:** The comparison is computed once per request from a six-hour cache;
  the table only displays what it is given, so a benchmark outage cannot affect
  its own prices.
- **ADVERSARIAL:** Hiding the comparison when `matched === 0` could hide a real
  zero-overlap catalog. With 44 rows against 456 listed models that is
  implausible, and the page states the comparison is unavailable rather than
  silently omitting a column.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Should the console catalog get the comparison too? → Not yet; it is an
   operator view with ten rows per page, and it was not the surface under
   discussion.
2. Does a single price hide a real difference? → Only when input and output are
   equal, which the tooltip states; two numbers are shown whenever they differ.
3. Is the table still usable on a phone? → It scrolls inside its card, which is
   the honest option for five columns; the document no longer widens.
4. What about existing rows with a stored zero output price? → Their sell rate is
   still zero in the database until the next sync recomputes it from the fixed
   ingest rule; the table now shows the input rate instead of `$0.00`, so the
   display stops claiming free output immediately.

### Implementation Evidence (REQUIRED for `closed`)

- [x] File:line ranges — `components/catalog/model-catalog-table.tsx:39-70,
    290-410`, `app/page.tsx:1-25`, `lib/providers/catalog.ts:120-132`
- [x] Gate output — above
- [x] Browser evidence — above
- [x] Step statuses — all implemented

## Resolution

- **Closed Date:** 2026-10-30
- **Fix Description:** Five-column catalog without inner scrolling, honest price
  cells, comparison on the landing page, and a zero output rate treated as a
  missing figure at ingest.
- **Tests Added:** Yes — `tests/provider-catalog.test.mjs` (+2).
- **Verification Evidence:** Gate receipt and browser measurements above.
- **Archived:** pending

## Lessons Learned

A shared component called without an argument fails quietly: the landing page
rendered 44 "not listed" cells for weeks of commits without a single error. The
table now says what it means instead of what it does not know.
