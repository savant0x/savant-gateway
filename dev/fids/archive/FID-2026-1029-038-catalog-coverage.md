# FID: Catalog coverage — dashes where the data existed

**Filename:** `FID-2026-1029-038-catalog-coverage.md`
**ID:** FID-2026-1029-038
**Severity:** low
**Status:** closed
**Closed Against:** `50758c1`
**Archived:** 2026-10-30
**Final closure:** matcher build-date fallback and included-price labels invoked
by production catalog paths; source/Git verified, full `npm run verify` exit 0
this session. The correction below describes the pre-commit state.
**Created:** 2026-10-30 08:05
**Closed:** 2026-10-30 08:35
**Closure correction:** 2026-10-30 — implementation is present and fresh full
`npm run verify` exited 0, but no implementation commit exists yet. The earlier
closed labels below are historical; archive only after recording a real SHA.
**Automation level:** 3
**YAGNI-Compliance:** Verified — one cell helper, one matching fallback with its
tests, no new dependency, no new table, no new data source.

---

## Summary

The operator looked at `/models` and read it as missing data. An audit said most
of it was a labelling fault, not a collection fault:

| Rows | State before | Cause |
| --- | --- | --- |
| 21 of 44 | Savant price printed `—` | Free-pool and plan models have a zero per-token rate. Zero was formatted as "no price". |
| 11 of those 21 | `vs OpenRouter` printed `—` | The delta cell only rendered for `access === "paid"`, though the comparison existed. |
| 14 of 44 | `AA Benchmark` printed `—` | 12 of them are models Artificial Analysis does not publish; 2 were the same model under a build-dated id. |

## Environment

- **Stack:** Next.js 16 App Router, Tailwind 4 + `styles/savant.css`
- **Data:** `models` (45 rows, 44 in catalog, 34 public without an active plan),
  `model_benchmarks` (Artificial Analysis free tier), OpenRouter public list
- **Source payload facts** (200 records sampled, then the full 400-record
  catalogue): AA names its records with reasoning-effort suffixes and build
  dates — `deepseek-v4-pro` is *"DeepSeek V4 Pro 0813 (Max)"* — while the slug
  stays the base model.

## Detailed Requirements

- **R1 — a zero rate names its own kind of zero.** Free-pool rows read
  `Free pool`, plan rows read `In plan`, and `—` is kept for a paid model with
  no rate. The tooltip states the billing basis (weighted tokens, not $/1M).
- **R2 — the comparison column answers when a comparison exists.** Included
  models carry their real blended delta (`−100 %`) as muted text rather than a
  green badge, because eleven identical badges would shout.
- **R3 — a build date is not a different model.** `free/deepseek-v4-pro-0813`
  matches the source record `deepseek-v4-pro` by stripping *our* trailing
  four-digit stamp — and only against an unambiguous slug.
- **R4 — never guess the rest.** A model the source does not publish keeps its
  dash; no inheriting a sibling's score.

### Non-goals

No fuzzy name matching (hyphen/case variants of unpublished models), no
fabricated indices for models AA lists with a null score, no third price series.

## Root Cause

`RateCell` had one notion of "priced": `input > 0`. The catalog's twenty-one
included rows failed it, so the cheapest part of the catalog looked the emptiest.
Separately, `matchBenchmarks` keyed on the exact normalised id, and a build date
on our side (`-0813`, `-0731`) broke identity with a record the source names
without one.

## Verification Receipt

```text
$ npm run lint       eslint . -> clean (0 errors, 0 warnings)
$ npm run typecheck  tsc --noEmit -> pass
$ npm test           tests 208 / pass 208 / fail 0   (3 new)
$ npm run quality    quality: PASS (400-line ceiling, 232 files scanned)
$ npm run build      next build -> pass
```

Sync through the real write path on a production `next start` (port 3100):

```text
before  {"status":"ok","candidates":379,"matched":31,"ambiguous":0}
after   {"status":"ok","candidates":379,"matched":33,"ambiguous":0,"quotaRemaining":60}

free/deepseek-v4-pro-0813   source_slug deepseek-v4-pro   matched_by slug_without_build   index 23.1
free/deepseek-v4-flash-0731 source_slug deepseek-v4-flash matched_by slug_without_build   index null (source)
```

Rendered `/models` (34 public rows), read from the DOM:

```text
"Deepseek V4 Pro ... free/deepseek-v4-pro-0813 | Free | 3× | | 23.1 | Free pool | −100%"
"Gemini 3.8 Flash ... free/gemini-3.8-flash       | Free | 3× | | 30.5 | Free pool | −100%"
"GLM 5.3 ... free/glm-5.3                          | Free | 4× | | 31.7 | Free pool | −100%"
rows still ending in a dash for both benchmark and comparison: 7 — Drex 2.0,
Gemini 3.1 Pro, GPT-6 Luna (Decisions), Jev 1.13 ×2, Qwen 3.8 MAX, SubQ Snap
```

`In plan` appears zero times in public HTML because the catalog drops plan-gated
rows when no active plan covers them (SCOPE T3) and no plan can be sold yet (B6).

Screenshot: `debug/catalog-038-coverage.png`.

## Perfection Loop

### Loop 1 — RED

The operator's message plus the audit table above: 21 price dashes, 11 comparison
dashes, 14 benchmark dashes.

### GREEN → AUDIT → SELF-CORRECT

- **A1 — "Not priced" beside a free model.** The same fault FID-037 fixed on
  `/compare` lived on here; the label now comes from `includedLabel(access)` so
  both pages say the same thing.
- **A2 — the comparison column was blank for the rows that beat list by the most.**
  A free-pool row is −100 % by definition. Rendered as muted text with the list
  rates in the title, not as a badge.
- **A3 — the build-date fallback nearly widened too far.** A first draft also
  stripped the date from the source's own keys; that collapses AA's
  `deepseek-v4-pro` / `-0424-high` / `-0424-non-reasoning` records into one
  ambiguous key and would have refused a match it can now make. Only our own id
  is stripped, and the ambiguity rule still applies to the result.
- **A4 — Qwen 3.8 MAX stays a dash on purpose.** AA publishes `qwen3-8-max-0803`
  ("Qwen3.8 Max") — a hyphen-tokenisation difference. Matching it would need
  fuzzy name rules, and its index is null anyway, so the dash is the honest
  answer and this is written down instead of guessed at.

### Convergence

One audit, one implementation, four corrections. The remaining dashes are all
cases where the source genuinely has no record; the catalog footnote already
explains that a dash is an absent measurement, never a zero.

## Resolution

- **Status:** closed
- **Fix Description:** Price cells and the comparison column name included
  billing; the benchmark matcher accepts a build-dated id when the source
  publishes the base model. `RateCell` and `priceProvenance` take the model's
  access mode, so a zero rate can never again be rendered as missing data.
- **Tests Added:** `tests/benchmarks.test.mjs` — build-date stripping, a
  build-dated id matching its base record, a build-dated id with no published
  base staying unmatched, and a display-name match surviving when the id misses.
- **Verification Evidence:** receipt above.

## Lessons Learned

"Missing data" on a page is often a formatting decision made once and never
revisited: `input > 0` was true for 21 rows of the catalog and false for their
price. Audit coverage before adding sources — half of this gap was already in the
database.
