# Changelog

All notable changes are recorded here. Entries name the FID that drove them and
distinguish verified behavior from unverified claims.

## 2026-11-02 — PostgreSQL pooler-safe session timeouts

- **FID-2026-1102-109 — high — production now connects through Neon's pooled
  endpoint instead of failing every database-backed route.** The pool no longer
  sends `statement_timeout` and `idle_in_transaction_session_timeout` in libpq's
  startup `options`; Neon's PgBouncer rejects that packet with `08P01`. pg-pool
  applies both `SET` statements through an async `onConnect` hook, which
  completes before a client is handed to a caller. Verified locally: focused
  adapter tests 15/15, lint zero warnings, typecheck 0, full suite 829 tests
  (828 pass, 1 skipped), quality PASS (531 files), build 0, and both disposable
  HTTP suites pass against local fixtures (`free/mock` and `mock-paid` are
  doubles; no real paid provider is called). The paid-limit probe now waits for
  its own bucket to refuse instead of depending on a one-second window. Live
  receipt pending the deployment of this commit.

## 2026-11-02 — Signal repository READMEs and precise article failures

- **FID-2026-1102-107 — medium — repository pages now render the GitHub
  README as content, and legacy repository rows repair their facts on first
  view.** `github_json` carries a sanitized `readmeHtml`; the first detail view
  fetches missing stars, forks, description, and README once and persists them.
  README relative images resolve to raw GitHub URLs and links to the repository;
  scripts, iframes, event handlers, and `javascript:` links are removed.
  Repository cards and the detail aside show stars, forks, and language, and
  repository pages no longer run the article scraper. A publisher that refuses
  automated reading now reports the HTTP status instead of "could not be
  reached"; no paywall is bypassed. Verified: lint 0 warnings, typecheck 0, full
  `npm test` 824 tests (823 pass, 1 skipped), 24 focused README/article/source
  tests, quality PASS (531 files), build exit 0. Live: a repository page renders
  its README and 32.6K stars / 1.6K forks; the repository list shows the same
  stats; a CNBC article still renders its body; the FT Anthropic page reports
  HTTP 403. Not verified: browser pointer/visual review and `npm run verify`
  HTTP/recovery suites.

## 2026-11-02 — Signal reader parity: source content and repository cards

- **FID-2026-1102-106 — medium — Signal detail pages now render the
  publisher's article when the feed carried only a link, a metadata template,
  or a short preview.** The reader keeps a usable feed body, otherwise fetches
  the source page once, extracts JSON-LD or the main semantic region, resolves
  image URLs, sanitizes the result, and persists it so later views do not
  refetch. Hacker News metadata templates (`Article URL:` / `Comments URL:` /
  `Points:`) never become the body or excerpt, including legacy rows read from
  storage. Repository enrichment now works without `GITHUB_TOKEN` and finds the
  slug from the item URL, a `owner/repo` title, or a GitHub link in the feed
  body. Repository pages show the full card: description, stars, forks,
  language, license, topics, homepage, and last push. A failed scrape keeps the
  feed preview with an honest note; a failed GitHub lookup keeps previously
  stored facts instead of blanking them. A YouTube handle now resolves through
  the public channel page when `YOUTUBE_API_KEY` is absent, so the two handles
  recovered from the old volume are seedable presets again. Verified: lint 0
  warnings, typecheck 0, full `npm test` 817 tests (816 pass, 1 skipped), 13
  focused feed/ingestion tests, quality PASS (529 files), build exit 0, live
  checks of 276 stored items, 17/17 enriched repositories, a CNBC article body,
  a paper body, a repository card, and 3 live `@airevolutionx` items ingested
  with no API key. The local PGlite volume was rebuilt from `data/gateway.db`
  after its checkpoint failed; the ten non-video presets were reseeded and
  fetched. Not verified: a browser visual/pointer review and `npm run verify`
  HTTP/recovery suites; the running local volume has not been reseeded with the
  two recovered YouTube handles (`r/singularity` returned 429).

## 2026-11-02 — Signal sources, search, digest, share, and recoverable presets

- **FID-2026-1102-094 / 095 / 096 / 097 / 098 / 099 / 103 — medium — Signal
  now ingests HuggingFace Daily Papers and Trendshift, enriches repository
  items with GitHub facts, searches titles and excerpts, publishes a UTC-day
  digest, shares items, and can seed the recoverable aggroNATION sources in one
  action.** `GITHUB_TOKEN` is optional: with it, repo cards and the detail aside
  show stars, forks, language, topics, license, and the GitHub OG image; without
  it, repo items still ingest unenriched. A missing token or a failed lookup
  never fails a source. The admin seed adds the six committed rows plus four
  inferred canonical feeds and is idempotent on URL; `npm run seed:content`
  exposes the same helper outside the UI. Search is title/excerpt `ILIKE`, not
  semantic retrieval; the digest is chronological, not an AI summary.
  Verified: lint 0 warnings, typecheck 0, quality PASS (525 files), build exit
  0, full `npm test` 806 tests (805 pass, 1 skipped), and 40 focused content
  tests. A live first fetch stored 276 items across nine sources and the hub
  reports 306 total (30 pre-existing videos); `/signal`, a detail page,
  `/signal/digest`, a dated digest, and search all return 200. The same run
  exposed and fixed a legacy `sources_kind_check` constraint that would have
  rejected HuggingFace sources on upgraded databases; the regression is covered
  by the content-source suite. `r/singularity` returned 429, and the two
  YouTube handles need `YOUTUBE_API_KEY` before they can resolve. Not verified:
  live GitHub enrichment (no `GITHUB_TOKEN`), a browser share/dialog review, and
  the full `npm run verify` HTTP/recovery suites. The remaining content gaps
  are recorded as open FIDs: 100 reactions/replies, 101 rising/movers, 102
  command palette, 104 public source status, and 105 source editing.

## 2026-11-02 — Signal video thumbnails open the player in a modal

- **FID-2026-1102-093 — medium — Clicking a video thumbnail on Signal now
  opens the YouTube player in a modal instead of doing nothing.** The card
  thumbnail is a dialog trigger with autoplay, a close button, Escape and
  backdrop dismissal, focus return, body scroll lock, and a “Full page” link.
  Article thumbnails still navigate to the detail page, and a malformed video
  id cannot become an iframe source. A video with no thumbnail renders a
  gradient play placeholder instead of a dead area. Verified (`a7498a1`):
  lint 0 warnings, typecheck 0, quality PASS (514 files), build exit 0, 5/5
  format tests, and live server HTML with 24 dialog triggers and zero
  preloaded embeds. Not
  verified: an actual pointer/Escape interaction (no browser is available in
  this environment), `npm run verify`, and a visual review.

## 2026-11-02 — Signal video details and on-site discussion

- **FID-2026-1102-092 — medium — A YouTube Signal item now shows its full
  description, views, likes, star rating, and YouTube comment count, with an
  authenticated on-site discussion.** The YouTube parser now reads
  `media:group` instead of the empty entry root; ingest enriches likes and the
  comment count from `videos?part=statistics` in one bounded call per 50 items
  when `YOUTUBE_API_KEY` is set, and a failed call keeps the feed metrics and
  the source cycle. The detail page gains a back button, a description/details
  sidebar, and a discussion with a 12-per-hour per-customer ceiling behind the
  existing customer session. Fixed the duplicate `13%` col key warning on the
  public catalog. Verified: commit `87cd398`, lint 0 warnings, typecheck 0,
  quality PASS (513 files), build exit 0, 22 focused content tests, a
  disposable PGlite app that rendered every sidebar marker, signup 201,
  authenticated comment POST 200, and the restarted local server returning 200
  with zero schema errors.
  Existing items backfill on the next source Fetch. Not verified: `npm run
  verify`, a browser visual review, and a live YouTube Data API call (the merge
  and failure paths use injected fetch fixtures).

## 2026-11-02 — Free AI Signal merged with model coverage and purchase paths

- **FID-2026-1102-088 / 089 / 090 / 091 — high — The gateway now has a public
  content surface tied to the model catalog, while content remains completely
  separate from billing and routing.** A new `content` PostgreSQL namespace
  stores operator-selected RSS/YouTube sources, normalized items, canonical
  tags, fetch cycles, reviewed model links, and signed-in watch/save state.
  Ingestion is bounded to 15 seconds, 2 MiB, the per-source item cap, and a
  five-failure disable rule; HTML is sanitized. Model links are written only
  on an exact title or publisher-tag alias, never a bare family name, and show
  the reason they matched. `/signal` is the single public hub, with detail and
  topic pages and one `ModelModule` that uses the catalog's live sell price and
  the existing signup/account/plans CTA. Model pages gain a Coverage section;
  signed-in customers can follow a model, save an item, and read a seven-day
  model-aware briefing. `CONTENT_ENABLED=false` disables the public surface.
  Verified: commit `81a40eb`, lint 0 warnings, typecheck 0, quality PASS (506
  files), build 0, full `npm test` 789 tests (788 pass, 1 skipped), 23 focused
  content tests, and a disposable PGlite run that rendered the empty and seeded
  hub/detail/topic/model pages and exercised authenticated watch/save/briefing/
  saved requests with a real session cookie (all 200). Not verified: a real
  publisher feed, the full `npm run verify` HTTP/recovery suites, and a browser
  visual review. The reference site's paid-content question does not apply:
  all content is free; the only purchase is inference.

## 2026-11-01 — PostgreSQL storage cutover completed

- **FID-2026-1031-086 / FID-2026-1031-085 — critical — The running application
  uses one PostgreSQL storage engine.** `lib/store.ts` binds the async façade to
  `lib/storage/runtime.ts`; the SQLite request path, `lib/db.ts`, `lib/store/*`
  and their importers are gone. `better-sqlite3` is now a devDependency used
  only by the one-way importer and its test. The storage contract gate reports
  zero SQLite importers and is pinned by `tests/storage-contract.test.mjs`.
  Fixed during the cutover: the trial route cleared the provider quota
  observation by refreshing without network dependencies; concurrent key
  creation could exceed the ten-key cap; PostgreSQL `BIGINT` micros arrived as
  strings and priced calls at zero; several route handlers serialized
  unresolved promises into JSON. Verified: `npm run verify` exit 0 — 749 tests
  (748 pass, 1 skipped), lint 0 warnings, typecheck 0, quality PASS (465 files),
  build exit 0, HTTP 750 + trial checks PASS, PostgreSQL recovery drill 12/12.
  The FID-060 load envelope has **not** been re-measured against PostgreSQL and
  remains `candidate`; that measurement is carried as a launch blocker, not a
  pass.

## 2026-11-01 — Admin-run model identity verification (free pool)

- **FID-2026-1101-087 — high — An operator can now run and publish an advisory
  identity check for a free-pool model.** `aio-identity-v2` seals the battery,
  sampling and decision constants; the runner probes the upstream directly with
  an injected fetch and an isolated `identity` schema, never through customer
  admission or credit. Baseline and verify runs produce orthogonal findings; a
  same-route baseline is `baseline` or `self_consistent`, never independent
  verification. Publishing is a separate operator action and writes a
  correction-ledger entry. `/models/[...id]` renders the published panel and
  `/identity` renders the method and ledger. Verified: 66 identity tests, 748
  repository tests, lint, typecheck, quality, build, the recovery drill, and a
  live fixture baseline/publish run (181 samples). At the time of that FID
  `npm run test:http` and `npm run verify` were red at FID-086's incomplete
  storage flip; both are green after the cutover entry above.
- **Account policy acceptance reads the lane that writes it.** The HTTP gate
  exposed the account page reading policy acceptance from the ported PostgreSQL
  façade while signup and the account route still write SQLite. The page now
  reads the SQLite lane until FID-086's flip, so a customer who has accepted is
  not asked again.

## 2026-11-01 — Step 4 slice 2: readers and provider writers on PostgreSQL

- **FID-2026-1031-086 (step 4, slice 2) — critical — The public model list, the
  chat entry, the account page and the operator console read PostgreSQL.**
  `/v1/models`, `/v1/chat/completions` (now the ported entry), `/account`, the
  admin gateway and operations pages and APIs, admin session, the provider
  runtime route and the account trial route all use the async façade.
  `lib/providers/runtime.ts` and `lib/providers/sync.ts` became production
  wrappers over the ported modules, so the catalog writer and its readers moved
  together rather than leaving one side empty. Verified: `npm test` 681 tests
  (680 pass, 0 fail, 1 skipped), typecheck 0, lint 0 warnings, quality PASS at
  464 files, build exit 0 with 23 static pages.
- **`/api/ready` probes PostgreSQL.** The table check reads `information_schema`
  instead of `sqlite_master`, the write is an upsert on `settings.key`, and the
  rollback is a sentinel that aborts the probe transaction so no row is kept.
  Verified with a live request: `{"status":"ready","checks":{"configuration":
  "ok","storage":"ok"},"mode":"durable","admission":"open"}` at HTTP 200.
- **Runtime bug found and fixed.** A route importing one façade group never ran
  the barrel's `bindStoreRuntime`, so the resolver threw and readiness reported
  `admission: "unavailable"` behind a 200. The resolver now binds the server
  runtime on first use; an explicit binding still wins. This affected every
  converted route.
- **HTTP suites currently fail, for a storage reason.** Against the flipped
  build they reach 53 PASS (metadata, page renders, promo origin guards) then
  stop at `promo admin list serves — expected 200, got 401`. The server log gives
  the cause: `DATABASE_URL is required in production. The local storage engine is
  a single-process database and is not a production fallback.` The harness still
  hands `next start` a SQLite `DB_PATH`. Reported as a failure, not a pass.
- **Known gap, stated plainly.** The legacy `lib/store` modules and barrel still
  exist (`npm run storage:check` exits 1), the HTTP suites and monitor/backup
  scripts still seed and read SQLite (`npm run test:http` was not run against
  the converted routes), and a fresh PostgreSQL database has no catalog until an
  admin sync or `npm run db:import` runs. Those are the remaining cutover steps,
  not completed here.

## 2026-11-01 — Step 4 slice 1: the async store façade

- **FID-2026-1031-086 (step 4, slice 1) — medium — A bound façade lets the
  caller conversion be `await` insertion rather than a rewrite.**
  `lib/store-facade/{runtime,bound,catalog,insights,access,money,operations}.ts`
  wrap the ported store under the names callers already import, strip the
  database-handle argument and supply one bound handle. The resolver is injected
  so the façade loads under the test runner, and an unbound façade throws rather
  than returning `undefined`. Verified by four suites (7 tests) against a real
  PGlite handle; typecheck, lint and quality pass at 464 files.
- **Deliberately not wired.** No caller is converted by this slice: the
  application still runs the synchronous store end to end, including the chat
  entry. The façade is the seam the atomic sweep needs, not the sweep itself.

## 2026-11-01 — Batch B slice 10: trial-offer on the async handle

- **FID-2026-1031-086 (step 2, slice 10) — medium — The trial-to-paid offer runs
  on the async handle.** `lib/storage/store/trial-offer.ts` publishes the paid
  model id and its exact rates only when the trial is enabled, the pair exists,
  both rows share a provider, the paid row is active and in the catalog, its cost
  is known and it has a sell price. Verified by
  `tests/trial-offer-postgres.test.mjs` (4 tests); `npm test` is 674 tests with
  673 pass, 0 fail, 1 skipped, zero lint warnings and a quality PASS at 457
  files.
- **Correction to earlier wording:** the storage contract check does not count
  missing modules and never reported `trial-offer`. Its counters are 43 SQLite
  importers, 28 legacy modules with inline statements and 199 statements — all
  unchanged, since `trial-offer` contains no SQL. The port removes the last
  module-level special case from the caller conversion, not a contract failure.

## 2026-11-01 — Batch B slice 9: the gateway orchestration ported

- **FID-2026-1031-086 (step 2, slice 9) — critical — The chat-completions entry
  exists on the async handle.** `lib/storage/gateway/call.ts` follows the same
  decision order as `lib/gateway.ts` — authenticate, validate, resolve, operator
  admission, rate limit, serving-account ceiling, subscription/free/paid
  reservation, durable admission, dispatch, settle — with every storage call
  awaited against one handle. `resolution.ts`, `provider-call.ts`, `paid.ts`,
  `trial.ts` and `payload.ts` hold the lookups, dispatch, reservations and
  payload rewrites; the pure refusal helpers moved to `lib/gateway-refusal.ts`
  and are shared by both entries rather than copied. Typecheck, lint and quality
  pass; `npm test` is 667 tests with 666 pass, 0 fail, 1 skipped.
- **Deliberately not wired.** Pointing `lib/gateway.ts` at the ported entry while
  every other route still reads SQLite would make the gateway the only reader of
  an empty PostgreSQL catalog: every inference call would answer
  `model_not_found`, and the HTTP suite would go red. The live entry is
  unchanged until the caller conversion lands in the same commit. The port
  therefore has no behavior test yet; the composed HTTP suite is its proof and
  runs at the flip.

## 2026-11-01 — Batch B slice 8: promo codes, and a pre-flip pipeline receipt

