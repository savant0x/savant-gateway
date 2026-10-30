# FID: The comparison under-reported its own data

**Filename:** `FID-2026-1029-037-compare-data-and-row-highlight.md`
**ID:** FID-2026-1029-037
**Severity:** low
**Status:** verified
**Created:** 2026-10-30 07:10
**Closed:** 2026-10-30 07:55
**Closure correction:** 2026-10-30 — implementation is present and fresh full
`npm run verify` exited 0, but no implementation commit exists yet. The earlier
closed labels below are historical; archive only after recording a real SHA.
**Automation level:** 3
**YAGNI-Compliance:** Verified — no new dependency, no new table, no new data
source. Four columns and one attribute were already arriving on the wire and
being discarded; the rest is labelling, one row, and one CSS rule.

---

## Summary

FID-036 shipped `/compare` and the operator used it on two free models. Three
things were wrong, and only one of them was cosmetic:

1. **Our own rate printed "Not priced".** A free-pool model has a zero rate, and
   the table treated zero as "no price" — directly above a `Savant vs list`
   row that said −100 %. The page contradicted itself.
2. **The benchmark block was mostly holes.** Coding and agentic indices, the
   median end-to-end response time and the release date were all present in the
   Artificial Analysis payload and all dropped on the floor. The one row that
   *was* shown, `Measured`, printed a dash on every row because the free tier
   publishes no per-model date.
3. **A win was a caret.** FID-036 deliberately removed the winning fill (A4
   there) and left a 12 px caret. Reading the table, the operator asked for the
   winning value to highlight the row instead.

## Environment

- **Stack:** Next.js 16 App Router, Tailwind 4 + `styles/savant.css`
- **Data:** `models`, `model_benchmarks` (Artificial Analysis free tier,
  `/api/v2/language/models/free`), OpenRouter's public model list
- **Payload fields the tier actually publishes** (measured over 200 records):
  intelligence index 31/200, **coding index 0/200, agentic index 0/200**,
  output speed / TTFT / end-to-end 106/200, release date 200/200.

## Detailed Description

### Requirements

- **R1 — a zero rate says which kind of zero it is.** `Free pool` for a
  free-access model, `In plan` for a subscription model, `Not priced` only for a
  paid model with no rate.
- **R2 — carry every measurement the source sends.** Coding index, agentic
  index, end-to-end response and release date are parsed, stored and rendered.
- **R3 — a row nobody measured is not a row.** Rows where both sides are null
  are dropped rather than printed as a wall of dashes.
- **R4 — a win highlights the row.** The winning cell carries an accent wash and
  the row's value cells carry a fainter band, so the answer is found without
  hunting for a caret.
- **R5 — provenance, not a dead row.** `Measured` is replaced by `Source`: the
  AA slug the numbers were matched on, the index revision, and the date when the
  source publishes one.
- **R6 — the files stay under the 400-line ceiling.**

### Non-goals

No third price series (AA's own `pricing.*` would be a second, conflicting
provenance), no domain indices (finance/legal/…) until they cover more than 34
of 379 records, no comparison of more than two models.

## Root Cause

`BenchmarkSummary` was a three-field shape (`intelligenceIndex`, `ttftSeconds`,
`outputTokensPerSecond`) that predated the payload inspection. Anything the
parser did not name was dropped at the edge, so the page could only ever show
what that shape happened to contain — and `rate()` collapsed "included" and
"unpriced" into one string because the row never asked the model for its access
mode.

## Verification Receipt

```text
$ npm run lint       eslint . -> clean (0 errors, 0 warnings)
$ npm run typecheck  tsc --noEmit -> pass
$ npm test           tests 205 / pass 205 / fail 0
$ npm run quality    quality: PASS (400-line ceiling, 232 files scanned)
$ npm run build      next build -> pass
```

Data, through the real sync path (`POST /api/admin/benchmarks {force:true}` on a
production `next start`, port 3100):

```text
{"status":"ok","candidates":379,"matched":31,"ambiguous":0,"quotaRemaining":66}

release dates stored: 31 / 31
claude-opus-5.5  release 2026-09-22  index 58.4  end-to-end 649.4 s
glm-5.3          release 2026-08-18  index 31.7  end-to-end  34.18 s
coding_index non-null: 0 of 31   (source publishes none on the free tier)
```

