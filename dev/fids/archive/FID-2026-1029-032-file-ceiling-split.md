# FID: File-ceiling split for the gateway and the catalog table

**Filename:** `FID-2026-1029-032-file-ceiling-split.md`
**ID:** FID-2026-1029-032
**Severity:** low
**Created:** 2026-10-30 07:20
**Automation level:** 3
**YAGNI-Compliance:** Verified — code moved, not rewritten. No new behavior, no new
state, no new dependency.

---

## Summary

`npm run quality` fails on two files that were already over the 400-line ceiling
at `HEAD`: `lib/gateway.ts` (412 at HEAD, 413 reported) and
`components/catalog/model-catalog-table.tsx` (467 at HEAD, 468 reported). Both
are split along the seams they already have — request resolution versus routing
in the gateway, and cells/filters/footnote in the table — so the ceiling is met
without touching a single behavior.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16, HeroUI v3
- **Commit/State:** `a21dff2` + working tree

## Detailed Description

### Problem

`scripts/quality-report.mjs` enforces `max_file_lines: 400` over `app/`,
`components/`, `config/`, and `lib/`. Two files exceed it, so the gate exits
non-zero and the pre-push hook fails closed. Both were over before this session's
changes: `git show HEAD:lib/gateway.ts | wc -l` is 412 and
`git show HEAD:components/catalog/model-catalog-table.tsx | wc -l` is 467.

The gateway mixes model-id resolution and upstream-error translation with the
request pipeline. The table mixes three presentational pieces — the filter bar,
the row cells and the price footnote — with its state machine.

### Expected Behavior

- `npm run quality` PASS.
- `lib/gateway.ts` and `components/catalog/model-catalog-table.tsx` each under
  400 lines.
- No behavior change: same resolution order, same error mapping, same filters,
  same sort order, same copy, same DOM structure and classes.
- Every extracted module stays under the ceiling as well.

### Root Cause

Both files grew by accretion; the ceiling is recent, and neither was split when
it was introduced.

### Evidence

```text
HEAD  lib/gateway.ts                          412 lines (413 reported)
HEAD  components/catalog/model-catalog-table.tsx  467 lines (468 reported)
gate  npm run quality -> FAIL (2 files over 400)
```

## Impact Assessment

### Affected Components

- `lib/gateway-resolution.ts` — new: model resolution, free verdict, upstream
  error mapping, retry headers
- `lib/gateway.ts` — imports them instead of defining them
- `components/catalog/catalog-cells.tsx` — new: rate cell, delta format, sort list
- `components/catalog/catalog-filters.tsx` — new: search, group/family/sort
  selects and the counts line
- `components/catalog/catalog-footnote.tsx` — new: the price and comparison notes
- `components/catalog/model-catalog-table.tsx` — owns state and rows only

### Risk Level

Low. Pure moves. The only seam that could bite is prop shape: the filter bar keeps
its callbacks and values in one props object, and the cells keep their exact
`RateCell` signature so both the Savant and OpenRouter columns render as before.

## Proposed Solution

### Approach

Move each unit verbatim into a module that already has a single responsibility,
then re-import. Nothing is renamed, reordered or "improved" during the move, so a
diff of the moved lines is a no-op apart from the import statements.

### Steps

1. Extract the five resolution/error helpers to `lib/gateway-resolution.ts`. —
   implemented
2. Extract `RateCell`, `formatDelta`, `deltaClass`, `comparisonAvailable`,
   `SortKey` and `SORTS` to `components/catalog/catalog-cells.tsx`. —
   implemented
3. Extract the filter bar with its counts to
   `components/catalog/catalog-filters.tsx`. — implemented
4. Extract the footnote block to
   `components/catalog/catalog-footnote.tsx`. — implemented
5. Gates plus a rendered-page check on the production build. — implemented

### Verification

- `npx eslint .` clean, `npx tsc --noEmit` pass, `npm test` pass,
  `npm run quality` PASS, `npm run build` pass.
- `npm start` against a copy of the database, then `/models` returns 200 and
  contains a known model name and the row count.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test
- gate: quality
- gate: build

### Verification Receipt

```text
npx eslint .            clean, 0 warnings
npx tsc --noEmit        pass
npm test                186 tests, 186 pass
npm run quality         PASS (400-line ceiling, 219 files scanned)
npm run build           pass
npm run test:http       http-suite 100 checks PASS; trial-http-suite PASS
/models (next start)    200; "34 models · 34 shown"; filter bar, search
                        placeholder and price footnote present
```

## Perfection Loop

### Loop 1 — RED

- **RED:** quality gate red on two oversize files.
- **GREEN:** split at existing seams.
- **AUDIT:** every moved function has a single caller module; grep confirms no
  duplicate definition remains in the original files.
- **ADVERSARIAL:** the filter bar owns `resetPage`; passing a callback that already
  resets must not double-reset. The extracted bar receives the same handlers, so
  the reset stays in the table where the page state lives.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Should the gateway be split by billing source instead? → No. That would move
   behavior between stages of one pipeline; the resolution helpers are independent
   of routing and are the safe seam.
2. Should the table become a generic data table? → No. That is a new abstraction,
   not a move.
3. Does moving `RateCell` change the tooltip text? → No, moved verbatim.

### Implementation Evidence (REQUIRED for `closed`)

- [x] File:line ranges — `lib/gateway-resolution.ts:1-55` (new),
      `lib/gateway.ts:1-366`, `components/catalog/catalog-cells.tsx:1-70`,
      `components/catalog/catalog-filters.tsx:1-135`,
      `components/catalog/catalog-footnote.tsx:1-42`,
      `components/catalog/model-catalog-table.tsx:1-293`
- [x] Gate output — receipt above
- [x] Rendered page check — receipt above
- [x] Step statuses — all implemented

## Resolution

- **Closed Date:** 2026-10-30
- **Fix Description:** `lib/gateway.ts` 412 → 366 lines with the resolution and
  upstream-error helpers in `lib/gateway-resolution.ts`; the catalog table
  467 → 293 lines with cells in `catalog-cells.tsx`, the filter bar in
  `catalog-filters.tsx` and the footnote in `catalog-footnote.tsx`. Moves are
  verbatim; no behavior, copy, class, or ordering changed.
- **Tests Added:** No — a pure move; the unit suite and both HTTP suites cover
  the behavior and were re-run.
- **Verification Evidence:** Gate receipt above, plus the rendered `/models`
  check on the production build.
- **Archived:** `dev/fids/archive/`, pending commit

## Lessons Learned

A line ceiling is only useful if the split follows a real responsibility boundary.
Splitting by size alone produces files that differ in name and nothing else.
