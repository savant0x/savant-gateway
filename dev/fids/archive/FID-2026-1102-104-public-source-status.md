# FID: Public Signal source status

**Filename:** `FID-2026-1102-104-public-source-status.md`
**ID:** FID-2026-1102-104
**Severity:** low
**Status:** closed
**Created:** 2026-11-02 19:08
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The operator console shows source health, last fetch, failure streak, and the
last error. The old site had a public status page. Signal has no public view, so
a visitor who sees an empty hub cannot tell whether the feature is new, disabled,
or broken. This FID defines a public status page that exposes only the facts a
reader needs, not internal error text.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none

## Detailed Description

### Problem

The hub's empty state says “no source has produced an item” but does not show
whether a source is disabled, failing, or simply new. An operator debugging the
hub has to open the admin console; a reader has no signal at all.

### Expected Behavior

- `/signal/status` lists enabled sources with label, kind, last successful
  fetch, and a coarse state (`ok`, `delayed`, `paused`).
- The raw `last_error` is never shown publicly; it can contain upstream text.
- Disabled sources are shown as paused, not deleted.
- The page is read-only and returns 404 when the content surface is disabled.
- No admin session is required, and no credential or internal URL is exposed.

### Root Cause

Not a defect. The source health data is admin-only by design; no public
projection was built.

### Evidence

```text
app/admin/(panel)/content/page.tsx: source status, last fetch, last_error
app/signal/page.tsx: empty-state copy only
resources/aggroNATION-main/app/status/page.tsx: public status reference
```

## Impact Assessment

### Affected Components

- `app/signal/status/page.tsx` (new)
- `lib/content/status.ts` (pure state mapping)
- `lib/content/store/sources.ts` (public projection)
- `app/signal/page.tsx` (link)
- `tests/content-status.test.mjs` (new)

### Risk Level

- [ ] Critical
- [ ] High
- [ ] Medium
- [x] Low: read-only; the main risk is leaking internal error text

## Proposed Solution

### Approach

Derive a coarse state from `enabled`, `status`, `failureStreak`, and
`lastFetchedAt` relative to the fetch interval. Return only label, kind, state,
and last success. Map errors to a generic “source needs attention” label. Test
the pure mapping at each boundary.

### Steps

1. Add the pure state mapper and tests.
2. Add the public source projection.
3. Add `/signal/status` with the content guard.
4. Link it from the hub empty state and footer.
5. Confirm no `last_error` or credential-bearing field is selected.

### Verification

Planned tests: disabled → paused; three failures → needs attention; last fetch
older than two intervals → delayed; a just-fetched source → ok.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-status.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- closed: 2026-11-03
- commit: `7a2020d`
- focused: `node --test tests/content-status.test.mjs` exit 0 — 2/2
  (state boundaries; the public projection never selects URL, config or
  `last_error`)
- test: `npm test` exit 0 — 874 tests, 873 pass, 1 skipped
- typecheck: `npm run typecheck` exit 0
- lint: `npm run lint` exit 0, zero warnings
- quality: `npm run quality` exit 0 — PASS (400-line ceiling, 555 files)
- build: `npm run build` exit 0 — `/signal/status` compiled
- call graph: `/signal/status` calls `listPublicSources` in
  `lib/content/store/sources.ts` and `publicSourceState` in
  `lib/content/status.ts`; the hub empty state and the footer link to it
- not run: `npm run test:http`, `npm run test:recovery`, browser review

## Perfection Loop

### Loop 1 — RED

- **RED:** No public projection; the only health view is admin-only.
- **GREEN:** Not started.
- **AUDIT:** Admin page selects `source.lastError`; that must not move into a
  public component.
- **ADVERSARIAL:** A public status page can reveal which feeds the operator
  watches. That is already visible through published items and the source label
  on each card, so the incremental exposure is small; internal errors are not.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should it show item counts? → A count is harmless but already on the hub;
   omit it to keep the page about health.
2. Should it show disabled sources? → Yes, as paused, because “no items” is the
   symptom the reader is investigating.
3. Should it be indexed? → No. It is an operational view; add `robots: noindex`
   and keep it out of the sitemap.
4. What is “delayed”? → Older than two fetch intervals plus a grace period;
   the exact constants are pure and tested.

### Implementation Evidence

Not applicable; status is `converged`.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist
- [x] Implementation matches the Proposed Solution
- [x] Typecheck/tests/lint pass with pasted tool output (receipt above)
- [x] Production call-graph evidence is present (page, projection, mapper)
- [x] FID status reflects the implementation state (`closed`)

### Loop 2 — Implementation convergence (2026-11-03)

- **RED:** Re-read the admin content page and the source store. Confirmed the
  only health read selects the full source row, including `last_error`, and no
  public projection or status page exists.
- **GREEN:** Add `listPublicSources` selecting only id, label, kind, enabled,
  status, failure streak, interval and last fetch — never the URL, config or
  `last_error`. Add pure `publicSourceState` with four public states: `ok`,
  `delayed` (never fetched, or older than two intervals plus a 15-minute
  grace), `attention` (error status or at least three failures), and `paused`
  (disabled). `/signal/status` is read-only, returns 404 when the content
  surface is disabled, is `noindex`, and shows a generic “needs attention”
  label instead of upstream error text. Link it from the hub empty state and
  the footer.
- **AUDIT:** The projection is a separate query, not a filter of the admin row,
  so `last_error` cannot leak by accident. Boundaries are pure and tested.
  Disabled sources remain visible as paused.
- **ADVERSARIAL:** A public page reveals which feeds the operator watches,
  which published items and source labels already reveal; it does not reveal
  internal error text, credentials or URLs. An empty source list is an honest
  empty state. Crawlers are excluded with `robots: noindex`.
- **CHANGE DELTA:** New implementation section, well under 10% of the record.
- **Step statuses:** 1–5 `implemented` after verification; no deferred or
  skipped step.

## Resolution

- **Closed Date:** 2026-11-03
- **Fix Description:** a dedicated public source projection with a tested
  coarse state mapper, a `noindex` read-only `/signal/status` page guarded by
  the content switch, and links from the hub empty state and footer.
- **Tests Added:** Yes — `tests/content-status.test.mjs` (2 cases) covering
  disabled, failure, delay and current boundaries and the selected columns.
- **Verification Evidence:** commit `7a2020d`; focused suite 2/2;
  `npm test` 874 (873 pass, 1 skipped); typecheck, lint, quality and build all
  exit 0.
- **Archived:** 2026-11-03 — moved to `dev/fids/archive/`.

## Lessons Learned

A public status page is a projection, not a dump. The raw error is useful to the
operator and unsafe for the reader; map states, do not reuse the admin row.
