# FID: Side-by-side model comparison

**Filename:** `FID-2026-1029-036-model-compare.md`
**ID:** FID-2026-1029-036
**Severity:** low
**Status:** verified
**Created:** 2026-10-30 04:40
**Closed:** 2026-10-30 06:05
**Closure correction:** 2026-10-30 — implementation is present and fresh full
`npm run verify` exited 0, but no implementation commit exists yet. The earlier
closed labels below are historical; archive only after recording a real SHA.
**Automation level:** 3
**YAGNI-Compliance:** Verified — one route, one client picker, one table
component, one pure helper and its tests. No new dependency, no new table, no new
data source.

---

## Summary

The catalog answers "what does this model cost" one row at a time. Choosing
between two candidates meant scrolling the table twice and holding both prices,
both benchmark scores and both capability sets in your head. OpenRouter solves
this with a two-model page; this FID adds the Savant equivalent at
`/compare?a=<model>&b=<model>`, reading only stored data.

## Environment

- **Stack:** Next.js 16 App Router, Tailwind 4 + `styles/savant.css`
- **Data:** `models` (public scope), `model_benchmarks` (Artificial Analysis),
  OpenRouter's public model list for the list rates
- **Reference:** <https://openrouter.ai/compare/deepseek/deepseek-v4.1-flash-1017/z-ai/glm-5.3-flash>
  — an overview block, an "at a glance" attribute table, and a benchmark
  freshness line. Their rows: input price, output price, context window,
  intelligence index, coding index, agentic index, p50 latency, p50 throughput.

## Detailed Description

### Requirements

- **R1 — one attribute per line, two columns.** Every comparable fact appears
  once with both models adjacent; a value only one side has is a dash, never a
  hidden row.
- **R2 — every number from the database.** Prices from `models`, AA scores from
  `model_benchmarks`, list rates from the OpenRouter payload. A missing
  measurement is "not measured", never zero.
- **R3 — the comparison is addressable.** The pair lives in the URL (`?a=&b=`)
  so a comparison can be linked and shared. Unknown or missing ids fall back to
  a deterministic pair instead of erroring.
- **R4 — the better side is marked.** Lower price, lower time-to-first-token,
  higher throughput and higher index each mark the winning cell; equal or
  unmeasured values mark neither.
- **R5 — reachable.** A `Compare` item in the public nav and a button on
  `/models`, so the page is not orphaned.
- **R6 — provenance travels.** Index version, sync date and the list-rate source
  are stated once under the table, as on the catalog.

### Non-goals

No chat playground, no provider-side comparison, no coding/agentic indices (not
stored), no more than two models in one view.

## Root Cause

The catalog is optimised for scanning one axis at a time. Comparison needs the
transpose — same attribute, two models — and no route presented it.

## Verification Receipt

```text
$ npm run lint       eslint . -> clean (0 errors, 0 warnings)
$ npm run typecheck  tsc --noEmit -> pass
$ npm test           tests 205 / pass 205 / fail 0   (10 new)
$ npm run quality    quality: PASS (400-line ceiling, 230 files)
$ npm run build      next build -> pass; /compare listed as a dynamic route
```

Interactivity, checked on a fresh `next start` (port 3210, production build):

```text
click "Swap"        url -> /compare?a=claude-opus-5.5&b=claude-fable-5.1
                    h1  -> "Claude Opus 5.5 vs Claude Fable 5.1"
select Model B      url -> /compare?a=claude-opus-5.5&b=claude-sonnet-5.5
                    h1  -> "Claude Opus 5.5 vs Claude Sonnet 5.5"
unknown ?a=         h1  -> "Claude Fable 5.1 vs Claude Opus 5.5" (falls back,
                    the requested b is kept)
free model pair     access row reads "Free", price rows read "Not priced"
390x844             documentElement.scrollWidth 373 == clientWidth 373
                    (before the responsive rule: 645)
```

Screenshots: `debug/compare-final.png` (1440),
`debug/compare-mobile-final.png` (390).

## Perfection Loop

### Loop 1 — RED

R1–R6, with the reference page and the catalog's one-row-at-a-time layout as
evidence.

### GREEN → AUDIT → SELF-CORRECT

- **A1 — the default pair opened on two free rows.** The first render compared
  DeepSeek V4 Pro with V4.1 Flash, both "Not priced": a comparison that says
  nothing. Defaults now prefer paid rows, and an explicit free model still gets a
  priced counterpart.
- **A2 — `Free · free`.** The access row printed the group label and the access
  mode even when they were the same word. It now reads `Free` / `Paid`, and
  `Label · mode` only when the group genuinely differs.
- **A3 — `210.04 s` read as a bug.** Stored TTFT values for thinking models run
  into minutes. Reused the catalog's `formatLatency` (exported rather than
  duplicated), so the cell says "3.6 min to first token".
- **A4 — the winning tint was a wide empty block.** Highlighting the whole cell
  painted ~490 px of accent for a right-aligned number. The mark is now a caret
  plus full-strength text, with the losing side at 80 % — no fill.
- **A5 — `0×` token weight.** A zero weight means "not weighted", not a zero
  multiplier. Renders as a dash.
- **A6 — the h1 broke mid-name.** `Claude Fable / 5.1 vs …` at `max-w-4xl`; widened
  the measure and dropped a step of size so a pair fits one line.
- **A7 — the page scrolled sideways at 390 px.** The compare table inherited the
  catalog's `min-width: 40rem`, which is right for a 7-column grid and wrong for
  a 3-column one. Below 640 px the table drops its minimum width and lets the
  values wrap; measured 645 → 373, equal to the client width.
- **A8 — the dev server could not be trusted for interaction.** Its HMR socket
  was failing (`ERR_INVALID_HTTP_RESPONSE`) and no client component on any page
  hydrated — the catalog's search box kept all 34 rows. Rather than "fix" a
  component that was not broken, the interaction was verified against a fresh
  production `next start`. Recorded here because a screenshot of a dead client
  looks identical to a working one.

### Convergence

One loop with eight corrections, all found by looking at the rendered page rather
than the source. No item remains that does not add a control or a metric the
operator did not ask for.

## Resolution

- **Status:** closed
- **Fix Description:** `/compare` renders two models from the catalog with a
  client picker that keeps the pair in the URL, a three-card verdict (cheaper on
  a 3:1 blend, higher index, faster first token), and one attribute-per-line
  table grouped as Identity, Savant price, OpenRouter list, Capabilities and AA
  Benchmark. `lib/compare.ts` holds the pure pair resolver and winner rule; the
  page reads `models`, `model_benchmarks` and the OpenRouter list, and never
  fabricates a value.
- **Tests Added:** `tests/compare.test.mjs` — ten cases covering id resolution,
  the free-row fallback, the same-model refusal, the single-model guard, and the
  lower/higher/tie/missing rules.
- **Verification Evidence:** receipt above.

## Lessons Learned

A comparison page is a data-honesty test: it prints the gaps of both models side
by side, so every dash has to mean something specific. And a dev server with a
broken client runtime fails silently — verify interaction against a clean start.