- **FID-2026-1031-086 (step 2, slice 8) — high — Promo codes run on the async
  handle.** `lib/storage/store/promos.ts` creates, lists and pauses codes;
  `promo-redemption.ts` redeems them behind the conditional claim
  `UPDATE ... WHERE redeemed_count < max_redemptions`, with the unique index on
  `(promo_code_id, user_id)` as the durable guard. The credit is now an
  assignment: `UPDATE users SET credit_micros = credit_micros + ? RETURNING
  credit_micros`, and the ledger row carries the balance that statement
  returned. The SQLite version read, added and wrote an absolute value, which
  was safe only because one writer was admitted; two different codes redeemed at
  the same moment would otherwise have lost one of the grants. Verified by
  `tests/promos-postgres.test.mjs` (7 tests).
- **Verification receipt — `npm run verify` exit 0.** Build compiled in 3.0s
  (23 static pages), 667 tests with 666 pass, 0 fail, 1 skipped, quality PASS at
  449 files, 792 HTTP check lines with zero failures across the composed and
  trial suites, and 13 recovery-drill PASS lines covering dump, restore, replay
  and refusals. **This proves the tree before the flip.** It is not evidence for
  the flipped tree: the storage contract check still reports 43 SQLite handle
  importers, 28 `lib/store` modules with 199 inline statements, and
  `lib/store/trial-offer.ts` without an async counterpart, so the cutover in
  step 4 has not started.

## 2026-11-01 — Batch B slice 7: provider sync and the account runtime

- **FID-2026-1031-086 (step 2, slice 7) — high — Provider catalog sync and the
  provider account check run on the async handle.**
  `lib/storage/ledger/quota.ts` holds the runtime lease ledger: claiming is
  conditional on no live lease, completing is conditional on still owning it, and
  a claim clears the stored observation so an in-flight check cannot be read as a
  fresh reading. `lib/storage/providers/runtime.ts` keeps the account contract —
  one check at a time, overlapping callers share the in-flight request, a failed
  fetch is stored and reported as a warning rather than thrown, and a stale
  observation is never served as current. `lib/storage/providers/sync.ts` reads
  the provider catalog and replaces only that provider's rows, preserving manual
  prices, costs, group assignments and operator disables. The upstream transport
  is injected because `lib/providers/request.ts` reaches `server-only`, while
  envelope validation, the page cap and the cursor rule stay in the port: a
  `200` carrying an error object is refused before it can delist a catalog.
  The analytics store from the same request had landed in slice 5 but had never
  been called, because the live `lib/store/analytics.ts` still returns the
  synchronous SQLite report; it now has a behaviour suite covering the zero-
  filled series, the windowed totals, model ranking, plan revenue and the
  monthly run-rate. Verified by `tests/provider-sync-postgres.test.mjs`
  (9 tests) and `tests/store-analytics-postgres.test.mjs` (4 tests), with
  `npm test` at 660 tests, 659 pass, 0 fail, 1 skipped, zero lint warnings and a
  quality PASS. The application is still on the synchronous store; the flip
  remains pending.

## 2026-11-01 — Batch B slice 6: catalog freshness and the display cache

- **FID-2026-1031-086 (step 2, slice 6) — medium — `ensureProvidersFresh` runs on
  the async handle, and the landing and catalog reads call it directly.**
  `lib/storage/providers/freshness.ts` keeps the stale-while-revalidate
  contract: the render starts a refresh and does not wait, only enabled,
  credentialed and stale providers are attempted, one run per handle at a time,
  and a five-minute floor separates attempts. A landed refresh clears the
  display cache so the next render sees the new catalog. The refresh state is
  keyed by handle, matching the projection cache. The work is also awaitable
  through `refreshProvidersIfDue`, which is what makes the policy testable
  without sleeping on a detached promise. While wiring it, the duplicate
  `public-catalog.ts` cache was removed in favour of the per-handle
  `catalog.ts` — a module-level cache would answer one database's query with
  another's rows. Verified by `tests/provider-freshness-postgres.test.mjs`
  (6 tests), with `npm test` at 647 tests, 646 pass, 0 fail, 1 skipped, zero
  lint warnings and a quality PASS. The application itself is still on the
  synchronous store; the flip remains pending.

## 2026-11-01 — Batch B slice 5: catalog reads

- **FID-2026-1031-086 (step 2, slice 5) — medium — The overview, landing,
  catalog and admin read models run on the async handle.** `public-catalog.ts`
  keeps the 5-second display cache and the same visibility predicate the gateway
  uses; `overview.ts` reads the seven catalog counts in one statement so a page's
  headline cannot disagree with the list beside it; `provider-catalog.ts` imports
  the statement and mapper from `lib/provider-catalog.ts` instead of restating
  them, and `banner.ts` ports the context-banner settings. As with
  `daily-trial`, the catalog refresher is a parameter rather than an import,
  because `lib/provider-sync.ts` reaches `server-only`. `npm test` is at 641
  tests, 640 pass, 0 fail, 1 skipped, with zero lint warnings and a quality PASS.
  **This does not flip the application**: the synchronous store is still the live
  path, and `analytics` plus provider sync are still unported.

## 2026-11-01 — Batch B slice 4: the settlement money path

- **FID-2026-1031-086 (step 2, slice 4) — high — `recordUsage`, `settleCall` and
  the streaming relay run on the async handle.** Settlement still makes one
  promise and the port keeps it: one admitted call settles once. The durable
  settlement row is claimed before any write, an already-settled free
  reservation stops the same way, and the debit, its ledger row, the hold
  release, the allowance move, the free-pool settle and the usage row commit in
  one transaction. Two findings shaped the port. The pricing and SSE helpers had
  to move out of `lib/gateway-settle.ts` into `lib/gateway-usage.ts`, because
  that module imports `server-only` and the port must load under the Node test
  runner; the live module re-exports them, so no caller changed. And the debit
  deliberately does **not** use `debitCredit`: its `WHERE credit_micros >= ?`
  guard would silently drop a charge when a provider reports more tokens than
  the estimate, which the hold — admission control, not a price ceiling — still
  permits. Settlement debits unconditionally and records the balance the
  statement returned. The relay now awaits settlement, so `[DONE]` is forwarded
  only after commit and a truncated stream settles as an error. Verified by
  `tests/gateway-settlement-postgres.test.mjs` (7 tests) and end to end by
  `tests/gateway-e2e-postgres.test.mjs` (2 tests), which admits, streams and
  settles two calls and then asks `reconcileDatabase` and `balanceAudit` whether
  the database agrees. `npm test` is at 641 tests, 640 pass, 0 fail, 1 skipped,
  with zero lint warnings and a quality PASS. Not wired into the request path:
  the flip is step 4.

## 2026-11-01 — Batch B slice 3: the operations cluster

- **FID-2026-1031-086 (step 2, slice 3) — high — Incident records, the snapshot
  and the monitor tick run on the async handle.** `lib/storage/operations/`
  carries the durable state machine (`incidents.ts`), the read model
  (`snapshot.ts`), one monitor pass (`tick.ts`) and the volume observation
  (`storage.ts`), with `lib/storage/store/operations.ts` as the shared entry
  point for the admin panel and the scheduler. The transitions are unchanged and
  tested: one alert per open condition, a fresh alert when a resolved condition
  returns, a single escalation from warning to critical, and a bounded,
  resumable delivery schedule that stays visible when it stops. One part could
  not be ported literally: the storage guard measured a SQLite file and
  `gateway-*.db` archives, so it now reads `pg_database_size(current_database())`
  and counts the manifest-bearing directory dumps — otherwise both halves would
  report "0 bytes, no backups" forever while looking healthy. Verified by
  `tests/operations-postgres.test.mjs` (9 tests), with `npm test` at 632 tests,
  631 pass, 0 fail, 1 skipped, zero lint warnings and a quality PASS. Not wired
  into the application: the flip is step 4.

## 2026-11-01 — Batch B slice 2: the allocation and trial cluster

- **FID-2026-1031-086 (step 2, slice 2) — high — Free-pool allocation, admission
  and settlement run on the async handle.** `lib/storage/ledger/allocations.ts`
  ports the daily split: an even share per activated account, re-derived when a
  late signup joins, lowered to the new fair share but never below what the
  account has already used or holds, and withdrawn when its last active key is
  revoked. `lib/storage/store/allocations.ts`, `store/daily-trial.ts` and
  `store/free-pool.ts` sit on it, so the display summary and the admission path
  now read the same policy and the same rows. Two port findings are recorded in
  the FID: `INSERT OR IGNORE` plus a select became
  `ON CONFLICT DO NOTHING … RETURNING`, and the live provider refresher is a
  parameter because `lib/providers/runtime.ts` imports `server-only`. Verified by
  `tests/store-allocation-cluster-postgres.test.mjs` (10 tests) against a real
  PostgreSQL engine, with `npm test` at 623 tests, 622 pass, 0 fail, 1 skipped,
  zero lint warnings and a quality PASS. Not wired into the application: the flip
  is step 4.

## 2026-11-01 — Batch B slice 1: benchmarks and the admin epoch

- **FID-2026-1031-086 (step 2, slice 1) — medium — The benchmark sync lease and
  the admin session epoch run on the async handle.** `lib/storage/store/benchmarks.ts`
  keeps the lease exclusive through the statement itself
  (`ON CONFLICT … DO UPDATE … WHERE lease_until < now`), so two syncs cannot both
  run, and keeps the stale-not-deleted rule for rows that disappear from the
  source catalogue. `lib/storage/store/admin.ts` increments the epoch with
  `UPDATE … RETURNING`, replacing a read-after-write that was correct only under
  SQLite's single writer. One finding shaped the port: `getBenchmarkStatus`
  cannot import `artificialAnalysisConfigured`, because that module imports
  `server-only` and cannot be loaded by the test runner, so configuration is now
  a parameter. Verified by `tests/store-batch-b-postgres.test.mjs` (4 tests),
  with `npm test` at 613 tests, 612 pass, 0 fail, 1 skipped. The remaining six
  Batch B modules depend on unported helper ledgers and are not claimed.
- **FID-2026-1031-086 (importer) — the dry run against the operator's real
  database succeeds without a refusal.** `data/gateway.db` imports 3 providers,
  3 groups, 89 models, 1 setting, 33 benchmark rows and 6 syncs into a throwaway
  target, with the source read-only and its digest unchanged.

## 2026-10-31 — Backup, restore and the recovery drill on PostgreSQL

- **FID-2026-1031-086 (step 6, durability) — high — The backup path now copies a
  database that does not exist as a file, and the drill proves the restore
  instead of describing it.** `lib/storage/backup.ts` writes a logical dump —
  `manifest.json` plus one `.jsonl` per table, ordered by the catalog's foreign
  keys — and refuses to write one when any user's `credit_micros` is not the sum
  of their ledger rows or `held_micros` not their live holds. Each table records
  an order-independent checksum, so a restore proves it loaded the same rows, not
  merely the same count. `scripts/db-restore.mjs` replaces a target in one
  transaction and refuses a missing manifest, a target holding customers without
  `--force`, a row count that disagrees with the manifest, a checksum mismatch
  and an unreconstructible balance; every refusal rolls back, leaving the target
  as it was. `scripts/db-recovery-drill.mjs` seeds a reconciled history, dumps
  it, deletes the source database, restores into a fresh one, reads a spendable
  balance back, and proves a replayed payment event and a tampered or truncated
  dump are all rejected. The shared invariant lives in
  `lib/storage/ledger/invariants.ts`, used by the importer, the backup and the
  drill. `tests/database-recovery.test.mjs` was ported to the new engine;
  `npm run test:recovery` passes 12 checks, `npm test` 609 tests / 608 pass / 1
  skipped. **Honest limits:** logical snapshot, not point-in-time recovery (no
  WAL archiving); rows are loaded per table, so very large archives should use
  `pg_dump`; and the server-level drill returns with the storage flip.

## 2026-10-31 — One-shot SQLite → PostgreSQL import

- **FID-2026-1031-086 (step 6, importer) — high — The operator's local
  configuration and customers can now be carried across the storage flip, with
  a balance check that refuses rather than guesses.** `scripts/sqlite-import.mjs`
  (`npm run db:import`) opens the SQLite file read-only, replaces the target's
  configuration rows inside one transaction, and copies customers, keys, ledger,
  holds, top-ups and subscriptions only with `--include-customers`. Four
  refusals are explicit: a target that already holds customers without
  `--force`, a target schema missing a column the source has (named, never
  dropped), a row shortfall between source and imported counts, and any user
  whose `credit_micros` does not equal the sum of their imported ledger rows or
  whose `held_micros` does not equal their live holds. A refusal rolls the whole
  transaction back, and the source digest is reported before and after so the
  untouched file is evidence. Counts compare rows the import inserted rather than
  the target's totals, because the migration seeds a dev user and system groups
  into a fresh database. Verified by `tests/sqlite-import.test.mjs` (5 tests:
  counts and unchanged bytes, recomputed balances, rollback on a dishonest
  ledger, non-empty-target refusal, column refusal), with `npm test` at 609
  tests, 608 pass, 0 fail, 1 skipped. **Still pending:** PostgreSQL
  backup/restore and the recovery-drill rerun, which need a networked database
  and the flip itself.

## 2026-10-31 — Batch A: subscriptions, top-ups and customers on the async handle

- **FID-2026-1031-086 (step 1) — high — The money and customer surface now has
  an async target, and fulfilment credits exactly once.**
  `lib/storage/store/topups.ts` credits a paid checkout with
  `UPDATE users SET credit_micros = credit_micros + ? RETURNING credit_micros`,
  so the balance written to the ledger is the balance the customer holds after
  the write; the previous read-then-write was safe only because SQLite admitted
  one writer. Replays still return `already_paid` from the status transition, so
  a webhook delivered twice adds no second ledger row. `customer.ts`,
  `account.ts` and `account-email.ts` carry identity, sessions, the key cap and
  the account read model; `subscriptions.ts`, `subscription-lifecycle.ts`,
  `subscription-invoices.ts`, `subscription-entitlements.ts` and
  `subscription-admin.ts` carry checkout, activation, reconciliation,
  cancellation and the operator grant, with the invoice upsert keyed on the
  unique `provider_invoice_id`. A concurrent second grant is now refused by the
  partial unique index and mapped to the same 409 the pre-check returns, instead
  of racing past it. **Not yet a behaviour change:** `lib/store/*` still serves
  the application, 29 statements across 8 modules remain unported, and the flip
  is still one atomic commit (FID-086 step 4). Verified by
  `tests/store-customer-batch-postgres.test.mjs` (12 tests against PostgreSQL),
  with `npm test` at 604 tests, 603 pass, 0 fail, 1 skipped.

## 2026-10-31 — Storage cutover prerequisites: one engine, one handle

- **FID-2026-1031-085 (step 4 + 5, slice 1) — high — The data layer now has a
  single runtime entry point, and production cannot be served from the local
  engine.** `lib/storage/database.ts` builds the storage handle: PostgreSQL when
  `DATABASE_URL` is set, otherwise an in-process PGlite database, with the
  migration run after readiness. `lib/storage/runtime.ts` caches it as a lazy
  single-flight promise and raises in production when `DATABASE_URL` is absent.
  Establishing the shape of the cutover produced the finding that decides it:
  the store layer is SQLite dialect (`datetime()`, scalar `MAX`,
  `INSERT OR IGNORE`) and the ported ledger is Postgres dialect (`GREATEST`,
  `ON CONFLICT`, `::timestamptz`), so neither statement set runs on the other
  engine and the flip is per dialect, not per connection — it cannot be staged
  with both databases live. **Not yet a behavior change:** nothing under `app/`
  imports the new handle, the 39 store modules and 73 callers are still the
  synchronous SQLite implementation, and the application continues to run on
  SQLite until the flip lands as one sequence.
- **FID-2026-1031-085 (step 4, slice 2) — high — The money-core store has an
  async target.** `lib/storage/store/billing.ts`, `activity.ts` and
  `reconciliation.ts` implement the account summary, ledger read, grant,
  activity log, adjustment, baseline and reconciliation report on the async
  handle. Reserve, release and quarantine are re-exported from the already
  ported `store/credit.ts` rather than restated, so the guarded reservation has
  one implementation. Two guarantees became explicit rather than assumed: a
  grant locks its read with `FOR UPDATE` (SQLite got that from being
  single-writer), and a summary read quarantines elapsed holds before reading.
  **No call site changed** — `lib/store/*` still serves the application, so this
  is a ported implementation awaiting the single atomic flip, not a behaviour
  change.

## 2026-10-31 — Shared projections and the first read-path ports

- **FID-2026-1031-085 (step 4, slices 3–4) — high — The row projections and key
  crypto moved out of modules that cannot be imported by a test, and the key and
  pricing stores now run on the async handle.** `lib/projections.ts` owns the
  row types and every projection; `lib/api-key-crypto.ts` owns key generation and
  hashing. `lib/store/shared.ts` and `lib/api-keys.ts` are now thin
  `server-only` re-exports, so each helper has exactly one implementation while
  the server boundary stays where the application needs it — the split was
  forced because `server-only` throws outside a React server context, which made
  the ported key store unloadable under the Node test runner. Also ported:
  `store/settings.ts`, `store/keys.ts` and `store/pricing.ts`, with explicit
  `.ts` import extensions because Node's ESM resolver does not infer them.
  Found and recorded, not silently changed: `averageMarginBps([])` returns
  `NaN`, so a catalog with nothing priced renders `NaN%` — a defect in the live
  path, left for its own change so the port's verification stays meaningful.
  **Still no caller flip:** `lib/store/*` serves the application unchanged.

