# FID: Content retention — watch a model, saved reading, model-aware briefing

**Filename:** `FID-2026-1102-091-content-retention.md`
**ID:** FID-2026-1102-091
**Severity:** medium
**Status:** closed
**Created:** 2026-11-02 15:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Add the smallest retention loop that makes the merged surface useful after the
first visit: a signed-in customer can watch a model, save an item, and read a
model-aware briefing. It uses the existing customer session and creates no new
entitlement. It is the only slice with customer state, and it is still isolated
from billing.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Next.js 16
- **Storage:** PostgreSQL `content.watches`, `content.saved_items`
- **Depends on:** FID-088, FID-089, FID-090

## Detailed Description

### Problem

The content surface has no reason to return: a reader who found a model through
an article has no way to follow that model or keep the article. Without state,
the merged surface is a feed, not a product loop.

### Expected Behavior

- A signed-in customer can watch/unwatch a model from the model page and from a
  content model module.
- A signed-in customer can save/unsave an item from a content card and detail
  page.
- `/signal/briefing` groups the last seven days of items by watched model; with
  no watches it shows latest content and a prompt to follow a model.
- `/signal/saved` lists the customer's saved items; signed-out visitors are
  redirected to login with a next path.
- Both mutations are same-origin, authenticated, and idempotent.
- Counts are bounded; no unbounded list is rendered.
- The feature respects `CONTENT_ENABLED`.

### Root Cause

The old site had engagement counters (views, likes) but no customer identity and
no model concept. The gateway has identity but no content state.

### Evidence

```text
resources/aggroNATION-main/supabase/migrations/engagement_discovery.sql
  engagement counters, no account identity
gateway customer_sessions + users   existing auth to reuse
gateway content schema               no watch/save tables yet
```

## Impact Assessment

### Affected Components

- `lib/storage/schema/content.ts`
- `lib/content/store/engagement.ts` (new)
- `lib/content/briefing.ts` (new)
- `app/api/account/content/watch/route.ts` (new)
- `app/api/account/content/saved/route.ts` (new)
- `app/signal/briefing/page.tsx` (new)
- `app/signal/saved/page.tsx` (new)
- `components/content/follow-buttons.tsx` (new)
- `app/models/[...id]/page.tsx`
- `tests/content-store.test.mjs` (retention assertions added)

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: customer state, but no money path
- [ ] Low

## Proposed Solution

### Approach

Two join tables keyed by `users.id`, with composite primary keys so the
operations are naturally idempotent. The briefing is a read over watched models'
coverage; no new recommendation model and no engagement scoring.

### Steps

1. `implemented` — Add watch and saved tables.
2. `implemented` — Add engagement store: toggle, check, list.
3. `implemented` — Add authenticated same-origin API routes.
4. `implemented` — Add follow/save client controls with pending and error state.
5. `implemented` — Add model page follow control.
6. `implemented` — Add `/signal/briefing` and `/signal/saved`.
7. `implemented` — Add tests for idempotent toggles and briefing grouping.

### Verification

- `tests/content-store.test.mjs` — toggle twice, list bounded, briefing groups
  by watched model and excludes stale items.
- Live check: sign in, watch a model, save an item, reload both pages.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-store.test.mjs (retention assertions)
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-11-02T15:39:24Z
- lint: exit 0, zero warnings
- typecheck: exit 0
- test tests/content-store.test.mjs: exit 0, 2 pass (watch, save, briefing,
  saved list, both toggles off)
- full `npm test`: exit 0, 789 tests, 788 pass, 1 skipped
- quality: exit 0, `PASS (400-line ceiling, 506 files scanned)`
- build: exit 0; `/api/account/content/watch`, `/api/account/content/saved`,
  `/signal/briefing`, and `/signal/saved` appear in the route table
- live authenticated HTTP on a disposable PGlite database:
  - `POST /api/account/content/watch` with a real `sg_session` cookie and same
    origin → 200 `{"watched":true}`
  - `POST /api/account/content/saved` → 200 `{"saved":true}`
  - `GET /signal/briefing` with the cookie → 200, showed “GPT-6 Luna launch
    notes” under the followed model
  - `GET /signal/saved` → 200, showed the item and “Retention Fixture”
  - both toggles back to false returned 200
  - no “Application error”, “Internal Server Error”, or digest in either page

## Perfection Loop

### Loop 1 — RED

- **RED:** A watch table without a uniqueness rule double-inserts on retry; a
  saved page without a bound can render the entire corpus. A briefing that reads
  all content is just the hub again.
- **GREEN:** Composite primary keys; `limit` clamps; briefing reads items linked
  to watched models within a seven-day window and falls back to latest.
- **AUDIT:** Tests toggle twice and assert one row; briefing excludes an item
  older than the window.
- **ADVERSARIAL:** A watch on a model removed from the catalog remains in the
  table but is dropped from the briefing by the catalog join. The row is inert,
  not a broken link.
