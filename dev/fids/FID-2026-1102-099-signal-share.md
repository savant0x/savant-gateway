# FID: Share a Signal item

**Filename:** `FID-2026-1102-099-signal-share.md`
**ID:** FID-2026-1102-099
**Severity:** low
**Status:** verified
**Created:** 2026-11-02 18:55
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

Signal detail pages had Save and the model module but no share action. This FID
adds a small client control that uses the Web Share API when available and
falls back to copying the current URL. It shares the canonical page, not the
publisher's URL, so a recipient lands on the model-linked context.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** none
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none

## Detailed Description

### Problem

A reader who wanted to pass a story to someone had to copy the address bar. The
old site exposed sharing on its cards and detail pages.

### Expected Behavior

- A Share control appears next to Save.
- On a device with `navigator.share`, it opens the native sheet with the item
  title and the current URL.
- Otherwise it copies the URL and shows “Link copied”.
- Cancelling the native sheet shows no error.
- A clipboard failure shows a short failure message, not a crash.

### Root Cause

Not a defect. The merged surface did not port the share control.

### Evidence

```text
app/signal/[id]/page.tsx before this FID: SaveButton only
resources/aggroNATION-main/components/article/*: share controls
```

## Impact Assessment

### Affected Components

- `components/content/share-button.tsx` (new)
- `app/signal/[id]/page.tsx`

### Risk Level

- [ ] Critical
- [ ] High
- [ ] Medium
- [x] Low: presentation-only, no storage or billing path

## Proposed Solution

### Approach

Keep the control client-side and dependency-free. Prefer the native share sheet,
fall back to `navigator.clipboard`, and treat `AbortError` as a normal cancel.

### Steps

1. Add the client `ShareButton`. — `implemented`
2. Render it beside Save on the detail page. — `implemented`
3. Handle native share, clipboard fallback, cancel, and failure. — `implemented`

### Verification

Inspection of the rendered page shows the control in the action row. The
browser API branches are small and typed; no new storage or server path exists.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: quality

### Verification Receipt

- verified: 2026-11-02T18:58:00Z
- lint: exit 0
- typecheck: exit 0
- quality: exit 0 (PASS, 525 files scanned)

## Perfection Loop

### Loop 1 — RED

- **RED:** No share action.
- **GREEN:** Added native share with clipboard fallback.
- **AUDIT:** The component reads `window.location.href` only inside the click
  handler, so server rendering is unaffected.
- **ADVERSARIAL:** `navigator.clipboard` is unavailable on insecure origins;
  the catch path shows a message. The native share path is tried first.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should it share the publisher URL instead? → No. The Signal page carries the
   model links and the purchase path, which is the reason the content exists.
2. Should it track shares? → Not in this slice. There is no analytics table and
   adding one would be a separate retention/privacy decision.
3. Does it work without JavaScript? → No; this is a client control. The page
   itself remains fully server-rendered and readable.

### Implementation Evidence

- **Commit SHA:** open; not closed until committed.
- **File:line ranges:** `components/content/share-button.tsx`,
  `app/signal/[id]/page.tsx` (action row).
- **Gate output:** lint and typecheck exit 0.
- **Reproducibility:** `rg "ShareButton"`.
- **Step statuses:** all three `implemented`.

### Code Verification Evidence

- [x] Files exist
- [x] Implementation matches the solution
- [x] Typecheck/lint pass
- [x] Call-graph: detail page renders `ShareButton`; click calls browser APIs
- [x] Status reflects implementation (`verified`)

### Loop 2 — Independent audit and self-correction

- **RED:** The first draft showed a message even after a successful native
  share; that is noise.
- **GREEN:** Native share returns without setting a message; only the clipboard
  fallback confirms.
- **AUDIT:** The component returns early after `navigator.share`.
- **ADVERSARIAL:** A user can dismiss the native sheet; `AbortError` is mapped
  to no message.
- **CHANGE DELTA:** 2%.

### Loop 3 — Final convergence

- **RED:** Could the button trigger a navigation?
- **GREEN:** It is `type="button"` and has no form ancestor.
- **AUDIT:** No `<form>` wraps the action row.
- **ADVERSARIAL:** The label is text, not an icon, so it is readable by screen
  readers without an `aria-label`.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** Signal detail pages have a native/clipboard share action.
- **Tests Added:** No; the behavior is browser-API presentation and has no
  testable server branch. The typing gates cover the component.
- **Verification Evidence:** lint and typecheck pass.
- **Archived:** not archived.

## Lessons Learned

Sharing the destination page, not the source URL, is what keeps the content
connected to the catalog. The share control is a small expression of the merge's
whole premise.
