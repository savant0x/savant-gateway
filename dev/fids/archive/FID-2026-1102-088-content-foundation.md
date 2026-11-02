# FID: Content source foundation and ingestion scaffolding

**Filename:** `FID-2026-1102-088-content-foundation.md`
**ID:** FID-2026-1102-088
**Severity:** high
**Status:** closed
**Created:** 2026-11-02 15:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

The gateway has no content surface. The operator approved merging the free
RSS/YouTube discovery layer from `resources/aggroNATION-main` into the gateway,
where content keeps attention and the only purchase remains inference. This FID
builds the isolated `content` schema, an operator-managed source registry,
feed parsing, and a bounded ingestion path. It deliberately ships **no public
content pages**; the public surface is FID-090. The isolation is the point: a
feed failure must never touch routing, keys, holds, or settlement.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL, local PGlite fallback for development
- **Commit/State:** working tree at the start of the content-to-commerce build
- **New dependencies:** `fast-xml-parser`, `sanitize-html` (runtime),
  `@types/sanitize-html` (dev)

## Detailed Description

### Problem

There is no source registry, no normalized item shape, no safe HTML pipeline,
and no ingestion run record. Copying the old site's Supabase fetchers would
import a second database, a second auth model, and unbounded fetch behaviour.

### Expected Behavior

- Operators can add, edit, enable, disable, and delete RSS and YouTube sources.
- Each source records interval, item cap, health, failure streak, and last error.
- A fetch is bounded by timeout, response size, and item cap.
- Fetched HTML is sanitized; excerpts are plain text.
- Tags are normalized to a stable slug set.
- Every fetch creates a `content.fetch_cycles` row with counts and status.
- Five consecutive failures disable the source; a success resets the streak.
- Cron is refused unless `CONTENT_CRON_SECRET` matches.
- No public page or model-page change is in this slice.

### Root Cause

Not a defect. The capability was never built in this repository; the reference
implementation is a separate Next.js application with Supabase-specific SQL.

### Evidence

```text
resources/aggroNATION-main/lib/fetchers/rss.ts      454 lines, unbounded body
resources/aggroNATION-main/lib/fetchers/youtube.ts  271 lines, channel-specific
resources/aggroNATION-main/supabase/migrations/     content tables, Supabase RLS
gateway lib/storage/schema/                         no content namespace
```

## Impact Assessment

### Affected Components

- `lib/storage/schema/content.ts` (new)
- `lib/storage/schema/index.ts`
- `lib/content/*` (new)
- `app/api/admin/content/*` (new)
- `app/api/cron/content/route.ts` (new)
- `app/admin/(panel)/content/page.tsx` (new)
- `components/admin/content-*` (new)
- `package.json`, `package-lock.json`
- `.env.example`

### Risk Level

- [ ] Critical
- [x] High: a new ingestion path can create SSRF, XSS, or unbounded work
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach

Keep content in its own PostgreSQL namespace with no foreign key into billing,
and make every network operation bounded and injectable. The parser and store
take explicit inputs so tests exercise them without a network or a server.

### Steps

1. `implemented` — Add `content` schema: sources, items, tags, item_tags,
   model_links, fetch_cycles. Idempotent, additive migration.
2. `implemented` — Add pure taxonomy and feed parsing modules. RSS, Atom and
   YouTube atom entries normalize into one item shape.
3. `implemented` — Add URL policy: public HTTP(S) only, no loopback/private
   literals, 15-second timeout, 2 MiB response ceiling.
4. `implemented` — Add source store and item store with interval/cap clamps.
5. `implemented` — Add ingestion orchestration with cycle receipt and failure
   streak handling.
6. `implemented` — Add admin source API and operator page; add cron route with
   a constant-time secret check.
7. `implemented` — Add tests for taxonomy, feed parsing, and the store contract.

### Verification

- `tests/content-taxonomy.test.mjs` — normalization, aliases, caps, dedupe.
- `tests/content-feeds.test.mjs` — RSS, Atom, YouTube, malformed input.
- `tests/content-store.test.mjs` — schema, source CRUD, item upsert, cycle.
- `tests/content-ingest.test.mjs` — injected fetch, cycle receipt, link write,
  failure streak, five-failure disablement.
- Live operator check: add an RSS source, fetch it, inspect the stored item.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-taxonomy.test.mjs
- gate: test tests/content-feeds.test.mjs
- gate: test tests/content-store.test.mjs
- gate: test tests/content-ingest.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-11-02T15:39:24Z
- lint: exit 0, zero warnings
- typecheck: exit 0
- test tests/content-taxonomy.test.mjs: exit 0, 5 pass
- test tests/content-feeds.test.mjs: exit 0, 5 pass
- test tests/content-store.test.mjs: exit 0, 2 pass
- test tests/content-ingest.test.mjs: exit 0, 2 pass
- full `npm test`: exit 0, 789 tests, 788 pass, 1 skipped
- quality: exit 0, `PASS (400-line ceiling, 506 files scanned)`
- build: exit 0, `/signal`, `/api/cron/content` and the admin content routes
  appear in the route table
- live empty-state check: `/signal` 200, `/models` 200, `/signal/briefing` 200
- live fixture check: a disposable PGlite database with one stored item served
  `/signal` 200 and `/signal/[id]` 200 with the item, source, tags, and body
- limitation: no real third-party feed was fetched. The network path is covered
  by an injected `fetchText` and the route/render check; publisher-specific XML
  quirks remain for the first live source.

## Perfection Loop

### Loop 1 — RED

