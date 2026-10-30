# Changelog

All notable changes are recorded here. Entries name the FID that drove them and
distinguish verified behavior from unverified claims.

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
  acceptable-use, refund and expiry text, plus a real outbound channel.

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