## 2026-10-31 — The public catalog on the async handle

- **FID-2026-1031-085 (step 4, slice 5) — high — The published catalog and its
  publication gate now run on the async handle.** `store/catalog.ts` and
  `store/model-sql.ts` are ported, with the manual-cost freshness guard moved
  from `julianday()` to `cost_observed_at::timestamptz >= now() - interval 'N
days'` (the interval is built from a validated integer at module load, never
  from a request). Two deliberate differences from the live version: the catalog
  cache is keyed per database handle instead of module-wide, so one database
  cannot answer another's query; and the tests are withhold/publish pairs, so
  each guard is shown refusing a row *and* admitting it once satisfied. Also
  recorded: the migration seeds the three system groups, so catalog fixtures
  must not insert them again. **Still no caller flip:** the application continues
  to run on the synchronous SQLite store.

## 2026-10-31 — Admin catalog, routes and usage on the async handle

- **FID-2026-1031-085 (step 4, slice 6) — high — Route reconciliation, the admin
  model store and the usage reads now run on the async handle.** `store/routes.ts`
  reconciles serving routes (cheapest provider answers the stable published id),
  `store/models.ts` owns admin reads and single-row pricing edits, and
  `store/usage.ts` owns `listUsage` / `listAdminUsage`. The full-catalog upsert
  moved to `store/model-sync.ts` when `models.ts` crossed the 400-line ceiling —
  a cut that also separates wholesale catalog rewrites from admin reads.
  `routesByGroup` is re-exported from `lib/route-reconcile.ts` rather than
  rewritten, since it is a pure grouping with no handle. Two contracts are now
  encoded in tests rather than assumed: `applyCatalogMarkup` must be preceded by
  `saveMarkupBps`, because its trailing reconcile re-derives auto prices from the
  stored markup and would otherwise undo the apply; and the published id is the
  plain upstream id, while an additional provider publishes a namespaced one.
  `recordUsage` — the settlement write — is deliberately **not** ported yet: it
  belongs with the gateway cutover, and half of it would be a stub.

## 2026-10-31 — Group and support stores on the async handle

- **FID-2026-1031-085 (step 4, slice 7) — high — The model group and support
  stores now run on the async handle.** `store/groups.ts` keeps the three rules
  that make a group edit a money edit: a system group keeps its billing mode, a
  plan-included group cannot be deleted, and moving rows into a free group zeroes
  their sell prices in the same transaction that moves them. Its label check now
  compares `lower(label)`, because the PostgreSQL constraint is a unique index on
  `lower(label)` — the exact-match check would have passed a case-only duplicate
  in the application and then failed inside the index as a driver error.
  `store/support.ts` preserves the operator queue's ordering (open first, then
  recency) with an explicit `::timestamptz` cast. **Still no caller flip:** the
  application continues to run on the synchronous SQLite store.

## 2026-10-31 — Plans on the async handle

- **FID-2026-1031-085 (step 4, slice 8) — high — The plan read model and plan
  mutations now run on the async handle.** `store/plan-rows.ts` and
  `store/plans.ts` port the purchasable product: group and model inclusions are
  expanded to the exact entitlement ids a subscription snapshot will hold, a free
  group cannot be sold, an active plan must cover at least one model, and a plan
  with subscriptions is archived rather than deleted. `decidePlanActivation`,
  `readPlanValues` and `expandEntitlementIds` are reused from `lib/plan-sales.ts`
  and `lib/plans.ts`, so the sales policy keeps one answer. `toPlanSummary`
  became a pure function with subscriber counts passed in — necessary once the
  database handle is an argument, and it makes a plan summary testable without a
  database. **Still no caller flip:** the application continues to run on the
  synchronous SQLite store.

## 2026-10-31 — Settlement and policy stores on the async handle

- **FID-2026-1031-085 (step 4, slice 9) — high — The settlement and policy
  acceptance stores now run on the async handle.** Both are evidence stores, so
  the port is judged on preservation: a settlement row is written before
  dispatch and throws if it cannot be stored (admitting a call whose row did not
  commit would be a charge with no audit trail); a quarantined hold releases
  exactly once, so a double-click cannot free the same reservation twice; and a
  repeat policy acceptance returns the *first* row, keeping the time the customer
  agreed to the version they were shown. The settlements store stays thin by
  design — the ledger owns every statement and this module supplies the call id
  and the clock, so a `stl_` id is minted in exactly one place. **Still no caller
  flip:** the application continues to run on the synchronous SQLite store.

## 2026-10-31 — The provider registry on the async handle

- **FID-2026-1031-085 (step 4, slice 10) — high — The provider registry now runs
  on the async handle.** `store/providers.ts`, `store/provider.ts` and the new
  `store/provider-rows.ts` and `store/quota.ts` port the registry that decides
  where a call is sent. The admission rules are unchanged: an unconfigured
  provider reports `unconfigured` and never inherits a stale balance or quota, a
  stale quota hides the subscription numbers, a provider claiming subscription
  support without a current quota reports `error`, the default provider cannot be
  deleted, deleting another removes its catalog and re-runs route reconciliation,
  and usage history is never rewritten. `toStatus` became asynchronous because it
  consults the quota ledger — splitting the pure part out would have duplicated
  the admission logic — and `providers.ts` crossed the line ceiling, so the row
  mapping moved to `provider-rows.ts`. Only `effectiveProviderRemaining` is
  ported from `lib/quota-ledger.ts`; the runtime lease belongs to the provider
  runtime cutover. **Still no caller flip:** the application continues to run on
  the synchronous SQLite store.

## 2026-10-31 — Subscription admission on the async handle

- **FID-2026-1031-085 (step 4, slice 11) — high — The subscription read model
  and admission path now run on the async handle.** `store/subscription-rows.ts`
  and `store/subscription-access.ts` port the second money path. The ordering is
  unchanged and load-bearing: a past-due subscription blocks before free or
  credit routing, and a model the plan does not cover returns `none` so the caller
  falls through instead of answering a confusing refusal. Admission still takes a
  hold and increments `weighted_tokens_held` in one transaction, settlement still
  moves that hold into used, and an expired hold is still quarantined rather than
  silently returned, reusing the ported settlement ledger. Snapshot columns remain
  the source of truth for price and allowance, so editing a plan cannot rewrite a
  purchased subscription. `MAX(0, …)` became `GREATEST(0, …)` and `datetime(…)`
  orderings became `::timestamptz` casts; `toSubscriptionSummary` became
  asynchronous for the same reason `toPlanSummary` did. **Still no caller flip:**
  the application continues to run on the synchronous SQLite store.

## 2026-10-31 — Automatic provider sync and a publication gate

- **FID-2026-1031-084 — medium — Catalogs refresh themselves, and a model the
  gateway cannot bill is no longer published.** A catalog read now re-syncs any
  enabled, configured provider whose catalog is older than
  `PROVIDER_SYNC_INTERVAL_HOURS` (default 6, `0` disables), one run at a time,
  serving stored rows while it happens. `PUBLIC_MODEL_SCOPE` additionally
  withholds a paid row with no sell price and a row priced from a manually
  entered cost older than `PROVIDER_PRICE_MAX_AGE_DAYS` (default 30). The cost
  timestamp is recorded on write and backfilled from the sync time. The admin
  **Sync and boundaries** card now reads live per-provider state — synced,
  priced, without cost, serving, last sync and an overdue flag — instead of a
  single while-label provider, and states the reserve boundary for providers
  with no balance endpoint.

## 2026-10-31 — Apixo credential name aligned with the upstream

- **FID-2026-1031-083 — low — The Apixo provider row now expects
  `APIXOAI_API_KEY`, the name the upstream documents, and an untouched row
  seeded as `APIXO_API_KEY` is renamed on boot.** Without the alignment a key
  stored under the documented name reads as unconfigured, so the provider stays
  disabled, no sync can run, and no Apixo model can appear anywhere on the site.
  The migration matches that exact seed value only: a provider row an operator
  pointed at a different variable is left alone, and a second boot changes
  nothing.

## 2026-10-31 — Sortable catalog columns and provider sections

- **FID-2026-1031-082 — medium — Every catalog column now sorts from its
  header, and the admin catalog shows what each provider contributes.** Model,
  Group, Weight, Features, AA Benchmark, Savant $/1M and vs OpenRouter are
  header buttons with `aria-sort` and a direction arrow; the four-option sort
  dropdown is gone. Missing measurements and unmatched comparisons sort last in
  both directions, ties fall back to the model name, and the default order keeps
  the free-first presentation. `Catalog by provider` on `/admin/catalog` counts,
  per provider, synced models, active rows, priced rows, unknown-cost rows and
  the published models it currently serves — where serving can differ from
  ownership when the cheapest route wins. Public pages stay white-label; the
  provider section is admin-only.

## 2026-10-31 — Cheapest-provider routing for a shared catalog

- **FID-2026-1031-081 — high — A model sold by two providers is now one
  published entry, served by the cheaper one.** Every synced row carries a
  provider-neutral `route_group` (case, separators and the `family/` path
  folded; release stamps and `-backup` dropped, variants preserved). After each
  sync, cost/price/status change and provider enable/disable/delete, the
  gateway ranks servable rows by `3 × input + output` cost and publishes the
  stable unscoped id while serving the winner. The serving provider's upstream
  id, protocol and cost are stored on the published row (`served_*`), so a
  cheaper takeover raises margin instead of recording a cost that was never
  paid. A model only the new provider sells appears once it is priced; a
  disabled published row hides the group rather than promoting another
  provider. Pinned `provider/model` ids still resolve directly. The admin
  catalog shows the serving provider, every competing route and a read-only
  cost when another provider serves the row. Adding a provider stays registry
  + key + sync + price (see [docs/providers.md](../docs/providers.md)).
  Automatic cross-provider failover, media endpoints and Apixo price import are
  explicit non-goals.

## 2026-10-31 — Apixo provider review and unpriced-import guard

- **FID-2026-1031-080 — medium — A provider that publishes no prices can no
  longer publish models.** Apixo's `GET /v1/models` answered with 43 rows and no
  cost field, so a first sync imported every model as active at `$0.00`, listed
  it in the public catalog, and answered `503 model_unpriced` on every call. New
  rows whose cost is unknown now import disabled; a priced row and a free-pool
  row still import active, and an existing row keeps whatever status the operator
  gave it. The
  [provider review](../docs/research/apixo-provider-review.md) records the
  verified API surface (dual wire format, per-key rate limits, 402/429 errors,
  a separate four-model image catalog at $0.01–$0.08 per image), the resale
  economics ($50 panel fee, $100 first top-up, cost at their public price), and
  the gaps this pass did not close: no image route, no cross-provider failover,
  and no machine-readable text prices. The `apixo` provider row stays disabled.

Verification: `node --test tests/catalog-integrity.test.mjs` 14 pass;
`npm run typecheck`, `npm run lint` (zero warnings), `npm run quality` and
`npm run build` exit 0.

## 2026-10-31 — Local quality pass: promo credit, lifecycle activity and read paths

- **FID-2026-1031-077 — medium — The A–Z audit found and fixed two concrete
  read-path defects.** `lib/analytics.ts` wrapped indexed timestamps in
  `datetime(...)`, defeating `usage_events_created_idx` on every admin analytics
  range; predicates now compare ISO strings directly and the query-plan test
  asserts the index. `billing_events(status, claimed_at)` was missing for stale
  claim recovery and is added additively. A provider-scoped usage composite was
  measured and rejected: it adds one index write to every settlement, while the
  existing `created_at` index already bounds the day window. The
  [A–Z audit](../dev/audits/2026-10-31-a-z-quality-audit.md) records 26 dimensions,
  evidence and the open launch dependencies. Load passed 123/123 checks at
  213.71–224.31 sustained admitted rps across post-change runs (one cold 181.42)
  against the 229.84 candidate baseline; the envelope remains unapproved.
- **FID-2026-1031-078 — high — Free credit now has an operator-issued promo
  path without a second balance.** `promo_codes` stores only a SHA-256 hash and
  a display prefix; the full 12-character code is returned once at creation.
  A code carries a dollar amount (max $500), a redemption cap and an optional
  UTC window. Redemption is default-off behind `PROMO_CODES_ENABLED`, runs in
  one immediate transaction that increments the cap, records the customer
  redemption, credits `credit_balance_micros`, writes a `promo` ledger row and
  appends an activity event. The admin panel issues/lists/pauses; the customer
  card renders only while the flag is on. Promo dollars do not expire; the code
  can. The existing weighted-token free pool is unchanged.
- **FID-2026-1031-079 — medium — Business lifecycle events now have one
  append-only record.** `activity_events` stores actor, kind, entity and
  allowlisted scalar metadata, never prompts, completions, keys, passwords,
  tokens or full promo codes. Signup, login/logout, key create/revoke, credit
  grant/adjustment, top-up create/paid and promo create/redeem are instrumented;
  money/account writes are transactional, while login/logout writes are
  best-effort so an audit failure cannot block a session. The
  `GET /api/admin/activity` route and the admin overview expose the latest rows
  with a clamped limit and user/kind filters.

Verification: `npm test` 394 pass; `npm run test:http` 750 checks plus the trial
suite; `npm run test:load` 123 checks; `npm run test:recovery` 34 checks;
`npm run typecheck`, `npm run lint` (zero warnings), `npm run quality` (355
files), `npm run build` and `npm run config:check` exit 0; `npm audit --omit=dev`
reports 0 vulnerabilities. Closed against `7996124`; all three records are
archived.

## 2026-10-31 — Measured capacity and failure acceptance

- **FID-2026-1030-060 — high — the gateway now has a bounded, reproducible load
  and fault receipt instead of a capacity assumption.** `scripts/load-acceptance.mjs`
  boots the production artifact on a disposable SQLite file and a local provider
  fixture, then measures ramp, steady, burst, mixed billing, long streams,
  cancellations, key churn, competing reservations, provider 429/5xx/disconnect/
  malformed/truncated responses, quota reset, database contention, alert failure,
  drain, process crash and a durable storage-write rejection. Dispatch is counted
  at the fixture upstream; settlement, usage, ledger and held credit are read
  independently from SQLite, so the run cannot pass by refusing work or leaving
  admitted calls unresolved. The fault matrix found and repaired a real SSE
  defect: a clean upstream close without `[DONE]` was settled as success, charged
  as an estimate and acknowledged as complete; it now settles as error, releases
  admission and never forwards `[DONE]`, with four HTTP regression checks.
  `tests/capacity-invariants.test.mjs` (5 tests) covers interleaved admission,
  refusal without RPM spend, alias sharing, idempotent release and unknown
  ceilings. The measured run passed 123/123 checks: 229.84 sustained admitted
  rps at p95 137.53 ms, 186.7 MB peak RSS, 5.07 MB database, 310 committed
  settlements, 310 usage rows, 5 explicit quarantines (4 crash + 1 storage
  failure), zero unresolved admissions and zero ledger/held differences. The
  candidate safe cap is 160.89 rps at 30% headroom; the receipt and docs label
  it candidate-only. Verification: `npm run verify` exit 0 — 381 unit tests,
  quality PASS (340 files), production build, 722 HTTP checks, trial suite and
  recovery drill PASS (7 concurrent writes, 1929 ms); `npm run test:load -- --json
  dev/audits/2026-10-31-load-acceptance.json` exit 0. ENOSPC and actual 120 s/
  300 s deadline waits were not reproduced; a storage-write rejection and
  provider disconnect cover those code paths. Operator approval, a funded real
  provider budget, the Fly volume and hosted proxy acceptance remain
  `FID-2026-1030-060-LIVE`. Closed against `8c10a07`; archived.

## 2026-10-31 — Durable operations incidents, alerts and admission controls

- **FID-2026-1030-059 — high — monitoring now has durable incident state, a real
  transport, and protected pause/drain controls.** The additive
  `operations_incidents` schema deduplicates by fingerprint, records
  open/resolved/acknowledgment and delivery state, and queues one recovery when a
  condition clears. A bounded snapshot reads traffic/errors, unresolved
  settlements, failed/quarantined payment events, provider quota age/unknown/
  error, reserve, held/quarantined money and database/backup observations from
  SQLite; no traffic is reported as `noTraffic`, never as 0% healthy. The
  operator-configured HTTPS webhook signs the raw body with HMAC-SHA256 when a
  secret is set, retries with bounded backoff, treats an unconfigured URL as
  local-only, and stores URL-redacted errors. `open`/`paused`/`draining` state is
  settings-backed and checked after authentication/model resolution but before
  rate limit, provider slot, allowance or credit hold, so a refused call writes
  no usage or hold; payment webhooks, settlement, quarantine release and
  in-flight streams keep working. `/admin/operations`, the protected API, the
  manual tick and `scripts/operations-monitor.mjs` expose the same state; the
  monitor opens the live database directly and runs from cron without an
  in-process timer. Verification: 376 unit tests (12 focused), quality PASS (340
  files), production build, 718 HTTP checks (+46), trial suite and recovery drill
  PASS; lint/typecheck/config-check clean. No webhook destination, scheduler or
  external alert was configured; those and a received-alert receipt remain
  `FID-2026-1030-059-LIVE`. Closed against `617935b` and archived.

