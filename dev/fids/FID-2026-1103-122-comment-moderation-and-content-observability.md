# FID: Comment moderation and content observability

**Filename:** `FID-2026-1103-122-comment-moderation-and-content-observability.md`
**ID:** FID-2026-1103-122
**Severity:** high
**Status:** converged
**Created:** 2026-11-03 10:35
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Signal has a public, authenticated comment surface with no delete or moderation
path at all: a customer cannot remove a typo and an operator cannot remove abuse
except by direct database access. The operator also cannot see reaction,
comment or save volume, and a parser-dropped feed entry is invisible because a
cycle records only `items_seen` and `items_upserted`.

## Environment

- **OS:** Windows 11, bash
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`
- **Commit/State:** `2708b3a` plus this change
- **New dependencies:** none

## Detailed Description

### Problem

`lib/content/store/comments.ts` exports add/list/count only. The admin content
page shows source and item counts, not engagement. `content.fetch_cycles` has no
skipped count, so a malformed entry appears only as a smaller `items_seen`.

### Expected Behavior

- A signed-in customer can delete their own comment; replies cascade.
- An operator can delete any comment from the admin content page.
- A delete is scoped: a customer cannot delete another customer's comment and a
  missing/foreign id is a 404, not a silent success.
- The admin content page reports reaction, comment and save totals.
- A cycle records how many raw entries were skipped.
- The retention policy for items is documented honestly.

### Root Cause

The discussion slice shipped authoring and reading; moderation and engagement
reporting were not in that slice. Cycle accounting mirrored the first fetcher.

### Evidence

```text
lib/content/store/comments.ts: no delete/own/operator function
app/admin/(panel)/content/page.tsx: source/cycle counts only
lib/content/store/cycles.ts: items_seen, items_upserted, error only
```

## Impact Assessment

### Affected Components

- `lib/content/store/comments.ts`, `lib/content/types.ts`
- `app/api/content/[id]/comments/route.ts` (DELETE)
- `app/api/admin/content/comments/[id]/route.ts` (new)
- `components/content/comment-section.tsx`, new delete button
- `components/admin/content-comment-moderation.tsx` (new)
- `app/admin/(panel)/content/page.tsx`
- `lib/content/store/cycles.ts`, `lib/storage/schema/content.ts`,
  `lib/content/feeds.ts`, `lib/content/ingest.ts`
- `tests/content-comments.test.mjs`, `tests/content-store.test.mjs`,
  `tests/content-ingest.test.mjs`
- `knowledge.md` (retention statement)

### Risk Level

- [ ] Critical
- [x] High: a public write surface with no moderation path
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Keep deletion at the store boundary with an explicit actor: the author path
requires `user_id`, the operator path requires an admin guard at the route.
Return a boolean and map false to 404. Add a viewer-aware `canDelete` boolean to
the comment read model so the UI never receives another customer's user id.
Count cycle skips by comparing parsed entries with the entries the parser saw.

### Steps

1. Add `deleteComment(db, commentId, { userId } | { operator: true })` with a
   scoped `DELETE ... RETURNING`; cascade removes replies.
2. Add `canDelete` to `ContentComment` from a viewer parameter on `listComments`.
3. Add the customer DELETE handler and the admin DELETE route.
4. Add the author delete button and the admin recent-comments panel with a
   client-side refresh.
5. Extend `contentStats` with reactions, comments and saves; show them.
6. Record `items_skipped` on cycles and parse reports.
7. Document that items are retained indefinitely and only snapshots prune.

### Verification

Focused tests prove own/foreign deletes, cascade, stats and skip accounting; the
full suite and build prove the UI compiles.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-comments.test.mjs
- gate: test tests/content-store.test.mjs
- gate: test tests/content-ingest.test.mjs
- gate: quality
- gate: build

### Verification Receipt

Implementation pass 2026-11-03: see Loop 2 and the closure receipt.

## Perfection Loop

### Loop 1 — RED

- **RED:** No delete path, no engagement totals, no skip accounting.
- **GREEN:** Actor-scoped delete, viewer-aware UI, stats and cycle column.
- **AUDIT:** The operator guard is at the route, not the button; the store
  refuses a foreign user id even if the route is wrong.
- **ADVERSARIAL:** Deleting a parent must not orphan replies; the schema cascade
  covers it and the test asserts it. A replay delete returns false, not 500.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Delete or hide? → Delete. A hidden-comment column adds a second read rule for
   little value; the operator can remove abuse outright.
2. Does the public model expose user ids? → No. It exposes one computed
   `canDelete` boolean.
3. Is an item ever deleted? → No automatic item deletion. This FID documents
   that decision instead of inventing a retention job that would break saved
   items and comments.
4. Does a skipped count change the source health? → No. Only a failed cycle does.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** pending implementation
- **Tests Added:** No
- **Verification Evidence:** None
- **Archived:** not archived
