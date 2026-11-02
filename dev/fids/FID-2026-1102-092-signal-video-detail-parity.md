# FID: Signal video details, description, metrics, and discussion

**Filename:** `FID-2026-1102-092-signal-video-detail-parity.md`
**ID:** FID-2026-1102-092
**Severity:** medium
**Status:** verified
**Created:** 2026-11-02 18:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

A YouTube source ingests and plays, but the Signal item page drops everything
the reference watch page had: no description, views, likes, rating, YouTube
comment count, no back button, and no discussion section. The same build also
throws a React duplicate-key warning on the public catalog because two column
widths are identical.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Next.js 16.4.3 App Router
- **Storage:** PostgreSQL (PGlite locally), `content` namespace
- **Depends on:** FID-088, FID-089, FID-090

## Detailed Description

### Problem

Operator report after adding a YouTube source:

1. The console shows `Encountered two children with the same key, 13%` at
   `components/catalog/model-catalog-table.tsx:221`.
2. Opening a video shows the player, but no sidebar with description, views,
   or ratings, and no other upstream data.
3. There is no back button and no comment section, both present on the
   reference site.

Investigation found the parser read only the Atom entry root. YouTube nests
`media:description`, `media:thumbnail`, `media:statistics views`, and
`media:starRating average` under `media:group`, so all of it was discarded.
Likes and YouTube comment counts require the Data API and were never requested.
The `content.items` table had no engagement columns, and no on-site comment
store or route existed.

### Expected Behavior

- YouTube items store and display the full description, views, likes, rating,
  and YouTube comment count when the source reports them.
- A missing metric is omitted, never asserted as zero.
- A video detail page has a back button, a details sidebar, the description,
  and an on-site discussion with an authenticated composer.
- On-site comments are bounded, same-origin, authenticated, rate-limited, and
  rendered as text.
- The catalog colgroup uses a stable key and emits no duplicate-key warning.

### Root Cause

The YouTube parser handled `entry.content`/`entry.summary`, which are absent in
the channel Atom feed, instead of `media:group`. The schema and UI were built
for title/excerpt only. The catalog keyed `<col>` by percentage width, and two
columns share `13%`.

### Evidence

```text
Encountered two children with the same key, `13%`.
components/catalog/model-catalog-table.tsx:221
  {columns.map((width) => (<col key={width} style={{ width }} />))}

Live server log before restart:
error: column i.view_count does not exist

YouTube feed shape:
<media:group>
  <media:description>…</media:description>
  <media:community>
    <media:starRating average="4.8" count="120" />
    <media:statistics views="15400" />
  </media:community>
</media:group>
```

## Impact Assessment

### Affected Components

- `lib/content/feeds.ts`, `lib/content/feed-xml.ts`, `lib/content/feed-youtube.ts`
- `lib/content/ingest.ts`
- `lib/storage/schema/content.ts`
- `lib/content/store/items.ts`, `lib/content/store/links.ts`,
  `lib/content/store/comments.ts`
- `app/signal/[id]/page.tsx`
- `components/content/content-detail-aside.tsx`,
  `components/content/comment-section.tsx`,
  `components/content/comment-form.tsx`
- `app/api/content/[id]/comments/route.ts`
- `components/catalog/model-catalog-table.tsx`

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: degraded discovery surface and a noisy client warning; no money
  or admission path is touched

## Proposed Solution

### Approach

Read the real YouTube feed shape, enrich it with one bounded Data API call when
a key exists, store metrics additively, and render a watch-page layout that
separates description, facts, and discussion. Comments reuse the existing
customer identity and the same-origin guard.

### Steps

1. `implemented` — Key the catalog colgroup by index, not by repeated width.
2. `implemented` — Split XML/sanitization helpers into `feed-xml.ts` and the
   YouTube entry parser into `feed-youtube.ts`; parse `media:group` for
   description, thumbnail, views, and star rating. The description is escaped
   and paragraph-preserved.
3. `implemented` — Add `view_count`, `like_count`, `youtube_comment_count`, and
   `rating` to `content.items` with an additive migration.
4. `implemented` — Enrich YouTube items during ingest with
   `videos?part=statistics` (one call per 50 items). A failed call keeps the feed
   metrics and does not fail the source cycle.
5. `implemented` — Add `content.comments` and a store with a 12-per-hour
   per-customer ceiling, plus `POST /api/content/[id]/comments` behind
   `requireCustomerApi`.
6. `implemented` — Rebuild the detail page with a back button, video details
   sidebar, full description, discussion list, and composer.
7. `implemented` — Document `CONTENT_*` and `YOUTUBE_API_KEY` in `.env.example`.

### Verification

- `tests/content-feeds.test.mjs` — media:group description, views, rating, and
  markup injection.
- `tests/content-ingest.test.mjs` — statistics merge and statistics failure.
- `tests/content-store.test.mjs` — metrics roundtrip, comment write/read/count,
  and the hourly ceiling.
- `tests/content-format.test.mjs` — compact count formatting.
- Disposable PGlite app: video detail 200 with all sidebar markers, signup 201,
  comment POST 200, comment rendered with the author name.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-feeds.test.mjs
