# FID: Signal search over titles and excerpts

**Filename:** `FID-2026-1102-097-signal-search.md`
**ID:** FID-2026-1102-097
**Severity:** medium
**Status:** verified
**Created:** 2026-11-02 18:55
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The old site had a search page and a command palette. The merged Signal hub
accepted `kind` and `tag` filters but had no visible search box, even though
the item query already supported a `search` argument. This FID exposes search
on `/signal`, preserves it across kind/tag/pagination links, and defines the
honest boundary: title and excerpt matching, not semantic retrieval.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none

## Detailed Description

### Problem

`ItemQuery.search` existed and the SQL clause used `ILIKE` on title and excerpt,
but no page passed a query value and no control submitted one. A visitor could
not search Signal.

### Expected Behavior

- A search field on `/signal` submits `q`.
- The query is trimmed and capped at 120 characters.
- Matching is case-insensitive title/excerpt substring matching.
- The query survives kind, tag, and pagination navigation.
- An empty result explains that search is title/excerpt only.
- A clear link removes the query without losing the active filters.

### Root Cause

The search capability was implemented at the store layer but never wired into
the public surface.

### Evidence

```text
lib/content/store/items.ts: itemWhere search uses title ILIKE / excerpt ILIKE
app/signal/page.tsx before this FID: Search type has kind, tag, page only
```

## Impact Assessment

### Affected Components

- `app/signal/page.tsx`
- `lib/content/store/items.ts` (existing query boundary)
- `tests/content-sources.test.mjs`

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: an unbounded query can scan the item table
- [ ] Low

## Proposed Solution

### Approach

Keep the existing SQL contract. Add `q` to the page's search params and to the
URL builder, render a GET form with hidden kind/tag fields, and pass the value
to `listItems`. Cap the input at 120 characters and trim it in the page.

### Steps

1. Add `q` to the page search type and URL builder. — `implemented`
2. Render the search form with hidden filters and a clear link. — `implemented`
3. Pass `search` to `listItems`. — `implemented`
4. Preserve the query across filters and pagination. — `implemented`
5. Add a store-level search assertion. — `implemented`

### Verification

`tests/content-sources.test.mjs` ingests a paper and asserts one match for a
summary word and zero for an absent word. The page uses the same query path.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-sources.test.mjs
- gate: quality

### Verification Receipt

- verified: 2026-11-02T18:58:00Z
- lint: exit 0
- typecheck: exit 0
- test tests/content-sources.test.mjs: exit 0 (9 tests, 9 pass)
- live: `/signal?q=routing` returned 2 items
- quality: exit 0 (PASS, 525 files scanned)

## Perfection Loop

### Loop 1 — RED

- **RED:** No visible search control; `search` never reached the store.
- **GREEN:** Added the form, query parameter, link preservation, and test.
- **AUDIT:** The test asserts `total === 1` for "routing" and `0` for "quantum".
- **ADVERSARIAL:** A query containing `%` is passed as a parameterized value,
  so it is a literal percent rather than a wildcard. That is the safer default;
  it may surprise a user who expects SQL wildcards, but search is substring.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should search cover body HTML? → No. Excerpt is plain text and bounded;
   matching raw stored HTML would return script/style text and cost more.
2. Should search be case-sensitive? → No. `ILIKE` matches publisher casing.
3. Should an empty query show all items? → Yes; the form sends an empty `q` and
   the page treats it as absent.
4. Does search need an index? → Not yet. The current corpus is small and the
   page is bounded to 24 rows; FID-103 records the future index need.

### Implementation Evidence

- **Commit SHA:** open; not closed until committed.
- **File:line ranges:** `app/signal/page.tsx` (`Search`, `queryHref`, form,
  `listItems` call), `tests/content-sources.test.mjs`.
- **Gate output:** focused test pass.
- **Reproducibility:** `rg "Search titles and excerpts|queryHref\\(kind, tag"`.
- **Step statuses:** all five `implemented`.

### Code Verification Evidence

- [x] Files exist
- [x] Implementation matches the solution
- [x] Typecheck/tests/lint pass
- [x] Call-graph: GET `/signal?q=` → `SignalPage` → `listItems({ search })`
- [x] Status reflects implementation (`verified`)

### Loop 2 — Independent audit and self-correction

- **RED:** Changing kind or tag initially dropped `q`, so the result count and
  the visible query disagreed.
- **GREEN:** Added `search` to every filter/tag/pagination `queryHref` call.
- **AUDIT:** All links now pass the same fourth argument; inspection of the page
  shows no `queryHref(kind, tag)` calls left in the filtered surface.
- **ADVERSARIAL:** The form uses `method="get"` with no action override, so a
  missing `action` would still work; the explicit `/signal` is kept for clarity.
- **CHANGE DELTA:** 5%.

### Loop 3 — Final convergence

- **RED:** Does a long query get reflected back into the input?
- **GREEN:** The page trims to 120 characters, and the input uses `maxLength`.
- **AUDIT:** The rendered `defaultValue` is the truncated value.
- **ADVERSARIAL:** A query with only whitespace becomes undefined, so the page
  shows the unfiltered hub rather than a no-results state.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** `/signal` has a visible search field backed by the
  existing title/excerpt query, and the query survives filter navigation.
- **Tests Added:** Yes — search assertion in `tests/content-sources.test.mjs`.
- **Verification Evidence:** lint, typecheck, focused test pass.
- **Archived:** not archived.

## Lessons Learned

A store-level capability is not a feature until a surface submits it. The
missing piece here was one parameter and one form, not a new query engine.
