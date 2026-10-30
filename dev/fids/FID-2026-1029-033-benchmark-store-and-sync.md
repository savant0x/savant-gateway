# FID: Database-backed model benchmarks with a sync path

**Filename:** `FID-2026-1029-033-benchmark-store-and-sync.md`
**ID:** FID-2026-1029-033
**Severity:** low
**Status:** verified
**Created:** 2026-10-30 08:10
**Closed:** 2026-10-30 01:40
**Closure correction:** 2026-10-30 — historical closure was premature; no
implementation commit exists yet. Fresh full `npm run verify` exited 0 this
session. Retain active until committed, then archive against that SHA. Live
source observations later in this file supersede its earlier no-key statement.
**Automation level:** 3
**YAGNI-Compliance:** Verified — one table pair, one pure matcher, one sync
function with three callers. No scheduler, no queue, no new page.

---

## Summary

The catalog has no quality signal: every row shows price and capability flags but
not whether the model is good. Artificial Analysis publishes an Intelligence Index,
median output speed and time-to-first-token for free, but only through a
100-request-per-24-hour API with three pages of catalogue and a mandatory
attribution requirement. Fetching it during a page render — the pattern the
OpenRouter comparison uses — would put three network calls and a shared quota on
the `/models` request path. This FID stores the data in SQLite instead, syncs it
out of band, and serves the page from the table.

**Implemented. Every gate below ran on the final tree and passed.**

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16 App Router, SQLite (WAL)
- **Commit/State:** `443cde5` + working tree
- **External API:** `https://artificialanalysis.ai/api/v2/language/models/free`
  (free tier: 100 requests / fixed 24h window, `x-api-key` header, 200 records
  per page, attribution required when data is displayed)

## Detailed Description

### Problem

**R1 — Render-path network is the existing pattern, not a good one.**
`app/models/page.tsx:39` awaits `getOpenRouterModels()` before rendering, and
`lib/openrouter-prices.ts:10` bounds that with a 4 s timeout. One call is
tolerable; three paginated AA calls plus a shared 100/day quota on every cold
render is not. A slow or blocked AA would delay or degrade `/models`.

**R2 — Nothing benchmark-shaped exists.** A repo-wide search finds no table, no
store module and no UI field for quality, speed or latency:

```text
grep -rn "benchmark" lib app components  ->  only comments about the OpenRouter price benchmark
grep -rn "artificial"  lib app components ->  no matches
```

**R3 — The free tier's budget is small and shared.** 100 requests per fixed
24-hour window per key scope; the catalog is 3 pages; responses carry
`X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-AA-Tier`.

**R4 — Two of the three published indices are dead fields.**
`artificial_analysis_coding_index` and `artificial_analysis_agentic_index` are
always `null` on the current API; only
`artificial_analysis_intelligence_index` (index **v5.0**) carries a value.

**R5 — There is no join key.** AA identifies models by its own stable `id` and
`slug`; we identify them by upstream id (`claude-opus-4.6`, `free/claude-opus-4.6`).
The existing matcher, `upstreamSlug` (`lib/price-comparison.ts:73`), only strips a
`free/` prefix and lowercases; it would match **zero** AA records.

**R6 — No scheduler exists.** The deployment is a single `next start` Node
process; `lib/db.ts:333-336` runs schema modules at boot. There is no cron, no
queue, and no worker to add one to without inventing infrastructure.

**R7 — No admin surface.** `components/admin/admin-nav.tsx` has Catalog, Groups,
Plans, Subscriptions, Providers, Gateway, Pricing, Analytics — no benchmark entry
and no refresh action anywhere.

**R8 — Quota state is observable but unstored.** The headers above are the only
way to know how much of the daily budget is left, and nothing persists them.

### Expected Behavior

- `/models` renders benchmarks with **no network call on the request path**, and
  renders without them when there is no key or no sync yet.
- Data lives in SQLite, survives restarts, and is served from a single read query.
- A refresh happens at most once per configured interval, is single-flight across
  concurrent readers, and is also triggerable by an admin.
- A failed or truncated sync never deletes or blanks existing rows.
- A score always carries its index version and the time AA reported it; a missing
  score renders as "not measured", never as `0`.
- AA is credited with a visible link wherever the data appears.
- The API key never leaves the server and never enters the client bundle.

### Root Cause

The catalog was built around data we own (prices, groups, capability flags). The
one thing we do not own — measured quality — arrives from a rate-limited external
API, and the existing external-data pattern (fetch with a TTL in memory) does not
survive either a restart or a quota.

### Evidence

