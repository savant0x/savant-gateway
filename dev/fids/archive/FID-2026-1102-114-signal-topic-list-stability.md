# FID: Keep the Signal topics row stable on selection

**Filename:** `FID-2026-1102-114-signal-topic-list-stability.md`
**ID:** FID-2026-1102-114
**Severity:** low
**Status:** complete
**Created:** 2026-11-02
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Selecting a topic on `/signal` moved that topic to the front as a removable
chip and deleted it from its original position. The remaining chips shifted
left, so the operator lost their place after every click. The topics row must
keep its order and counts fixed; the selected topic is highlighted in place, and
a separate clear control sits at the end.

## Problem

`app/signal/page.tsx` rendered the selected tag first as `{tagLabel(tag)} ×`
and then rendered `tags.filter((entry) => entry.slug !== tag).slice(0, 12)`.
The selected topic therefore changed both the order and the membership of the
row. A direct topic URL whose tag was outside the visible twelve showed no
highlighted chip at all.

## Expected Behavior

- The visible topic chips always render from `tags.slice(0, 12)` in their normal
  order, selected or not.
- The selected chip uses the existing cyan active treatment and
  `aria-current="page"`; its label and count do not change, so its width does
  not change.
- If the selected topic is outside the visible twelve, an active chip is
  appended at the end, leaving the original twelve in place.
- A separate “Clear topic ×” link at the end clears the topic while preserving
  the kind and search filters.
- No tag counts or sort inputs change as a result of selection.

## Approach

Replace the filter-and-prepend block with one ordered map over
`tags.slice(0, 12)`, computing `active = entry.slug === tag`. Append the
out-of-list active chip only when needed, then a clear link when `tag` is set.

## Verification

- `npm run lint`, `npm run typecheck`, and the production build pass.
- The rendered order is determined only by `tags.slice(0, 12)`; no branch
  removes or reorders a chip.
- The selected chip's classes match the existing active filter treatment.
- “Clear topic ×” links to the same kind and search without `tag`.

## Perfection Loop

### Loop 1 — RED

- **RED:** Selection removes the active chip from its position and prepends a
  different chip, shifting the row.
- **GREEN:** Keep the ordered list immutable and style the active item in place.
- **AUDIT:** `tags` already comes from a global `listTags` query, independent of
  the selected tag; only the render logic caused movement.
- **ADVERSARIAL:** Removing the prepended chip also removes the only clear-topic
  affordance, so the fix must add an explicit clear link. A selected tag outside
  the visible twelve must still be discoverable without reordering the twelve.
- **CHANGE DELTA:** Initial design.

### Loop 2 — Convergence

- **RED:** An appended out-of-list chip could itself be mistaken for part of the
  fixed twelve.
- **GREEN:** Render it only when the tag is not already visible, and label it
  with the tag name only; the clear link remains separate.
- **AUDIT:** The visible twelve are unchanged for normal selections; direct
  topic URLs gain a visible active chip at the end.
- **ADVERSARIAL:** Counts stay global, so selecting a topic cannot alter another
  chip's label or width. No new query or state is introduced.
- **CHANGE DELTA:** 0% after the final audit.

## Implementation Evidence

- [x] Commit SHA: implementation and this closure record are in the containing
  commit.
- [x] Files: `app/signal/page.tsx`.
- [x] Tests added: none; this is a render-order correction with no new pure
  logic.
- [x] Verification: `npm run verify` exit 0 — 847 tests (846 pass, 1 skipped),
  quality PASS (535 files), production build 0, both HTTP suites PASS, and
  recovery drill PASS; lint zero warnings and typecheck 0 separately.

## Resolution

- **Closed Date:** 2026-11-02
- **Fix Description:** The topics row now renders a stable ordered list, with the
  selected topic highlighted in place and a separate clear control.
- **Tests Added:** No — UI-only ordering fix.
- **Verification Evidence:** `npm run verify` exit 0, recorded above.
- **Archived:** yes —
  `dev/fids/archive/FID-2026-1102-114-signal-topic-list-stability.md`
