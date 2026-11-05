# FID: Dashboard-configured content fetching and durable history

**Filename:** `FID-2026-1104-015-content-fetch-automation-and-history.md`
**ID:** FID-2026-1104-015
**Severity:** high
**Status:** converged
**Created:** 2026-11-04 23:20 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Connect the existing due-source ingestion engine to an actual scheduler, expose
its policy and health in the dashboard, and make historical fetch outcomes
browsable. A stored interval alone does not cause work. This is a design-only
contract under FID-2026-1104-018; no scheduler has been activated.

## Environment

- Windows, PowerShell, Node v24.21.0; Next.js 16.4.3; PostgreSQL/PGlite.
- Grounding commit: `f6d2a5b`; two existing untracked chat exports preserved.
- Session scope: SCOPE CA1; implementation reserved by the operator.
- Vercel project metadata exists; current plan and live cron configuration have
  not been independently observed. No secret values were read or printed.

## Detailed Description

### Problem

The operator observed two-day-old content and manually fetched all sources.
Repository inspection demonstrates an unwired scheduler contract; it does not
prove what any external scheduler currently does in production.

### Expected Behavior

All enabled sources are eligible automatically at their configured intervals,
without a browser remaining open. Operators can pause automation, adjust source
intervals and bounded run capacity, inspect history and detect overdue work.

### Root Cause

`app/api/cron/content/route.ts:29` exports only POST. There is no root
`vercel.json` or scheduled workflow in the inspected tree. Vercel cron invokes
GET and supplies `CRON_SECRET`; the existing policy reads only
`CONTENT_CRON_SECRET`. Per-source intervals are stored but need a caller.

### Evidence

- `lib/content/store/sources.ts:113`: `listDueSources` selects enabled, overdue
  rows, ordered oldest-first, with a hard maximum of 50.
- `app/api/cron/content/route.ts:64`: `limit: 10`; line 65: `deadlineMs: 45_000`.
- `lib/content/ingest.ts:185`: `startCycle` precedes fetch; success and failure
  both call `finishCycle`. Logging exists already.
- `app/admin/(panel)/content/page.tsx:57`: `listRecentCycles(db, 8)`; no history
  navigation. `last_fetched_at` advances on failures too.
- `lib/content/ingest.ts:298`: candidates are selected before individual claims;
  simultaneous selectors can hold stale due snapshots. Deadline is checked only
  before starting each source, not across its multi-request enrichment.
- Baseline focused command in master: 55 tests, 55 pass, 0 fail, 0 skipped.
- Current official Vercel docs fetched through Context7 `/websites/vercel`:
  GET/Bearer convention, Hobby daily-only, Pro/Enterprise minute-level minimum.
  Sources: <https://vercel.com/docs/cron-jobs/manage-cron-jobs> and
  <https://vercel.com/docs/cron-jobs/usage-and-pricing>.

## Impact Assessment

### Affected Components

Existing cron/admin fetch routes, ingestion/claims/cycles/source stores,
content schema, policy, source editor, admin content page, production
configuration inventory, scheduler configuration and operator documentation.

Planned files: `lib/content/automation.ts`, `lib/content/store/automation.ts`,
`lib/storage/schema/content-automation.ts`,
`app/api/admin/content/automation/route.ts`,
`app/api/admin/content/runs/route.ts`, and
`app/admin/(panel)/content/history/page.tsx`. Extend the existing cron/fetch
entry points and migration registration; split helpers before exceeding the
400-line ceiling. New history APIs are read-only GET; policy writes are PATCH.

### Risk Level

- [x] High: freshness cannot be sustained automatically from the current tree.
- Main change risks: upstream quotas, duplicate work, lease expiry, unbounded
  enrichment, misleading health, history loss and logging credentials.

## Proposed Solution

### Approach

Use one authenticated scheduler heartbeat and the existing ingestion path.
The dashboard controls database-backed behavior; the deployment owns the
heartbeat. Do not use render side effects, browser polling or process timers
as the scheduling authority on serverless hosting.

1. Store one versioned automation policy through the existing `settings` store:
   enabled, batch limit 1–50 (default 10), expected heartbeat minutes 1–60
   (default 5). Keep source cadence in `fetch_interval_minutes` (15–1440).
   Database enabled explicitly overrides the legacy environment default; absent
   policy preserves `CONTENT_INGEST_ENABLED` behavior. No implicit activation.