## 2026-10-31 — Accessible customer experience matrix verified

- **FID-2026-1030-056 — high — the residual customer-experience matrix is
  verified and the record closes.** A Playwright/Edge run against the production
  build on a disposable database covered 33 routes — 18 public, `/account`, and
  14 admin/dashboard surfaces — at 320x844 and 1024x900 in both themes:
  132/132 checks pass. Every page returned 200 with `lang="en"`, exactly one
  `h1`, a skip link to `#main-content`, the resolved `dark`/`light` class and
  `color-scheme`, and no horizontal document overflow. Minimum body contrast was
  14.03:1; keyboard Tab focused the skip link with a solid 2px outline, closing
  the earlier inconclusive focus reading. `/compare` showed its truthful empty
  state with the one-model fixture. Real payment fulfillment and a
  deployed-origin browser pass remain `FID-2026-1030-056-LIVE`. Closed against
  `1f6fb2f` and the docs follow-up; archived.

## 2026-10-31 — Launch FID closures: quota, deployment readiness and policies

- **FID-2026-1030-049 — high — quota freshness, reset and allocation coverage is
  closed.** The implementation lives in FID-063 (`d31d9e0`: fresh upstream
  reads, exact unknown/zero/unlimited/reset semantics, daily allocated credits)
  and FID-069 (`b8a1a50`: refresh before admission when the observation
  expired), with the disabled-trial branch pinned by `057f6c2`. The focused
  quota/allocation/trial files pass 47/47. A live upstream reset and refresh
  observation is not claimed; it remains `FID-2026-1030-049-LIVE`.
  Verification: `npm run verify` exit 0 — 364 unit tests, quality PASS (323
  files), production build, 678 HTTP checks, trial suite and recovery drill
  PASS; lint and typecheck clean. Closed and archived.
- **FID-2026-1030-057 — critical — production readiness is closed without
  claiming a deployment.** `b9764fe` adds the startup configuration gate,
  truthful liveness/readiness, secure headers and the deployment runbook, with
  `tests/production-config.test.mjs` proving the failure codes and disposable
  runtime. Hosting/domain/TLS/volume decisions, hosted ingress SSE and timeout
  observation, a live SIGTERM drain receipt and deployment approval remain
  `FID-2026-1030-057-LIVE`; deployment stays 062/067. Verification: the same
  full gate, exit 0. Closed and archived.
- **FID-2026-1030-061 — high — published policies and the support path are
  closed; the operator's launch gates are not claimed.** The authenticated
  support queue landed in `790aaab`, policy v1 in `69e050d`, and the tax/entity
  corrections in v1.1 under `d2db4ae`. Entity registration and address, counsel
  review, host retention facts, tax and Stripe business-profile gates, a real
  deletion and a controlled outside-channel inquiry remain
  `FID-2026-1030-061-LIVE`. Verification: the same full gate, exit 0. Closed
  and archived.

## 2026-10-31 — NOWPayments customer crypto top-up lane

- **FID-2026-1031-076 — high — customers can now buy prepaid credit with crypto
  through NOWPayments.** `NOWPAYMENTS_TOPUPS_ENABLED` defaults off and the new
  `/api/account/topup/crypto` checkout route refuses with
  `503 crypto_topups_disabled` before reading NOWPayments credentials. Fixed-rate
  USD invoices are created over `x-api-key` against the sandbox or live base URL
  chosen by `NOWPAYMENTS_SANDBOX`; the signature-verified IPN webhook at
  `/api/webhooks/nowpayments` credits exactly once through the existing
  `fulfillTopup` claim machine. Non-final statuses never claim, terminal failures
  mark the topup failed, and unknown or mismatched orders quarantine. The webhook
  stays active while the lane is closed so an in-flight invoice still credits.
  The top-up card is lane-aware and billing history names the payment provider.
  Verification: 363 unit tests (+15), quality PASS (323 files), build, 672 HTTP
  checks (+28), trial suite and recovery drill PASS; lint and typecheck clean;
  `npm run verify` exit 0. The live/sandbox smoke test is operator territory
  before the lane is enabled. Closed against `4574fee` and archived.

## 2026-10-31 — Crypto-only payment gate

- **FID-2026-1031-075 — high — card top-ups are now an explicit launch decision
  rather than a consequence of Stripe credentials.** `CARD_TOPUPS_ENABLED`
  defaults off; the checkout route refuses with `503 card_topups_disabled`
  before reading Stripe configuration, and the account page derives its top-up
  state from the same policy. Disabled copy names the USDC lane instead of
  promising generic payments, and billing history no longer claims Stripe
  checkouts. The webhook and fulfillment path stay active for in-flight
  sessions. Verification: 348 unit tests, quality PASS (320 files), build,
  644 HTTP checks with Stripe keys present, trial suite PASS; lint and typecheck
  clean. No card sale was exercised because the lane is closed by decision.
  Closed against `98b6eb9` and archived.

## 2026-10-31 — Email ownership and account recovery

- **FID-2026-1030-045 — high — account links now establish ownership or reset
  passwords through a single-use transaction.** Hash-only action records bind
  links to account, purpose, current email, expiry and accepted delivery; resend
  invalidates earlier links. Reset revokes sessions, keys and other actions
  atomically. Account verification, recovery and fragment-based confirmation
  pages call real request/consume routes. An opt-in Resend REST adapter uses
  idempotency keys and bounded retries; disabled configuration is disclosed.
  Public reset delivery runs after the generic response so transport timing
  cannot reveal account existence. Verification: 344 unit tests, quality PASS
  (319 files), build, 642 main HTTP checks, trial gate and recovery drill PASS;
  post-format lint/typecheck clean. The controlled inbox, sender and new privacy
  recipient disclosure remain explicit operator inputs; no real email was sent.
  Closed against `871f19e` and archived.

## 2026-10-31 — Bounded requests and account abuse controls

- **FID-2026-1030-046 — high — malformed and excessive requests are refused
  before inference reservations.** Shared streaming reads bound actual bytes,
  body time, JSON depth and nodes at every JSON mutation boundary; Stripe keeps
  its raw signed payload under a separate byte cap. Completion budgets must be
  positive integers, both aliases are validated, only `n=1` is supported, and
  message/tool counts are bounded. Paid keys share one account RPM bucket;
  key issuance is transactionally capped at ten active and twenty/hour.
  Client identity uses only an explicitly selected ingress header, otherwise
  one shared untrusted-client bucket. Limiter memory, SSE frames and response
  bytes are bounded. Nine unit regressions and production HTTP refusal/churn
  probes cover the new boundaries. Verification: 335 tests, quality PASS (308
  files), production build, 609 main HTTP checks, trial suite and recovery drill
  PASS. Closed against `bb925af` and archived. Hosted proxy stripping and
  restart acceptance remain live observations in the tracking ledger.

## 2026-10-31 — Customer docs cover the first request and the recurring questions

- **FID-2026-1030-056 follow-up — low — the API reference was complete but did
  not answer how to start or what the recurring failure and billing states
  mean.** Added `/docs/start`, a six-step newcomer guide (account and key,
  billing group, first request, first bill, failure table, next steps) and
  `/docs/faq`, 33 answers in five groups (start, models and pricing, credit and
  billing, errors and limits, account/privacy/support) with links into the
  contract. Added shared docs navigation, per-page social cards, and entry
  points from the site header, footer, account header, account page, support
  page and landing quick start. The guide states the local origin, includes an
  explicit shell setup and a JavaScript streaming example, and uses a
  placeholder model id instead of a stale seeded row. The FAQ adds key rotation,
  prompt and output retention, top-up bounds and the unsupported endpoint list.
  Claims were written against the implemented behavior: Chat Completions only,
  plan sales off, no email, manual support and deletion, one process and no
  failover. Added `/sitemap.xml` for 13 canonical public pages, `/robots.txt`
  for the crawl policy, and FAQPage JSON-LD generated from the same answers the
  page renders. The sitemap and robots routes render per request, so they read
  `NEXT_PUBLIC_SITE_URL` from the deployed process instead of baking the build
  machine's origin into the image; the FAQPage markup omits an absolute URL for
  the same reason. Static pages still resolve social image URLs during
  `next build`, so the Dockerfile requires `NEXT_PUBLIC_SITE_URL` as a build
  argument and `fly.toml` supplies it alongside the runtime value; a build with
  `https://runtime.example` emitted that origin in both docs pages' social
  tags, while the earlier unconfigured build emitted `http://localhost:3000`.
  The HTTP suite now renders `/docs/start` and `/docs/faq`
  anonymously, checks their social metadata, verifies the sitemap, robots policy
  and FAQ schema, and keeps the unimplemented Messages/Responses guard on the
  API reference. Verification: `npm run verify` exit 0 — 326 unit tests, 496
  HTTP checks (466 before), trial suite PASS, quality PASS (307 files), clean
  production build, recovery drill PASS. The QC receipt is
  `dev/audits/2026-10-31-docs-qc-pass.md`.

## 2026-10-31 — Current docs and the operator gate tell the truth

- **FID-2026-1030-057 follow-up — medium — the docs still described a rejected
  topology and the named operator gate did not enforce production.** README,
  `AGENTS.md`, the launch plan and the database research said SQLite was a local
  placeholder that must be replaced, although FID-067 selected one persistent
  process on a local volume. The launch plan's Vercel section and
  `docs/database-options.md` are now labelled superseded history, and README's
  limit is "Not deployed" rather than "not deployable." Separately,
  `npm run config:check` reports `PASS (non-production)` unless `NODE_ENV` is
  `production`, so the runbook's claim that it was the operator gate was false.
  New `npm run config:check:prod` forces production mode and is now the documented
  deployment gate; `config:check` is added to the pre-push hook and CI for parity
  with `npm run verify`. `CONTRIBUTING.md` now names the v0.1.2 single-agent
  contract instead of the harness protocol, and the support runbook names policy
  v1.1 as current. Master FID-043 links to archived children 048 and 050–055 at
  their real `archive/` paths, and the internal-followups restore citation uses
  the runbook anchor instead of a drifting line number. New
  `docs/getting-started.md`, `docs/operator-first-run.md`,
  `docs/troubleshooting.md` and `docs/README.md` cover local setup, first provider
  sync, first request, operator ordering, failure codes and doc status. The
  admin credit card no longer claims checkout and customer top-ups are
  unimplemented (FID-056 follow-up). The audit receipt is
  `dev/audits/2026-10-31-quality-pass.md`. Verification: `npm run check` exit 0,
  `npm test` 326 passing, production build exit 0 (18 static/SSG pages), quality
  PASS (295 files), attribution guard PASS; `config:check` exit 0 in
  non-production and with a synthetic production inventory;
  `config:check:prod` exit 1 with the expected codes when the inventory is
  absent; a 33-file current-document link scan found zero broken links; the
  full 168-file scan leaves 20 historical archive/audit links. `npm run verify`
  itself was not rerun because no route, schema, settlement or HTTP behavior
  changed; the FID-058 receipt remains the last full gate run.

## 2026-10-31 — The recovery drill gates every push

- **FID-2026-1030-058 follow-up — low — the drill existed but a push could skip
  it.** The pre-push hook ran the attribution guard, lint, typecheck, tests,
  quality, build and both HTTP suites, then stopped. `.githooks/pre-push` now
  runs `npm run test:recovery` after `npm run test:http`, and the CI `gates` job
  does the same. The gate descriptions in `AGENTS.md`, `README.md` and
  `CONTRIBUTING.md` now name the drill and match `npm run verify`. No application
  code changed. Verification: the hook was run end-to-end on the working tree;
  the recovery drill passed after the 466-check HTTP suite.

## 2026-10-31 — Recovery is a tested path, not a backup file

- **FID-2026-1030-058 — critical — the backup existed, but no restore or
  financial recovery path had ever been exercised.** `scripts/db-backup.mjs` now
  binds each online copy to a `savant-backup/1` sidecar with SHA-256, byte count,
  page size, journal mode and table inventory; it requires the core
  customer/money tables, writes the sidecar atomically, applies `0700`/`0600`
  POSIX bits, prunes the `.db` and `.json` as a pair, and never prunes the
  resolved live file. New `scripts/db-restore.mjs` refuses a missing or mismatched
  sidecar, an existing target and a target equal to `DB_PATH`; it verifies
  integrity, foreign keys, required tables, the credit equation
  (`balance = latest baseline + ledger`), negative balances and orphan ledger
  rows, then renames the verified copy into place and writes a
  `<target>.restore.json` receipt with counts, unresolved settlements and
  quarantined holds. New `scripts/db-recovery-drill.mjs` seeds a reconciled
  history, keeps writes running through the backup, restores into a new file,
  boots the real production server, signs in and reads
  `/api/admin/reconciliation`, then restarts on the restored copy. The drill
  completed with 8 concurrent writes and both startups in 2009ms. New
  `tests/database-recovery.test.mjs` (5 tests) covers backup under writes,
  restore invariants, target/live/checksum refusals, explicit unverified
  consent, a killed uncommitted write, additive migration on a restored copy and
  replay rejection by the event-id and provider-reference unique constraints.
  `docs/deployment-runbook.md` now separates backup, isolated restore,
  RPO/RTO, payment replay and code rollback. Verification: `npm run verify` exit
  0 — 326 unit tests, 466 HTTP checks, trial suite, quality PASS (295 files),
  production build and recovery drill PASS. FID-058 closed against `2dc005e` and
  archived 2026-10-31; the operator RPO/RTO and first timed restore on the
  production volume remain blocked as `FID-2026-1030-058-LIVE`, not claimed by
  this closure.

## 2026-10-31 — FID ledger integrity

- **FID-2026-1031-071 — medium — The active queue now describes itself
  truthfully.** Eighteen records were active and none was closed. Active 063 and
  064 reused numbers already held by archived records (`provider-account-truth`
  and `ci-fresh-database-migration-race`), so the brand-image, social-card and
  metadata-gate records were renumbered to 072, 073 and 074 with a renumber note;
  the archived numbers were not moved. Six records used `implemented` as a FID
  status, which is not one of the six permitted values: 056, 057 and 061 now read
  `fixed` with their residual gates named, and 072, 073, 074 and 067 were closed
  against `4ad9a21`, `d72f6ef` and `1081362`. 067 had been `converged` while its
  packaging was committed — corrected, with the operator-approved deployment
  deferral kept as a named blocker rather than a closure claim. 068 was missing
  from `SCOPE.md` and used `pending` for four steps; it is registered and those
  steps are now `blocked` on the chain/token, xpub, RPC and screening inputs.
  `dev/tracking/internal-followups.json` now carries the archived records' live
  observation gaps (069 live capacity, 070 probe limits, 067's first image build,
  card crawler coverage), and `docs/project-status.md` reflects the Fly decision
  and the current queue. 066 remains `converged` as the dormant path back, with
  its D6 no-port decision recorded instead of being mislabelled as closure. No
  application code, schema, policy text or runtime data changed. Verification:
  `npm run verify` exit 0 — 321 tests, quality PASS (295 files), production
  build, 466 HTTP checks and the trial suite PASS; the duplicate-ID and SCOPE
  coverage scans return no gaps. Closed against `d991967`; archived 2026-10-31.

## 2026-10-31 — Test doubles must answer what they advertise

- **FID-2026-1030-070 — medium — both HTTP doubles could advertise a provider
  capability they never implemented, and nothing compared the two.** It bit
  twice in one pass: the trial double received a `GET /balance` it did not
  answer, parsed the empty body as a completion and killed the run with a
  `SyntaxError` that named neither the capability nor the endpoint; the main
  double had the mirror problem, answering `/balance` for a row that denied the
  capability, which hid the FID-069 outage behind a configured fallback.
  `checkProviderDouble` now reads the same `supports_balance` /
  `supports_subscription` flags production reads, calls each advertised endpoint
  with the serving credential, and accepts the payload only if
  `parseProviderBalance` / `parseProviderSubscription` accept it — so a 200 with
  the wrong shape fails too. It runs in both suites before any check that
  depends on the fixture. Verified RED→GREEN: a double answering an advertised
  `/balance` with `404` exits 1 with
  `the "mock" double answers /balance, which its provider advertises — expected 200, got 404`;
  green runs report 466 checks in the main suite (463 before) and five probe
  checks in the trial suite. Gates: `lint` (zero warnings), `typecheck`,
  `quality`, `build` and both HTTP suites exit 0.

## 2026-10-30 — The free path no longer dies on idleness

