# FID: Fetch all enabled content sources now

**Filename:** `FID-2026-1102-113-content-fetch-all.md`
**ID:** FID-2026-1102-113
**Severity:** low
**Status:** complete
**Created:** 2026-11-02
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

The admin content console has a per-source Fetch button but no page-level way to
refresh every source after adding presets, changing a filter, or recovering from
an outage. The existing no-`sourceId` endpoint branch calls
`ingestDueSources(..., 10)`, which is a due-only cron path, not a forced refresh.

A first attempt made the endpoint ingest every enabled source in one server
request. That request could outlive the HTTP call and return an empty body, so
the browser threw `Unexpected end of JSON input`. The converged design instead
walks the enabled sources one at a time from the admin control, using the
already-working single-source endpoint, showing progress and isolating failures.

## Expected Behavior

- One “Fetch all sources” action refreshes every enabled source, regardless of
  `last_fetched_at`.
- Disabled sources are excluded.
- Each source is requested through the existing single-source path, so its own
  15-second fetch bound and cycle are unchanged.
- A failure is reported for that source and the remaining sources still run.
- An empty or non-JSON response is reported as `HTTP <status>`, never as a raw
  JSON parse error.
- The button is disabled while work is in flight and shows `Fetching n of m:
  <label>`.
- The final summary states how many sources ran, how many items were stored,
  how many failed, and the first failure.
- The cron route keeps using `ingestDueSources`; this feature does not turn the
  scheduled path into a forced refresh.

## Approach

- `lib/content/fetch-all.ts` is pure orchestration: filter enabled sources,
  preserve order, run a caller-supplied fetch function sequentially, convert a
  thrown request into a failed result, and summarize the batch.
- Its `readFetchResult` reads the response text first. Empty and non-JSON bodies
  become status-based errors instead of `JSON.parse` failures.
- `components/admin/content-source-fetch-all.tsx` supplies the HTTP call to the
  existing `/api/admin/content/fetch` endpoint with one `sourceId` at a time,
  drives progress, refreshes the table, and renders the summary.
- The admin page passes its loaded source rows to the control; no new API route
  or server bulk path is introduced.
- `tests/content-fetch-all.test.mjs` covers enabled filtering, order, sequential
  progress, failure isolation, summary counts, and empty/non-JSON responses.

## Verification

- Disabled sources are absent from the target list.
- Two targets are requested in order; a thrown first request does not stop the
  second.
- The summary counts stored items and names the first failure.
- A `504` with an empty body reports `HTTP 504`; an HTML body reports an
  unreadable response with its status; a JSON `401` preserves the server error.
- Lint, typecheck, focused tests, full `npm test`, quality, build, both HTTP
  suites, and the recovery drill pass.

## Gates

- `npm run lint`
- `npm run typecheck`
- `node --test tests/content-fetch-all.test.mjs`
- `npm test`
- `npm run quality`
- `npm run build`
- `npm run verify`

## Perfection Loop

### Loop 1 — RED

- **RED:** The admin has no fetch-all control. The existing no-source endpoint
  branch fetches only due sources with a ten-source cap, so exposing it as
  “Fetch all” would be false.
- **GREEN:** Add a page-level control that walks the enabled source rows one at a
  time and reports per-source outcomes.
- **AUDIT:** The existing endpoint already guards the admin session, parses a
  `sourceId`, and calls `ingestSource`; the per-source path already owns the
  fetch timeout, cycle, failure streak, and upsert behavior.
- **ADVERSARIAL:** Running all sources in one request risks a gateway timeout and
  an empty response. A client loop keeps every request bounded, makes progress
  visible, and lets completed sources survive a later failure.
- **CHANGE DELTA:** Initial design.

### Loop 2 — Implementation correction

- **RED:** The first implementation added `ingestAllSources` and changed the
  no-`sourceId` route branch. Clicking the control returned an empty body and
  the client threw `Unexpected end of JSON input`.
- **GREEN:** Removed the server bulk path and moved orchestration to a pure
  sequential helper used by the control. Response parsing now reports the HTTP
  status for empty bodies.
- **AUDIT:** No new endpoint or dead server function remains; the existing route
  is unchanged. The control uses the same `sourceId` contract as the per-source
  button.
- **ADVERSARIAL:** A single source request may still fail or return invalid JSON;
  that source becomes a failed result and the next one still runs. No claim of
  atomic completion is made.
- **CHANGE DELTA:** Replaced the bulk request design with bounded per-source
  requests; the user-visible contract is unchanged.

## Implementation Evidence

- [x] Commit SHA: implementation and this closure record are in the containing
  commit.
- [x] Files: `lib/content/fetch-all.ts`,
  `components/admin/content-source-fetch-all.tsx`,
  `app/admin/(panel)/content/page.tsx`, `tests/content-fetch-all.test.mjs`.
- [x] Gate output: `npm run verify` exit 0 — 847 tests (846 pass, 1 skipped),
  quality PASS (535 files), production build 0, 750 HTTP checks plus trial HTTP
  PASS, and recovery drill PASS. Lint zero warnings and typecheck 0 separately.
- [x] Tests: 5/5 in `tests/content-fetch-all.test.mjs`; covers enabled
  filtering, order, sequential progress, failure isolation, summary counts, and
  empty/non-JSON responses.

## Resolution

- **Closed Date:** 2026-11-02
- **Fix Description:** The admin content page now has a “Fetch all sources”
  action that refreshes every enabled source sequentially through the existing
  single-source endpoint, with progress, per-source failure isolation, and a
  status-based error for empty responses.
- **Tests Added:** Yes — pure orchestration and response parsing tests.
- **Verification Evidence:** `npm run verify` exit 0 and focused 5/5, recorded
  above.
- **Archived:** yes —
  `dev/fids/archive/FID-2026-1102-113-content-fetch-all.md`
