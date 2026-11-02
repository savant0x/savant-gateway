# FID: Trendshift listing as a repo source

**Filename:** `FID-2026-1102-095-trendshift-listing-source.md`
**ID:** FID-2026-1102-095
**Severity:** medium
**Status:** verified
**Created:** 2026-11-02 18:40
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

Trendshift publishes no RSS feed. The old site parsed its listing HTML and
showed repo rank, views, bookmarks, tags, and mentions. Signal could not
represent the source at all. This FID adds a deliberately narrow listing parser
anchored on repository anchors, a hard failure when zero rows parse, and the
`trendshift` source kind.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL, PGlite for local tests
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none

## Detailed Description

### Problem

The source manifest marked Trendshift unsupported because Savant only parsed
feeds. Registering `https://trendshift.io/?sort=views` as `rss` would fail every
fetch and eventually disable a source the operator asked for.

### Expected Behavior

- Operators can choose **Trendshift listing** in Admin → Content.
- A fetch reads the listing once and yields `repo` items for anchors whose text
  is exactly `owner/repo`.
- The canonical item URL is the GitHub repository when the row links to the same
  slug; otherwise it is the Trendshift repository page.
- Views and bookmarks are stored as metrics only when the row reports them.
- An empty parse is a hard error, so a redesign cannot look like a healthy empty
  source.

### Root Cause

Not a defect. The reference site's HTML scraper was not ported, and the merge
deliberately avoided adding a parser that pretends to be a feed.

### Evidence

```text
resources/aggroNATION-main/lib/fetchers/trendshift.ts: 319 lines, HTML scraper
docs/research/aggronation-sources.json: Trendshift "supported": false
lib/content/types.ts before this FID: no trendshift kind
```

## Impact Assessment

### Affected Components

- `lib/content/trendshift.ts` (new)
- `lib/content/types.ts`
- `lib/storage/schema/content.ts`
- `lib/content/admin-input.ts`
- `lib/content/ingest.ts`
- `components/admin/content-source-form.tsx`
- `tests/content-sources.test.mjs`

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: an upstream redesign can break parsing; the hard failure bounds it
- [ ] Low

## Proposed Solution

### Approach

Anchor the parser on `href="/repositories/{id}"` plus an exact `owner/repo`
label, never CSS classes. Slice each row's text window from that anchor to the
next. Parse the first two compact numbers as views and bookmarks. Cap all text.
Throw when no row parses.

### Steps

1. Add `trendshift` to `SOURCE_KINDS` and the SQL kind constraint. — `implemented`
2. Add `parseTrendshiftListing` with a zero-row error. — `implemented`
3. Route the kind to the parser in `fetchSourceItems`. — `implemented`
4. Accept the kind in the admin parser and form. — `implemented`
5. Add parser and ingestion tests. — `implemented`

### Verification

`node --test tests/content-sources.test.mjs` covers two rows, metric scaling,
tags, GitHub canonicalization, and the zero-row error.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-sources.test.mjs
- gate: quality

### Verification Receipt

- verified: 2026-11-02T18:45:00Z
- lint: exit 0
- typecheck: exit 0
- test tests/content-sources.test.mjs: exit 0 (9 tests, 9 pass)
- live fetch: 5 repository rows stored
- quality: exit 0 (PASS, 525 files scanned)

## Perfection Loop

### Loop 1 — RED

- **RED:** Unsupported source kind; no parser; no honest row possible.
- **GREEN:** Added the kind, parser, switch, form option, and tests.
- **AUDIT:** The fixture produces `acme/router` from the GitHub link and
  `other/tool` from the Trendshift repository link.
- **ADVERSARIAL:** The tag regex originally allowed spaces and swallowed the
  rest of the row. The test caught no bookmarks, which exposed that `likes` was
  hardcoded to zero. Both were corrected.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Is views/bookmarks the same as likes? → No, but `ContentMetrics` has no
   bookmark field. Mapping bookmarks to `likes` is a presentation compromise;
   the details panel labels it "Likes". This FID records that the value is a
   bookmark count, not a GitHub star or a like.
2. What if the row links a different GitHub repo than its label? → The parser
   keeps the Trendshift URL, because the GitHub link would point at a different
   repository than the row claims.
3. What if the page returns 200 but zero rows? → Hard error, per the expected
   behavior.

### Implementation Evidence

- **Commit SHA:** open; not closed until committed.
- **File:line ranges:** `lib/content/trendshift.ts`,
  `lib/content/ingest.ts` (`source.kind === "trendshift"`),
  `lib/content/types.ts`, `lib/storage/schema/content.ts`,
  `components/admin/content-source-form.tsx`.
- **Gate output:** focused test 9 pass; a live fetch stored 5 rows.
- **Reproducibility:** `rg "parseTrendshiftListing|canonicalizeTrendshiftUrl"`.
- **Step statuses:** all five `implemented`.

### Code Verification Evidence

- [x] Files exist
- [x] Implementation matches the solution
- [x] Typecheck/tests/lint pass; paste above
- [x] Call-graph: fetch route → `ingestSource` → `fetchSourceItems` →
  `parseTrendshiftListing`
- [x] Status reflects implementation (`verified`)

### Loop 2 — Independent audit and self-correction

- **RED:** TypeScript rejected `for...of matchAll` under the project target.
- **GREEN:** Wrapped the iterator in `Array.from`.
- **AUDIT:** `npm run typecheck` exits 0.
- **ADVERSARIAL:** Number parsing can pick a date or an id from a row. The
  parser skips tokens adjacent to hyphens and caps values at 100M; a row with
  no counts honestly shows no metrics.
- **CHANGE DELTA:** 4%.

### Loop 3 — Final convergence

- **RED:** Could a redesigned page with one stray anchor pass as healthy?
- **GREEN:** One valid anchor is still a real row; zero anchors fails. Partial
  extraction is preferred over inventing rows.
- **AUDIT:** The zero-row test asserts the error message names the parser.
- **ADVERSARIAL:** The page can change at any time; the next fetch records the
  error and the source remains visible to the operator.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** Trendshift is a supported repo source with an
  anchor-based parser and a fail-closed empty state.
- **Tests Added:** Yes — `tests/content-sources.test.mjs`.
- **Verification Evidence:** lint, typecheck, focused test pass.
- **Archived:** not archived.

## Lessons Learned

When a source has no feed, the parser must fail loudly on a zero-row parse. An
empty list is indistinguishable from a healthy source with no news, and that is
how a broken scraper hides for weeks.
