# FID: GitHub repository facts denormalized at fetch time

**Filename:** `FID-2026-1102-096-github-repo-enrichment.md`
**ID:** FID-2026-1102-096
**Severity:** medium
**Status:** verified
**Created:** 2026-11-02 18:40
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The old site enriched repository cards with GitHub stars, forks, language,
topics, license, and an Open Graph image. Signal stored repo items but had no
repository facts. This FID adds a token-gated GitHub lookup during ingestion,
stores the result in `content.items.github_json`, and renders it on the detail
aside and card without ever calling GitHub during a page render.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL, PGlite for local tests
- **Commit/State:** `cb0633b` plus the content working tree
- **New configuration:** `GITHUB_TOKEN` (optional)

## Detailed Description

### Problem

`ContentItem` had no GitHub shape, the store had no column, and ingestion had
no enrichment step. The old manifest noted that the GitHub star enrichment was
not ported. Repo items therefore showed only a title and a link.

### Expected Behavior

- When `GITHUB_TOKEN` is set, each repo item is enriched once per fetch cycle.
- A missing token skips enrichment; the item still ingests and renders.
- A failed lookup is absorbed and never fails the source.
- Facts are stored at fetch time; a render performs no GitHub request.
- Stars, forks, language, topics, license, homepage, and OG image are shown only
  when present.
- The same repo URL is requested at most once per cycle.

### Root Cause

Not a defect. The reference enrichment was not ported during the content merge.

### Evidence

```text
resources/aggroNATION-main/lib/fetchers/github-repos.ts: 175 lines
lib/content/types.ts before this FID: no GitHubRepo type
lib/storage/schema/content.ts before this FID: no github_json column
```

## Impact Assessment

### Affected Components

- `lib/content/github.ts` (new)
- `lib/content/types.ts`
- `lib/content/ingest.ts`
- `lib/content/policy.ts`
- `lib/content/store/items.ts`
- `lib/content/store/links.ts`
- `components/content/content-card.tsx`
- `components/content/content-detail-aside.tsx`
- `lib/storage/schema/content.ts`
- `.env.example`
- `tests/content-sources.test.mjs`

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: an unauthenticated call could exhaust a shared rate limit
- [ ] Low

## Proposed Solution

### Approach

Keep the GitHub client pure and optional. Gate the default fetcher on the token,
inject a fake in tests, cache by slug inside one cycle, and serialize the facts
into a new nullable column. Parse the column defensively so a malformed row is
missing data, not a page error.

### Steps

1. Add `GitHubRepo`, `githubJson`, and the column. — `implemented`
2. Add slug extraction, response parsing, and the token-gated fetch. — `implemented`
3. Enrich repo items in `fetchSourceItems`. — `implemented`
4. Render the repo panel and the OG image fallback. — `implemented`
5. Document `GITHUB_TOKEN` and test the round trip. — `implemented`

### Verification

`tests/content-sources.test.mjs` covers URL normalization, response parsing,
JSON round-trip, and an ingestion with an injected GitHub result. The UI reads
the stored facts; no network call exists in a render path.

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
- quality: exit 0 (PASS, 525 files scanned)

## Perfection Loop

### Loop 1 — RED

- **RED:** No repo shape, no column, no enrichment; old site parity missing.
- **GREEN:** Added the type, client, column, ingestion step, UI, and tests.
- **AUDIT:** The ingestion test asserts the stored item carries the injected
  description and stars, and that the excerpt uses the repo description.
- **ADVERSARIAL:** The first test called a non-existent `result.itemIds`; the
  test was corrected to read the stored page. The production code was not
  changed to satisfy a test convenience.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should enrichment run without a token? → No. The unauthenticated API is 60
   requests/hour and shared; a busy cycle could spend the whole budget. Without
   a token the UI honestly shows no repo facts.
2. Should a GitHub failure be logged as a source failure? → No. Repo facts are
   optional metadata; failing the source would disable a healthy feed.
3. Should the OG image be the card thumbnail? → Yes, as a fallback only. The
   repo card has no publisher image, and the GitHub OG URL is deterministic.
4. Should `links.ts` coverage items carry GitHub facts? → Yes; otherwise the
   model coverage tab would lose the same data the hub shows.

### Implementation Evidence

- **Commit SHA:** open; not closed until committed.
- **File:line ranges:** `lib/content/github.ts`,
  `lib/content/ingest.ts` (`enrichGithub`),
  `lib/content/store/items.ts` (`githubJson`, `parseGithubJson`),
  `lib/storage/schema/content.ts` (`github_json`),
  `components/content/content-detail-aside.tsx`.
- **Gate output:** focused test 9 pass. No live GitHub call ran because no
  `GITHUB_TOKEN` is configured; the injected-fetch path covers the contract.
- **Reproducibility:** `rg "GITHUB_TOKEN|github_json|parseGithubJson"`.
- **Step statuses:** all five `implemented`.

### Code Verification Evidence

- [x] Files exist
- [x] Implementation matches the solution
- [x] Typecheck/tests/lint pass; paste above
- [x] Call-graph: fetch route → `ingestSource` → `enrichGithub` →
  `fetchGithubRepo`; render → `getItem` → `parseGithubJson`
- [x] Status reflects implementation (`verified`)

### Loop 2 — Independent audit and self-correction

- **RED:** `lib/content/store/links.ts` built `CoverageItem` without the new
  required `github` field, so typecheck failed after the type change.
- **GREEN:** Added `github_json` to the coverage query and parsed it.
- **AUDIT:** `npm run typecheck` exits 0.
- **ADVERSARIAL:** A repo can be renamed. The stored slug is the fetch-time
  identity; the UI links it directly and a later fetch replaces it.
- **CHANGE DELTA:** 3%.

### Loop 3 — Final convergence

- **RED:** Does a malformed `github_json` break a page?
- **GREEN:** No; `parseGithubJson` returns null.
- **AUDIT:** The parser test asserts `parseGithubJson("not json") === null`.
- **ADVERSARIAL:** The stored description is escaped by React; it is not
  rendered as HTML. The excerpt uses `plainTextBody` and is sanitized.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** Repo items can carry GitHub facts, stored at fetch time
  and rendered without a live API call.
- **Tests Added:** Yes — `tests/content-sources.test.mjs`.
- **Verification Evidence:** lint, typecheck, focused test pass.
- **Archived:** not archived.

## Lessons Learned

Optional enrichment needs two states, not one: “no token” and “lookup failed”.
Both leave the item valid, and both are visible as absent facts rather than a
zero star count that looks real.
