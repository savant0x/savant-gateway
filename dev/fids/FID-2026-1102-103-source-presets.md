# FID: One-click recoverable source presets

**Filename:** `FID-2026-1102-103-source-presets.md`
**ID:** FID-2026-1102-103
**Severity:** medium
**Status:** verified
**Created:** 2026-11-02 19:00
**Automation level:** 2
**YAGNI-Compliance:** Verified

---

## Summary

The old aggroNATION source rows lived in Supabase. Only six were committed in
the repository, and four further feeds are evidenced by source badges but were
not committed. Re-entering ten rows by hand is error-prone and hides which URLs
are exact versus inferred. This FID adds one preset manifest, an idempotent
seed helper, an admin button, and a CLI so the operator can populate Signal
without importing a second database.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL, PGlite local
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none

## Detailed Description

### Problem

The extraction produced `docs/research/aggronation-sources.json`, but there was
no product path from that manifest to the source registry. The admin form
creates one source at a time; a bulk import would have to be retyped and could
silently duplicate URLs.

### Expected Behavior

- Admin → Content offers **Add recommended sources**.
- The list contains the six committed rows where representable, plus four
  canonical inferred feeds.
- HuggingFace and Trendshift use their real source kinds, not RSS.
- Seeding is idempotent on URL; an existing row is skipped, never updated.
- A CLI can do the same against the configured database.
- The UI copy says YouTube channels are still not recoverable.

### Root Cause

Not a defect. The merge produced a manifest document but not a registry seed.

### Evidence

```text
docs/research/aggronation-sources.json: 6 exact rows, 4 inferred feeds
app/admin/(panel)/content/page.tsx before this FID: single-source form only
```

## Impact Assessment

### Affected Components

- `lib/content/presets.ts` (new)
- `scripts/seed-content-sources.mjs` (new)
- `app/api/admin/content/sources/seed/route.ts` (new)
- `components/admin/content-source-presets.tsx` (new)
- `app/admin/(panel)/content/page.tsx`
- `tests/content-sources.test.mjs`

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: a bad preset can create a source that fails every fetch
- [ ] Low

## Proposed Solution

### Approach

Keep the manifest in one typed array. Seed by comparing the normalized URL to
the existing registry; call `createSource` only for a missing URL. Surface the
same helper through an admin-guarded POST and a CLI. Never edit an existing row,
so an operator's label, tags, or interval always win.

### Steps

1. Add the preset manifest with exact/inferred notes. — `implemented`
2. Add the idempotent `seedContentSources`. — `implemented`
3. Add the admin seed route and button. — `implemented`
4. Add the CLI for non-UI use. — `implemented`
5. Test that a second seed creates nothing. — `implemented`

### Verification

`tests/content-sources.test.mjs` seeds twice and asserts the first run creates
all presets and the second creates none. The admin route and CLI call the same
helper, so the test covers both paths' core.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-sources.test.mjs
- gate: quality

### Verification Receipt

- verified: 2026-11-02T19:02:00Z
- lint: exit 0
- typecheck: exit 0
- test tests/content-sources.test.mjs: exit 0 (9 tests, 9 pass)
- seed:content: exit 0 (10 sources created against a disposable PGlite directory)
- live seed: 10 presets registered in the local database (4 already present from
  a partial first run, 6 added on the retry)
- quality: exit 0 (PASS, 525 files scanned)

## Perfection Loop

### Loop 1 — RED

- **RED:** Ten rows had no product path; manual entry could duplicate or
  mislabel the HuggingFace/Trendshift URLs as RSS.
- **GREEN:** Added the manifest, seed helper, route, button, CLI, and test.
- **AUDIT:** The second seed skips every preset; no row is updated.
- **ADVERSARIAL:** `new URL(preset.url)` normalizes the URL before comparison.
  A stored URL with a trailing slash is therefore treated as the same source,
  which is the desired identity for these feeds.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Should presets overwrite an existing source? → No. The operator may have
   disabled it, changed tags, or fixed a URL. Skipping is the safe rule.
2. Should the YouTube channels be guessed? → No. The repo does not contain the
   list; guessing would create sources the operator never chose.
3. Should seeding fetch immediately? → No. It only creates rows. A fetch is a
   separate explicit action, so a slow or failing feed does not make the seed
   look broken.
4. Should the script run while the dev server is using the local PGlite
   directory? → No. PGlite is single-process; the script refuses or the engine
   lock fails. The admin button is the path while the app is running.

### Implementation Evidence

- **Commit SHA:** open; not closed until committed.
- **File:line ranges:** `lib/content/presets.ts`,
  `app/api/admin/content/sources/seed/route.ts`,
  `components/admin/content-source-presets.tsx`,
  `scripts/seed-content-sources.mjs`.
- **Gate output:** focused test 9 pass; `npm run seed:content` created 10
  sources in a disposable local database, and the live seed registered 10
  presets in the local database.
- **Reproducibility:** `rg "CONTENT_SOURCE_PRESETS|seedContentSources"`.
- **Step statuses:** all five `implemented`.

### Code Verification Evidence

- [x] Files exist
- [x] Implementation matches the solution
- [x] Typecheck/tests/lint pass
- [x] Call-graph: admin button → POST `/api/admin/content/sources/seed` →
  `seedContentSources` → `createSource`; CLI uses the same helper
- [x] Status reflects implementation (`verified`)

### Loop 2 — Independent audit and self-correction

- **RED:** The first list used `https://huggingface.co/papers` as the HF source
  URL, but the fetcher calls the API endpoint. A row labelled with the page URL
  would misdescribe what is fetched.
- **GREEN:** The preset uses `https://huggingface.co/api/daily_papers`, matching
  the fetcher and the old committed URL.
- **AUDIT:** The preset list and `HUGGINGFACE_DAILY_PAPERS_URL` agree.
- **ADVERSARIAL:** A future source kind added to the union but not to the
  preset list is simply absent; no cast hides it.
- **CHANGE DELTA:** 4%.

### Loop 3 — Final convergence

- **RED:** Could a preset source pass validation yet fail immediately?
- **GREEN:** All URLs are public HTTPS; Reddit can rate-limit, and the copy
  notes it. The failure path is the existing visible cycle/streak.
- **AUDIT:** The seed test creates rows successfully under the URL policy.
- **ADVERSARIAL:** The route returns 400 if a preset URL becomes invalid, so a
  future policy change is visible rather than half-seeded.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** not closed
- **Fix Description:** Recoverable sources can be added in one action or one
  CLI command, with exact/inferred provenance in the manifest and no overwrite.
- **Tests Added:** Yes — double-seed idempotency in
  `tests/content-sources.test.mjs`.
- **Verification Evidence:** lint, typecheck, focused test pass.
- **Archived:** not archived.

## Lessons Learned

A data-recovery task is not finished when the data is found; it is finished when
the operator can load it without hand-copying. Idempotency on the canonical URL
is what makes the button safe to press twice.
