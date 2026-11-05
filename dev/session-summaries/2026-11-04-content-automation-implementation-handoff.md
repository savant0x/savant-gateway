# Content automation and persistent matching — implementation handoff

Planning commit: `3af1b1dfc163e592dc0f3353949ad390f00844b1`.
Date: 2026-11-04, America/New_York. Scope register: SCOPE CA1–CA5.

This handoff prepares the next coding session. No application code was written
during planning. All four records are `converged`, not implemented or closed.
The current instruction is to write this handoff; implementation begins when
the operator starts the coding session using the starter below or an equivalent
instruction. Hosted deployment and scheduler activation remain separate boundaries.

## Read first

1. `AGENTS.md`, `ECHO-single-agent.md`, and the full
   `dev/echo-v0.1.2-single-agent.md`, 0–EOF. This is a single-agent repository.
   The harness's Hybrid Mode is not implementation authority here.
2. `protocol.config.yaml`, `SCOPE.md`, and `dev/fids/README.md`. Session autonomy
   is 3 and strict mode is true; preserve operator rulings and unrelated work.
3. [Master FID-018](../fids/FID-2026-1104-018-content-automation-master.md).
4. [Fetch automation FID-015](../fids/FID-2026-1104-015-content-fetch-automation-and-history.md).
5. [Persistent decisions FID-016](../fids/FID-2026-1104-016-persistent-content-model-decisions.md).
6. [Matching management FID-017](../fids/FID-2026-1104-017-content-matching-controls-and-review.md).
7. [Planning receipt](2026-11-04-content-automation-planning.md), including the
   defect reproduction, measured design corrections and process deviation.

Recheck HEAD and the real code before implementing. Re-audit a FID if changed
conditions invalidate its design. Read every touched file completely; use direct
file edits, never scripted transforms. Use Context7 for current library/platform
documentation and the installed Next.js 16 guides before framework changes.

## Product intent

The operator found two-day-old content and had to fetch every source manually.
They also found model associations in a recent log but no complete management
page, unclear matching timing, and no matching controls.

The persistence requirement is explicit: "The entire point of tagging it is so
the link is persistant".

- An accepted model association stays on the content and the same eligible exact
  model across refetch, rematch, settings changes and restart. It leaves the
  suggestions queue but remains in accepted/all-active inventory.
- Dismiss removes that association from active/public use and prevents automatic
  recreation. Retain an internal suppression decision, not an active link.
  Dismissing a model association does not delete the story.
- Topic tags and content-to-model associations are separate data. Do not turn
  this work into a paid classifier or a routing-identity rewrite.

## Current implementation and reproduced defects

Start with `lib/content/ingest.ts`, `linking.ts`, `policy.ts`,
`store/sources.ts`, `store/claims.ts`, `store/cycles.ts`, `store/links.ts`,
`store/item-writes.ts`, `store/items.ts`, and `lib/storage/schema/content.ts`.
Trace the existing cron/admin fetch/link routes and admin content page, then
item detail, model coverage, model-filtered Signal, counts and briefing.

Current fetches already write durable cycles and perform matching for every
returned item on every fetch. Reuse those authorities. The gaps are:

- POST-only cron, no repository scheduler artifact, and a content-secret versus
  Vercel `CRON_SECRET` mismatch. Live external cron was not inspected.
- Dashboard previews only eight cycles and 15 recently created model links.
- Automatic matches mark themselves reviewed; there is no explicit Accept.
- Dismiss deletes the row; another fetch recreates it.
- Empty matching results leave stale automatic links behind.
- Item detail can expose an unreviewed link excluded by model coverage.
- A title mentioning a suffixed model also matches the shorter sibling.
- The source attempt timestamp advances on failure; it is not last success.
- No stored-content rematch or catalog-change invalidation exists.

The planning receipt reproduces these defects with real stores in an in-memory
database. Those reproductions are a starting point for regression proofs.

## Ordered implementation

### First: FID-015 — fetching and history

Build additive policy/history storage, the shared bounded claim/runner path,
authenticated GET/POST cron, dashboard controls and complete fetch history.
Keep per-source intervals and fetch existing enabled sources fairly across ticks.
Manual fetching must use the same ownership path as scheduled fetching.

Recheck due/enabled status atomically at claim time. Bound the whole source,
including enrichment and writes; persist stage/cursor and primary membership
when work spans ticks. Budget interruption must not masquerade as an upstream
failure or disable a healthy source. Preserve history on deliberate source
deletion using source snapshots. Track attempt and success separately.

Prepare scheduler artifacts and an activation runbook. A stored enabled flag
does not establish that any hosted scheduler exists.

### Second: FID-016 — persistent decisions and visibility

Introduce suggested, auto_published, accepted, dismissed and retired states,
plus durable decision events and explicit Accept/Dismiss/Restore actions.
Migrate existing operator links to accepted; migrate machine-reviewed links to
automatic publication without inventing human acceptance or deleted dismissals.

Accepted/dismissed decisions dominate every machine path. Use the same item
lock and expected revisions for decisions and reconciliation; item fields and
topic tags must commit atomically. Model-scoped rematch must not retire other
models' automatic links. Keep exact SKU ids; free/paid/subscription products
remain distinct. Delisting preserves accepted records in admin.

Wire one public visibility/catalog-eligibility authority through every consumer.
Specifically test item detail, whose current path does not filter reviewed rows.

### Third: FID-017 — complete management and rematch

Build `/admin/content/links` with filters, stable pagination, all decision states,
content/model links, evidence, decision history and persistent accepted inventory.
Add versioned matching settings, precise model-scoped aliases and clear evidence
labels. Rule weights must not be presented as correctness probabilities.