- **RED:** The reference fetchers trust arbitrary source URLs and body sizes;
  the old schema is Supabase-specific. A direct port would add SSRF and XSS to a
  money-serving process.
- **GREEN:** Public-URL policy, 2 MiB cap, sanitize-html allowlist, plain-text
  excerpts, item cap, timeout, and source health state.
- **AUDIT:** `lib/content/url.ts` rejects loopback/private literals; parser tests
  cover script and event-handler stripping.
- **ADVERSARIAL:** DNS rebinding can still resolve a public name to a private
  address. Accepted residual risk for an admin-only source registry; documented
  in the FID and in the admin copy.
- **CHANGE DELTA:** 0% (initial record).

### Missed Questions

1. **Should content share the customer/API-key tables?** No. Content is public
   and has no entitlement. It shares only `users` for optional follows in 091.
2. **Should source credentials be stored?** No. YouTube uses `YOUTUBE_API_KEY`
   from the environment; the registry stores only the channel id and tags.
3. **Should ingestion run on page render?** No. It runs from cron or an explicit
   admin fetch, so a slow feed cannot delay a page.
4. **What happens when a source fails?** The cycle records the error, the streak
   increments, and five consecutive failures disable the source. Re-enabling is
   an operator action.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `81a40eb8af07ae4fdbc8626e112310b4ebc2a46e`
- [x] **File:line ranges:**
  - `lib/storage/schema/content.ts:16` — isolated `content` namespace.
  - `lib/content/feeds.ts:326` — RSS/Atom/YouTube normalization.
  - `lib/content/url.ts:30` — public-URL policy.
  - `lib/content/ingest.ts:143` — bounded fetch, cycle, streak.
  - `lib/content/store/sources.ts:129` — source CRUD.
  - `lib/content/store/items.ts:288` — URL-keyed item upsert.
  - `lib/content/store/cycles.ts:30` — cycle start/finish receipts.
  - `app/api/cron/content/route.ts` — secret-gated cron.
  - `app/admin/(panel)/content/page.tsx` — operator console.
- [x] **Gate output:** lint/typecheck/quality/build and the four content test
  files exit 0; full suite 788 pass, 1 skipped. Receipt above.
- [x] **Reproducibility:** `rg -n "contentSchema|parseFeed|ingestSource"`
  finds the schema, parser, and ingestion entry in the committed tree.
- [x] **Step statuses:** all seven steps `implemented`; no step deferred.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist in the committed tree.
- [x] Implementation matches the Proposed Solution: source registry, bounded
  fetch, sanitizer, normalized tags, cycle rows, streak disablement, cron.
- [x] Typecheck/tests/lint pass with pasted output above.
- [x] Production call graph: `/api/cron/content` → `ingestDueSources` →
  `ingestSource` → `upsertItem` / `replaceAutoLinks`; `/admin/content` → source
  APIs. Both routes appear in the production build output.
- [x] FID status reflects the implementation: closed against `81a40eb`.

### Loop 2 — Independent audit and self-correction

- **RED:** The first feed test exposed that the body came from
  `content:encoded` while the excerpt also came from it; a reader would see the
  full body twice and the short summary was lost. A malformed item also had no
  proof that the URL policy dropped it rather than storing an unreachable URL.
- **GREEN:** Excerpt now prefers `description`/`summary`; body still prefers
  `content:encoded`. A relative loopback link test proves the item is dropped.
- **AUDIT:** `tests/content-feeds.test.mjs` 5 pass; `tests/content-ingest`
  proves a failing source reaches `disabled` on the fifth attempt and stops
  being enabled.
- **ADVERSARIAL:** `sanitize-html` permits remote images, so a feed image can
  leak a reader's IP to the publisher. Accepted: the item is third-party content
  and the image is not proxied. The admin copy states sources are external.
- **CHANGE DELTA:** 0% of scope; the corrections were implementation details.

### Loop 3 — Final convergence

- **RED:** Residual risk is DNS rebinding after hostname validation and a feed
  that returns well-formed XML with no usable item. Both leave the gateway
  serving no content, not a broken page.
- **GREEN:** The source becomes `error` with a cycle row; five failures disable
  it. The public hub renders an honest empty state.
- **AUDIT:** Disposable-database render check returned 200 for `/signal` and the
  detail route with a stored item; empty-state check returned 200 before the
  fixture was seeded.
- **ADVERSARIAL:** No real publisher feed was exercised. The first operator
  source is the remaining empirical test; the FID does not claim otherwise.
- **CHANGE DELTA:** 0% — scope and claims unchanged; evidence completed.

## Resolution

- **Closed Date:** 2026-11-02 15:39 UTC
- **Fix Description:** Added the isolated content namespace, operator source
  registry, bounded RSS/YouTube parsing, sanitized HTML, normalized tags,
  URL-keyed item upsert, fetch-cycle receipts, failure-streak disablement, the
  admin source console, and a constant-time cron endpoint.
- **Tests Added:** Yes — `tests/content-taxonomy.test.mjs`,
  `tests/content-feeds.test.mjs`, `tests/content-store.test.mjs`,
  `tests/content-ingest.test.mjs`.
- **Verification Evidence:** lint 0 warnings, typecheck 0, quality PASS (506
  files), build 0, 23 focused content tests pass, full `npm test` 788 pass / 1
  skipped, live empty and fixture renders 200.
- **Archived:** 2026-11-02 15:39 UTC (moved to `dev/fids/archive/`).

## Lessons Learned

A content system is a second ingestion boundary. Treating it as a separate
namespace with bounded I/O is cheaper than discovering later that a feed parser
can reach the ledger.