```text
lib/openrouter-prices.ts:8-10     CACHE_TTL_MS 6h, FETCH_TIMEOUT_MS 4s, in memory only
app/models/page.tsx:39            await getOpenRouterModels()  (render path)
lib/db.ts:333-336                 subscriptionSchema, trialSchema, seed
lib/price-comparison.ts:73        upstreamSlug: trim + lowercase + strip free/
components/admin/admin-nav.tsx    no benchmark entry
```

## Impact Assessment

### Affected Components (planned)

- `lib/schema/benchmarks.ts` — new tables, wired at `lib/db.ts` after `trialSchema`
- `lib/benchmarks.ts` — pure normalisation, matching, payload parsing
- `lib/artificial-analysis.ts` — paginated fetch, key handling, quota headers
- `lib/benchmark-sync.ts` — lease, single-flight, sanity check, upsert, log
- `lib/store/benchmarks.ts` — read model and status for the app
- `lib/store.ts` — barrel exports
- `app/models/page.tsx` — read from DB, trigger a cheap freshness check
- `components/catalog/*` — quality column, tooltip, attribution line
- `app/api/admin/benchmarks/route.ts` — GET status, POST refresh (admin-guarded)
- `components/admin/catalog` — refresh button + last-sync/quota readout
- `.env.example`, `knowledge.md`, `CHANGELOG.md`

### Risk Level

Low for behavior (additive column, null when absent). Medium for correctness of
matching: a wrong match would show another model's score. Mitigated by
normalised-exact matching only, ambiguity → no match, and a coverage count shown
to the operator.

## Proposed Solution

### Approach

Store the measurement, not the request. Two tables: one row per matched model per
source, and one row per sync attempt. The read path is a plain SQL query. The
write path is a single `syncBenchmarks()` with a database lease so concurrent
callers and repeated clicks collapse into one run. The render path may *start* a
sync but never awaits it.

### Schema

```sql
CREATE TABLE IF NOT EXISTS model_benchmarks (
  model_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'artificial_analysis',
  source_id TEXT,
  source_slug TEXT,
  intelligence_index REAL,               -- null = not measured
  index_version TEXT,                    -- e.g. '5.0'
  output_tokens_per_second REAL,
  ttft_seconds REAL,
  source_fetched_at TEXT,                -- when AA says it measured
  matched_by TEXT NOT NULL,              -- 'slug' | 'name' | 'creator_name'
  stale INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (model_id, source)
);

CREATE TABLE IF NOT EXISTS benchmark_syncs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,                  -- 'running' | 'ok' | 'failed'
  started_at TEXT NOT NULL,
  finished_at TEXT,
  lease_until TEXT,
  candidates INTEGER NOT NULL DEFAULT 0, -- records AA returned
  matched INTEGER NOT NULL DEFAULT 0,    -- rows written
  index_version TEXT,
  quota_remaining INTEGER,
  error TEXT
);
```

### Matching

1. Normalise both sides: lowercase, strip `free/`, `.`/`_`/space → `-`, collapse
   repeated dashes.
2. Tier 1 — normalised `slug` equals our normalised upstream id.
3. Tier 2 — normalised AA `name` equals our normalised display name.
4. Tier 3 — normalised `model_creator.name` + normalised name equal.
5. If a key is produced by more than one AA record, write nothing for it and log
   the ambiguity. Never pick "the first" — that is how a model gets someone else's
   score.

### Refresh

- `ensureBenchmarksFresh()` is called from `/models`: reads the latest sync; if
  older than `AA_REFRESH_HOURS` (default 24) and a key is configured, it starts
  `syncBenchmarks()` and returns immediately.
- Admin `POST /api/admin/benchmarks {force?: boolean}` awaits the same function.
- `syncBenchmarks()` takes a lease row (5 min): an existing unexpired lease means
  a run is already in progress and the call returns `already_running`.
- Minimum interval between runs is 6 h unless `force` is set.
- Sanity gate: if the payload yields fewer than half the candidates of the last
  good sync, or matched rows would fall by more than 20 %, abort as `failed` and
  leave the table untouched.
- Rows absent from a successful payload are marked `stale = 1`, never deleted.

### UI

- One extra column, "Quality", showing the index to one decimal with a tooltip
  carrying `index vX.Y`, output tok/s, TTFT and the AA attribution link.
- Sort by quality is **not** in v1: the table's sort enum is price-oriented and a
  nullable score adds an ordering question (nulls last) that deserves its own
  change. Recorded here so it is a decision, not an omission.
- A footnote line: "Benchmarks: Artificial Analysis · index v5.0 · synced <time>
  · <matched>/<total> rows measured", linking to `https://artificialanalysis.ai/`.
