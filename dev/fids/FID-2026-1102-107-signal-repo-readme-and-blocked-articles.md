# FID: Signal repository README and blocked article fallback

**Filename:** `FID-2026-1102-107-signal-repo-readme-and-blocked-articles.md`
**ID:** FID-2026-1102-107
**Severity:** medium
**Status:** verified
**Created:** 2026-11-02 20:45
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

Repository detail pages show GitHub facts only when ingestion happened to
enrich the row, and they never show the repository's README. Legacy Trendshift
rows and rows fetched while GitHub rate-limited the unauthenticated API
therefore render without stars or forks. At the same time, a publisher that
refuses the reader (FT returns HTTP 403) is reported as "could not be reached",
which is not what happened and does not tell the reader that the article is
available only at the publisher.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL, PGlite local
- **Commit/State:** `main` plus the content working tree
- **New dependencies:** none

## Detailed Description

### Problem

1. `content.items.github_json` is written only during ingestion. A row stored
   before the token-optional fix, or stored when GitHub answered 403/429, has
   no facts and the detail page has no second attempt.
2. `RepoPanel` shows stats, description, language, license, and topics but no
   README. A reader who opens a repository cannot read what the project says
   about itself without leaving the gateway.
3. `ensureArticleBody` catches every fetch failure and returns one message,
   "The source page could not be reached." A 403 publisher block, a timeout,
   and a policy rejection are indistinguishable.
4. A repository detail view also runs the article scraper against GitHub and
   renders its failure note below the repository panel.

### Expected Behavior

- A repository detail view resolves missing GitHub facts once and persists
  them; later views read the stored row.
- A repository detail view fetches the README once, sanitizes it, persists it
  inside `github_json`, and renders it below the repository panel.
- README links open the GitHub page in a new tab; images with repository-
  relative paths resolve to raw GitHub URLs; scripts, styles, iframes, forms,
  and event handlers never reach the page.
- A repository card in the Signal grid shows stars, forks, and language when
  facts exist.
- A repository detail view uses the README as its content and does not run the
  article scraper against GitHub.
- A blocked article names the HTTP status and points the reader at the original
  instead of claiming the page was unreachable. Nothing bypasses a paywall.

### Root Cause

Enrichment was modelled as ingestion-only, and the reader's catch block erased
the reason for the failure. Neither path had a legacy-row repair mechanism.

## Impact Assessment

### Affected Components

- `lib/content/github-readme.ts` (new): README fetch, extraction, sanitization.
- `lib/content/github.ts`: `readmeHtml` on the denormalized repository type.
- `lib/content/repo-reader.ts` (new): lazy facts/README resolution and store.
- `lib/content/store/items.ts`: persist a lazily resolved repository.
- `lib/content/store/item-rows.ts`: serialize/parse `readmeHtml`.
- `lib/content/types.ts`: `GitHubRepo.readmeHtml`.
- `lib/content/reader.ts`: status-specific failure messages.
- `app/signal/[id]/page.tsx`: resolve facts before rendering the panel.
- `components/content/repo-panel.tsx`: README section.
- `components/content/content-card.tsx`: repository stats on cards.
- `components/content/content-detail-aside.tsx`: Trendshift view/bookmark labels.
- `styles/globals.css`: readable article and README typography.
- `tests/content-readme.test.mjs` (new), `tests/content-sources.test.mjs`,
  `tests/content-article.test.mjs`: regression coverage.

### Risk Level

- [ ] Critical
- [ ] High
- [ ] Medium: one optional GitHub request on the first detail view of a
  repository whose facts or README are absent.
- [x] Low: the request is bounded, failure is absorbed, and the stored row is
  reused on later views.

## Proposed Solution

### Approach

Extend `GitHubRepo` with `readmeHtml`. When a repository detail view has no
facts, fetch the public repository and the README, merge them, and write the
result back to `github_json`. When facts exist but the README is absent, fetch
only the README. An empty-string README is a cached "no README"; a `null` means
the attempt failed and may be retried. Sanitize README HTML with a dedicated
allowlist, resolve relative asset paths against GitHub raw URLs, and never
render a failed fetch as an empty article.

Change the reader's catch block to format `ArticleFetchError` by status:
403/401 becomes "publisher refused automated access", timeouts become a timeout
message, and policy blocks keep the policy reason. No proxy, paywall bypass, or
archive service is introduced.

### Steps

1. Add the README module and the `readmeHtml` field. — implemented
2. Add lazy repository resolution and persistence. — implemented
3. Render README and repository stats; improve the blocked-article message. — implemented
4. Add tests, run the gates, and check the live pages. — implemented

### Verification

- `tests/content-readme.test.mjs` proves relative images/links resolve, unsafe
  markup is removed, and an empty README is cached as absent.
- `tests/content-sources.test.mjs` proves `github_json` round-trips README HTML
  and that a legacy row without facts is repaired.
- `tests/content-article.test.mjs` proves a 403 produces a publisher-block
  message rather than "could not be reached".
- Live: a repository detail page contains a README heading and sanitized body;
  a blocked FT item names HTTP 403; a CNBC item still renders its article.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-readme.test.mjs
- gate: test tests/content-sources.test.mjs
- gate: test tests/content-article.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-11-02T20:59:33Z
- lint: exit 0 (zero warnings)
- typecheck: exit 0
- test focused: exit 0 (24 tests, 24 pass for README, article, sources)
- test full: exit 0 (824 tests, 823 pass, 1 skipped)
- quality: exit 0 (PASS, 531 files scanned)
- build: exit 0 (Next.js production build)
- live repository: `/signal/itm_fb3587c103fc76bd433bbbda` renders the
  `Vorssaint` README body, 32.6K stars, 1.6K forks, and no article-scrape
  failure note; `/signal?kind=repo` renders the same stars/forks on the card.
- live article: the CNBC Oracle page still renders 3.1K characters of article
  body; the FT Anthropic page now reports `The publisher refused automated
  access (HTTP 403)` instead of "could not be reached".
- not verified: a browser visual/pointer review and `npm run verify`
  HTTP/recovery suites.

## Perfection Loop

### Iteration 1 — RED

The reported failures are reproducible: the FT Hacker News row returns HTTP 403
to the reader and displays "could not be reached"; repository rows created
before enrichment render no stats; no repository route renders a README.

### Iteration 2 — GREEN

Implemented `github-readme.ts` (fetch, extract, sanitize, relative URL
resolution), `repo-reader.ts` (lazy facts/README repair with a 10-minute failure
cache), persistence through `saveItemGithub`, README rendering, repository stats
on cards and the detail aside, and status-specific article failures. Repository
detail pages skip the article scraper.

### Iteration 3 — AUDIT

- [x] A README is sanitized before storage and again render-safe.
- [x] Relative images resolve to raw GitHub URLs.
- [x] A 403 article names the status and does not claim a network failure.
- [x] A failed README fetch does not remove existing repository facts.
- [x] A second detail view does not fetch the README again.
- [x] No new dependency, placeholder, or dead path.

### Iteration 4 — ADVERSARIAL

- GitHub rate-limits the README request: the repository panel still renders
  with stored facts, and the README is absent rather than fake.
- A README contains a `<script>`, an `onerror` image, or a `javascript:` link:
  none reach the page.
- A README has no body: the empty result is cached so every view does not
  repeat the request.
- A publisher returns 403: the page explains the block and keeps the excerpt;
  it does not fetch through a proxy.

### Iteration 5 — COMPLETE

The gates pass, the repository and article pages were checked against the
running local database, the receipt carries real output, and `CHANGELOG.md`
records the behavior. The FID remains open only until its commit and archive
move.