Build a durable stored-content rematch job using materialized item membership,
pinned policy/catalog inputs, progress, cancellation and resumable fenced writes.
Do not fetch publishers to rematch stored content. Mark relevant catalog/alias
changes dirty transactionally; unchanged sync timestamps/prices enqueue nothing.
Preserve a 35-second fetch / 10-second rematch budget when both have work.

New detections default to review-required. Automatic publication is an explicit
dashboard option; still-matching legacy automatic links retain publication.
Matching-off does not erase accepted links or stop source fetching; global
automation pause stops new scheduled fetch and rematch admissions.

### Finally: FID-018 — integrated proof and closure

Run the master's complete cross-feature acceptance scenarios. Close each child
only after committed implementation and its declared gates exist, then archive
with CHANGELOG/session evidence. Close the master after all child implementation
obligations are satisfied. Keep live commissioning observations separate from
implementation closure under the existing auto-archive ruling.

## Required verification

The following are planned artifacts, not existing passing tests:

| Owner | Required suite |
| --- | --- |
| 015 | `tests/content-automation.test.mjs` |
| 015 | `tests/content-job-concurrency.test.mjs` |
| 016 | `tests/content-link-decisions.test.mjs` |
| 016 | `tests/content-link-concurrency.test.mjs` |
| 017 | `tests/content-match-management.test.mjs` |
| 017 | `tests/content-rematch.test.mjs` |

Register the two concurrency suites in
`scripts/postgres-concurrency-proof.mjs`'s TEST_FILES; require real independent
PostgreSQL connections and fail on skips. Creating a test file alone does not
wire the mandatory proof.

Add shared HTTP probes at `scripts/http-suite/content-checks.mjs` and invoke
them before the existing destructive `runChecks` block. Prove auth/origin guards,
settings persistence, historical pagination, decisions, jobs and public visibility.
Capture the browser receipt required by 017, using FID-009 infrastructure if
available; do not infer browser success from compilation.

Run each child's exact gates and the final `npm run verify` contract. Preserve
raw output, real exit codes, production call-graph evidence and implementation
commits. The quality ceiling is 400 lines; extend existing helpers and split
modules before exceeding it. No placeholders, secret exposure or attribution.

Tests must use disposable databases and fixture upstreams. Never point
schema-resetting HTTP suites at the application's configured database. Docker
or a safely provisioned disposable PostgreSQL database must be available for the
mandatory proof; the planning receipt does not establish either host's current
availability. Do not disable TLS verification to make provisioning pass.

## Last measured baseline

At the planning baseline (`f6d2a5b`; planning commit `3af1b1d` changes docs only):

- Focused existing content/identity/SKU tests: 55 pass, zero failures/skips.
- Full `npm test`: 1,019 total, 1,015 pass, zero failures, four PostgreSQL-only
  skips because no disposable `TEST_DATABASE_URL` was supplied.
- Check/lint/typecheck, build, quality, config check, attribution, repository and
  storage checks pass. Documentation review passes 163 structural checks.
- Full verify, real-PostgreSQL concurrency, HTTP/recovery/load gates and browser
  journeys were not run in the planning session. No planned behavior is verified.
- One 015 documentation pass exceeded the 10% cap; the receipt discloses it.
  Both final unchanged-document convergence passes measured 0% for all records.

Rerun verification for the implementation; these are historical receipts.

## Operator and workspace boundaries

The scheduler backend and Vercel tier are unconfirmed. Official documentation
checked during planning permits daily cron only on Hobby and minute-level cron
on Pro/Enterprise. Do not purchase a tier or quietly deploy an unsupported
five-minute expression. A supported external heartbeat can use the same endpoint.
Secret provisioning, hosted deployment and scheduler activation need the
operator's authorization; record two real heartbeats before claiming live refresh.

No wallet funding, real payment, paid inference or paid classifier is required.
The operator explicitly ruled that testing uses mocks/disposable providers
without spending provider-wallet funds. Keep the current hosting/database and
existing unrelated launch obligations.

Two pre-existing untracked files must remain untouched and unstaged:
`codex-session-01a1a700-9468-73d3-9e20-4dd3a01e06d0.md` and
`freebuff-chat-2026-11-03T12-54-56.217Z.md`.
Use explicit staging paths. The planning work was not pushed: Git-triggered
hosting means normal-main delivery can cause a deployment. Reconcile that
deployment boundary with the operator before pushing implementation changes.

## Starter for the next coding session

```text
Implement the content automation and persistent matching program in this repo.

Start by reading AGENTS.md and dev/echo-v0.1.2-single-agent.md completely.
Then read dev/session-summaries/2026-11-04-content-automation-implementation-handoff.md,
the planning receipt, SCOPE.md and the four converged FIDs 2026-1104-015 through
2026-1104-018. Verify the current code and plan conditions before editing.

This is the coding session: implement 015, then 016, then 017, and satisfy the
master 018. Record the new implementation authorization in SCOPE; the previous
planning-only boundary applied to the planning session. Accepted model links
must remain attached to content across automatic processing. Dismissals must
not be recreated automatically. Build the complete management inventory,
configurable recurring fetching/history and bounded stored-content rematching.

Follow single-agent ECHO, preserve unrelated work, run the declared gates and
real two-connection proofs, verify production callers and browser behavior,
and commit verified slices with explicit paths. Close/archive only with real
implementation and verification evidence. Use fixture providers and disposable
databases without wallet funding or real-money tests.

Do not deploy, activate a hosted scheduler, provision secrets, purchase services,
or push changes that trigger deployment without resolving those operator
boundaries. Confirm the scheduler backend/tier for commissioning while completing
the independent implementation work. Do not treat the planning receipts as
proof that these features already work.
```