- gate: test tests/content-ingest.test.mjs
- gate: test tests/content-store.test.mjs
- gate: test tests/content-format.test.mjs
- gate: test tests/content-linking.test.mjs
- gate: quality
- gate: build

### Verification Receipt

```text
npm run lint      exit 0, zero warnings
npm run typecheck exit 0
npm run quality   PASS (400-line ceiling, 513 files scanned)
npm run build     exit 0, /signal and /signal/[id] dynamic

node --test tests/content-feeds.test.mjs tests/content-format.test.mjs \
  tests/content-ingest.test.mjs tests/content-store.test.mjs \
  tests/content-linking.test.mjs
tests 22 / pass 22 / fail 0

Disposable PGlite app (port 3100, seeded YouTube item):
  GET /signal/itm_0502…                    HTTP 200
  Back to videos / Description / body text  present
  youtube-nocookie embed vid123             present
  Views 12.3K / Likes 678 / Rating 4.5 / 5  present
  Comments on YouTube 90                    present
  Discussion / No comments yet              present
  POST comment unauthenticated              HTTP 401
  POST comment cross-origin                 HTTP 403
  Signup                                    HTTP 201
  Authenticated comment POST                HTTP 200
  Authenticated detail render               HTTP 200, "1 comment" and the
                                            author name present

Restarted the local dev server after the additive migration:
  GET /signal                                HTTP 200
  GET /signal?kind=video                     HTTP 200
  "column i.view_count does not exist"       0 occurrences
  GET /signal/itm_19a5…                      HTTP 200 with back button,
                                            description panel, details,
                                            discussion, and the embed
```

## Perfection Loop

### Loop 1 — RED

- **RED:** The page sells a model under a video whose description and social
  proof are missing, and the hub carries a client-side key warning. The parser
  silently discards real feed data, which is worse than a documented gap.
- **GREEN:** `media:group` parsing, additive metric columns, bounded statistics
  enrichment, on-site comments, and an index-keyed colgroup.
- **AUDIT:** The ingest test proves the Data API values override feed views and
  fill likes/comment counts. The failure test proves a quota error keeps the
  feed metrics and the cycle succeeds. The comment test proves the 13th post in
  an hour is rejected.
- **ADVERSARIAL:** A description containing `<script>` and an `onerror` image is
  escaped into text; the feed test asserts neither survives. Statistics are
  optional, so an API outage cannot disable a healthy source. Comments are
  plain text, authenticated, same-origin, length-bounded, and rate-limited.
- **CHANGE DELTA:** 0% (initial record).

### Missed Questions

1. **Should missing metrics render as zero?** No. A zero is withheld; only
   reported values are displayed.
2. **Does an on-site comment count replace the YouTube count?** No. Both are
   labeled separately.
3. **Do old items get metrics automatically?** No. Existing rows backfill on
   the next source fetch; the operator presses Fetch once.
4. **Do comments create a second account system?** No. They reference `users`
   and reuse the customer session.

### Implementation Evidence

```text
components/catalog/model-catalog-table.tsx   index-keyed colgroup
lib/content/feed-xml.ts                      shared XML + sanitization
lib/content/feed-youtube.ts                  media:group parser
lib/content/feeds.ts                         RSS parser + dispatch
lib/content/ingest.ts                        statistics enrichment
lib/storage/schema/content.ts                metric columns + comments table
lib/content/store/comments.ts                list/count/add, 12/hour ceiling
app/api/content/[id]/comments/route.ts       authenticated POST
components/content/content-detail-aside.tsx  description + facts + related
components/content/comment-section.tsx       server-rendered discussion
components/content/comment-form.tsx          client composer
app/signal/[id]/page.tsx                     watch-page layout
```

### Code Verification Evidence

See the Verification Receipt. No `npm run verify` claim: the HTTP and recovery
suites were not rerun for this UI-only slice.

### Loop 2 — Independent audit and self-correction

- Found and fixed during the loop: `ensureColumn` rejects schema-qualified
  identifiers (`content.items`), so the migration is written directly as static
  DDL.
- Found and fixed: the new metrics broke the `CoverageItem` projection; the
  coverage query now selects the four columns.
- Found and fixed: `feeds.ts` crossed the 400-line ceiling; the helper and
  YouTube parser split keeps every file under it.
- Found by live check: the running dev server had cached the pre-change schema
  and served `column i.view_count does not exist`. A restart applied the
  additive migration; the page then returned 200.

### Loop 3 — Final convergence

The parser, schema, store, route, and page agree on one metric shape. A missing
source value is absent rather than fabricated. Existing items are the only
honest gap, and the operator action to close it is one Fetch press.

## Resolution

- **Closed Date:** pending local commit
- **Fix Description:** YouTube media metadata and Data API enrichment, an
  on-site discussion, a details sidebar with a back button, and the catalog
  colgroup key fix.
- **Tests Added:** media:group parsing and injection, statistics merge and
  failure, metrics roundtrip, comments write/read/count/rate-limit, and compact
  counts.
- **Verification Evidence:** the receipt above.
- **Archived:** pending local commit.

## Lessons Learned

An aggregator's "missing data" is often a parser reading the wrong level of the
document, not a missing API. Read the publisher's actual shape before adding a
network dependency; the feed already carried description, views, and rating.
