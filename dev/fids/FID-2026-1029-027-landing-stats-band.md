# FID: Landing stats band

**Filename:** `FID-2026-1029-027-landing-stats-band.md`
**ID:** FID-2026-1029-027
**Severity:** low
**Created:** 2026-10-30 05:05
**Automation level:** 3
**YAGNI-Compliance:** Verified — one component and one CSS block, no new data, no
new section, no dependency.

---

## Summary

The catalog counters under the hero were four loose numbers: a tiny FontAwesome
icon, a number in body weight, and a letter-spaced label, with dividers appearing
only at the `lg` breakpoint. On mobile the four values had no separation at all
and the last two read as one block. They are now a bordered data band — one cell
per figure, a mono ordinal, display-face numerals, and a hairline that marks the
cell on hover.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16, Tailwind v4 + savant.css
- **Commit/State:** `c9d747c` + working tree

## Detailed Description

### Problem

```text
before  <div class="grid grid-cols-2 ... lg:grid-cols-4 lg:divide-x">
          icon + number (text-2xl)
          LABEL (text-xs uppercase)
```

1. No structure: dividers only existed from 1024px up, so at 390px the four
   figures floated in a two-column grid with nothing separating them.
2. The number was set in the body face at `text-2xl`, so it carried the same
   weight as page copy rather than reading as a figure.
3. Icon and number shared a line, so the icon competed with the value instead of
   labelling it.
4. The label spacing left "PAID & PLAN MODELS" wrapping into a second line with
   no baseline relationship to its value.

### Expected Behavior

- Every cell is bounded at every breakpoint, so four figures read as four
  figures.
- The value is the largest element in the cell and uses the display face.
- The icon sits with its label, not with the number.
- One hairline between the hero and the band, not two.

### Root Cause

The section was written as a Tailwind grid before the `savant` design language
existed, and was never revisited when the rest of the landing page moved to the
mono-label / display-numeral treatment (`section-kicker`, `engine-details`,
`.data-table`).

### Evidence

Measured before, at 390px: four cells, no borders, `grid-cols-2` only. After:
four cells at 170×134 with a 1px rule on every edge, document `scrollWidth` equal
to the viewport at both 390 and 1280.

## Impact Assessment

### Affected Components

- `components/landing/stats.tsx` — rewritten as a data band
- `styles/savant.css` — `.landing-stats*` block, `--red` token

### Risk Level

Low. Presentational only; the numbers are the same four the page computed
before (`modelCount`, `freeModelCount`, paid + subscription, distinct families).

## Proposed Solution

### Approach

Reuse the vocabulary already on the page rather than inventing one: mono ordinals
like the numbered value rows, display numerals like `engine-price`, and the same
hairline borders as the catalog table. The ordinal's `//` is the brand mark's
slash in `--red`, which also gives the section the red accent the brand uses.

### Steps

1. Replace the Tailwind grid with `.landing-stats-grid` / `.landing-stat`.
2. Add the per-cell ordinal, display-face value and icon-with-label footer.
3. Add `--red` (`#ff2a6d` dark, `#c8102e` light, matching the mark) and use it
   for the slash only.
4. Two columns below 800px, four above.
5. Drop the duplicate top border: the hero already draws it.

### Verification

- `npx tsc --noEmit` clean, `npx eslint components/landing/stats.tsx` clean.
- Rendered at 1280×900 and 390×844 on `localhost:3000`: four cells, equal
  heights, `scrollWidth == innerWidth`, `--red` resolving to `rgb(255,42,109)`.

## Verification Gates

- `npx tsc --noEmit` — pass
- `npx eslint components/landing/stats.tsx` — pass
- `npx prettier --check` — pass
- Visual: dark theme at 1280 and 390 (the app is pinned to `dark`)

### Verification Receipt

```text
npx eslint components/landing/stats.tsx   exit 0
npx tsc --noEmit                          exit 0

1280px  cols "299.5px ×4"   cell 300×131   gridBorderTop 0px   heroBorderBottom 1px
 390px  cols "170px 170px"  cell 170×134   docOverflow false
```

## Resolution

The counters are a bordered band at every width, with mono ordinals, display
numerals and a labelled icon.

## Lessons Learned

A section written before a design language exists will keep its original defaults
indefinitely, because nothing in the codebase points at it. Reading the rendered
page — not the component — is what surfaced it.
