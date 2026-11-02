# FID: Merged public content surface and model coverage tab

**Filename:** `FID-2026-1102-090-content-public-surface.md`
**ID:** FID-2026-1102-090
**Severity:** high
**Status:** closed
**Created:** 2026-11-02 15:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

Build the public half of the merge: one `/signal` hub for articles, videos,
papers, repositories, and discussions; a detail page that shows the model module
and a purchase CTA; topic hubs; and a Content/Coverage section on each model
page. The design keeps one purchase path: content → model module → existing
signup/account/plans routes. No content is sold and no entitlement is created.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Next.js 16 App Router
- **Storage:** PostgreSQL, reads through `content` store
- **Depends on:** FID-088, FID-089

## Detailed Description

### Problem

The gateway sells inference but has no reason to return between purchases. The
old site has discovery but no catalog and no purchase path. A separate content
site would split auth and attention; a content tab buried in docs would not be
discoverable.

### Expected Behavior

- `/signal` lists normalized items with a kind filter and tag chips, newest
  first, bounded page size. Empty state names the operator action.
- `/signal/[id]` renders title, source, date, author, sanitized body or excerpt,
  tags, and a “Models in this piece” module.
- The model module shows each linked model with price, access label, why it
  matched, and the correct CTA:
  - free → `/dashboard`
  - paid and signed out → `/signup?next=/account`
  - paid and signed in → `/account`
  - subscription → `/plans`
- A missing model id is omitted rather than rendering a broken link.
- `/signal/topics/[tag]` lists items with that canonical tag.
- Model detail gets a “Coverage” section with counts, relation labels, and
  linked cards. Empty state says no coverage yet and does not invent content.
- `CONTENT_ENABLED=false` makes `/signal` render a disabled state and hides the
  model coverage section, with no 500.
- All content links use canonical URLs; external links are `rel="noreferrer"`.

### Root Cause

The gateway has no content read path or presentation layer. The old site's
presentation is coupled to Supabase reads and a distinct visual language.

### Evidence

```text
app/models/[...id]/page.tsx        price, capabilities, identity; no coverage
config/site.ts                     six nav items, none content-related
resources/aggroNATION-main/app     content pages and Supabase reads
```

## Impact Assessment

### Affected Components

- `app/signal/**` (new)
- `components/content/**` (new)
- `app/models/[...id]/page.tsx`
- `config/site.ts`
- `app/sitemap.ts` if present
- `lib/content/store/*`
- `tests/content-format.test.mjs` (new)

### Risk Level

- [ ] Critical
- [x] High: public page can misstate a model's price or availability
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Server components read the content store and the existing catalog in one place;
a shared model module owns the CTA decision. The content look is quiet and
editorial, not a copy of the neon reference skin. Public pages are
`force-dynamic` so an ingest is visible without a redeploy.

### Steps

1. `implemented` — Add `lib/content/format.ts` for relation labels, date
   formatting, and the CTA target (pure and tested).
2. `implemented` — Build `/signal` with kind filters, tag chips, and paging.
3. `implemented` — Build `/signal/[id]` with sanitized body, tags, and model
   module.
4. `implemented` — Build `/signal/topics/[tag]`.
5. `implemented` — Add Coverage section to the model page.
6. `implemented` — Add “Signal” to public nav and the sitemap.
7. `implemented` — Add empty, disabled, and missing-model states.
8. `implemented` — Add format/CTA tests.

### Verification

- `tests/content-format.test.mjs` — CTA matrix, relation labels, date handling.
- `npm run build` — all new routes compile.
- Live check: `/signal`, a detail page, a topic page, and a model page render
  with a real ingested item and the correct CTA.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-format.test.mjs
- gate: test tests/content-store.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-11-02T15:39:24Z
- lint: exit 0, zero warnings
- typecheck: exit 0
- test tests/content-format.test.mjs: exit 0, 3 pass
- test tests/content-store.test.mjs: exit 0, 2 pass
- full `npm test`: exit 0, 789 tests, 788 pass, 1 skipped
- quality: exit 0, `PASS (400-line ceiling, 506 files scanned)`
- build: exit 0; `/signal`, `/signal/[id]`, `/signal/topics/[tag]`,
  `/signal/briefing`, `/signal/saved` and `/models/[...id]` appear in the
  route table
- live empty state: `/signal` 200 with “No stories yet”, `/models` 200
- live fixture: `/signal` 200 with the item and source; `/signal/[id]` 200 with
  the body, tags, “Models in this piece”, “Open the console”, and “Title
  matches”; `/signal/topics/openai` 200 with the item
- live model page: `/models/free/gpt-6-luna` 200 with “Coverage” and the linked
  item title
- error scan: no “Application error”, “Internal Server Error”, or digest in the
  rendered HTML

## Perfection Loop

### Loop 1 — RED

- **RED:** A content page can show a stale price or a CTA that sends a paid
  signed-in customer to signup. It can also render unsanitized feed HTML.
- **GREEN:** Model data comes from the live catalog projection, not a copy; the
  CTA is a pure function with four cases; body HTML is sanitized at ingest and
  again on render is unnecessary because the stored value is already clean.