2. GET and POST share an authenticated cron handler. Accept `CRON_SECRET` for
   Vercel and the existing content secret for compatibility, each constant-time,
   refusing if neither is configured. No URL/query secret. Admin mutations use
   the existing session and same-origin guard. Bound bodies and validate values.
3. Prepare a five-minute heartbeat configuration for a confirmed supported
   backend. Use Vercel cron on Pro/Enterprise; on Hobby use an operator-approved
   external scheduler calling the same endpoint. Do not silently deploy an
   unsupported expression or purchase a plan. Include an executable external
   invocation/runbook; provider selection is an activation input, not a reason
   to omit the scheduler artifact from the implementation deliverable.
4. Reuse due selection and claims, excluding live-claimed candidates before
   LIMIT; atomically recheck enabled/due status when claiming, preventing a
   selector from re-fetching a source completed by a competing run. Fair ordering
   uses next-due time and stable id. Tick limits are batches, never an implied
   ten-source catalog cap; remaining due work continues on later heartbeats.
5. Enforce a whole-source/run budget across primary fetch, redirects, body reads,
   enrichment and item writes. Propagate cancellation into fetchers; do not race
   a write-bearing promise and leave it running. Use a request-scoped budget,
   explicit checkpoints and database statement limits. Lease lifetime exceeds
   the full possible invocation; owner checks fence writes after takeover.
   Manual single-source and Fetch All use the same claim path. A budget stop is
   resumable work, not five artificial upstream failures that disable a source.
   Persist a source stage/cursor pinned to its configuration revision when primary
   collection spans ticks; checkpoints resume instead of restarting forever.
   Snapshot the primary listing/item membership so a reordered live ranking
   cannot shift the cursor. A changed source revision interrupts the old cycle
   and starts a new one; it does not count as an upstream failure.
   Optional enrichment may exhaust its allowance without discarding primary
   content. Advance last-success only after the complete primary cycle finishes.
6. Add durable run rows (trigger, start/finish, status, counts, cursor/budget
   outcome, sanitized error) and link source cycles to a run where applicable.
   Preserve existing cycles with legacy provenance. Expired owners' unfinished
   cycles/runs become interrupted on the next tick; no invented completion.
   Record authenticated paused/no-due ticks so heartbeat health is observable.
7. Keep last attempt and last success separate. Backfill success only from
   successful finished cycles; absent proof stays null. Preserve cadence based
   on attempts to avoid hammering failing sources. Public freshness uses success.
   Add bounded paginated run/cycle history (source, outcome, trigger, dates),
   timestamps with timezone, duration, seen/upserted/skipped counts and errors.
   Label upserts as processed items, not newly created items. Retain receipts
   indefinitely initially; no new automatic deletion policy is introduced.
8. Dashboard states: paused, secret missing, awaiting first heartbeat, healthy,
   heartbeat overdue, running, partial and failed; show last success, next due
   estimate and backlog. A saved enabled flag never proves a scheduler exists.
   Source failures are independent. Disabled sources remain disabled.

History stores source label/id snapshots. Migrate cycles' source reference to
nullable `ON DELETE SET NULL`, preserving the snapshot and run receipt when a
source is deliberately deleted; do not retain deleted content through this change.
Policy saves use expected revisions (409 on stale writes). Redact all persisted
upstream errors using the existing redaction authority; never store URL tokens.

### Steps

1. **blocked — coding reserved:** additive policy/history schema and store APIs.
2. **blocked — coding reserved:** bounded shared runner, ownership and cron/API.
3. **blocked — coding reserved:** dashboard policy, source timing and history.
4. **blocked — coding reserved:** backend artifacts, runbook and automated proofs.
5. **blocked — operator activation inputs:** confirm backend/tier, provision its
   secret and authorize hosted deployment; observe two heartbeats without a
   browser. This observation is distinct from committed implementation closure.

### Verification

