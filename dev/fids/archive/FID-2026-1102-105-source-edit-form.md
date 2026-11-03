# FID: Edit an existing content source

**Filename:** `FID-2026-1102-105-source-edit-form.md`
**ID:** FID-2026-1102-105
**Severity:** low
**Status:** closed
**Created:** 2026-11-02 19:20
**Automation level:** 2
**YAGNI-Compliance:** Verified

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

- closed: 2026-11-03
- commit: `7a2020d`
- focused: `node --test tests/content-store.test.mjs` exit 0 — 3/3,
  including the case that an edit touches only its row and that an invalid
  edit URL is refused
- test: `npm test` exit 0 — 874 tests, 873 pass, 1 skipped
- typecheck: `npm run typecheck` exit 0
- lint: `npm run lint` exit 0, zero warnings
- quality: `npm run quality` exit 0 — PASS (400-line ceiling, 555 files)
- build: `npm run build` exit 0 — the admin content page compiled
- call graph: `ContentSourceTable` is rendered by
  `app/admin/(panel)/content/page.tsx`, passes `onEdit` into
  `ContentSourceActions`, and the reused `ContentSourceForm` PATCHes
  `/api/admin/content/sources/[id]`
- not run: `npm run test:http`, `npm run test:recovery`, manual keyboard check

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

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output (receipt above)
- [x] Production call-graph evidence is present (page, table, actions, form)
- [x] FID status reflects the implementation state (`closed`)

### Loop 2 — Implementation convergence (2026-11-03)

- **RED:** Re-read the PATCH route, the create form, the row actions, and the
  admin content page. Confirmed the API already merges a partial body through
  `parseSourceBody` and `updateSource`, while the form always POSTs and the row
  has no Edit control.
- **GREEN:** Give `ContentSourceForm` an optional `ContentSource` prop. When
  present it initializes every field from the row, sends PATCH to that row's
  id, keeps the same parser and URL policy, and calls an `onDone` callback.
  Move the admin source table into one client component so an Edit action can
  open a full-width inline editor row without a modal primitive. Save refreshes
  the table; Cancel collapses the editor and changes nothing. The form states
  that a URL edit changes future fetches and that enabling clears the failure
  streak.
- **AUDIT:** There is one form and one validation path. A PATCH carries the
  whole edited row, so a blank optional field clears it as the operator sees
  it. The source id and stored items are unchanged.
- **ADVERSARIAL:** A URL edit keeps old items attached by design; the copy says
  so. A rejected URL surfaces the API error and leaves the row untouched. An
  edit cannot touch another source because the id is the row's own.
- **CHANGE DELTA:** New implementation section, well under 10% of the record.
- **Step statuses:** 1–5 `implemented` after verification; no deferred or
  skipped step.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** the create form now accepts an optional source and
  PATCHes that row through the existing parser, with an inline editor and Edit
  action in the admin source table.
- **Tests Added:** Yes — the update-isolation and invalid-URL cases in
  `tests/content-store.test.mjs` plus the existing parser coverage.
- **Verification Evidence:** commit `7a2020d`; focused suite 3/3;
  `npm test` 874 (873 pass, 1 skipped); typecheck, lint, quality and build all
  exit 0.
- **Archived:** 2026-11-03 — moved to `dev/fids/archive/`.

## Lessons Learned

When an API already exists, the gap is often a missing state transition in the
UI. Reusing the create form is cheaper and keeps one validation path.