- **FID-2026-1030-069 — critical — every free request after thirty seconds of
  silence was answered `503`, and the path never recovered without a human.**
  Found by the first real call through the gateway: 200 in 3.8 s warm, then `503`
  in 8 ms after 40 s and 70 s idle. The mechanism is a chain of three correct
  pieces: a provider observation expires after 30 s, an expired counter reads as
  `null` rather than as evidence, and `null` fell back to a `PROVIDER_SHARED_RPM`
  that was not configured — so admission refused a call it could have checked.
  Nothing on the request path refreshed the observation; only operator pages did.
  Admission now calls `ensureProviderObservation`, which refreshes once when the
  stored reading has expired and returns the re-read status; a *failed* refresh
  still refuses, so "unknown capacity is never unlimited" keeps its meaning, and
  concurrent refreshes coalesce on the existing 25 s runtime lease. The
  documented fallback is now set (`PROVIDER_SHARED_RPM=15`, untracked
  `.env.local`). **The gate had been green on this since FID-048 for an
  instructive reason:** `scripts/http-suite.mjs` pinned `PROVIDER_SHARED_RPM`,
  so the suite carried the fallback production lacked, and the fixture provider
  declared `supports_balance = 0` while the mock upstream answered `/balance`
  all along. Both were corrected, which is why the new check is able to fail.
  Verified RED→GREEN: with the pre-fix behaviour restored the suite exits 1 on
  `a request after 60s of idleness still succeeds — expected 200, got 503`; with
  the fix it exits 0 with **463 checks passing**, including that the request
  itself triggered the account check (the row is backdated 60 s rather than slept
  through). Gates: `lint`, `typecheck`, `test` (321), `quality` (295 files),
  `build`, `config:check` and the http suite all exit 0. Not exercised against
  the live provider account — the suite uses the mock.

## 2026-10-30 — Deployable on one persistent host

- **FID-2026-1030-067 — high — the gateway described how it must be hosted and
  provided no way to do it.** `docs/deployment-runbook.md` already recorded the
  contract and the previous FID declined a libSQL port to Vercel on the strength
  of it, so the missing piece was packaging: `Dockerfile`, `.dockerignore`,
  `fly.toml`, `scripts/docker-entrypoint.sh` and `scripts/db-backup.mjs`. The
  configuration pins one machine on one volume with `auto_stop_machines = "off"`,
  runs `next` as the entry process rather than `npm` so SIGTERM reaches the
  listener and the documented drain happens, and uses `/api/ready` — not
  liveness — as the health check, so a deploy whose origin, database path or
  admin credentials are wrong never enters rotation. **Nothing was deployed and
  the image was not built**: `docker build` cannot run here because Docker's
  Linux engine needs virtualization enabled on this machine, so the first
  `fly deploy` will also be the image's first build. Verified against a real
  production `next start` on a file database instead: `/api/ready` returned
  `ready`/`durable`, `journal_mode` read back as `wal` from an independent
  connection, an account written before a stop authenticated after a restart by a
  new process, and `npm run config:check` failed with `admin_unconfigured`,
  `origin_loopback`, `db_relative` and `multi_worker` on each broken environment.
  The backup path was exercised against the live database (35 tables,
  `integrity ok`, account readable from the copy). **That run found a real defect
  in the new script:** verifying a WAL copy creates `-wal`/`-shm` siblings, and
  pruning removed only the `.db`, so backups accumulated orphans; pruning and
  cleanup now remove the siblings too. Gates: `npm run lint`, `typecheck`,
  `test` (321 passing), `quality` (295 files) and `build` all exit 0. Closed
  against `1081362`; deployment remains operator-blocked and is tracked in
  `dev/tracking/internal-followups.json`.

## 2026-10-30 — Operator banner replaces the placeholder

- **Asset change — the operator's own banner is now the README hero.** The
  placeholder `banner.svg` (a two-line wordmark, 3 KB) is replaced by
  `banner.png`, an infographic carrying the inbound surface, repository
  structure, stack table and launch status. The supplied master was a 2752×1536
  JPEG at 1.93 MB; it was resampled to 1700×949 — 2× the 850 px display width —
  and re-encoded as a 256-colour PNG with maximum compression, giving 716 KB.
  The master JPEG was moved to `~/dev/gateway-artwork/` rather than committed, so
  the repository carries one reference image and the full-resolution original
  survives outside it. Note the format cost honestly: for this gradient-heavy
  artwork, PNG is roughly 4× the bytes of an equivalent JPEG (177 KB at the same
  1700 px), so 716 KB is the floor for a PNG at a resolution where the tables
  stay legible. `config/images.ts` records the new path and dimensions.

## 2026-10-30 — Social metadata coverage gate

- **FID-2026-1031-074 — medium — Nothing checked the head of a rendered page, so
  the missing social card had shipped with every gate green.** The HTTP suite now
  audits every public page for `og:title`, `og:description`, an absolute
  `og:image` with dimensions, and `twitter:card`, then fetches the card image it
  names and requires an `image/*` response; `/models` and `/docs` are additionally
  required to use their own card rather than the site-wide one. The rules live in
  a pure module (`scripts/http-suite/metadata.mjs`) so the failure path is
  unit-tested, which is the difference between a check and a gate. **Its first
  live run failed**, catching a regression from FID-2026-1031-073: `twitter: { images: [] }`
  had downgraded `/models` and `/docs` to Next's small `summary` card with no
  image — worse than before that change. Both pages now restate
  `card: "summary_large_image"`. Verified: `node --test tests/metadata.test.mjs`
  9 passing, `npm run check` exit 0, `npm run build` exit 0, and `npm run
  test:http` ending `http-suite: 461 checks PASS` (up from 423) with
  `trial-http-suite: all checks PASS`. Closed against `d72f6ef`; archived
  2026-10-31.

## 2026-10-30 — Per-page social cards from page data

- **FID-2026-1031-073 — low — The catalog and API reference shared one generic
  card.** Every page inherited the site-wide `og.png`, and the root metadata
  pinned `openGraph.title` and `openGraph.url`, so all pages claimed the title
  "Savant Gateway" and the url `/`. `/models` and `/docs` now carry
  `opengraph-image` routes rendered by `next/og` from their own data: the catalog
  card counts what `getCatalogData()` actually returns, the docs card states the
  documented endpoint surface, both share one satori-safe layout in
  `lib/social-card.tsx`. Root metadata no longer sets title or url, so each page
  resolves its own; carded pages restate `summary_large_image` and drop the
  inherited `twitter:image` so Twitter falls back to their `og:image`. Verified:
  `npm run check` and `npm test` exit 0, `npm run build` exit 0 with
  `○ /docs/opengraph-image` and `ƒ /models/opengraph-image`, both routes `200
  image/png` on a disposable production server, `og:title "Model catalog -
  Savant Gateway"` on `/models`, and the catalog card rendering `0 models`
  against an empty database after showing `34` at build — the proof that it is
  per-request and not baked. Closed against `d72f6ef`; archived 2026-10-31.

## 2026-10-30 — One brand-image directory and a real social preview

- **FID-2026-1031-072 — low — Artwork had two homes and the site had no social
  card.** `assets/` and `public/` held byte-identical copies of the logo and the
  favicon set, `public/site.webmanifest` duplicated the icon list that
  `app/layout.tsx` already declared, paths were hardcoded in four components and
  two stylesheets, and there was no `openGraph`/`twitter` metadata at all, so a
  shared link rendered as a bare URL. Now every referenced image lives in
  `public/images/` and `config/images.ts` is the one list that metadata, the web
  manifest and the components read. `/site.webmanifest` is replaced by a
  generated `app/manifest.ts`, which cannot drift from the icon links. The social
  card is drawn as `og.svg` and rasterised to `og.png` (1200×630) by
  `npm run images`; `sharp` already ships with Next, so nothing new is
  installed. Verified: `npm run check` and `npm test` (312) exit 0, `npm run
  build` exit 0 with `/manifest.webmanifest` static, and a disposable production
  server returned 200 `application/manifest+json` for the manifest and 200 for
  every image, while the prerendered head carries `og:image` (1200×630 with alt),
  `twitter:card=summary_large_image`, three `rel="icon"` links and
  `apple-touch-icon`. Committed as `4ad9a21`; CI run 41125090006 and
  attribution-guard run 41125090105 are green on that commit, and the pre-push
  gate re-ran the full verify before the refs were accepted. **Still open:**
  `assets/bg_pattern.jpg` remains as the only source for the CSS texture, and no
  crawler has been used to confirm how a platform crops the card. Closed against
  `4ad9a21`; archived 2026-10-31.

## 2026-10-30 — Repository presentation and Apache 2.0 license

- **Documentation and licensing only — no code, schema, policy text or runtime
  behavior changed, so no FID was opened.** The README is rebuilt on the Savant
  brand: a centered banner (`public/images/banner.svg`, added here), one cyan-on-black
  badge row, a pre-launch status callout, `---`-separated sections and the
  `Get Started` / `Overview` / `Key Technologies` / `Features` layout used by
  `savant0x/savant-code`. Every claim was re-read from the tree: 43 route
  handlers and 29 pages counted by `find`, the API surface table enumerated
  from `app/api`, and the limits section rewritten to lead with "not deployable
  as built" rather than burying it. `LICENSE` is now the Apache 2.0 text from
  `savant0x/savant-code` (Copyright 2026 Spencer Howell (Savant AI)); `NOTICE`
  adds the Apache statement and reproduces the full MIT text for the HeroUI
  template portions it already attributed; `package.json` declares
  `Apache-2.0` and a description. Verified: `npm test` 312 passing, and the
  full `npm run verify` set last recorded against FID-061 still stands — no
  source file it covers was touched.

## 2026-10-30 — Policy v1.1: tax and entity disclosure corrected

- **FID-2026-1030-061 — high — Two false statements in the freshly published
  policies are corrected the same day.** v1 claimed tax is calculated and
  collected by Stripe; the Checkout Session in `app/api/account/topup/route.ts`
  sends no `automatic_tax`, no tax-id collection and no invoice, so no tax is
  added at checkout. v1.1 states that no tax is calculated or collected, that no
  separate invoice or VAT document is issued, and that the buyer is responsible
  for any tax that applies. Separately, v1 printed no registered address because
  none exists: v1.1 states that the operator is not registered as a separate
  legal entity, names Kentucky, United States, and says a postal address is
  available on request and will be printed once one exists — no address was
  invented. `content/legal/v1.1/` carries the two edits; refunds and acceptable
  use are unchanged; `/legal/v1/...` still serves the superseded text marked as
  superseded. Because acceptance is version-keyed, accounts that accepted v1 are
  asked again and their v1 row is kept as history. Verified: `npm run verify`
  exit 0, 312 unit tests, 423 HTTP checks, trial HTTP PASS, quality PASS.

## 2026-10-30 — Customer policies published

- **FID-2026-1030-061 — high — The gate now has published terms, privacy,
  refunds and acceptable-use pages, and a recorded acceptance behind them.**
  Version `1.0` is effective 2026-10-30 at `/terms`, `/privacy`, `/refunds` and
  `/acceptable-use`, with `/legal/v1/<slug>` kept permanently reachable and an
  unpublished version answering 404. The text is written from implemented
  behavior and from the operator's 61-question answer sheet: 18 and over, no
  uptime guarantee, no committed support response time, plans not for sale and
  not priced, no credit expiry, refunds only for duplicate or unauthorized
  charges and where the law requires one, and Stripe as the tax and invoice
  layer. A liability exclusion with a three-month cap and a non-waivable-rights
  carve-out replaces the empty clause. Signup now requires the acceptance
  checkbox and the API refuses an account without it, writing the acceptance row
  in the same request; existing accounts are asked once on `/account`; the row is
  keyed by version and repeated acceptance keeps the first timestamp. The footer
  links every policy, which is the notice path for customers who never open the
  checkbox. Verified: `npm run verify` exit 0, 311 unit tests, 421 HTTP checks,
  trial HTTP PASS, quality PASS (290 files). Committed as `69e050d`; CI run
  41114926726 and attribution-guard run 41114926691 are green on that commit,
  and the pre-push gate re-ran the full verify before the refs were accepted.
  **Still open:** no registered
  address is published, Stripe Tax is assumed rather than verified, and no lawyer
  reviewed the text — the operator accepted that position.

## 2026-10-30 — Authenticated support queue

- **FID-2026-1030-061 — high — Support is a recorded, account-bound request,
  not a promise.** A new `support_requests` table stores kind, message, status,
  timestamps and an operator note. Customers submit from `/account` and see
  their history; the operator reads the queue at `/admin/support` and resolves
  with a customer-visible note. No public form, no invented address, no email
  transport and no response-time guarantee. The public `/support` page explains
  the channel and is linked from the footer; the HTTP suite verifies it does not
  invent a `mailto:` or `support@` address and that one account cannot read
  another's requests. `docs/support-runbook.md` records the manual deletion
  procedure and its retention truth: deleting an account cascades every
  account-owned row, while usage events are retained with `user_id` nulled for
  billing/audit. Verified: `npm run verify` exit 0, 305 unit tests, 376 HTTP
  checks, quality PASS (276 files). **Still open:** approved terms, privacy,
  acceptable-use, refund and expiry text, plus a real outbound channel. Four v1
  drafts now exist for review under `docs/policies/`, written from implemented
  behavior with explicit placeholders and "operator decision required" markers;
  nothing is published or linked.

## 2026-10-30 — Truthful customer states

- **FID-2026-1030-056 — high — Disabled and payment states now say what is
  true.** After 054 closed plan sales, `/plans` still promised a Stripe payment
  flow under "Plans are not available yet", and the account subscription card
  still offered "Compare plans" to a catalog that cannot sell. The payment
  paragraph now renders only when a plan is purchasable, and a customer with no
  plan is told that plans are not on sale; comped subscribers still see their
  real plan. The HTTP gate adds a state/accessibility matrix for `/`, `/models`,
  `/plans` and `/docs`: 200 with `lang="en"`, one `h1`, a skip link; the API
  reference documents only the implemented Chat Completions endpoint; both
  payment return banners attribute credit and access to the signed webhook and
  never claim the balance moved. A production-build browser receipt covered
  390/1440 widths, both themes, contrast (8.97:1 muted on dark) and live client
  hydration on the signed-in account. Verified: `npm run verify` exit 0, 297
  unit tests, 351 HTTP checks. **Still open:** policy/support pages (061), 320 and
  1024 widths, admin screens and a keyboard focus-ring receipt.

## 2026-10-30 — Provider and benchmark integrity

- **FID-2026-1030-055 — high — A 200 response can no longer erase a catalog.**
  `fetchUpstreamModels` treated any body without a `data` array as an empty
  catalog, and the following scoped replace soft-delisted every model for that
  provider. `/models` is now read through one validated boundary that rejects
  non-JSON, error objects, HTML and shape changes; an explicit `data: []` stays
  a verified empty catalog, and a non-empty page with no usable ids is refused.
  Pagination is followed through `has_more`/`last_id` (ten-page cap), and a page
  that claims more without a cursor refuses the whole import. The write happens
  only after the complete catalog is read, so failures leave rows, manual prices,
  groups and sync timestamps untouched. Benchmark integrity is now exercised
  end to end against a fixture source: two-page import, collapsed-payload
  refusal that keeps rows fresh, stale provenance (a dropped model keeps its own
  index version and measurement date) and a spent daily window that makes no
  request. Verified: `npm run verify` exit 0, 297 unit tests, 320 HTTP checks,
  quality PASS (267 files). Closed against `36c6581`; CI run 41100450463 green.

## 2026-10-30 — Enforced no-sales launch policy

- **FID-2026-1030-054 — high — Plan sales are a policy, not a side effect of
  missing credentials.** Prepaid credit requires Stripe to be configured, so
  unset keys could not remain the reason plans were unsellable. `PLAN_SALES_ENABLED`
  is now the single gate and defaults to off: the public catalog (landing page,
  `/plans`, `/api/plans`) publishes no plan, `POST /api/account/subscription`
  returns `403 plan_sales_disabled` before reading Stripe configuration, and
  authoring refuses to publish a draft or archived plan as `active`. Sales being
  off closes only new purchases: existing snapshots, comps, extensions, the
  portal and a signed invoice for a checkout already in flight keep working.
  Verified: `npm run verify` exit 0, 290 unit tests, 284 HTTP checks (the suite
  holds an active plan in storage and still gets an empty catalog, then proves a
  comped subscription serves included usage with no credit change). Closed
  against `cbc31df`; CI run 41098426834 green.

## 2026-10-30 — Parallel-boot migration safety

- **FID-2026-1030-064 — high — Fresh-database boot no longer races itself.**
  CI failed during `next build` because three page-data workers imported the
  database module at once and each ran the additive migrations; `hasColumn` and
  the following `ALTER TABLE` are not atomic, so a worker that lost the race
  crashed with `duplicate column name: family`. `createDb()` now performs every
  schema step and the seed inside one `BEGIN IMMEDIATE` transaction, the busy
  timeout is set before WAL so a concurrent first open waits instead of failing,
  and `ensureColumn` accepts a duplicate-column result as the requested end
  state while still raising unrelated SQLite errors. No schema, billing or
  payment semantics changed. Verified: fresh-`DB_PATH` builds exit 0 twice,
  `npm run verify` exit 0 with 283 unit tests, 262 HTTP checks, trial suite PASS,
  quality PASS (265 files). Closed against `0eb775d`; CI run 41096399599 green.

## 2026-10-30 — Recoverable payment delivery

- **FID-2026-1030-053 — critical — Webhook state that survives a crash.**
  `billing_events` now records `claimed`, `processed`, `failed` or
  `quarantined` with attempts, claim time, livemode and last error, so a process
  death after the claim no longer suppresses the payment forever: a stale claim
  is reclaimable and a failed handler keeps its evidence. Mode is bound through
  `STRIPE_EXPECTED_LIVEMODE` (quarantined when the declared environment
  disagrees), `fulfillTopup` requires the checkout metadata user to own the
  pending top-up, and a mismatched amount, currency, owner or missing row is
  quarantined without credit. An authenticated payments view lists event state
  and top-ups; replay still requires a signed Stripe delivery. Closed against
  `8531f9b`; archived receipt: 280 unit tests, 262 HTTP checks, trial HTTP PASS,
  quality PASS (265 files), clean lint/typecheck/build.

