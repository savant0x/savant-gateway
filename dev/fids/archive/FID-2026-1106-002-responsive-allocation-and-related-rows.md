# FID: Responsive free-model allocation and related-reading rows

**Filename:** `FID-2026-1106-002-responsive-allocation-and-related-rows.md`
**ID:** FID-2026-1106-002
**Severity:** low
**Status:** closed
**Created:** 2026-11-06 18:15
**Automation level:** 3
**YAGNI-Compliance:** Verified — two existing surfaces gain the smallest layout
fix and reuse the existing `ContentMedia` row variant; no new component, route
or dependency.

## Summary

The free-model detail page overflowed a 390 px viewport by 214 px because its
content grid column lacked `min-w-0`; the free-allocation `curl` walkthrough set
the column's minimum width to 588 px. The same page mix also left the Signal
detail page's text-only "Related reading" list without thumbnails, unlike the
model-page coverage rows. Both are repaired and the browser matrix now asserts
the empty free-model document width and the related-reading rows.

This record was written after the repair. The Perfection Loop below is a
reconstruction and the deltas are disclosed rather than presented as a
pre-code convergence.

## Detailed Description

### Problem

At 390 px the empty free-model page reported `documentElement.scrollWidth` 214 px
wider than the viewport. The browser matrix's offender list placed the 588 px
`div.space-y-6` content column inside a 358 px content box. The free-allocation
guide's `pre` is horizontally scrollable, but its flex ancestors could not
shrink, so the column adopted the guide's minimum width.

The Signal detail page rendered related items as compact `ContentCard`s with no
media. The model coverage work had already added a validated `ContentMedia`
row variant with thumbnail precedence, a video dialog and separate title links.

### Expected Behavior

- A free-model page, including the empty-coverage state, has no horizontal
  document overflow at 390 px.
- The `curl` block scrolls inside its own box; the page does not.
- Related reading rows show the stored thumbnail, then the GitHub OG image, then
  the shared Signal fallback, and keep the title as its own `/signal/{id}` link.
- A valid related video opens the existing dialog; a row without a valid video
  creates no iframe.

### Root Cause

The model page's left grid column had no `min-w-0`, and the guide's step
wrappers were flex items with automatic minimum widths. The `pre` therefore
expanded the column instead of scrolling. Related reading predated the row
variant.

### Evidence

```text
browser-matrix: mobile layout overflows by 214px:
  div.space-y-6 width 588 at left 16 on a 390px viewport
scripts/browser-matrix.mjs   empty-page section check, no document check
components/content/content-detail-aside.tsx   compact cards, no media
```

## Proposed Solution

1. Add `min-w-0` to the model page content column and to the free-allocation
   guide step wrappers, leaving the `pre`'s own `overflow-x-auto` intact.
2. Render related reading as the existing `ContentMedia` row variant plus a
   title link and source/date line.
3. Assert the whole empty free-model document has no horizontal overflow, and
   assert one seeded related row carries a thumbnail, a title link and no
   iframe.

## Verification Gates

- gate: lint
- gate: build
- gate: test_browser — full matrix on the current production build
- gate: verify — full sequential gate run
- gate: repository:check

### Verification Receipt

- verified: 2026-11-06 (full gate and browser matrix)
- build: exit 0; production build `0zm_Bb4Z79zlK7_rqLpy1`
- lint: exit 0, zero warnings
- `npm run test:browser`: 14/14 journeys PASS on build
  `0zm_Bb4Z79zlK7_rqLpy1`, including `model coverage rows and empty state` at
  390 px and the related-reading row assertion
- full `npm run verify`: PASS — 12/12 gates, 1,124/1,124 tests with zero skips,
  PostgreSQL 20/20, HTTP suites, recovery, build, 191.4 s

## Perfection Loop

### Loop 1 — RED

- **RED:** the empty free-model page overflows by exactly 214 px and the browser
  matrix named the 588 px grid column as the offender. Related reading had no
  media.
- **GREEN:** `min-w-0` on the grid column and guide rows; `ContentMedia`
  `variant="row"` in related reading.
- **AUDIT:** the `pre` keeps `overflow-x-auto`, so narrowing the column moves the
  scroll into the code block instead of clipping it.
- **ADVERSARIAL:** `min-w-0` can turn an overflow into a clipped or unscrollable
  block if the inner scroll container is removed. The browser assertion measures
  the document, and the existing matrix still opens the coverage video dialog
  at both widths.
- **CHANGE DELTA:** about 2%.

### Loop 2 — Independent audit

- **RED:** the old matrix checked only the empty Coverage section width, not the
  page's document width, which is how the 214 px overflow survived.
- **GREEN:** `assertNoHorizontalOverflow` now reports the offending elements and
  runs on the empty free-model page.
- **AUDIT:** the first diagnostic run reproduced 214 px and the 588 px column;
  the post-fix run passes 14/14.
- **ADVERSARIAL:** a screenshot alone would not prove width. The assertion uses
  `scrollWidth` and computes each offender's right edge.
- **CHANGE DELTA:** test-only, 0% product behavior.

### Loop 3 — Final convergence

- **RED:** related rows could regress to nested controls or an eager iframe.
- **GREEN:** the row uses the existing separate link/button media control; the
  assertion checks the title link, one thumbnail and zero iframes before
  activation.
- **AUDIT:** build, lint and the full browser matrix pass.
- **ADVERSARIAL:** a green gate run does not prove the row renders. The browser
  matrix asserts the seeded related row and the empty-page document width on
  the verify build itself.
- **CHANGE DELTA:** stable.

## Implementation Evidence

- [x] **Files:** `app/models/[...id]/page.tsx` (column `min-w-0`),
  `components/catalog/free-allocation-guide.tsx` (step wrappers),
  `components/content/content-detail-aside.tsx` (row list),
  `scripts/browser-matrix.mjs` (offender diagnostics, empty-page document
  assertion, related fixture and assertions).
- [x] **Gate output:** build exit 0; lint exit 0 with zero warnings; browser
  14/14 on build `0zm_Bb4Z79zlK7_rqLpy1`; full `npm run verify` 12/12 gates
  with 1,124/1,124 tests and PostgreSQL 20/20.
- [x] **Reproducibility:** `npm run build && npm run test:browser`; the matrix
  fails with the offender list if the overflow returns.
- [x] **Full verify:** PASS, 191.4 s, on the same build.
- [x] **Commit:** `64a30f0bdf496f27a17a6f17e140e57ee4911c0e`.

## Resolution

- **Closed Date:** 2026-11-06 18:25
- **Fix Description:** added `min-w-0` to the model detail content column and the
  free-allocation walkthrough rows, so the `curl` block scrolls in its own box;
  rendered Signal related reading with the existing `ContentMedia` row variant
  and a separate title link.
- **Tests Added:** the browser matrix now reports the offending elements on a
  width failure, asserts the whole empty free-model page at 390 px and asserts a
  seeded related-reading row's thumbnail, title link and zero pre-activation
  iframes.
- **Verification Evidence:** commit `64a30f0`; production build
  `0zm_Bb4Z79zlK7_rqLpy1`; full browser matrix 14/14; `npm run verify` PASS with
  12/12 gates, 1,124/1,124 tests, PostgreSQL 20/20 and 191.4 s.
- **Archived:** 2026-11-06 18:25

## Related audit

The separate archived-receipt audit is
[`dev/audits/2026-11-06-archived-fid-receipt-audit.md`](../../audits/2026-11-06-archived-fid-receipt-audit.md).
It found no stale build citation, one mislabeled commit, and four absent test
filenames that are planning, rejected or explicitly skipped references rather
than passing claims.