Rendered output, read back from the served HTML:

```text
/compare?a=claude-opus-5.5&b=glm-5.3        data-winner: 10 rows (3 left, 7 right)
/compare?a=free/deepseek-v4.1-flash&b=free/glm-5.3-flashx
    price rows            "Free pool" x3   (was "Not priced")
    Released              Sep 10, 2026 | —
    AA Benchmark          Time to first token / Output speed / End-to-end response / Source
    Intelligence Index    hidden — both sides null, not a row of dashes
computed styles          winner cell colour-mix 12%, band 5%, label column untouched
1440 px                  scrollWidth 1423 == clientWidth 1423
390 px                   scrollWidth 373 == clientWidth 373; label cell 102 px,
                         scrollWidth 102 (before: 164, overlapping the value)
```

Screenshots: `debug/compare-037-final-table.png` (table at 1440),
`debug/compare-free-final.png` (free pair, `Free pool` + the new AA rows),
`debug/compare-037-mobile-v2.png` (390).

## Perfection Loop

### Loop 1 — RED

The operator's paste of the rendered page, plus the payload inspection above:
three "Not priced" rows against an access row reading Free, and a `Measured` row
that printed `—` for both models.

### GREEN → AUDIT → SELF-CORRECT

- **A1 — coding and agentic indices are null on the free tier.** 0 of 200
  records carry them. They are parsed and stored anyway (the day the tier
  includes them the rows appear), and R3 keeps them from rendering as dashes.
  Recorded here so nobody later reads "no coding index" as a matching bug.
- **A2 — release dates did not land, twice.** The first `next start` failed with
  `EADDRINUSE` while `curl` answered 200 from the *previous* build still holding
  the port, so the sync ran old code. Caught because `release_date` stayed null
  after a sync that otherwise succeeded. Stopped it by PID from `netstat`
  instead of trusting `kill` on the `npx` wrapper.
- **A3 — the winner wash never rendered.** `.compare-table tbody tr[data-winner]
  .compare-value` (0-3-2) outranked `.compare-value[data-better="true"]`
  (0-3-0), so a winning cell painted at the band's 5 % and the two sides looked
  identical. Found by reading `getComputedStyle` on both cells instead of
  squinting at a screenshot. The winner rule now repeats the row selector.
- **A4 — full-row band read as zebra striping.** Tinting the label column too
  turned six decided rows into a striped block. The band now covers only the two
  value cells, and the winner carries the stronger wash (5 % / 12 %) instead of
  a 2 px inset line that looked like a stray column divider.
- **A5 — `Measured` was a dead row.** The tier publishes no per-model date, so
  the row was dashes on both sides. Replaced with `Source` (slug + version +
  date when present), which every benchmarked row can answer.
- **A6 — both files crossed 400 lines.** `compare-table.tsx` 438 and
  `lib/benchmarks.ts` 403. Split into `compare-rows.tsx` (the row builder) and
  `lib/benchmarks-parse.ts` (payload parsing), with the types and matching left
  where they were. No behaviour change; the served HTML is identical.
- **A7 — labels ran through their values at 390 px.** Row labels inherited
  `white-space: nowrap`: at 102 px of column a 164 px label printed straight over
  the number beside it (`Savant vs list, blende−91.9%`). Labels now wrap below
  640 px; `scrollWidth` 164 → 102, equal to the cell, and the document still
  measures 373 == 373.

### Convergence

Two loops. Every correction came from reading the rendered output, the database,
or the cascade — none from reading the source and assuming it worked.

## Resolution

- **Status:** closed
- **Fix Description:** `/compare` now labels included models honestly, carries
  every measurement Artificial Analysis sends (coding index, agentic index,
  end-to-end response, release date, source slug), drops rows nobody measured,
  and highlights the winning row rather than a caret. Schema growth is additive
  (`ensureColumn`), so an existing database migrates in place.
- **Tests Added:** `tests/benchmarks.test.mjs` extended — a coding-only record
  survives parsing, the new fields parse and match through, and a missing field
  stays null.
- **Verification Evidence:** receipt above.

## Lessons Learned

A null and a zero are different failures, and so are "included" and "unpriced":
the page printed one while its own delta row asserted the other. And CSS
specificity is a silent override — measure the computed colour, do not trust the
screenshot to tell you which rule won.