## 2026-10-30 — Credit reconciliation and audited corrections

- **FID-2026-1030-052 — critical — Ledger equation and append-only corrections.**
  `credit_ledger` gains a unique reference, so a retried refund is a no-op and
  the same reference with different terms is a conflict. Refunds are bounded by
  current credit and no correction can drive an account below zero; rows are
  appended, never edited or deleted. A dated opening baseline is available only
  for history that predates ledger coverage, and reconciliation reports
  `baseline + ledger sum` against every balance, plus usage debits, paid
  top-ups, active holds, quarantined reserve and net corrections. An admin API
  and `/admin/reconciliation` surface every difference instead of tuning it
  away; historic gaps are never backfilled. Closed against `c2db992`; archived
  receipt: 272 unit tests, 260 HTTP checks, trial HTTP PASS, quality PASS
  (262 files), clean lint/typecheck/build.

## 2026-10-30 — Durable settlement and quarantine

- **FID-2026-1030-051 — critical — Durable settlement identity.** Every admitted
  call now writes a `settlements` row before dispatch with its billing source,
  reservation links and estimate. Settlement claims that row inside the same
  transaction as usage, the debit, the ledger row and the hold release, so a
  duplicate, late or post-quarantine callback writes nothing and charges
  nothing. Expired credit, subscription and free-pool reservations move to
  `quarantined_holds` with their capacity still reserved: an elapsed TTL no
  longer refunds a call whose output may have been served. One audited operator
  release returns the exact amount, and `GET/POST /api/admin/settlements`
  exposes the state. Closed against `0ce4747`; archived receipt: 264 unit tests,
  254 HTTP checks, trial HTTP PASS, quality PASS (256 files), clean
  lint/typecheck/build.

## 2026-10-30 — Provider usage fidelity

- **FID-2026-1030-050 — critical — Token components and provenance.** One parser
  (`lib/usage.ts`) now owns provider usage: totals, cached-input and
  reasoning-output subsets, cache-write counts, and whether both totals were
  actually reported. A missing side is estimated and labelled, never stored as
  an authoritative zero; booleans, blanks, negatives, fractions and
  out-of-domain subsets are absent. Anthropic normalization stopped fabricating
  zero counters, counts cache input once, and the stream merges split usage
  frames instead of last-wins. Settlement stores cached, cache-write and
  reasoning counts plus `usage_source`, applies the existing rate once to each
  total, and exposes provenance in usage summaries. Cached-rate discounts are
  not invented; 044 still owns rates. Closed against `945c729`; archived receipt:
  259 unit tests, 251 HTTP checks, trial HTTP PASS, quality PASS (252 files),
  clean lint/typecheck/build.

## 2026-10-30 — Aggregate provider admission

- **FID-2026-1030-048 — critical — One serving-account ceiling for every billing
  mode.** Every dispatch now takes an RPM and concurrency slot for the serving
  upstream account before any subscription, free-pool or credit hold exists, so
  customer fairness limits cannot multiply real capacity and a refusal never
  strands a reservation. Identity is the provider origin plus the credential
  variable name, so registry aliases share one ceiling without persisting a
  secret. A current upstream rpm wins; `PROVIDER_SHARED_RPM` is the explicit
  fallback for accounts that publish none, and an unknown ceiling refuses with
  503 before dispatch instead of assuming headroom. Refusals carry the real
  ceiling, remaining count and retry guidance; the streaming relay releases the
  slot exactly once on completion, error and cancellation. Paid reservation moved
  to `lib/gateway-paid.ts` to keep the request file under the 400-line ceiling.
  Closed against `e346b0a`; archived receipt: 251 unit tests, 251 HTTP checks,
  trial HTTP PASS, quality PASS (250 files), clean lint/typecheck/build.

## 2026-10-30 — Current upstream account values and daily trial credits

- **FID-2026-1030-063 — critical — Provider account truth.** Separates quota
  observation from catalog sync, fetches upstream on every explicit account
  check and before daily-trial admission, fences concurrent/late writes, and
  hides unavailable or expired values. Exact upstream counters/reset times are
  separate from the conservative admission balance after local usage and holds.
  Fixes the observed previous-day 19,631,919-used snapshot when upstream reports
  0 used / 20,000,000 remaining. Closed against `d31d9e0`; archived receipt:
  242 unit tests, 242 HTTP checks, trial HTTP PASS, warning-free full gates.
- **FID-2026-1030-063 — high — Daily allocated trial credits.** Reuses the
  weighted-token allocation/usage/reservation ledger, caps configured allocation
  against observed daily upstream capacity, rebalances unspent grants, and
  exposes scoped customer credits with the upstream UTC reset. Token credits
  remain separate from prepaid dollars. The one-time trial switch stays off;
  no subscription sale, funding or deployment is activated. The supplied APInex
  email is recorded as sandbox/PAYG context, not an invented rate card.

## 2026-10-30 — Launch implementation: offering evidence and security boundaries

- **FID-2026-1030-047 — critical — Secret-safe diagnostics and account
  isolation.** One redaction policy now covers server logs, `usage_events.error`,
  provider runtime rows and benchmark attempts, with the provider error reader
  redacting at the boundary. Provider base URLs reject embedded credentials and
  provider redirects are not followed. Login guessing is bounded per account
  independently of `x-forwarded-for`. The production HTTP matrix adds
  cross-account, revoked-key, suspended-account, spoofed-header, credential-echo
  and redirect probes; `SECURITY.md` describes actual behavior. Closed against
  `2ef2d74`; 217 unit tests, 170 HTTP checks and the trial suite pass.
- **FID-2026-1030-044 — high — Offering evidence ledger, closure pending.**
  Records dated observed, configured, unknown and pending inputs and reconciles
  the measured economics without inventing a fee or budget. Activation paths are
  verified closed; the recorded $0.00 wallet yields a conservative zero paid
  upstream spend. The record remains `converged`; closure needs the six dated
  operator rulings. No offering, funding, payment or deployment occurred.

## 2026-10-30 — Complete launch FID outline

- **FID-2026-1030-043 — critical — Master launch contract authored and audited.**
  Master 043 organizes nineteen children 044–062 with A–Z coverage, 74 acyclic
  dependency edges, operator inputs, disabled-offering safety, implementation
  gates and real acceptance. All twenty documents completed RED/GREEN,
  AUDIT/ADVERSARIAL, measured SELF-CORRECT and two final zero-change passes.
  Revision deltas were below 10%; per-file hashes and evidence are in
  `dev/audits/2026-10-30-launch-fid-perfection-loop.md`.
- **FID-2026-1030-044 through FID-2026-1030-062 — high/critical — Child plans.**
  Cover offering/economics; email/recovery; abuse/security/isolation; shared
  admission/quota; usage fidelity; durable settlement and financial reconciliation;
  payments/subscription safety; provider/catalog/benchmarks; accessible UX/docs;
  deployment/data recovery; delivered alerts; load acceptance; policies/support;
  real customer acceptance and controlled release/rollback/observation.
  All remain active `converged`, not implemented or closed. Sixteen proposed
  test files are explicitly future artifacts; existing fixtures are not live
  acceptance. No production code, offering activation or deployment changed.

## 2026-10-30 — Repository organization and first systems review

- **FID-2026-1030-041 — medium — Current project index and full launch plan.**
  Added `docs/project-status.md`, `docs/launch-plan.md`, a dated systems review
  and session receipt. The plan orders offering decisions, deeper systems
  verification, deployment/restore/monitoring, external funding and payment
  setup, real acceptance, controlled rollout, rollback and first-week review.
  Trial-off and no-subscription-sales decisions remain in force. Local runtime
  directories and the superseded audit snapshot are ignored and preserved.
- **FID-2026-1030-041 — medium — FID lifecycle reconciliation.** FID-020–029
  are archived against their existing implementation commits and fresh gates.
  Premature closure labels on FID-033–040 were corrected before committing
  their catalog/benchmark/compare/presentation work as `50758c1`; their closure
  now records that real SHA. Historical receipts remain dated observations.
  Corrected the unsupported shared-dev/build-output claim: Next.js 16 isolates
  dev output under `.next/dev`. Also clarified the historical blend claim:
  prompt-heavy traffic reduces savings where prompt rates are less competitive.
- **FID-2026-1030-042 — high — Request and stream failure boundaries.**
  Non-object JSON now returns 400 before completion/benchmark field access.
  Streaming accounting writes are attempted once before response closure;
  failures emit a fixed diagnostic with reservation identifiers and fail the
  stream without exposing exception text. The terminal `[DONE]` line is held
  until settlement commits, so clients cannot accept completion before the
  accounting result. Transaction rollback leaves the failed hold visible for
  reconciliation. Regression HTTP checks cover malformed roots, paid SSE with
  split UTF-8/CRLF/terminal chunks, injected SQLite failure and rollback,
  recovery on a later request, and once-only disconnect settlement. This does
  not claim a durable retry service, alert delivery or live payment acceptance.

## 2026-10-30 — Local time

- **FID-2026-1030-040 — low — Timestamps read in the visitor's own zone.** Every
  timestamp came from one UTC-pinned formatter that appended " UTC", so a
  reader in Salem saw `05:58 UTC` for a measurement their own clock placed at
  1:58 AM — including on the compare footnote, which stamped the Artificial
  Analysis measurement and the OpenRouter fetch the same way. New
  `components/local-time.tsx` renders `<time>` in UTC on the server and swaps to
  the browser's zone once after mount, keeping the instant in `datetime`/`title`
  and the hydrated tree identical; the 14 timestamp call sites on `/account`,
  `/admin`, the dashboard cards, `/models` and `/compare` now use it. The old
  `formatDate` is gone and date-only values (release dates, grant end days) go
  through `formatCalendarDay`, which stays unlocalised on purpose because a
  calendar day shifted west of Greenwich becomes the previous day. The two
  "resets per UTC day" lines still say UTC: that is the enforced billing
  boundary, not a clock reading. Verified by typecheck, lint, a dev server
  serving `/`, `/models` and `/compare` (200) with `/admin` and `/account`
  correctly 307 to sign-in, and a DOM read of the footnote returning "1:58 AM
  EDT" and "3:01 AM EDT" (12-hour clock with an AM/PM marker, before and after
  the swap). The auth-gated tables were typechecked and linted, not re-rendered.

## 2026-10-29 — Price engine

- **FID-2026-1029-039 — medium — The hero price card updates, and prints one
  rate.** The report was a stale form after selecting a model; the diagnosis was
  in the symptom — the native `<select>` showed the new option while the body
  kept `deepseek-v4-flash` / `$0.065`, which only happens with no client runtime
  at all. The dev server on port 3000 was dead because a production build had
  overwritten the `.next` it serves; restarted and verified. Beside that, a real
  defect: every priced model bills input and output equally, and the card
  printed the same figure twice (display rate plus output line). It now reads
  "per 1M tokens, in and out", with the two-line form kept for models whose
  rates differ (`gpt-6.1-sol` $0.40 / $0.60). Verified by lint, typecheck, 208
  tests, quality PASS over 232 files, build, and DOM reads on both the restarted
  dev server and a production server.

## 2026-10-29 — Catalog coverage

- **FID-2026-1029-038 — low — Dashes where the data already existed.** The
  catalog printed `—` in the Savant price column for all 21 free-pool and plan
  models, because a zero per-token rate was formatted as "no price"; those rows
  now read `Free pool` / `In plan` with the billing basis in the title. The
  `vs OpenRouter` cell was blank for the same 11 public rows although their
  comparison existed — included models now show their real `−100 %` as muted
  text. On the benchmark side, `matchBenchmarks` gained one conservative
  fallback: a trailing four-digit build stamp on _our_ id (`deepseek-v4-pro-0813`)
  is stripped against an unambiguous source slug, which filled two rows and gave
  the free V4 Pro row its real 23.1 index. Matched rows 31 → 33. The 7 rows that
  still show a dash are models Artificial Analysis does not publish, and the
  ambiguity rule was deliberately left intact. Verified by lint, typecheck, 208
  tests (3 new), quality PASS over 232 files, build, and the rendered `/models`
  DOM on a fresh production server.

## 2026-10-29 — Comparison data and row highlight

- **FID-2026-1029-037 — low — Every measurement the source sends, and a win that
  lights its row.** A zero rate now says which zero it is — `Free pool` for a
  free-access model, `In plan` for a subscription model, `Not priced` only for a
  paid model with no rate — instead of printing "Not priced" underneath an
  Access row that read Free and above a −100 % delta. The Artificial Analysis
  coding index, agentic index, median end-to-end response, release date and the
  matched slug are parsed, stored and rendered; all five were being read off the
  wire and dropped. Rows where neither side was measured are dropped, and the
  `Measured` row (a dash on all 31 rows, because the free tier publishes no
  per-model date) became `Source` with the slug and index revision. A winning
  value now highlights its row: a 5 % accent band on the value cells and a 12 %
  wash on the winning cell, replacing the caret-only mark. Schema growth is
  additive (`ensureColumn`), so an existing database migrates in place; a forced
  sync through the admin route stored release dates on 31/31 matched models.
  Note for later: the free tier publishes no coding or agentic index (0 of 200
  records), so those rows stay hidden until it does. Verified by lint, typecheck,
  205 tests, quality PASS over 232 files, build, and served HTML from a fresh
  production server (ten winner rows, `Free pool`, the new AA rows, no overflow
  at 1440 px). Files split to hold the 400-line ceiling:
  `components/compare/compare-rows.tsx`, `lib/benchmarks-parse.ts`.

## 2026-10-29 — Model comparison

- **FID-2026-1029-036 — low — Two models, one attribute per line.** `/compare`
  takes `?a=<model>&b=<model>` and renders both from stored data: identity,
  Savant rates, OpenRouter list rates with the matched id and the blended delta,
  capabilities, and the AA benchmark with its measured date. A picker keeps the
  pair in the URL (replace, not push), `Swap` flips them, and an unknown id falls
  back to the first priced row instead of erroring. The better side of each
  numeric row carries a caret and full-strength text; equal or unmeasured values
  mark neither. Reachable from the public nav and from `/models`. Presentation
  and pure helpers only — no new dependency, no new table. Verified on a fresh
  production server (swap, select, deep link, free-model pair, 390 px without
  sideways scroll) plus lint, typecheck, 205 tests, quality and build.

## 2026-10-29 — Brand canvas

- **FID-2026-1029-035 — low — Canvas bands and wireframe bands.** The
  operator's 2048 px pattern ships as `public/bg-pattern.webp` (1440 px, blurred,
  29 KB) and tiles at 420 px under one 86 % veil that is black in dark mode and
  white in light. On the landing page `.landing-bands` assigns the canvas to odd
  bands and the perspective wireframe to even bands from DOM order, so the rhythm
  holds when the optional plans band is missing and the page always opens and
  closes dark. Odd bands carry the canvas; even bands carry the drawing at 7 %
  accent on a surface one step above the page. The footer closes with the same canvas, washed
  from its bottom edge. Copy sits on a wash in the hero and the closing band, and
  chips and stat panels inside a canvas band take `.canvas-surface` — an opaque
  accent-tinted fill — because translucent tints were what made the texture read
  as noise. Presentation only; no data, no dependency, no page. Verified on the
  live server (band tones, no overflow) and by lint, typecheck, 195 tests and
  build.

## 2026-10-29 — Catalog table grid

- **FID-2026-1029-034 — low — One fact per column.** Token weight and the
  tool/vision glyphs moved out of the Group cell into their own `Weight` and
  `Features` columns; prices render on one line as `input / output`; numerals
  are right-aligned to shared column edges at 13 px mono; rows are tighter and
  use zebra bands instead of a rule per row; the delta chip matches the group
  chip's radius. The OpenRouter rate is no longer a column: it is the title of
  the Savant rate, alongside the matched id and the blended delta. `Quality`
  became `AA Benchmark` and `vs list` became `vs OpenRouter`, because neither old
  label named the source a reader could see. Layout only — no data, pricing or
  query change. Verified on the live server at 1440 and 1024 (no overflow,
  header and cell content edges measured equal), plus lint, typecheck, 195 tests,
  quality and build.

## 2026-10-29 — Stored benchmarks

- **FID-2026-1029-033 — low — Quality column served from the database.** The
  catalog had no measured quality signal, and Artificial Analysis' free tier
  (100 requests per 24h; the live catalogue is two pages of 200) cannot sit on a
  render path. Measurements now live in `model_benchmarks` and are written by one
  leased sync (`lib/benchmark-sync.ts`); `/models` reads the table, may start a
  refresh, and never waits on one. A sync log records candidates, matched rows,
  index version and remaining quota, and a sanity gate refuses a collapsed
  payload so a truncated response cannot mark every row stale. Matching is
  normalised-exact (slug, then name, then creator+name) and an ambiguous key is
  refused rather than guessed; `null` renders as a dash, never zero. Admin →
  Catalog gains the sync status and a refresh button; the catalog footnote
  carries the required attribution link. The column and footnote disappear when
  no key is configured, and the rest of the catalog is unaffected.