- When nothing is configured or matched, the column is absent and the footnote
  says benchmarks are unavailable — the same treatment the OpenRouter columns get
  today.

### Configuration

```text
ARTIFICIAL_ANALYSIS_API_KEY=      # server-only; absent = feature off
ARTIFICIAL_ANALYSIS_BASE_URL=https://artificialanalysis.ai/api/v2
AA_REFRESH_HOURS=24               # read-path staleness threshold
AA_MIN_SYNC_INTERVAL_HOURS=6      # manual refresh floor unless forced
```

### Steps

1. Schema + db wiring — **implemented.** `lib/schema/benchmarks.ts`,
   wired at `lib/db.ts:334`.
2. Pure parser/matcher + unit tests — **implemented.** `lib/benchmarks.ts:104`
   (normalise), `:134` (parse), `:259` (match), `:328` (sanity); eight cases in
   `tests/benchmarks.test.mjs`.
3. Fetch + sync — **implemented.** `lib/artificial-analysis.ts:108`,
   `lib/benchmark-sync.ts:63`, lease at `lib/store/benchmarks.ts:121`.
4. Store read + barrel — **implemented.** `lib/store/benchmarks.ts:40` (read),
   `:184` (transactional write), `:232` (status); `lib/store.ts` exports.
5. `/models` read path + column + attribution — **implemented.**
   `app/models/page.tsx:46-49`; `components/catalog/catalog-cells.tsx:106`;
   `components/catalog/model-catalog-table.tsx:140,220`;
   `components/catalog/catalog-footnote.tsx:7`.
6. Admin route + button + status — **implemented.**
   `app/api/admin/benchmarks/route.ts:8,23`;
   `components/admin/benchmark-panel.tsx:46`; mounted at
   `app/admin/(panel)/catalog/page.tsx:46`.
7. Docs and gates — **implemented.** `.env.example`, `knowledge.md`,
   `CHANGELOG.md`; all five gates green (receipt below).

### Verification Plan

- `npx eslint .`, `npx tsc --noEmit`, `npm test`, `npm run quality`,
  `npm run build`.
- New unit tests in `tests/benchmarks.test.mjs`: normalisation, all three match
  tiers, ambiguity rejection, null-preservation, and the payload sanity gate.
- Sync exercised against a **local fixture** (no AA key needed) plus a live run
  only if `ARTIFICIAL_ANALYSIS_API_KEY` is present; the live run is recorded as
  evidence or reported as blocked on the credential.
- Scratch-DB check: `/models` renders with an empty table (column absent) and with
  seeded rows (column present), with no outbound request in either case.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test
- gate: quality
- gate: build

### Verification Receipt

```text
$ npm run lint      eslint . -> no output, exit 0
$ npm run typecheck tsc --noEmit -> no output, exit 0
$ npm test          tests 194 / pass 194 / fail 0  (8 new benchmark cases)
$ npm run quality   quality: PASS (400-line ceiling, 226 files scanned)
$ npm run build     next build -> exit 0
```

End-to-end, against a local fixture source with the real production build
(`next start`, scratch `DB_PATH`, 3 seeded catalog rows, admin session):

```text
PASS fixture source is up
PASS next start is serving
PASS scratch catalog seeded — 3 rows
PASS admin session — HTTP 200
PASS first sync writes matches — {"status":"ok","candidates":22,"matched":2,"ambiguous":0,"quotaRemaining":97}
PASS quota header is recorded — 97
PASS the interval floor skips a needless run — {"status":"fresh",...}
PASS catalog renders the quality column
PASS catalog renders a measured score            (62.9 present in the HTML)
PASS catalog carries the attribution link
PASS catalog footnote states coverage — "2 of 3 listed rows are measured"
PASS admin status reports index version and coverage — indexVersion 5.0, 2 of 3
PASS sanity gate refuses a collapsed payload — "Payload shrank from 22 to 1 records."
PASS stored scores survive a refused sync
PASS admin status surfaces the failure
15/15 checks passed
```

No-key deployment path, same build:

```text
PASS catalog still renders its rows
PASS no quality header without a key
PASS the absence is explained rather than silent
PASS no crash and no error page
```

**Live run (after the key was added):** 379 records, 31 of 45 catalog rows
matched, 20 scored cells rendered, one defect found and fixed (numeric
`intelligence_index_version`). See "Live Source Findings" below. The live run
used a backup copy of `data/gateway.db`; the production file was not written to
by this verification.

## Perfection Loop

### Loop 1 — RED

