# FID: HuggingFace Daily Papers as a first-class source

**Filename:** `FID-2026-1102-094-huggingface-daily-papers.md`
**ID:** FID-2026-1102-094
**Severity:** medium
**Status:** closed
**Created:** 2026-11-02 18:40
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The old site ingested HuggingFace Daily Papers through a dedicated JSON fetcher.
The merged Signal surface only supported RSS and YouTube, so the source manifest
had to mark Daily Papers unsupported. This FID adds a bounded HuggingFace source
kind, parses the public `daily_papers` JSON array, and upserts papers on their
arXiv identity so a paper shown on two days does not duplicate.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL, PGlite for local tests
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none; the endpoint is public and unauthenticated

## Detailed Description

### Problem

`SOURCE_KINDS` admitted only `rss` and `youtube`. The admin form, source table
check constraint, and ingestion switch all refused HuggingFace, and the only
recoverable old row (`https://huggingface.co/api/daily_papers`) could not be
registered honestly as an RSS feed.

### Expected Behavior

- Operators can choose **HuggingFace Daily Papers** in Admin → Content.
- A fetch reads the public JSON endpoint once, capped by the source's item cap.
- Each entry becomes a `paper` item with title, summary, authors, publication
  time, and a stable `https://huggingface.co/papers/{id}` URL.
- Malformed JSON or a non-array body fails the cycle with a precise error; it
  never looks like a healthy empty source.
- No API key is required.

### Root Cause

Not a defect. The capability was never ported from
`resources/aggroNATION-main/lib/fetchers/huggingface.ts`; the merged surface
only implemented feed parsing.

### Evidence

```text
resources/aggroNATION-main/lib/fetchers/huggingface.ts: 141 lines, JSON fetcher
lib/content/types.ts before this FID: SOURCE_KINDS = ["rss", "youtube"]
docs/research/aggronation-sources.json: "supported": false for Daily Papers
```

## Impact Assessment

### Affected Components

- `lib/content/huggingface.ts` (new)
- `lib/content/types.ts`
- `lib/storage/schema/content.ts`
- `lib/content/admin-input.ts`
- `lib/content/ingest.ts`
- `components/admin/content-source-form.tsx`
- `tests/content-sources.test.mjs`

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: a new parsing path can mis-identify papers or fail a cycle
- [ ] Low

## Proposed Solution

### Approach

Parse the public array in a pure module. Treat the arXiv id as the external
identity and the HuggingFace paper URL as the canonical URL. Reuse the existing
source record, cycle, tag, and upsert path rather than adding a second ingestion
pipeline.

### Steps

1. Add `huggingface` to `SOURCE_KINDS` and the SQL kind constraint. — `implemented`
2. Add the pure `parseDailyPapers` parser with shape errors. — `implemented`
3. Route the source kind to the parser in `fetchSourceItems`. — `implemented`
4. Accept the kind in the admin body parser and form. — `implemented`
5. Add parser and ingestion tests. — `implemented`

### Verification

`node --test tests/content-sources.test.mjs` exercises the parser, malformed
bodies, the API-only request path, and storage of a paper. `npm run typecheck`
and `npm run lint` cover the wiring.

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
- live fetch: 50 Daily Papers stored
- quality: exit 0 (PASS, 525 files scanned)

## Perfection Loop

### Loop 1 — RED

- **RED:** No source kind, no parser, no admin path; the manifest called the
  source unsupported.
- **GREEN:** Added the kind, parser, switch, form option, and tests.
- **AUDIT:** The parser test returns one item from two entries because the
  second entry lacks an id and title; this is a deliberate drop, not a crash.
- **ADVERSARIAL:** A JSON array can contain arbitrary objects. The parser
  validates `id` and `title` as non-empty strings, caps title/excerpt/author
  length, and defaults an invalid date to now instead of throwing.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should the paper URL be the HuggingFace page or the arXiv page? → The old
   site linked the HuggingFace page; keep that, because it carries the paper
   discussion and is the endpoint the operator selected.
2. Should upvotes become a metric? → No. The existing `ContentMetrics` model
   has views/likes/rating/YouTube comments; reusing likes for upvotes would
   mislabel the number. The summary and authors are enough.
3. Do duplicate papers on consecutive days duplicate rows? → No. The canonical
   URL is the arXiv id path, and `upsertItem` conflicts on URL.

### Implementation Evidence

- **Commit SHA:** `e8760d0` — Signal content surface and reader batch.
- **File:line ranges:** `lib/content/huggingface.ts`,
  `lib/content/ingest.ts` (`source.kind === "huggingface"`),
  `lib/content/types.ts` (`SOURCE_KINDS`),
  `lib/storage/schema/content.ts` (kind check),
  `components/admin/content-source-form.tsx`.
- **Gate output:** `node --test tests/content-sources.test.mjs` → 9 pass;
  a live fetch stored 50 papers.
- **Reproducibility:** `rg "parseDailyPapers|HUGGINGFACE_DAILY_PAPERS_URL"`.
- **Step statuses:** all five `implemented`.

### Code Verification Evidence

- [x] Files in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass; paste is recorded above
- [x] Call-graph: admin POST → `createSource`; fetch route → `ingestSource` →
  `fetchSourceItems` → `parseDailyPapers`
- [x] FID status reflects the implementation state (`verified`, not `closed`)

### Loop 2 — Independent audit and self-correction

- **RED:** The first parser signature used `maxItems = CONTENT_LIMITS.pageSize`,
  which TypeScript narrowed to the literal `24`; callers passing a source cap
  failed typecheck.
- **GREEN:** Annotated both parsers with `maxItems: number`.
- **AUDIT:** `npm run typecheck` exits 0 after the annotation.
- **ADVERSARIAL:** A source URL is still required even though the endpoint is
  fixed. That is deliberate: the registry row must be inspectable and the URL
  is the one an operator recognizes.
- **CHANGE DELTA:** 5%.

### Loop 3 — Final convergence

- **RED:** Does a malformed upstream body disable the source?
- **GREEN:** Yes. The parser throws, `ingestSource` records the failure, and
  five consecutive failures disable the source.
- **AUDIT:** Existing failure-cycle tests cover the generic path; the parser
  error is surfaced in `last_error`.
- **ADVERSARIAL:** No key is configured, so there is no credential failure mode.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** HuggingFace Daily Papers is a supported source kind with
  a pure parser and an ingestion path.
- **Tests Added:** Yes — `tests/content-sources.test.mjs`.
- **Verification Evidence:** lint, typecheck, and the focused test pass.
- **Archived:** 2026-11-03 — moved to `dev/fids/archive/`.

## Lessons Learned

A source kind is four contracts in this tree: the TypeScript union, the SQL
check constraint, the admin parser/form, and the ingestion switch. Missing any
one produces a row that exists but cannot fetch. Add them together.