## 2026-10-29 — File-ceiling split

- **FID-2026-1029-032 — low — `quality` is green again.** Two files were over the
  400-line ceiling before this session's work and kept the gate red:
  `lib/gateway.ts` (412) and `components/catalog/model-catalog-table.tsx` (467).
  The gateway's model resolution, free verdict and upstream error/retry mapping
  moved verbatim to `lib/gateway-resolution.ts` (366 lines left); the table's
  rate cell and delta helpers, filter bar and price footnote moved to
  `components/catalog/catalog-cells.tsx`, `catalog-filters.tsx` and
  `catalog-footnote.tsx` (293 lines left). No behavior, copy, class or ordering
  changed. Verified: lint clean, typecheck, 186 unit tests, `quality` PASS over
  219 files, build, both HTTP suites (100 checks + trial suite), and `/models`
  rendering "34 models · 34 shown" on the production build.

## 2026-10-29 — Subscription production truth

- **FID-2026-1029-031 — high — No invented billing periods, no unpurchasable tier.**
  Three surfaces stated things no source supported. `readStripeSubscriptionSnapshot`
  fell back to `period_start = now` and `period_end = now + 30 days` when Stripe
  reported neither, and `invoice.paid` invented a 30-day window when the invoice
  line carried no period — both wrote an allowance window no payment covered.
  The snapshot reader moved into the pure lifecycle module and now returns null
  periods, reconcile keeps the stored period with `COALESCE`, and an invoice that
  cannot be dated is ignored (Stripe retries) instead of activated. Separately,
  the catalog published 10 plan-gated models while the plans table held zero rows;
  the public scope now requires an active plan to cover a plan-gated model, so the
  catalog, `/v1/models`, the landing grid and the public counts publish 34 rows
  with no plan, 44 once an active plan covers the subscription group, and 34 again
  when it is drafted. The dead `subscriptionGrantsAccess` helper was removed.
  Tests: `tests/plans.test.mjs` (+1 case, 3 scenarios). The quality gate still
  fails on two pre-existing oversize files, recorded in SCOPE.

## 2026-10-29 — Hide a group

- **FID-2026-1029-030 — low — Groups can be hidden from the public catalog.**
  `model_groups` carried no visibility control, so taking a tier off the public
  page meant disabling models one by one or deleting the group. A `hidden`
  column now removes a group's models from the catalog page, the landing grid,
  `/v1/models` and the public model counts, while billing, plan membership and
  direct-by-id calls are untouched. Admin → Groups has a "Hide group" checkbox
  and a `hidden` chip. Verified on a scratch DB: 44 visible, 33 with `free`
  hidden, 23 with `free` and `subscription` hidden, 44 after unhiding.

## 2026-10-29 — Money integrity audit

- **FID-2026-1029-029 — high — Charges reach the credit ledger; money is exact.**
  `recordUsage` debited `credit_micros` without a ledger row, so the account's
  "every balance change" ledger showed grants and top-ups only and its running
  balance went stale on the first spent credit. Each settled charge now writes a
  `usage` row inside the same transaction, with `balance_after_micros` equal to
  the balance the customer sees. `computeTokenCostMicros` and
  `defaultSellMicros` moved from float to exact integer arithmetic (the float
  product lands one micro off past 2^53), `formatMicros` renders two to six
  decimals instead of printing `$0.195` as `$0.20` and `$0.000039` as `$0.0000`,
  plan prices must be whole cents, and `createPlanCheckout` refuses a price it
  cannot bill exactly instead of rounding it. Tests: `tests/money.test.mjs`
  (+14).

## 2026-10-29 — Fire-red link hover

- **FID-2026-1029-028 — low — Public text links hover into the fire red.**
  Hover shared the cyan accent with active state, kickers and figures, and
  footer, docs and account-nav links had no hover colour at all. One rule now
  paints `.site-shell`, `.auth-surface` and `.site-chrome` text links `--red`
  on hover, CTAs keep their own background treatment, and the wordmark is
  pinned so the logo does not recolour. Admin and workspace chrome keep accent
  hover, where red would collide with their active and destructive states.

## 2026-10-29 — Landing stats band

- **FID-2026-1029-027 — low — The catalog counters are a bordered band.** The
  four figures under the hero were a Tailwind grid whose dividers only existed
  above 1024px, so on mobile they floated with nothing separating them, and the
  values were set in the body face at the same weight as page copy. Each figure
  is now its own bounded cell with a mono ordinal (`// 01`) in the brand red, a
  display-face numeral, and the icon moved down to label the text instead of
  competing with the number. Two columns below 800px, four above; the duplicate
  top hairline is gone. Adds the `--red` token (`#ff2a6d` dark, `#c8102e` light).

## 2026-10-29 — Comparable price comparison

- **FID-2026-1029-026 — high — The `vs list` pill is a 3:1 blended rate.** The
  pill compared our flat per-token rate with OpenRouter's prompt rate only, so
  GLM 5.3 read `+179%` and Deepseek V4.1 Flash `+73.3%` while the same models are
  86.1% and 84.4% cheaper on completion — the upstream relay publishes one rate
  for both directions and the public list does not. Every paid row now carries
  `blendedDeltaBps` (three prompt tokens to one completion token), the tooltip
  keeps both direction deltas, and `/models` shows the blended headline beside
  the prompt, completion and coverage figures. Measured: all 18 matched paid rows
  are below list on the blend, median −87.0%. Tests:
  `tests/price-comparison.test.mjs` (+2).

## 2026-10-29 — Catalog table clarity

- **FID-2026-1029-025 — medium — Five-column catalog, comparison on the landing
  page.** The landing `#models` table never received the benchmark, so it printed
  `not listed` on all 44 rows; it now fetches the same cached OpenRouter list as
  `/models`. The table is five columns — model (with family, context and id as
  meta), group (with weight and capability icons), Savant $/1M, OpenRouter $/1M,
  and a `vs list` pill on input with the output difference in its tooltip — so
  the inner scrollbar is gone and the height follows the rows. Price cells show
  one number when input and output are equal and a dash when a rate does not
  exist; comparison columns are hidden with an explanation when the benchmark is
  unavailable rather than repeating `not listed`. At ingest, a published zero
  output rate now falls back to the input rate instead of billing completion
  tokens at $0. Tests: `tests/provider-catalog.test.mjs` (+2).

## 2026-10-29 — Per-account free daily cap

- **FID-2026-1029-024 — high — Per-account daily ceiling on the free pool.**
  The even split still divides 90% of the pool across activated accounts, but an
  account may now spend at most `FREE_ACCOUNT_DAILY_CAP` weighted tokens per UTC
  day (default 100,000; `0` disables). Effective allowance is
  `min(share, cap)`, so a pool divided between five accounts grants 3.6M each but
  binds at the cap, and a farm of accounts cannot each bank a share. The refusal
  names the limit actually hit, Admin → Gateway sets the cap and shows the share
  beside the effective allowance, and a missing or malformed value falls back to
  disabled rather than locking accounts out. Tests: `tests/allocation.test.mjs`
  (+5).

## 2026-10-29 — Completion rate limits

- **FID-2026-1029-023 — high — Boundary rate limiting on completions.** Free
  traffic now shares one token bucket (`FREE_SHARED_RPM`, default 12) that sits
  under the upstream account ceiling of 15 RPM, and every paid key has its own
  bucket (`PAID_KEY_RPM`, default 60), so an anonymous burst can no longer starve
  a paying caller. The check runs after request validation and before any
  reservation, so a throttled call holds no credit, no free-pool slot and no
  plan allowance, and never reaches the provider. A refusal is `429` with
  `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
  `X-RateLimit-Scope`. Buckets are per process, which suits the single-process
  SQLite deployment and is stated in the module header rather than assumed.
  Tests: `tests/rate-limit.test.mjs` (10).

## 2026-10-29 — Business model document, third upstream, dual-format auth

- **FID-2026-1029-022 — medium — Provider economics document.**
  `docs/business-model.md` states what each upstream charges, what the catalog
  sells for, what the daily free allowance would cost if bought, and how much
  paid revenue carries that exposure. Its numeric section is generated by
  `npm run business-model` from `data/gateway.db` and the dated snapshot in
  `docs/data/provider-prices.json`, so it cannot drift from the billing data.
  Current figures: 23 priced rows, 30% markup, 23.2% gross margin, free
  allowance 18M weighted tokens/day (540M/month) between $21.60 and $1,080 per
  month depending on model mix — $350/month of paid revenue covers the median.
  Tests: `tests/business-model.test.mjs` (7).
- **FID-2026-1029-022 — medium — Apixo registered as a third upstream.**
  Provider row `apixo` seeds disabled with base URL
  `https://api.apixoai.online/v1`, dual wire format, and key variable
  `APIXO_API_KEY`; it stays disabled until the key exists because its catalog
  endpoint requires one. Its published rates (12 models) are captured with the
  capture date; three catalog rows are 33.3% cheaper on input there than at the
  current upstream.
- **Gemini plan assessment, no code.** `docs/research/gem-review-assessment.md`
  checks the 90-day commercialization plan against the database and the source.
  Confirmed: one relay at 15 RPM with a $0.00 wallet, no boundary rate limit on
  `/v1`, no per-account free ceiling, unlimited keys per account, no email
  verification, and a $5 minimum top-up that costs 8.9% in card fees. Rejected:
  its wholesale price tables are invented (real catalog is $0.04–$2.00 per 1M,
  median $0.15), its `free/claude-opus-4.6` 402 diagnosis misreads our own
  catalog (that row is subscription-only by upstream flag), and the topology
  names an Express server that does not exist. Recommended order: boundary rate
  limiter, per-account free ceiling, then the $10 minimum.
- **FID-2026-1029-022 — low — Dual-format providers authenticate both routes.**
  Upstream auth headers moved to `lib/providers/auth-headers.ts`; a `both`
  provider now sends `Authorization: Bearer`, `x-api-key`, and
  `anthropic-version`, so one base URL serves OpenAI and Anthropic routes.
  Single-format providers still send exactly one credential.

## 2026-10-29 — Catalog price comparison and admin navigation rail

- **FID-2026-1029-020 — medium — OpenRouter price comparison on `/models`.**
  The public catalog widened to `max-w-[96rem]`, gained tools/vision, weight,
  and OpenRouter columns, and now states its source and fetch time. Matching is
  by exact upstream id after stripping a `free/` prefix; `:batch` and `~`
  variants are excluded so a variant never stands in for the model. An outage of
  the public list drops the column instead of the page. Three positioning cards
  report the median input delta, the median output delta, and exact-id coverage
  over matched paid rows. Tests: `tests/price-comparison.test.mjs` (8).
  **Unverified claim:** the deltas are arithmetic over catalog prices synced
  from the upstream feed, and that feed prices 40 of 45 rows identically on
  input and output — confirm it against the provider's rate card before using
  any savings figure publicly.
- **FID-2026-1029-021 — medium — Admin navigation rail.** Admin pages share one
  sticky 16rem rail from `app/admin/(panel)/layout.tsx`, which also owns the
  `requireAdminPage()` guard; `components/admin/admin-header.tsx` is removed so
  no route renders the old chrome. Below 1024px the rail becomes a horizontally
  scrolling strip that never widens the document. All ten admin routes answer
  200 with a session cookie and 307 without one.

## 2026-10-29 — Daily free-pool allocation, context banner, and launch analysis

- **FID-2026-1029-016 — high — Daily shared free-pool allocation.** Free-tier
  admission no longer applies one per-user constant. A per-UTC-day
  `free_pool_allocations` row grants an activated account (active customer with
  at least one active key) an even share of 90% of the configured daily pool,
  capped by the day's unallocated remainder. The 10% reserve is never allocated,
  and a joining account rebalances existing grants down to the new fair share
  (never below recorded usage plus holds) so it can receive unspent capacity.
  Admin → Gateway sets the pool, share, and enablement; settings override
  environment defaults, and `FREE_DAILY_WEIGHTED_TOKENS` remains the fallback
  when allocation is disabled. Trial mode keeps its own ledger and ignores the
  daily allowance. Tests: `tests/allocation.test.mjs` (9).
- **FID-2026-1029-017 — medium — Operator-editable context banner.** Admin →
  Gateway stores one string and an enable switch; while enabled it is prepended
  as a leading system message to every upstream request, for both OpenAI and
  Anthropic upstreams. Text is capped at 2,000 characters, control characters
  are stripped, the caller's message array is not mutated, and the banner's
  estimated tokens are counted before the free admission or credit hold so
  allowance and cost estimates agree. Tests: `tests/context-banner.test.mjs`
  (3).
- **FID-2026-1029-019 — high — Allocation join rebalance.** The first account
  of the UTC day could bank the entire 90% share, leaving every later signup
  that day with a zero allowance. A first request for a day now rebalances
  existing grants to the new fair share before the insert, floored at each
  account's recorded usage plus in-flight holds, so total grants never exceed
  the allocatable share and unspent capacity reaches newcomers. Tests:
  `tests/allocation.test.mjs` (11). Committed as `2626a13`; FID-019 is closed
  against that commit and archived.
- **FID-2026-1029-018 — low — Public catalog read memo.** A five-second,
  per-process TTL memo wraps the `listModels` display projection only; admin
  reads and the billed model lookup stay uncached. Measured avoided cost was
  150.2 µs per catalog query over 300 runs against 44 active rows. Tests:
  `tests/cache.test.mjs` (3).
- **Launch analysis and stale-record repair, no code.** `docs/trial-system-audit.md`
  records that the lifetime trial is implemented but cannot issue a grant
  because nothing writes `users.email_verified_at`; it stays disabled.
  `docs/subscriptions-decision.md` records the keep-but-do-not-sell decision,
  the unverified Stripe path, and the revisit criteria.
  `docs/business-plan-research-prompt.md` is a self-contained Gemini Deep
  Research brief with the platform, cost, allocation, abuse, and constraint
  model. `.env.example` lost its scaffold `[TEMPLATE]` header (verified harmless
  to `@next/env`, removed as noise) and gained the allocation variables;
  `dev/agenda.md` now records the real launch agenda; the untracked
  `dev/audit/issues.md` snapshot was preserved, not deleted, per the handoff.
  Receipt: `npm run verify` exit 0 — lint zero warnings, typecheck, 135/135 unit
  tests, quality PASS over 207 files, production build exit 0 (54 app routes),
  `http-suite` 100 checks PASS and `trial-http-suite` all checks PASS. Committed
  as `58d5556`; FID-2026-1029-016, FID-2026-1029-017, and FID-2026-1029-018 are
  closed against that commit and archived. Trial activation, plan sales, real
  Stripe delivery, and funded paid inference remain unverified and are not
  claimed.

## 2026-10-29 — Disabled lifetime trial infrastructure

- **FID-2026-1029-015 — high — One-time trial ledger and paid routing.** Added
  durable per-customer grants, concurrent reservations, replay-safe settlement
  and historical free-usage offsets. Configurable development default 100,000
  weighted tokens; activation off, pair map empty, gateway grant budget zero.
  Verified email and finite issuance budget gate grants. Explicit paid pairs
  reuse credit holds after trial exhaustion; unavailable pairs fail closed,
  and temporary pool depletion never triggers charging. Usage records requested
  and serving model identities. Account UI shows lifetime balance and transition
  prices; model API adds trial_paid_transition. Added ledger unit tests and a
  production-build trial HTTP suite to test:http/verify. Receipt: 118 unit tests,
  zero-warning lint/typecheck, quality (197 files), 51-route build, existing 100
  HTTP checks plus trial suite PASS; account browser checks at 1440/390/320.
  Activation controls and live payment/funding acceptance remain documented
  launch requirements. This change does not enable the trial offering.
  Committed `d3e4a56`; FID-015 closed and archived.

## 2026-10-29 — Provider metadata integrity

- **FID-2026-1029-014 — high — Correct quota and catalog metadata.** Preserve
  upstream weights independently of free eligibility, accept both context
  spellings and retain authenticated fields when public metadata is partial.
  Reject null, blank, boolean, negative and nonfinite prices as unknown rather
  than treating them as known zero costs. Six new regression tests; full gates
  passed with 113 unit tests, quality (191 files), 51-route build and 100 HTTP
  checks. Applies on subsequent sync; live catalog not changed by verification.
  Added a concrete trial conversion proposal with six exact paid-pair candidates
  and five unmatched free models. Trial routing remains unimplemented pending
  entitlement selection. Committed `ae9c363`; FID-014 closed and archived.

## 2026-10-29 — Savant visual system

- **FID-2026-1029-013 — medium — Whole-site brand and catalog presentation.**
  Applied Orbitron/Rajdhani/JetBrains Mono typography, semantic cyan light/dark
  themes, shared branding, sharper controls, and mobile navigation across
  public, authentication, account, console and admin surfaces. The homepage
  leads with model value and configured retail prices, and renders the complete
  enabled catalog instead of six preview rows. Preserved independent input and
  output rates, subscription labels, search and filters. Fixed account/console
  mobile overflow, replaced customer setup commands with payment availability
  guidance, and removed raw error messages from the error boundary. Gates:
  107 unit tests, quality PASS over 191 files, 51-route build, 100 HTTP checks,
  and zero-warning lint. Production browser checks covered 102 route/theme/width
  combinations plus 17 interaction assertions on disposable data. Launch
  requirements are documented in `docs/launch-readiness.md`; trial conversion,
  wallet funding and real Stripe acceptance are not claimed by this change.
  Committed as `56a2436`; FID-013 is closed and archived.

