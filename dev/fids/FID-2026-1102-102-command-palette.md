# FID: Signal command palette

**Filename:** `FID-2026-1102-102-command-palette.md`
**ID:** FID-2026-1102-102
**Severity:** low
**Status:** converged
**Created:** 2026-11-02 19:08
**Automation level:** 2
**YAGNI-Compliance:** Pending

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

Not run. Status is `converged`; no code shipped.

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

- [ ] Files referenced in Affected Components exist
- [ ] Implementation matches the Proposed Solution
- [ ] Typecheck/tests/lint pass with pasted tool output
- [ ] Production call-graph evidence is present
- [ ] FID status reflects the implementation state

## Resolution

- **Closed Date:** not closed
- **Fix Description:** Planned; no code shipped under this FID.
- **Tests Added:** No.
- **Verification Evidence:** None.
- **Archived:** not archived.

## Lessons Learned

A palette is a second client over the same query contract. Building it before
the query is bounded is how a small navigation feature becomes a scraping API.