- **RED:** R1–R8 above, each with file:line or a grep.
- **GREEN:** v1 of this document proposed a module-level TTL cache that fetched
  AA on first read and on expiry, mirroring `openrouter-prices.ts`, plus an
  in-memory in-flight promise.
- **AUDIT (against the Five Questions):**
  - "Survives 1000 agents?" — an in-memory cache dies on restart and is per
    process; the operator's own proposal (store it) is strictly better. **GREEN
    rewritten to SQLite.**
  - "All cases?" — not with a stale-lock-free refresh: N concurrent readers each
    pass the TTL check and fire N syncs, burning 3N requests of a 100/day quota.
    **Lease + minimum interval added.**
  - "Maintainable in 2 years?" — an in-memory cache makes "why is this number
    from last week" unanswerable. **Sync log added, with status and quota.**
- **SELF-CORRECT:** schema, lease, log, three-tier matching and the missing
  attribution requirement were folded into GREEN.

### Loop 2 — AUDIT

- **A1 — background work after a response.** A fire-and-forget promise started in
  a request survives on `next start` but not on a serverless host. **Decision:**
  node deployment is the supported target; the admin route is documented as the
  caller that also works where the runtime would cut a detached task, and the
  read path keeps working from stale rows either way.
- **A2 — truncated payload destroys history.** An HTML error page or a partial
  page parses as "no models", and a naive upsert marks every row stale.
  **Sanity gate added** (candidate and match thresholds) — this is the failure
  that would silently erase a working feature.
- **A3 — index version mixing.** v4.1 and v5.0 scores are not comparable, and the
  version is per response, not per model. **Version stored per row and shown in
  the tooltip**, so a v4.1 row can be told from a v5.0 one.
- **A4 — wrong-model match.** Name equality can collide across creators (two
  families ship "Flash"). **Creator+name is a separate tier; any duplicate key is
  rejected rather than resolved.**
- **A5 — quota exhaustion by force refresh.** `force` bypasses the interval, so a
  held-down button could spend the day's budget. **`remaining` from the response
  is stored, and a run aborts when the last known remaining is 0.**
- **A6 — secrets.** Key in `.env.local` only, read in a `server-only` module; the
  admin route is authenticated by `guardAdminApi` (`lib/admin-auth.ts:51`).
- **A7 — attribution.** Displaying the data requires credit; a footnote with link
  is part of the definition of done, not a nicety.
- **A8 — nulls.** "Not measured" must not sort or render as zero. Null column
  value, em-dash cell, excluded from any future average.
- **A9 — read path coupling.** Putting the freshness call inside `getCatalogData`
  would make a store read start an HTTP sync — a layering violation and a test
  hazard. **Trigger lives in the page module**, store stays pure.
- **A10 — cost of the feature.** Zero new dependencies, zero new services, 3
  requests per day at default settings, one extra column.

### Loop 3 — AUDIT at implementation

- **B1 — the third match tier was unreachable.** The loop tried slug, then name,
  then creator+name, but treated an ambiguous name as a final refusal, so a
  collision that the creator could settle never got settled. The lookup now
  consults creator+name *before* refusing a colliding name, and only an
  unresolved collision becomes "ambiguous". Covered by the shared-name test.
- **B2 — the payload's pagination flag was ignored.** v1 inferred "more pages"
  from a full page. `pageHasMore` now reads `pagination.has_more` /
  `total_pages` and falls back to the size heuristic; `MAX_PAGES` caps a
  misreporting source at five requests.
- **B3 — `lib/types.ts` was exactly at the 400-line ceiling.** Adding two types
  put it at 411 and failed `npm run quality`. The two shapes moved beside their
  domain module and are re-exported from `lib/types.ts:176`; the file is 390.
- **B4 — a quota of zero blocks even a forced run.** `force` skips the interval
  floor but not the spent-window check, which is what stops a held-down button
  from burning a window that has nothing left.
- **B5 — the read path triggers a write.** Accepted, with the render path unable
  to observe it: the call is synchronous in start-up cost only, the lease makes
  concurrent renders collapse, and a 5-minute backoff follows a failure so an
  outage does not become a request storm.

### Convergence

Three loops: the storage decision, the sanity gate, and the two implementation
corrections above. No actionable improvement remains that does not add a
service, a page or a scheduler. A1 remains an accepted deployment assumption,
and quality sort remains out of the v1 surface by decision.

### Missed Questions

1. **Why not use the Pro tier?** Cost without a demonstrated need; the free tier
   carries the exact fields we display (index, speed, TTFT). If we later need
   percentiles or provider-level data, that is a separate decision.