## 2026-10-29 — Route-level HTTP suite

- **FID-2026-1029-012 — high — Route-level HTTP verification.** Added a
  post-build `npm run test:http` gate that boots the production server against a
  disposable SQLite database, seeds one mock provider and one paid model through
  a second connection, and exercises 100 assertions over real HTTP: signup
  returns `201` with an HttpOnly/SameSite=Lax/Secure `sg_session`; logout revokes
  it and login mints a new one; duplicate signup is `409` and foreign-origin
  mutations are `403`; one customer cannot list or revoke another's API key; a
  signed Stripe `checkout.session.completed` event credits exactly once, a
  replay is a no-op, an invalid signature is `400`, and an amount mismatch
  leaves the top-up pending; a paid call debits exactly 200 micros through a
  mock upstream, forwards the configured provider key, translates the model id,
  and writes a `credit` usage row; an unfunded call is `402`; and the admin
  session boundary redirects anonymous pages, rejects a wrong password, and
  serves the customer page with a hardened `sg_admin` cookie. Wired into
  `package.json`, `protocol.config.yaml`, CI after build, and the pre-push hook
  after build. No production code changed. Gates: `npm run verify` exit 0,
  107/107 unit tests, quality PASS over 189 files, 51-route build, 100 HTTP
  checks. Committed as `4374c00`; FID-012 is closed and archived.

## 2026-10-29 — Subscription revenue analytics

- **FID-2026-1029-011 — medium — Subscription plan revenue in admin analytics.**
  The admin overview and analytics page now show credit revenue
  (`usage_events.charged_micros`, recognized at settlement) separately from plan
  revenue (paid `subscription_invoices`, recognized at `paid_at`), plus total
  revenue, total margin, paid-invoice count, active/past-due/canceling/manual
  subscriber counts, and MRR. A per-plan table reports range invoice revenue and
  current run-rate; the daily chart plots credit, plan, and upstream cost as
  grouped bars; the top-models table is explicitly credit-only. MRR counts
  active Stripe subscriptions that are not set to cancel, normalizes yearly
  prices to a month, and excludes manual comps and past-due plans. The query
  layer moved to `lib/analytics.ts` with an injectable database handle and clock
  so Node tests execute the real SQL; `lib/revenue.ts` holds the pure run-rate
  and margin math. An additive `(status, paid_at)` invoice index supports the
  range scan. Billing, routing, invoice recording, and Stripe handling are
  unchanged. Refunds and credit notes are not tracked, so a paid invoice stays
  in recorded cash after a refund; plan revenue is cash-basis while cost is
  usage-basis. Tests: `tests/revenue.test.mjs` (5) and
  `tests/analytics.test.mjs` (3). Gates: `npm run verify` exit 0, 107/107 tests,
  quality PASS over 189 files, 51-route build. A disposable-database receipt
  rendered $163.00 total revenue ($3.00 credit + $160.00 plans), $1.50 cost,
  +$161.50 total margin, $20.00 MRR, 4 active/1 past-due/1 canceling/1 manual
  subscribers, and plan rows of $120.00, $40.00, and $0.00; anonymous analytics
  redirected 307 to login, a wrong password returned 401, and the authenticated
  page returned 200. Committed as `ba233c6`; FID-011 is closed against that
  commit and archived.

## 2026-10-29 — Subscription plans and entitlements

- **FID-2026-1029-008 — high — Customer subscription plans, entitlement
  snapshots, and recurring billing.** Added an operator-authored plan catalog
  (price, month/year interval, included groups and individual models, included
  weighted-token allowance, `block` or `credit` overage with markup), plus an
  additive schema for plans, subscriptions, entitlement snapshots, allowance
  periods, subscription holds, invoices, and billing-event idempotency. A
  subscription snapshots the plan values and exact model ids; later plan edits
  do not change a purchase, and refresh is explicit. The gateway now picks one
  billing source per call: included plan usage reserves weighted tokens and
  charges zero, exhausted `block` plans return `402 subscription_limit_reached`,
  exhausted `credit` plans charge from prepaid credit with markup, past-due
  plans return `402 subscription_past_due`, and uncovered subscription-group
  models return `403 subscription_required`. Stripe Checkout in subscription
  mode, Billing Portal, cancel/resume, signed `invoice.paid` activation,
  payment failure, subscription reconciliation, and top-up dispatch share the
  webhook with event-id idempotency. Customer surfaces add `/plans` and an
  account subscription card with allowance, invoices, cancel, resume, and
  portal; admin surfaces add **Plans** and **Subscriptions** with create, edit,
  archive, delete, manual grant/extend/revoke, Stripe sync, and entitlement
  refresh. `/v1/models` adds `requires_subscription`; provider quota copy now
  says upstream. Tests: `tests/plans.test.mjs` (10 cases). Gates: `npm run
verify` exit 0, 99/99 tests, quality PASS over 186 files, 51-route build. A
  disposable-database HTTP receipt proved active-plan CRUD and draft exclusion,
  a zero-charge included call with 6 weighted tokens, snapshot stability
  through a $5→$6 and group edit, explicit refresh 23→24 models, 403 on an
  uncovered plan-only model, 402 on an exhausted block plan, 9-micro credit
  overage with 5000-bps markup, duplicate checkout 409, foreign-origin 403,
  manual extend/revoke, one signed-invoice activation with a replay no-op, and
  a $5.00 top-up credited once. Real Stripe checkout/recurring delivery and a
  funded live subscription remain unverified (B4). Committed as `a945789`;
  FID-008 is closed against that commit and archived.

## 2026-10-29 — First-class model groups

- **FID-2026-1029-007 — high — First-class model groups with operator
  assignment.** Groups are now durable rows in `model_groups` with a stable
  slug, editable label, description, sort order, billing mode, and a protected
  system flag. The migration seeds `free`, `paid`, and `subscription` and
  backfills every existing model from its old provider-derived access, so
  behavior does not change on boot. Models carry `group_slug` and
  `group_source`; a manual assignment survives provider sync, while auto rows
  follow the provider-derived default. The admin panel adds
  **Groups** (`/admin/groups`) with create, edit, delete-with-reassignment,
  system-group protection, and model counts, plus group selectors in the
  catalog and pricing tables and a dynamic group filter in the public catalog.
  Billing follows the group: a `free` group forces both sell prices to zero and
  skips credit holds; `paid` and `subscription` groups use the existing credit
  path. A zero-cost model can now be moved to a paid group and charged. Usage
  rows snapshot `group_slug`, and `/v1/models` keeps `group` while adding
  `group_slug`, `group_label`, and `group_billing_mode`.
  Tests: `tests/model-groups.test.mjs` covers validation, reserved slugs,
  price reset, access mapping, and reassignment. Gates: `npm run verify` exit
  0, 89/89 tests, quality PASS over 160 files, 41-route build. A disposable copy
  of `data/gateway.db` migrated with all 45 models preserved; the receipt
  created a custom paid group, moved a zero-cost `free/` model into it, priced
  it, confirmed a provider sync preserved the manual group, and made a live
  gateway call that charged 160 micros with `group_slug = paid`. Closed against
  `161ddcc`; FID-007 is archived.

## 2026-10-29 — D6/D50 remediation and provider-registry design

- **FID-2026-1029-009 — high (D50), low (D6) — Sanitize client errors and
  enforce free-pool admission control.** `sanitizeError` in `lib/http.ts` logs
  local exception detail server-side and returns fixed text on the public
  provider-fetch path, the admin credit grant (now `500`), and provider sync.
  Free calls now reserve weighted tokens before dispatch against a per-user
  UTC-daily allowance and the effective provider remaining, returning `429`
  with `Retry-After` and `X-RateLimit-Reset` on refusal. Reservations settle in
  the usage transaction; new tables are `free_pool_usage` and
  `free_pool_reservations`. Limits are `FREE_DAILY_WEIGHTED_TOKENS`,
  `FREE_PROVIDER_REMAINING_FLOOR`, and `FREE_PROVIDER_ALERT_THRESHOLD`.
  Closed against `4782ce1`. Gates: `npm run verify` exit 0, 62/62 tests,
  quality PASS over 127 files, 33-route build. Tests:
  `tests/free-pool.test.mjs` plus sanitizer cases in `tests/http.test.mjs`.
- **FID-2026-1029-010 — high — Multi-provider registry.** Implemented the
  `providers` entity: per-provider protocol, base URL, credential variable
  name, static headers, capability flags, enabled state, and runtime status.
  Models are now scoped by `(upstream_slug, upstream_id)` with their own
  `family`, wire `protocol`, and `cost_source`; a sync only delists that
  provider's vanished rows. `lib/providers/` holds the registry, scoped sync,
  and OpenAI Chat Completions and Anthropic Messages adapters (request,
  response, stream mapping, usage, and error translation). Paid rows without a
  known cost cannot be enabled; operators enter manual costs that survive
  sync. Free-pool admission uses the serving provider's remaining figure while
  the daily allowance stays per user. Admin → Providers registers, edits,
  enables, disables, deletes, tests, and syncs upstreams; the legacy
  `POST /api/provider/sync` remains an alias for syncing every enabled
  provider. Existing Savant models, ids, keys, balances, and usage rows are
  untouched by the additive migration, and CommandCode is seeded unconfigured.
  Tests: `tests/providers.test.mjs`, `tests/provider-catalog.test.mjs`, and
  `tests/anthropic-translate.test.mjs`. Gates: `npm run verify` exit 0, 79/79
  tests, quality PASS over 152 files, 39-route build. A disposable-database
  boot kept all 45 existing models on `savant`, seeded both providers, and
  added the `provider_slug` columns. Live CommandCode inference is not run:
  no credential or second-upstream account is configured. Closed against
  `957430c`; archived at
  `dev/fids/archive/FID-2026-1029-010-multi-provider-registry.md`.

## 2026-10-29 — Rebuild closure and record reconciliation

- **FID-2026-1029-001 — high — Rebuild the gateway on Next.js 16 + HeroUI v3.**
  Closed against `bf3da9a007ca41d6e66c60ed080c2ef3e6cef7e5`, the first commit
  containing the rebuilt tree. The production loopback bypass recorded as an
  open Host-header finding is disabled in production builds, and FID-006's
  receipt recorded a spoofed `Host: localhost` request returning `403`; the
  usage-row copy finding was removed with the rebuilt dashboard; cancelled
  streams now settle provider usage or a streamed-character estimate instead of
  zero. Closure gates: `npm run verify` exit 0, 48/48 tests, quality PASS over
  125 files, 33-route build. Archived at
  `dev/fids/archive/FID-2026-1029-001-nextjs-gateway-rebuild.md`.
- **FID-2026-1029-006 — record correction, no behavior change.** The archived
  record's status was corrected from `converged` to `closed`; its 2026-10-29
  closure receipt and `455ddb5` implementation commit are unchanged.

## 2026-10-29 — Customer accounts and prepaid credit top-ups

- **FID-2026-1029-006 — high — Sell paid models to outside customers.** Adds
  email/password signup with scrypt hashes, opaque server-side sessions
  (`sg_session`, HttpOnly, SameSite=Lax, seven days, Secure in production),
  and sign-out revocation. Customer keys, usage, ledger, and top-up history are
  scoped by the session user; a second account cannot revoke or read the
  first's data. Adds `/signup`, `/login`, and `/account`, plus
  `/api/auth/*`, `/api/account/keys`, `/api/account/topup`, and an admin
  Customers page. Prepaid credit is sold in $5–$500 increments through Stripe
  Checkout; credit is granted only by a signature-verified webhook whose
  amount and currency match a pending top-up. `topups.provider_ref` is unique
  and fulfillment transitions and ledgers in one transaction, so replay is a
  no-op. Checkout returns `503` while Stripe is unconfigured — no fake credit
  path. Also hardens the operator boundary: the loopback console bypass is
  disabled and `/dashboard` requires the admin session in production builds.
  Tests: 48 total (18 new password, customer, session, and top-up tests).
  Live disposable-DB receipt: 201 signup, 409 duplicate, 401 wrong password,
  cross-account revoke 404, foreign Origin 403, per-account usage isolation,
  503 unconfigured top-up, signed paid webhook credited $25.00 once, replay
  credited nothing, unpaid event ignored, logout revoked the session, and
  `/admin/customers` returned 200. A live Stripe card payment remains
  unverified because no live keys were available; fulfillment was tested with
  a Stripe-signed event. Closed against `455ddb5`; archived at
  `dev/fids/archive/FID-2026-1029-006-customer-accounts-and-credit-topups.md`.

## 2026-10-29 — Provider, family, and price-group semantics

- **FID-2026-1029-005 — medium — Separate the provider identity from the model
  family and price group.** The catalog had stored the upstream `"Free"`
  sentinel as the model provider for 21 rows, and `/v1/models` published
  `owned_by: "Free"`. Savant Gateway is now the provider (`owned_by:
"savant-gateway"`); the model family (GPT, Claude, DeepSeek, …) is serialized
  as `family`; and free/paid/subscription is the price group (`group` in
  `/v1/models`, `access` in UI data). Legacy `provider='Free'` rows are
  repaired at boot from the model id, syncs can no longer reintroduce the
  sentinel, and the public catalog, admin tables, and analytics use Family and
  Group labels. Adds `lib/model-family.ts` and `tests/model-family.test.mjs`
  (4 tests; 30 total).

## 2026-10-29 — Full catalog, sell-price math, credits, and analytics

- **FID-2026-1029-004 — high — Sell the full provider catalog with credit
  settlement and pricing analytics.** All 45 active provider rows are public
  instead of only the free pool; free rows route immediately and non-free rows
  route once priced. Adds separate upstream-cost and
  sell-price fields, a 30% default markup, inline per-row pricing, bulk
  repricing, and per-direction plus blended margin. Paid calls reserve an
  estimated credit hold, settle actual usage in one transaction, and write
  revenue and cost to the usage row; free-pool calls stay zero-charge and
  weighted-metered. Adds a public `/models` table with search, sort, filters,
  and pagination; an authenticated admin shell with overview, catalog, pricing,
  and analytics pages; operator credit grants and a ledger; 7/30/90-day
  revenue, cost, margin, token, latency, error-rate, and top-model reporting;
  and Font Awesome Free. Provider sync is now an additive upsert that preserves
  manual prices, operator disables, and delisted rows. Settlement deliberately
  charges actual usage rather than capping at the hold, so the pre-flight
  reservation cannot underbill an overrun; an unfunded overrun leaves a
  negative balance and the next paid call returns `402`. Tests: 26 total (10
  new pricing tests). Closed against `2623912`; archived at
  `dev/fids/archive/FID-2026-1029-004-full-catalog-pricing-analytics.md`.

## 2026-10-29 — Landing page, admin panel, and canonical protocol

- **FID-2026-1029-003 — high — Public landing, authenticated admin panel, and
  canonical protocol import.** `/` is now a public landing page with the
  supplied brand assets and live active/free catalog counts; the existing
  console moved to `/dashboard`. Adds a password-protected `/admin` panel with
  provider sync, model enable/disable, key creation/revocation, and usage.
  Model statuses survive a provider sync. Admin sessions are HMAC-signed
  HttpOnly cookies with a durable epoch: sign-out revokes issued tokens, not
  just the browser copy. Login is rate-limited and cross-origin mutations are
  rejected. The existing `/api/*` routes now accept loopback or an admin
  session and keep their loopback development behavior. Replaces the condensed
  ECHO summary with the canonical `ECHO.md`, the single-agent protocol and
  marker, coding standards, templates, and an npm-configured
  `protocol.config.yaml`. Adds brand favicons, web manifest, and source assets.
  Tests: 16 (session, limiter, HTTP helpers). Closed against
  `508d4431524b26606e4b94a7b95e0b3ccc22a2c3`; archived at
  `dev/fids/archive/FID-2026-1029-003-landing-admin-and-protocol-port.md`.

## 2026-10-29 — Savant Gateway repository bootstrap

- **FID-2026-1029-002 — high — Establish the Savant Gateway identity and
  repository scaffold.** The product surface is renamed from the resale
  scaffold to Savant Gateway; `lib/apinex.ts` becomes `lib/provider.ts`;
  provider endpoint variables become `PROVIDER_BASE_URL` and
  `PROVIDER_PUBLIC_MODELS_URL` with the existing upstream defaults. The
  929-line dashboard and 471-line store are split into responsibility-scoped
  modules under the 400-line ceiling. Adds AGENTS/ECHO/protocol governance,
  FID and session templates, the attribution guard, quality gate, Node test
  suite, git hooks, and CI. No provider behavior, key format, free-pool rule,
  or metering rule changed. Closed against commit
  `bf3da9a007ca41d6e66c60ed080c2ef3e6cef7e5`; the FID is archived at
  `dev/fids/archive/FID-2026-1029-002-savant-gateway-bootstrap.md`.
