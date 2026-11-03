# FID: Signal reader content parity

**Filename:** `FID-2026-1102-106-signal-reader-content-parity.md`
**ID:** FID-2026-1102-106
**Severity:** medium
**Status:** closed
**Created:** 2026-11-02 21:40
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

Signal detail pages were rendering only what the feed syndicated. Link-only RSS
items (Hacker News, Google's short recap posts) therefore showed a metadata
template or a one-line blurb instead of the article. Repository items from
Open Source Projects and Trendshift showed no GitHub facts because enrichment
was skipped without `GITHUB_TOKEN` and the slug was read only from the item URL.
This FID restores the reference site's reader behavior: extract and sanitize
the publisher's page when the feed body is absent, a metadata template, or too
short to be an article; enrich repos from the GitHub link inside the feed body
or from a `owner/repo` title; and render the full repository card the reference
site had.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL, PGlite local
- **Commit/State:** `main` plus the content working tree
- **New dependencies:** none (`sanitize-html` is already used by feeds)

## Detailed Description

### Problem

1. `parseFeed` stores the Hacker News `description` verbatim. That body is:

   ```text
   Article URL: … Comments URL: … Points: N # Comments: N
   ```

   The reader treats it as article content, so the page shows four URLs and no
   article. The reference site rejected this shape and scraped the linked page.

2. A short feed body is still preferred over the source page. Google's AI recap
   feed carries an image and about fifty characters; the page renders exactly
   that instead of the article.

3. `enrichGithub` returns early when no token exists, and reads the slug only
   from `item.url`. Open Source Projects puts the repository link inside the
   feed body; Trendshift puts `owner/repo` in the title. Both stay blank even
   though GitHub's public API answers unauthenticated requests.

4. The detail page had no full repository panel. The aside showed a small panel
   only when `github_json` was already populated.

### Expected Behavior

- A text item with no usable body fetches the publisher page on first view,
  extracts the main region, sanitizes it, stores it, and renders it.
- A stored body that is a metadata template or under 200 visible characters is
  treated as unusable and goes through the same fetch path.
- A failed fetch shows the excerpt and an honest note, never an empty article.
- Repository items obtain GitHub facts without a token and from either a GitHub
  URL, a `owner/repo` title, or a GitHub link in the body.
- Repository detail pages show slug, description, stars, forks, language,
  license, topics, and outbound GitHub/homepage links.
- Fetched content is sanitized: no script, iframe, style, or event attributes,
  and images resolve to absolute URLs.
- No render calls GitHub. Facts stay denormalized in `github_json`.

### Root Cause

The port implemented the feed-first half of the reference reader but not its
fallback half (`fetchArticle`), and it tightened GitHub enrichment into a
token-only path. The metadata-template guard from the reference site was never
ported.

## Impact Assessment

### Affected Components

- `lib/content/article.ts` (new): extraction, sanitization, page fetch.
- `lib/content/reader.ts` (new): usability predicate, lazy fetch, persistence.
- `lib/content/github.ts`: unauthenticated fetch and slug discovery.
- `lib/content/ingest.ts`: always enrich repos; keep the feed body; resolve a
  YouTube handle from the public channel page when no API key exists.
- `lib/content/feeds.ts`: reject metadata templates as body/excerpt; read a
  channel id out of a public channel page.
- `lib/content/presets.ts`, `components/admin/content-source-presets.tsx`: the
  two YouTube handles recovered from the old volume are seedable presets.
- `lib/content/store/items.ts`: store a fetched body.
- `app/signal/[id]/page.tsx`: resolve the reader body; render the repo card.
- `components/content/repo-panel.tsx` (new).
- `components/content/content-detail-aside.tsx`: remove the duplicate compact
  repo panel.
- `tests/content-article.test.mjs` (new), `tests/content-feeds.test.mjs`,
  `tests/content-sources.test.mjs`: regression coverage.

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: first view of a link-only item performs one outbound request.
- [ ] Low

Mitigations: 15-second timeout, 2 MiB cap, public-URL policy, per-item cache,
and a stored body so repeat views never fetch again.

## Proposed Solution

### Approach

Port the reference extraction rules without adding a DOM dependency. Try
structured data (`articleBody`), then balanced semantic containers (`article`,
`main`, `role=main`, article-body class names), then a paragraph fallback.
Sanitize once with the same allowlist contract as feed content. Resolve the
body lazily: the first detail request for an unusable body fetches and writes
it to `content.items.body_html`; later requests read the stored HTML.

GitHub enrichment becomes token-optional. `fetchGithubRepo` sends the bearer
header only when a token exists. Slug discovery checks URL, title, and body in
that order. Repo topics and description are applied without discarding the
feed's own body. The full card renders in the main column; the aside keeps the
story facts and the original link.

### Steps

1. Add the extractor and sanitizer. — implemented
2. Add the usability predicate, lazy resolver, and body store. — implemented
3. Reject metadata templates in the feed parser. — implemented
4. Make GitHub enrichment token-optional and body-aware. — implemented
5. Render the repository panel. — implemented
6. Add unit and PGlite regression tests. — implemented
7. Run lint, typecheck, focused tests, quality, build, and live page checks. — implemented

### Verification

- Unit: metadata predicate, balanced extraction, sanitization, absolute images.
- Integration: an HN-shaped item is scraped once, stored, and rendered from the
  database on the second call.
- Source integration: an Open Source Projects-shaped item with a GitHub link in
  its body is enriched without a token.
- Source recovery: a YouTube handle in the preset list resolves through the
  public channel page, fetches its Atom feed, and ingests items without
  `YOUTUBE_API_KEY`.
- Live: `/signal/<hn-item>` contains CNBC article prose, not `Article URL:`;
  a repo detail page contains stars/forks/description; a paper detail page
  contains more than the feed blurb.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-article.test.mjs
- gate: test tests/content-feeds.test.mjs
- gate: test tests/content-ingest.test.mjs
- gate: test tests/content-sources.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-11-02T20:37:18Z
- lint: exit 0 (zero warnings)
- typecheck: exit 0
- test focused: exit 0 (13 tests, 13 pass for feeds + ingestion)
- test full: exit 0 (817 tests, 816 pass, 1 skipped)
- quality: exit 0 (PASS, 529 files scanned)
- build: exit 0 (Next.js production build, 23 static pages)
- live content: 276 items stored; 17 of 17 repository rows carry GitHub
  facts; `/signal?q=oracle` rendered CNBC article paragraphs and no visible
  metadata template; a paper detail rendered an 11,198-character sanitized
  page body; a repository detail rendered 32.6K stars, 1.6K forks, the
  description, Swift, GPL-3.0, and topic chips.
- live YouTube handle: a disposable database ingested 3 items from
  `@airevolutionx` with `apiKey: null`; no `googleapis.com` request was made.
- storage recovery: the local PGlite volume failed its checkpoint after the dev
  process stopped. The original directories are preserved; the dev database was
  rebuilt from `data/gateway.db` configuration (3 providers, 89 models) and the
  ten non-video presets were reseeded and fetched. This is local dev data
  recovery, not a code gate.
- not verified: a browser pointer/visual review and `npm run verify`
  HTTP/recovery suites; the running local volume has not been reseeded with the
  two recovered YouTube handles (`r/singularity` returned 429).

## Perfection Loop

### Iteration 1 — RED

The reported pages are the reproducible failure: Hacker News shows
`Article URL:` as body text; Trendshift shows no stars or description; a paper
detail shows a feed blurb. The feed parser has no template guard and the reader
has no source-page fallback.

### Iteration 2 — GREEN

Implemented extraction and lazy resolution, template rejection, token-optional
GitHub discovery, and the repository panel. Tests cover each pure step and the
persistence path.

### Iteration 3 — AUDIT

Checks to confirm before closing:

- [x] The extractor never returns a body under 200 visible characters as
      sufficient.
- [x] Sanitization removes scripts, iframes, styles, and event attributes.
- [x] The URL policy runs before every article fetch.
- [x] A second detail read does not fetch again.
- [x] A repo with no token still gets public GitHub facts.
- [x] The feed body is not overwritten by a GitHub description.
- [x] No new dependency, no placeholder, no dead path.

### Iteration 4 — ADVERSARIAL

- A publisher returns 403 or a JS-only shell: the page keeps the feed excerpt
  and explains that the full body is unavailable.
- A page has nested `<article>` tags: balanced slicing takes the outer region.
- A page has relative image sources: they resolve against the page URL.
- GitHub rate-limits the unauthenticated request: the item still stores and
  renders; only the repo panel is absent.
- A feed body contains `Article URL:` in a genuine article discussing HN: the
  template predicate requires all three labels, so it does not fire on one
  mention.

### Iteration 5 — COMPLETE

The gates pass, the live pages were checked against the rebuilt local database,
the receipt above carries real output, and `CHANGELOG.md` records the reader
parity fix. The two recovered YouTube handles were added to the seedable preset
list and their keyless resolution was measured against a disposable database.
The implementation landed in commit `e8760d0`; this record is now closed and archived.

### Implementation Evidence

- **Commit SHA:** `e8760d0`.
- **File:line ranges:** `lib/content/article.ts`, `lib/content/reader.ts`,
  `lib/content/github.ts`, `app/signal/[id]/page.tsx`, and
  `components/content/repo-panel.tsx`.
- **Gate output:** lint, typecheck, focused tests, full `npm test`, quality, and
  build all pass as recorded above.
- **Reproducibility:** `rg "ensureArticleBody|fetchGithubRepo|RepoPanel"` finds
  the production implementation and callers.
- **Step statuses:** all seven steps implemented.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** Signal reader and repository enrichment parity implemented.
- **Tests Added:** Yes — article, feed, ingestion, and source regressions.
- **Verification Evidence:** declared gates pass as recorded above.
- **Archived:** 2026-11-03 — moved to `dev/fids/archive/`.
