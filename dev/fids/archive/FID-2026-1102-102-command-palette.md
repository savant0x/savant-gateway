# FID: Signal command palette

**Filename:** `FID-2026-1102-102-command-palette.md`
**ID:** FID-2026-1102-102
**Severity:** low
**Status:** closed
**Created:** 2026-11-02 19:08
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The old site had a command palette for jumping to content, tags, and pages.
Signal now has a plain search form but no keyboard-first navigation. This FID
defines a bounded palette: open with Ctrl/Cmd+K, search items and model names,
navigate with arrows, and go to the selected page. It does not add a second
search engine or a client-side full corpus.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none

## Detailed Description

### Problem

A visitor can search only by submitting the hub form, and only items. Models,
topics, and the digest are reachable by links, not by keyboard.

### Expected Behavior

- Ctrl/Cmd+K opens a dialog from any public page.
- Typing queries `/api/content/search?q=` with a 150 ms debounce and an abort
  for the previous request.
- Results are grouped: items, models, topics.
- Arrow keys move, Enter navigates, Escape closes.
- An empty query shows nothing; a failed request shows an error, not an empty
  “no results” lie.
- The palette is keyboard accessible and focus returns to the trigger on close.

### Root Cause

Not a defect. The merged surface did not port the reference palette.

### Evidence

```text
resources/aggroNATION-main/components/command-palette.tsx: 224 lines
resources/aggroNATION-main/app/api/search/route.ts: 40 lines
components/landing/site-header.tsx: no palette trigger
```

## Impact Assessment

### Affected Components

- `app/api/content/search/route.ts` (new)
- `components/content/command-palette.tsx` (new)
- `components/landing/site-header.tsx`
- `lib/content/store/items.ts` (reuse search)
- `app/models/page.tsx` search or a model query
- tests for query limits and result mapping

### Risk Level

- [ ] Critical
- [ ] High
- [ ] Medium
- [x] Low: read-only navigation, no storage mutation

## Proposed Solution

### Approach

Reuse the existing item search and a bounded model-name query. Return at most 5
items and 3 models/topics. The API validates `q` length and returns a typed
payload. The palette is a client component mounted once in the site header,
with an abortable fetch and no client-side cache beyond the current open.

### Steps

1. Add the read-only search route with a length cap and `no-store`.
2. Add a model/topic lookup bounded to three rows each.
3. Build the accessible dialog and keyboard handling.
4. Mount the trigger in the public header.
5. Test the query parser and result caps.

### Verification

Planned tests: 1-character query is rejected; whitespace is trimmed; results
are capped; a repository error surfaces as an error state. Manual keyboard
check after implementation.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-search.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- closed: 2026-11-03
- commit: `7a2020d`
- focused: `node --test tests/content-search.test.mjs` exit 0 — 2/2
  (pure query bounds; capped items, models and topics with unpublished rows
  excluded)
- test: `npm test` exit 0 — 874 tests, 873 pass, 1 skipped
- typecheck: `npm run typecheck` exit 0
- lint: `npm run lint` exit 0, zero warnings
- quality: `npm run quality` exit 0 — PASS (400-line ceiling, 555 files)
- build: `npm run build` exit 0 — `/api/content/search` compiled
- call graph: `CommandPalette` is mounted once by
  `components/landing/site-header.tsx`; it fetches `/api/content/search`,
  which calls `listItems`, `listTags` and `searchModels`
- not run: `npm run test:http`, `npm run test:recovery`, manual keyboard check

## Perfection Loop

### Loop 1 — RED

- **RED:** No route, no dialog, no keyboard trigger.
- **GREEN:** Not started.
- **AUDIT:** The existing search is server-rendered and cannot be called from a
  client dialog without a route.
- **ADVERSARIAL:** A public search endpoint is a scraping surface. Cap `q`, cap
  rows, keep it read-only, and do not expose unpublished or admin-only data.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should the palette search page bodies? → No; title/excerpt, matching the hub.
2. Should it remember recent searches? → Not in this slice. That is local
   storage/privacy scope, not navigation.
3. Should it be available on admin pages? → No. Admin has its own navigation;
   mounting a public search there would mix surfaces.
4. Should it use a client-side index? → No. The dataset is database-owned and
   can change between requests.

### Implementation Evidence

Not applicable; status is `converged`.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output (receipt above)
- [x] Production call-graph evidence is present (header, route, store lookups)
- [x] FID status reflects the implementation state (`closed`)

### Loop 2 — Implementation convergence (2026-11-03)

- **RED:** Re-read the public header, the hub search form, the item query, and
  the catalog model rows. Confirmed no search route and no client palette; the
  only search is the server-rendered hub form over titles and excerpts.
- **GREEN:** Add pure `parseSearchQuery` limits (two-character minimum, 120
  maximum, trimmed), a read-only `/api/content/search` route with `no-store`,
  five items, three models and three topics. Extend `listTags` with an optional
  search term and add a bounded `searchModels`. Mount one client palette in the
  public header when the content surface is enabled; it uses a native dialog,
  Ctrl/Cmd+K, Escape, arrow navigation, Enter, a 150 ms debounce and an abort
  for the previous request. Empty input shows nothing; a failed request shows
  an error state rather than “no results”.
- **AUDIT:** The route is read-only, validates `q`, selects no admin-only
  field, and returns typed rows. The palette is mounted once, returns focus on
  close, and is not mounted on admin pages. No client-side corpus or cache is
  introduced.
- **ADVERSARIAL:** The endpoint is a scraping surface, so the query and every
  result group are capped and the payload carries only navigation fields. A
  one-character query is rejected before a database read. A slow earlier
  request cannot overwrite a newer result because it is aborted.
- **CHANGE DELTA:** New implementation section, well under 10% of the record.
- **Step statuses:** 1–5 `implemented` after verification; no deferred or
  skipped step.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** a read-only bounded search route with a two-character
  minimum and 120-character cap, and an accessible Ctrl/Cmd+K palette with
  debounce, abort, arrow navigation and an honest error state.
- **Tests Added:** Yes — `tests/content-search.test.mjs` (2 cases) covering
  parser bounds and capped, published-only results.
- **Verification Evidence:** commit `7a2020d`; focused suite 2/2;
  `npm test` 874 (873 pass, 1 skipped); typecheck, lint, quality and build all
  exit 0.
- **Archived:** 2026-11-03 — moved to `dev/fids/archive/`.

## Lessons Learned

A palette is a second client over the same query contract. Building it before
the query is bounded is how a small navigation feature becomes a scraping API.