- **AUDIT:** Format test covers all four CTA cases; build covers routes.
- **ADVERSARIAL:** “Signed in” is read from the session cookie, but the account
  may have no credit. The CTA goes to `/account`, which shows the balance; it
  does not promise a completed purchase.
- **CHANGE DELTA:** 0% (initial record).

### Missed Questions

1. **Does content need its own nav item?** Yes, one “Signal” item. Six content
   routes do not become six nav items.
2. **Should pages be static?** No. Ingestion changes them and the catalog is
   already dynamic.
3. **Should content be gated by a plan?** No. All editorial content is free; the
   purchase is inference.
4. **What if the content feature flag is off?** `/signal` says it is not enabled
   and model pages omit coverage. No route throws.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `81a40eb8af07ae4fdbc8626e112310b4ebc2a46e`
- [x] **File:line ranges:**
  - `lib/content/format.ts:63` — the four-case purchase CTA.
  - `app/signal/page.tsx:47` — hub, filters, paging, empty state.
  - `app/signal/[id]/page.tsx:45` — detail, sanitized body, model module.
  - `app/signal/topics/[tag]/page.tsx` — canonical topic hub.
  - `components/content/content-card.tsx:15` — shared card.
  - `components/content/model-module.tsx:18` — live price and CTA module.
  - `components/content/coverage-panel.tsx:10` — model-page coverage.
  - `app/models/[...id]/page.tsx:185` — Coverage rendered in the model page.
  - `config/site.ts` and `app/sitemap.ts` — one Signal nav item and sitemap
    entry.
- [x] **Gate output:** focused tests exit 0; full suite 788 pass, 1 skipped;
  lint/typecheck/quality/build exit 0.
- [x] **Reproducibility:** `rg -n "SignalPage|ModelModule|CoveragePanel"`
  finds every public entry point in the committed tree.
- [x] **Step statuses:** all eight steps `implemented`; no step deferred.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution: one hub, detail, topic,
  model coverage, live price, one CTA, disabled/empty/missing-model states.
- [x] Typecheck/tests/lint pass with pasted output above.
- [x] Production call graph: `/signal` → `listItems`/`listTags`;
  `/signal/[id]` → `getItem`/`listLinksForItem`/`getCatalogData`;
  model page → `listContentForModel`. The production route table confirms all.
- [x] FID status reflects the implementation: closed against `81a40eb`.

### Loop 2 — Independent audit and self-correction

- **RED:** The first render of the fixture detail page had no “Models in this
  piece” section because the disposable catalog was empty. That proved the
  module silently disappears when the catalog cannot resolve a linked model,
  which is correct for a missing model but hid the purchase path in the check.
- **GREEN:** Seeded one public free model in the disposable catalog. The same
  detail route then rendered “Models in this piece”, the model name, “Open the
  console”, and the match reason; the model page rendered Coverage.
- **AUDIT:** Both pages returned 200 with no error text. The format test covers
  all four CTA cases; the build lists every new route.
- **ADVERSARIAL:** The model module shows the catalog price, not a saved price
  from ingest. If the catalog changes between the content fetch and the render,
  the reader sees the current price. That is the intended single source of
  truth, not drift.
- **CHANGE DELTA:** 0% of scope; the check exposed a fixture gap, not a page
  defect.

### Loop 3 — Final convergence

- **RED:** Residual risk is that content pages are public while the catalog is
  dynamic; an operator can delist a model between the link write and the read.
  The page omits an unknown model rather than rendering a broken link.
- **GREEN:** `modelsById` resolution drops unknown ids; the coverage read joins
  the current catalog on the model page. `CONTENT_ENABLED=false` returns the
  disabled state and hides Coverage.
- **AUDIT:** Empty-state, fixture, topic, model-page, and production build all
  exit 200/0. The disabled path is a static branch with no DB call.
- **ADVERSARIAL:** The “signed in” CTA is based on a session, not on a balance.
  A signed-in customer with no credit lands on `/account`, which shows the
  balance; the button does not claim the purchase completed.
- **CHANGE DELTA:** 0% — scope and claims unchanged; evidence completed.

## Resolution

- **Closed Date:** 2026-11-02 15:39 UTC
- **Fix Description:** Added the `/signal` hub, detail and topic pages, the
  shared content card and model purchase module, the model-page Coverage
  section, one public nav item, the sitemap entry, and honest disabled/empty
  states.
- **Tests Added:** Yes — `tests/content-format.test.mjs` (CTA, dates, labels),
  plus the store and ingest coverage tests that feed the pages.
- **Verification Evidence:** lint 0 warnings, typecheck 0, quality PASS (506
  files), build 0, focused tests pass, full suite 788 pass / 1 skipped, live
  empty and fixture renders 200 including model module and Coverage.
- **Archived:** 2026-11-02 15:39 UTC (moved to `dev/fids/archive/`).

## Lessons Learned

The merge works only if the model module is the same purchase surface the
catalog already uses. A content-specific checkout would duplicate pricing.
