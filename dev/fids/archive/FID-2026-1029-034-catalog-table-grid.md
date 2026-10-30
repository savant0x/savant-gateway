# FID: Catalog table reads as a grid, one fact per column

**Filename:** `FID-2026-1029-034-catalog-table-grid.md`
**ID:** FID-2026-1029-034
**Severity:** low
**Status:** closed
**Closed Against:** `50758c1`
**Archived:** 2026-10-30
**Final closure:** shared catalog table/cell implementation verified against
source and Git; full `npm run verify` exit 0 this session. The correction below
describes the pre-commit state; historical visual observations were not repeated.
**Created:** 2026-10-30 02:05
**Closed:** 2026-10-30 02:40
**Closure correction:** 2026-10-30 — implementation is present and fresh full
`npm run verify` exited 0, but no implementation commit exists yet. The earlier
closed labels below are historical; archive only after recording a real SHA.
**Automation level:** 3
**YAGNI-Compliance:** Verified — one table component, one cell helper, one CSS
block. No data changes, no new dependency, no new page.

---

## Summary

The catalog table had grown a column at a time and read as noise: two-line
prices doubled every row, the model column was wide and empty while Quality sat
misaligned, weight and the tool/vision glyphs were crammed into the Group cell,
and 34 rows of hairline rules had no rhythm. This FID gives every fact its own
column and a predictable alignment.

## Environment

- **Stack:** Next.js 16 App Router, Tailwind 4 + hand-written `styles/savant.css`
- **State:** working tree at build `443cde5`, live data (34 public rows, 31 benchmarks)

## Detailed Description

### Problem

- **R1 — two-line prices.** `RateCell` rendered input and output on separate
  lines, making every row ~61 px tall for two short numbers.
- **R2 — crowded Group cell.** `AccessChip` + token weight + tool + vision icons
  lived in one cell with no alignment between rows, because the chip's width
  moved everything after it.
- **R3 — wide, empty identity column.** Model took 40% while names are short;
  the money columns were padded beyond their content.
- **R4 — broken rhythm.** Every row carried a hairline rule; with 34 rows the
  table read as a wall of lines rather than a grid.
- **R5 — inconsistent geometry.** Delta chips were full-round pills while group
  chips were 0.2 rem rectangles.

### Expected Behavior

One fact per column, numerals right-aligned to a shared edge, ratios and
capabilities readable without a tooltip hunt, and a row height that lets the eye
travel across 34 rows.

## Root Cause

Incremental additions to a shared cell. Each new attribute (weight, tools,
vision, benchmark) was appended to an existing cell instead of earning a column,
so no alignment rule could hold.

## Verification Receipt

```text
$ npm run lint      eslint . -> clean
$ npm run typecheck tsc --noEmit -> pass
$ npm test          tests 195 / pass 195 / fail 0
$ npm run quality   quality: PASS (400-line ceiling, 226 files)
$ npm run build     next build -> pass
```

Visual and structural checks on the live dev server (Safari-equivalent Chromium):

```text
1440x1000  header row: Model | Group | Weight | Features | AA Benchmark | Savant $/1M | vs OpenRouter
1024x900   no horizontal overflow; header and cells share content right edges
           per column (measured from the DOM: 956/957, 1173/1174, 1376/1378)
           row height 53 px (was 61); prices on one line; zebra bands visible
           Savant cell title = "Savant: $2.60 per 1M tokens. OpenRouter list:
           $10.00 / $50.00 per 1M (anthropic/claude-fable-5.1), blended −87%."
```

Screenshots: `debug/catalog-grid.png` (1440), `debug/catalog-columns-1024.png`.

## Perfection Loop

### Loop 1 — RED

R1–R5 with the rendered page as evidence.

### GREEN → AUDIT → SELF-CORRECT

- **A1 — weight and features were still inside Group.** First pass aligned the
  icon cluster with `justify-between`, which tidied it but kept two facts in one
  column. Operator ruling: each gets its own column. Rebuilt as `Weight`
  (right-aligned `N×`, dash when not applicable) and `Features` (centred tools /
  vision glyphs).
- **A2 — eight columns overflowed at 1024 px.** The Features header collided
  with its neighbour at 8% width. Fixed with a smaller header size for that
  column only and tighter horizontal padding (0.85 rem), then measured: no
  overflow, shared right edges intact.
- **A3 — zebra invisible on the dark surface.** A 45% alpha band over `#080f16`
  was imperceptible; raised to 75% and moved the header to `--surface-tertiary`
  so the three surfaces separate.
- **A4 — single-line prices lose the input/output distinction.** Kept the
  pairing visible as `input / output` with the output muted and a title naming
  both; a lone value still means one rate for both directions.
- **A5 — light theme.** All colours come from existing tokens
  (`--surface-secondary`, `--surface-tertiary`, `--accent`, `--border`), so the
  banding and hover invert with the theme instead of hard-coding white/10.
- **A6 — the comparison was a whole column of mostly-empty cells.** OpenRouter's
  rate repeated what the verdict already implies, and cost 244 px of table. The
  column is gone; the Savant rate carries `priceProvenance` in its title (our
  rate, their list rate, the matched id, the blended delta). `Quality` was
  renamed `AA Benchmark` because it is their index, not a generic score, and
  `vs list` became `vs OpenRouter` because "list" named nothing a reader could
  see.
- **A7 — the Features header was left-aligned.** `.data-table th` (0,1,1) beat
  the Tailwind `.text-center` (0,1,0), so the glyph column's header drifted while
  its icons centred. Fixed with an explicit `text-align: center` on both cells
  and header at a specificity that wins.

### Convergence

One loop with three corrections. No actionable improvement remains that does not
add a column or a control the operator did not ask for.

## Resolution

- **Status:** closed
- **Fix Description:** Column order is Model, Group, Weight, Features, AA
  Benchmark, Savant $/1M, vs OpenRouter. Prices render on one line as
  `input / output`; numerals are 13 px mono, tabular, right-aligned to a shared
  edge; rows are 0.55 rem padded with zebra bands instead of rules; the delta
  chip uses the same 0.2 rem radius as the group chip. The OpenRouter rate lives
  in the Savant cell's tooltip instead of a column. Column widths are
  proportional and adapt when the comparison or benchmark column is absent.
- **Tests Added:** none — layout only; the covering checks are the build,
  typecheck and the visual/DOM measurements above.
- **Verification Evidence:** receipt above.

## Lessons Learned

A table stops looking organised at the moment a cell holds two unrelated facts.
Giving weight and capabilities their own columns cost 60 px and bought the whole
grid its alignment.