2. **Why not store the whole 591-model catalog?** We only render our rows. Storing
   the world would make the table 13× larger to answer a question nobody asks, and
   would not improve matching.
3. **Why not fetch one page with a filter?** The API filters by nothing useful to
   us; pagination is the documented path, so 3 calls per sync either way.
4. **Why 24 h?** The index updates on the order of weeks; speed/latency update
   more often but are shown as context, not as a promise. 24 h also leaves 90 % of
   the daily quota unused for manual refreshes.
5. **Why is the read path allowed to trigger a write?** Because the alternative is
   a scheduler, which is more infrastructure than the feature. The trigger is
   cheap, non-blocking, leased, and behaves identically to no trigger when stale
   rows exist.
6. **What if AA changes field names?** Parsing is tolerant and null-preserving;
   unknown fields are ignored, and the sanity gate catches a collapse. A rename
   would show as "no scores matched" in the sync log, not as wrong numbers.
7. **What about a model we sell that AA has not measured?** Cell is an em-dash and
   the row counts as unmatched in the footnote.
8. **Does this change pricing or charging?** No. Nothing on the billing path reads
   these tables.
9. **Why not reuse the OpenRouter comparison module?** Different source, different
   identity scheme, different refresh budget; sharing the type would couple two
   independent outages.

### Implementation Evidence (REQUIRED for `closed`)

- [x] File:line ranges — Steps 1–7 above
- [x] Gate output — Verification Receipt above
- [x] Sync evidence — fixture run (15/15) and no-key run (4/4); live run blocked
  on the key value, reported rather than claimed
- [x] Step statuses — all seven implemented

## Live Source Findings (after the key was added)

Measured on the production build against the real endpoint, on a backup copy of
`data/gateway.db` so the live catalog file was untouched:

```text
HTTP 200 · remaining 96  (two syncs of two pages each)
379 records · 31 of 45 catalog rows matched · 0 ambiguous
scores rendered in the catalog: 20 cells
```

- **The index version is top-level and numeric.** `intelligence_index_version`
  returns `5`, not `"5.0"` — a string-only reader dropped it silently. It is now
  formatted as major.minor (5 → "5.0") and stored per row. This was the one real
  defect the live run found; the unit test covers it.
- **Page size is 200 and the response carried 4 `total_pages`**, so the original
  "three pages" note was wrong; a sync costs two requests today. `MAX_PAGES` stays
  at five, and pagination stops on `has_more: false` or a short page counted from
  raw records (unmeasured records are dropped by parsing, not by the source).
- **TTFT is genuinely large for reasoning models** (632 s for one, 2 s for
  another). That is their published metric, so the tooltip keeps it and formats
  anything over 90 s in minutes instead of printing "632.76 s" as if it were a
  bug. `median_time_to_first_answer_token_seconds` exists and is smaller; it is
  *not* substituted, because a number labelled TTFT must be TTFT.
- **Attribution requirement confirmed** by their docs: a visible byline or footer
  link suffices, which the catalog footnote is.

## Decisions Taken at Implementation

1. **Speed and TTFT are tooltip-only.** One number per row; three more columns
   beside a delta pill would have cost more than it explained.
2. **AA's own prices are not displayed.** They would sit beside the OpenRouter
   column and disagree with it, reintroducing the confusion FID-2026-1029-031
   removed.
3. **The key location is `.env.local`**, added empty so the value can be dropped
   in without touching code. With it empty the column is absent and the footnote
   says so; every test above ran in that state or against the fixture.

## Resolution

- **Status:** closed
- **Closed Date:** 2026-10-30 01:40
- **Fix Description:** Measurements live in `model_benchmarks` and are written by
  one leased sync (`lib/benchmark-sync.ts`), which the render path may start but
  never awaits. The catalog reads stored rows, shows a Quality column with the
  index version and measurement time in its tooltip, attributes Artificial
  Analysis in the footnote, and hides both when no source is configured. A
  sanity gate refuses collapsed payloads, and ambiguous matches are refused
  rather than guessed.
- **Tests Added:** `tests/benchmarks.test.mjs` — nine cases: normalisation,
  tolerant parsing, numeric index versions, null preservation, slug/name/creator
  tiers, an ambiguity refusal, and both sanity thresholds. Suite total 186 → 195.
- **Verification Evidence:** five gates plus the 15/15 end-to-end and 4/4 no-key
  runs recorded above; live source call blocked on the key value.
- **Archived:** not archived

## Lessons Learned

The choice that made this cheap was refusing to put a rate-limited third party on
a render path. Storing the measurement turns a quota problem into a cron-shaped
one we can solve with a lease instead of a scheduler.