Planned `tests/content-automation.test.mjs`: policy persistence/defaults,
malformed input, paused/no-due heartbeat, >50 sources progressing across ticks,
overlap and stale candidate recheck, manual/scheduled exclusion, whole-source
deadline, interrupted run recovery, failure/success clocks and stable pagination.
Use fixtures, injected clocks and disposable storage; no paid inference.
Extend the real HTTP suite with unauthorized cron GET/POST, no-secret refusal,
admin 401/cross-origin 403, persisted settings, history and public freshness.
Real two-connection ownership proof and a rendered dashboard receipt are
mandatory before claiming those behaviors; PGlite alone is insufficient.
Implement that proof in `tests/content-job-concurrency.test.mjs`, register it in
`scripts/postgres-concurrency-proof.mjs`'s TEST_FILES, and reject skipped cases.
Add HTTP probes in `scripts/http-suite/content-checks.mjs`, called before the
destructive `runChecks` block in `scripts/http-suite.mjs`.

## Verification Gates

- gate: lint — `npm run lint` (zero warnings).
- gate: typecheck — `npm run typecheck`.
- gate: test tests/content-automation.test.mjs — planned.
- gate: test tests/content-job-concurrency.test.mjs — planned; test:postgres too.
- gate: test tests/content-ingest.test.mjs — existing regression.
- gate: test tests/content-status.test.mjs — success-based freshness regression.
- gate: test tests/content-guidance.test.mjs — public projection regression.
- gate: quality — `npm run quality` (400-line ceiling).
- gate: build — `npm run build`.
- gate: verify — `npm run verify`, including real PostgreSQL, HTTP and recovery.

### Verification Receipt

Planning-only receipts and audit deltas are in the master and session summary.
Future tests above do not exist yet; no new behavior or hosted tick is verified.

## Perfection Loop

### Loop 1 — RED

- **RED:** interval storage is disconnected from an actual scheduler; history
  exists but is truncated; attempt timestamps masquerade as freshness.
- **GREEN:** reuse the stores/engine, add an authenticated heartbeat and durable
  policy/history, separate success from attempt, and expose honest health.
- **AUDIT:** exact caller searches above establish the existing route/engine;
  implementation must prove cron → shared runner → claim → cycle → public read.
- **ADVERSARIAL:** stale selectors, hot failing sources, multi-call enrichment,
  crashed owners, >50 due sources, scheduler tier mismatch and token leakage.
- **CHANGE DELTA:** initial design; subsequent measured passes recorded below.

### Missed Questions

1. What if the scheduler stops? Persist ticks; show overdue after two expected
   heartbeat periods plus a one-minute grace; no last-success fallback.
2. Can every interval be met with a large backlog? It is a due target, not an
   SLA. Show backlog and oldest overdue age; measure capacity before promising it.
3. Does a failed source block others? No; record its outcome, preserve attempt
   cadence and continue within the remaining budget.
4. Does pause cancel an in-flight fetch? Stop admitting new work at checkpoints;
   safely finish or interrupt the current unit. State this in the UI.

### Implementation Evidence (REQUIRED for `closed`)

All implementation steps are blocked by the planning-only instruction. There
is no implementation commit, runtime proof or closure claim.

### Code Verification Evidence

Existing engine, route, source/cycle/claim stores and page were read. New policy,
history and scheduling wiring are planned, not present. Future reachability
requires searches from both cron and manual entry points and live HTTP evidence.

### Loop 2 — Independent audit and self-correction

- **RED:** per-request limits cannot bound multi-request source work; a proof
  file outside the PostgreSQL runner would never prove real ownership.
- **GREEN:** durable source checkpoints, enrichment allowance, explicit mandatory
  concurrency registration and HTTP runner insertion; source snapshots preserve
  receipts on source deletion, with revision-safe policy writes.
- **AUDIT:** `scripts/postgres-concurrency-proof.mjs` TEST_FILES currently lists
  only settlement/admission; `scripts/http-suite.mjs` runs destructive checks last.
- **ADVERSARIAL:** resumed source config changes invalidate its cursor; absence
  of a success cycle must remain null, never backfilled from a failed attempt.
- **CHANGE DELTA:** first correction 698/11528 characters (6.055% Levenshtein).

### Loop 3 — Final convergence

Final audits must confirm scheduler/policy separation, bounded resumption,
history provenance and executable gate wiring. Two final unchanged-document
passes and their hashes/deltas are recorded in the planning session receipt.

## Resolution

Design only. No closed date, archive move, implementation SHA or live scheduler
receipt. The master retains the operator's coding and deployment boundaries.

## Lessons Learned

A due-time field is policy, not execution. A successful save is not a heartbeat,
and a failed attempt is not a successful content refresh.