- **CHANGE DELTA:** 0% (initial record).

### Missed Questions

1. **Should anonymous visitors have local saved items?** No. That needs a second
   identity and a merge path. Sign-in is the existing boundary.
2. **Should watching send email?** No. There is no consent or delivery path in
   this slice; the briefing is pull-only.
3. **Should views/likes be copied from the old site?** No. They drove a ranking
   that would be mistaken for model quality. This slice has no public counters.
4. **Is the briefing personalized by model quality?** No. It is a chronological
   read of watched-model coverage, with the reason visible.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `81a40eb8af07ae4fdbc8626e112310b4ebc2a46e`
- [x] **File:line ranges:**
  - `lib/storage/schema/content.ts` — `watches` and `saved_items`, composite
    primary keys.
  - `lib/content/store/engagement.ts:14` — idempotent watch setter and cap.
  - `lib/content/store/engagement.ts:90` — idempotent saved setter and cap.
  - `lib/content/store/engagement.ts:152` — saved reading list.
  - `lib/content/store/engagement.ts:166` — model-aware briefing.
  - `app/api/account/content/watch/route.ts` — authenticated, same-origin.
  - `app/api/account/content/saved/route.ts` — authenticated, same-origin.
  - `app/signal/briefing/page.tsx` and `app/signal/saved/page.tsx`.
  - `components/content/watch-button.tsx` and `save-button.tsx`.
- [x] **Gate output:** focused tests exit 0; full suite 788 pass, 1 skipped;
  lint/typecheck/quality/build exit 0; authenticated HTTP toggles 200.
- [x] **Reproducibility:** `rg -n "setWatch|setSaved|briefingForUser"` finds
  the store and both API routes in the committed tree.
- [x] **Step statuses:** all seven steps `implemented`; the planned separate
  engagement test file was folded into the existing content store test rather
  than duplicated.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution: watch/save tables, toggles,
  authenticated APIs, client controls, model follow, briefing, saved page.
- [x] Typecheck/tests/lint pass with pasted output above.
- [x] Production call graph: model page → `WatchButton` → watch API → `setWatch`;
  detail page → `SaveButton` → saved API → `setSaved`; briefing →
  `briefingForUser` → `listContentForModel`; saved → `listSavedItems`.
- [x] FID status reflects the implementation: closed against `81a40eb`.

### Loop 2 — Independent audit and self-correction

- **RED:** The planned `tests/content-engagement.test.mjs` would have duplicated
  the same PGlite fixture and the same toggle assertions as the content store
  test. A duplicate test file is not evidence; it is another fixture to maintain.
- **GREEN:** The retention assertions live in `tests/content-store.test.mjs`
  (watch, save, briefing, saved list, both off). The separate promised path is
  marked as folded rather than silently missing.
- **AUDIT:** Full suite 788 pass; authenticated HTTP watch/save/briefing/saved
  all 200 with a real session cookie, then both toggles off 200.
- **ADVERSARIAL:** The briefing is pull-only and returns the latest six followed
  models; a seventh watch is stored but not shown in the briefing. That is a
  display bound, not a lost row, and the watch cap is 30.
- **CHANGE DELTA:** 0% of scope; one planned test path was consolidated.

### Loop 3 — Final convergence

- **RED:** Residual risk is a watch on a model that is later delisted. The row
  remains but the briefing's catalog join drops it, so no dead link appears.
- **GREEN:** `modelsById` omits unknown ids; saved items still open because the
  item row is independent of the catalog. The saved list has a 50-item cap and
  the watch list a 30-model cap.
- **AUDIT:** Authenticated HTTP test covered on/off for both mutations and both
  pages; no error text. Store tests assert one row after a repeated on toggle.
- **ADVERSARIAL:** No email delivery or push notification exists. The FID says
  pull-only and does not claim a notification channel.
- **CHANGE DELTA:** 0% — scope and claims unchanged; evidence completed.

## Resolution

- **Closed Date:** 2026-11-02 15:39 UTC
- **Fix Description:** Added composite-keyed watch and saved tables, idempotent
  setters with caps, authenticated same-origin APIs, follow/save client
  controls, the model-aware briefing, and the saved reading list.
- **Tests Added:** Retention assertions in `tests/content-store.test.mjs`
  (watch, save, briefing, saved list, toggles off); the separate engagement
  test file named in the draft was folded into that suite.
- **Verification Evidence:** lint 0 warnings, typecheck 0, quality PASS (506
  files), build 0, full suite 788 pass / 1 skipped, authenticated HTTP toggles
  and both pages 200 on a disposable database.
- **Archived:** 2026-11-02 15:39 UTC (moved to `dev/fids/archive/`).

## Lessons Learned

Retention should reuse the existing identity boundary and stay pull-only until
there is a consented delivery path.
