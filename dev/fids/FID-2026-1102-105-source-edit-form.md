# FID: Edit an existing content source

**Filename:** `FID-2026-1102-105-source-edit-form.md`
**ID:** FID-2026-1102-105
**Severity:** low
**Status:** converged
**Created:** 2026-11-02 19:20
**Automation level:** 2
**YAGNI-Compliance:** Pending

---

## Summary

The admin API supports updating a source (`PATCH /api/admin/content/sources/[id]`),
but the console exposes only Fetch, Enable/Disable, and Delete. An operator who
mistypes a label, URL, tag, interval, or item cap must delete the source and
lose its items. This FID adds an edit form that reuses the create form and the
existing PATCH contract.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none

## Detailed Description

### Problem

`components/admin/content-source-form.tsx` always posts to the collection with
`POST` and resets to `INITIAL`. There is no edit control in
`components/admin/content-source-actions.tsx` and no prefilled form per row.

### Expected Behavior

- Each source row has an Edit action.
- The form opens prefilled with label, kind, URL, tags, channel id, interval,
  item cap, and enabled state.
- Saving sends `PATCH /api/admin/content/sources/{id}`.
- The URL policy and the four source kinds apply exactly as on create.
- Cancel restores the row view without changing anything.
- A successful edit refreshes the table.

### Root Cause

Not a defect in the API; the UI was never built. The create form was written as
a one-shot component.

### Evidence

```text
app/api/admin/content/sources/[id]/route.ts: PATCH implemented
components/admin/content-source-actions.tsx: fetch/toggle/delete only
components/admin/content-source-form.tsx: POST and INITIAL reset
```

## Impact Assessment

### Affected Components

- `components/admin/content-source-form.tsx`
- `components/admin/content-source-actions.tsx` or a row-editor wrapper
- `app/admin/(panel)/content/page.tsx`
- tests for the input parser (existing) and a UI-focused review

### Risk Level

- [ ] Critical
- [ ] High
- [ ] Medium
- [x] Low: admin-only, existing API and validation

## Proposed Solution

### Approach

Make the form accept an optional `source` prop. When present, initialize from
it and PATCH to its id; when absent, keep the current POST. Keep one form and
one validation path. The edit action can open the form in an inline row or a
dialog; choose the smaller layout that keeps the table readable.

### Steps

1. Extract the form state initializer from a source row.
2. Add the optional source prop and PATCH branch.
3. Add the Edit action and prefill wiring.
4. Hide the create form while editing, or render the editor inline.
5. Verify create, edit, cancel, and a rejected URL.

### Verification

Planned tests: parser rejects an invalid edit URL; a PATCH updates only the
intended row; a cancel leaves the source untouched. Manual keyboard check after
implementation.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-store.test.mjs
- gate: quality
- gate: build

### Verification Receipt

Not run. Status is `converged`; no code shipped.

## Perfection Loop

### Loop 1 — RED

- **RED:** No edit control; delete is the only way to fix a typo.
- **GREEN:** Not started.
- **AUDIT:** The PATCH route validates through `parseSourceBody`, so the missing
  work is presentation, not a second validation rule.
- **ADVERSARIAL:** Editing a URL changes source identity while items keep their
  source_id. That is intended: the rows stay attached, but the next fetch reads
  a different feed. The UI must say so rather than imply a rename.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should editing a URL delete old items? → No. It changes future fetches; old
   items remain and are still labeled with the source label.
2. Should the source id change? → No. Stable ids keep item and cycle foreign
   keys intact.
3. Should an edit reset the failure streak? → The existing PATCH sets status
   active and clears the streak when enabled; keep that behavior and document
   it in the form copy.
4. Should editing be inline or a dialog? → Inline is simpler and avoids a new
   modal primitive; choose it unless the table becomes unreadable.

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

When an API already exists, the gap is often a missing state transition in the
UI. Reusing the create form is cheaper and keeps one validation path.
