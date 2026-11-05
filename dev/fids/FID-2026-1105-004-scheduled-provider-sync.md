# FID: Scheduled provider sync and AIO trigger

**Filename:** `FID-2026-1105-004-scheduled-provider-sync.md`
**ID:** FID-2026-1105-004
**Severity:** medium
**Status:** fixed
**Created:** 2026-11-05 16:17
**Automation level:** 3
**YAGNI-Compliance:** Verified

> **Project application (savant-gateway).** This repository uses npm, not Bun,
> and it does not ship `fid:verify`, `quality:report` beyond `npm run quality`,
> `scope:check`, or `validate:repository`. The gates that actually exist are
> declared in `protocol.config.yaml` and repeated below. FID closure is checked
> by review against this template, the gate output, and the commit recorded in
> the FID. `implemented` is a step status, never a FID status. Use `converged`
> before implementation and close only after the code, the gates, and a local
> commit exist.

---

## Summary

Provider catalogs are refreshed automatically only as a side effect of a page
render. There is no scheduler entry point, so an idle gateway never refreshes a
provider, and the overview card labels disabled and keyless providers "sync
overdue" even though sync-all correctly skips them. The manual button is wired
to a sync-all alias but is labelled as a generic provider sync.

This design adds one authenticated endpoint for due providers; an explicit
**AIO sync** manual action that syncs every enabled provider's account and
catalog; truthful per-provider status derived from the existing `providersDue`
policy; and a Vercel Hobby daily schedule (`vercel.json`, `0 0 * * *`). The
operator confirmed Hobby daily on 2026-11-05. The code does **not** create an
in-process timer. Deployment, `CRON_SECRET` provisioning and the activation
receipt remain operator steps. The local implementation is complete and gated
below; no commit, deployment or activation has occurred.

## Environment

- **OS:** Windows (win32), commands run through Git Bash.
- **Language/Runtime:** Node.js `v24.21.0`; npm `12.2.1`; TypeScript strict;
  Next.js `16.4.3`; React `19.3.0`.
- **Tool Versions:** PostgreSQL 17.11 pinned through
  `@embedded-postgres/windows-x64`; PGlite 0.5.14 for unit fixtures;
  `node --test`; `npm run quality`.
- **Commit/State:** baseline commit `edde1c7`
  (`docs(fids): record FID-003 implementation commit`). The implementation is
  uncommitted in the working tree; the two untracked chat exports are
  untouched. No runtime secret, deployment or scheduler activation exists.

## Detailed Description

### Problem

1. **Automatic sync is render-triggered.** `getLandingData` and
   `getCatalogData` call `ensureProvidersFresh()` at
   `lib/storage/store/overview.ts:122` and `:137`. An idle deployment with no
   page views never checks a stale catalog. The operations runbook describes
   this as automatic without a scheduler (`docs/operations-runbook.md:39`),
   which is accurate but does not meet an unattended schedule requirement.
2. **No provider scheduler contract.** The only cron route is
   `/api/cron/content`, authenticated by `CONTENT_CRON_SECRET` or
   `CRON_SECRET` (`app/api/cron/content/route.ts:59-72`). There is no
   provider-specific endpoint, no method contract, no due-only scheduler path
   and no fail-closed secret for provider sync.
3. **The manual action is not named as one action.** The admin card's button
   posts to `/api/provider/sync`, which is a legacy alias for
   `syncAllEnabled` (`lib/provider.ts:5-6`). The card says "Sync every enabled
   provider" while the provider row action says "Sync"; operators reasonably
   read them as the same operation.
4. **The card's overdue rule disagrees with the sync policy.**
   `ProviderSyncCard` computes overdue locally at
   `components/admin/provider-sync-card.tsx:23-29` and renders it at `:53-55`.
   It ignores `enabled` and `configured`, while `providersDue` deliberately
   excludes both (`lib/provider-sync-policy.ts:36-53`). CommandCode (enabled,
   no key), Apixo and router.cheap (seeded disabled) therefore show "sync
   overdue" after a successful AIO sync; the button did exactly what the policy
   allows.
5. **The plan is now Hobby daily, but no schedule exists.** The operator
   confirmed Vercel Hobby on 2026-11-05 ("keep it on hobby schedule"). Hobby
   supports daily crons only (`docs/content-scheduler.md:57-58`), so a six-hour
   entry would be invalid. The Vercel project is `savant-gateway`; the
   repository still has no `vercel.json`. The schedule must be a daily cron,
   and the card must not imply a six-hour automatic check.

### Expected Behavior

- Vercel Hobby calls the endpoint once a day at 00:00 UTC. The endpoint
  refreshes every enabled, configured provider whose catalog is due.
- The same endpoint is triggerable by a scheduler or operator with a configured
  secret; missing or wrong credentials are refused before any database or
  upstream work.
- A manual AIO sync refreshes balance, subscription and catalog for every
  enabled provider, ignores the due clock, and reports the aggregate result
  plus warnings.
- Disabled providers and providers without a visible credential show
  disabled/no key. An enabled, configured provider that is stale shows
  `refresh due`, not `sync overdue`; this is a due state, not proof the daily
  cron failed.
- Repeated scheduled calls do not stampede an upstream: the existing
  per-provider lease remains authoritative. An explicit scheduler tick may
  bypass only the render path's per-process five-minute floor, not the interval
  or the lease.
- The UI reports last sync and due state, not scheduler health. No heartbeat
  table exists, so the card must not claim a scheduler is installed.
- The endpoint returns `503` until a secret is configured. A route that exists
  is not proof that a scheduler calls it.

### Root Cause

Freshness was implemented as a read-path optimization, not as a scheduled
operation. The card duplicated the overdue decision instead of consuming the
pure policy, and the button's label described a provider scope that its endpoint
had already generalized. The missing scheduler boundary was then confused with
a plan-specific hosting artifact; the operator has now confirmed Hobby daily,
so the artifact is a daily cron, not a six-hour assumption.

### Evidence

Code evidence, read on 2026-11-05:

```text
lib/storage/store/overview.ts:122,137  ensureProvidersFresh(db, { sync })
lib/storage/providers/freshness.ts:41   MIN_ATTEMPT_MS = 5 * 60 * 1000
lib/storage/providers/freshness.ts:76   refreshProvidersIfDue
lib/storage/providers/freshness.ts:89   five-minute floor
lib/storage/providers/freshness.ts:92   providersDue selection
lib/storage/providers/freshness.ts:110  claimProviderSync
lib/provider-sync-policy.ts:36          providersDue
lib/provider-sync-policy.ts:8           default 6-hour interval
components/admin/provider-sync-card.tsx:23  local overdue rule
components/admin/provider-sync-card.tsx:53  "sync overdue" badge
components/provider-sync.tsx:21         POST /api/provider/sync
app/api/provider/sync/route.ts:14       syncProvider() alias
lib/provider.ts:5-6                     syncAllEnabled as syncProvider
app/api/admin/providers/sync/route.ts:14 syncAllEnabled
lib/storage/providers/sync.ts:190       syncAllEnabled loop
app/api/cron/content/route.ts:59-72     cron secret / 401 / 503 pattern
docs/content-scheduler.md:57-58         Hobby daily-only limitation
docs/content-scheduler.md:67-68         do not commit a schedule yet
.env.example:75                         PROVIDER_SYNC_INTERVAL_HOURS=6
```

Observed operator state on 2026-11-05: the AIO action returned 42 imported
models and a `commandcode: COMMANDCODE_API_KEY is not configured` warning;
Savant showed a current `syncedAt`; CommandCode, Apixo and router.cheap showed
`last sync —` and `sync overdue`. The providers table seeds Apixo and
router.cheap with `enabled = 0`; CommandCode is `enabled = 1` with no configured
key. There is no `vercel.json` in the tree. The operator confirmed Hobby daily
on 2026-11-05; the planned implementation adds a daily cron and a schedule
config test, not a six-hour schedule.

## Impact Assessment

### Affected Components

- `lib/provider-sync-policy.ts` — secret policy and the existing due rule.
- `app/api/cron/providers/route.ts` — new authenticated scheduler endpoint.
- `lib/storage/providers/freshness.ts` — explicit scheduler tick option; the
  due interval and durable lease remain.
- `components/provider-sync.tsx` — endpoint selection and AIO notice.
- `components/admin/provider-sync-card.tsx` — policy-derived status and copy.
- `scripts/http-suite.mjs`, `scripts/http-suite/provider-cron-checks.mjs`,
  `scripts/http-suite/harness.mjs` — HTTP integration gate.
- `tests/provider-sync.test.mjs` — secret policy.
- `tests/provider-scheduler.test.mjs` — Hobby daily schedule guard.
- `vercel.json` — daily `0 0 * * *` Vercel cron.
- `.env.example`, `README.md`, `docs/provider-scheduler.md`,
  `docs/providers.md`, `docs/operations-runbook.md`, `docs/README.md` —
  operator contract.

All listed paths are written in the working tree; the implementation is
uncommitted.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [ ] High: Major feature broken, no workaround
- [x] Medium: an unauthenticated or duplicated scheduler can multiply metadata
  calls; a manual AIO can race the daily sync; the daily cron is implemented but
  deployment and activation are unproven.
- [ ] Low: Minor issue, cosmetic, or edge case

## Proposed Solution

### Approach

Keep one freshness truth. The scheduler and the render path both call
`refreshProvidersIfDue`, which already applies `providersDue`, the durable
`provider_sync_leases` claim and the public-catalog invalidation. Add only the
authenticated HTTP boundary and an explicit `force` option for a scheduler
tick. The manual AIO button continues to call `syncAllEnabled` through the
explicit admin endpoint; the card consumes `providersDue` instead of
reimplementing it.

The operator confirmed Hobby daily, so the implementation commits a single
daily `vercel.json` cron. The code does not start a timer. Deployment and
secret provisioning remain operator steps.

### Steps

1. **Secret policy.** Add `providerCronSecrets(env)` to
   `lib/provider-sync-policy.ts`. It returns the distinct, trimmed, non-empty
   values of `PROVIDER_CRON_SECRET` and `CRON_SECRET`, in that order. At least
   one is required. It never logs or returns a value outside this server-side
   comparison. Accepting both is deliberate: Vercel injects `CRON_SECRET`, while
   a generic scheduler may use the provider-specific name; a precedence rule
   would make one of them fail when both are set.
2. **Scheduler route.** Add `app/api/cron/providers/route.ts` with `GET` and
   `POST` sharing one handler, `runtime = "nodejs"`, `dynamic = "force-dynamic"`
   and `maxDuration = 60`. Authenticate with a timing-safe comparison of
   `Authorization: Bearer`, `x-provider-secret` or `x-cron-secret`. No secret:
   `503`. Wrong secret: `401`. On success, call
   `refreshProvidersIfDue(db, { sync: (slug) => syncProvider(slug), force: true })`
   and return `{ ok, attempted, intervalHours, providers }`, where `providers`
   is the same summary the card reads. No cache headers. A provider failure is
   swallowed by the existing freshness path and remains visible on that
   provider's row; the route does not return an upstream body.
3. **Explicit tick option.** Add `force?: boolean` to `ProviderSyncDeps` in
   `lib/storage/providers/freshness.ts`. When true, skip only the
   `now - state.lastAttempt < MIN_ATTEMPT_MS` check. `providersDue` still
   selects enabled, configured, stale providers; `claimProviderSync` still
   prevents a second process from running the same provider. The render path
   leaves `force` unset. This is the production caller for the new option.
4. **Manual AIO.** Extend `ProviderSyncButton` with an `endpoint` choice:
   `admin` posts to `/api/admin/providers/sync`; `legacy` keeps
   `/api/provider/sync`. The admin card passes `endpoint="admin"` and the label
   **AIO sync**. The success notice names the number of providers and models
   and preserves warnings. The dashboard hero keeps the legacy endpoint and its
   existing label.
5. **Truthful card.** Import `providersDue` in `ProviderSyncCard`; compute due
   state from `{ slug, enabled, configured, syncedAt }`. Render `disabled` for
   a disabled provider and no due badge for disabled or unconfigured rows.
   Render `refresh due` for an enabled, configured stale provider; do not use
   `sync overdue`, because there is no provider heartbeat. Show
   `enabled`/`disabled` beside the key state. The copy must say Vercel Hobby
   checks daily and a page render may refresh after 6h; it must not claim a
   six-hour scheduler.
6. **Tests.** Extend `tests/provider-sync.test.mjs` for the secret list:
   provider secret, platform fallback, both set, blank values and no secret.
   Add `tests/provider-scheduler.test.mjs` to assert `vercel.json` has exactly
   one cron, path `/api/cron/providers`, schedule `0 0 * * *`, and no sub-daily
   entry. Add `scripts/http-suite/provider-cron-checks.mjs` to prove `401` without a
   secret, `200` with it, a due provider's `synced_at` advances, an immediate
   second call is not due, and disabled/unconfigured providers are not
   attempted. Seed a disposable provider whose mock catalog is an explicit
   `data: []`; restore the mock state and delete the fixture in `finally`.
   Wire the module into `scripts/http-suite.mjs` before the page-render checks.
7. **Operator contract.** Document the endpoint, methods, secret sources,
   scheduler examples, activation receipt and failure semantics in
   `docs/provider-scheduler.md`; update the automatic-sync sections in
   `docs/providers.md` and `docs/operations-runbook.md`, the env inventory and
   the README table. The doc must state that Vercel Hobby checks daily, that
   the 6h interval is a due threshold, and that the card does not report
   scheduler health.
8. **Hobby daily schedule.** Add `vercel.json` with exactly one cron:
   `{ "crons": [{ "path": "/api/cron/providers", "schedule": "0 0 * * *" }] }`.
   This is the only automatic cadence; do not add a six-hour or other sub-daily
   entry. Set `CRON_SECRET` in the Vercel project; Vercel sends
   `Authorization: Bearer $CRON_SECRET`. `PROVIDER_CRON_SECRET` remains
   optional for a generic trigger. Deployment and secret provisioning are
   separate operator steps. After deployment, call the endpoint once, confirm
   `200` and a provider snapshot, then wait for the next daily run and verify
   `synced_at` advances.

### Verification

`tests/provider-sync.test.mjs` and `tests/provider-scheduler.test.mjs` are the
focused artifacts. The route and scheduler behavior are exercised by
`scripts/http-suite/provider-cron-checks.mjs` through `npm run test:http`.
No paid inference, provider registration, real scheduler, deployment or secret
was involved. The local implementation gates passed; the activation gates did
not run.

## Verification Gates

Planning gates for this design (run against the current tree):

- gate: lint — `npm run lint`
- gate: typecheck — `npm run typecheck`
- gate: repository:check — `npm run repository:check`
- gate: attribution — `npm run attribution`

Implementation gates, not run while this record is `converged`:

- gate: test tests/provider-sync.test.mjs — `node --test tests/provider-sync.test.mjs`
- gate: test tests/provider-scheduler.test.mjs — `node --test tests/provider-scheduler.test.mjs`
- gate: test — `npm test`
- gate: quality — `npm run quality`
- gate: build — `npm run build`
- gate: test:http — `npm run test:http`

### Verification Receipt

Planning receipt, 2026-11-05. The implementation receipt is intentionally
pending; a `converged` record must not claim code or a scheduler exists. The
following was run after the FID was registered in `dev/fids/README.md`, SCOPE
and the current-status index:

```text
repository-check: PASS (Node 24, 11 gates, 13 active FIDs, root links and current docs consistent)
repository:check exit=0
lint exit=0
typecheck exit=0 (Types generated successfully)
attribution-guard: PASS (no coding-agent credit found)
attribution-document-guard: PASS (no governed credit line)
attribution exit=0
implementation: not started
scheduler activation: not performed
```

Implementation receipt, 2026-11-05, against the uncommitted working tree:

```text
npm run lint exit=0
npm run typecheck exit=0 (Types generated successfully)
node --test tests/provider-sync.test.mjs tests/provider-scheduler.test.mjs
  -> 12 tests, 12 pass, 0 fail
npm test -> 1059 tests, 1052 pass, 7 skipped, 0 fail
  (the 7 skips are the mandatory TEST_DATABASE_URL concurrency races)
npm run quality -> PASS (400-line ceiling, 638 files scanned)
npm run build -> exit 0
node scripts/with-disposable-postgres.mjs -- bash -c 'npm run test:http'
  -> exit 0
  http-suite: provider scheduler contract PASS
  http-suite: 776 checks PASS
  trial-http-suite: all checks PASS
npm run repository:check -> PASS (Node 24, 11 gates, 13 active FIDs)
npm run attribution -> PASS (no coding-agent credit)
git diff --check -> exit 0
scheduler activation: not performed
```

The standalone `npm run test:http` on its default PGlite wire server is not a
valid receipt here: it failed the pre-existing `paid account limit holds across
different keys` check because PGlite's single connection loses concurrent
bucket updates. The same check passes under the repository's declared gate on
disposable native PostgreSQL, which is the command above. That limitation is
recorded here rather than hidden by a weakened assertion.

## Perfection Loop

### Sequential design trace

**Plan:** 10 thoughts. Subject: choose the scheduler boundary, authentication
and manual-trigger semantics that satisfy the request without assuming an
unconfirmed hosting plan.

#### Thought 1

The request has three distinct requirements: an automatic cadence, a manual
trigger, and an "AIO" action that covers every enabled provider. The current
tree satisfies only the third operationally: `syncAllEnabled` already loops
every enabled provider (`lib/storage/providers/sync.ts:190-210`), and the card
already posts to its alias (`components/provider-sync.tsx:21`). The gap is the
automatic boundary and the display truth, not a missing sync implementation.

#### Thought 2

Automatic refresh can be implemented by (A) a hosted scheduler calling an HTTP
endpoint, (B) a timer inside the Next.js process, or (C) only the existing
render path. C is not a schedule: `ensureProvidersFresh` is invoked by page
renders (`lib/storage/store/overview.ts:122,137`), and an idle deployment never
calls it. B is rejected by the operations runbook's external-monitor precedent
and by multi-instance/serverless duplication. A is the only branch that gives
an auditable cadence and can be triggered independently.

#### Branch A from 2

A hosted endpoint plus a committed `vercel.json` at `0 */6 * * *`.

#### Thought 3 (Branch A)

This branch is not deployable on the current evidence. `docs/content-scheduler.md:57-58`
says Vercel Hobby supports daily crons only; the project plan is not recorded
in the tree. `docs/content-scheduler.md:67-68` says not to commit a Vercel
schedule until the operator confirms the plan and authorizes deployment. A
six-hour schedule would assume Pro/Enterprise and silently create a cron the
operator did not approve. The initial draft made this exact mistake. Branch A
is rejected for this FID; it can be a later, operator-approved one-line
configuration change.

#### Branch B from 2

A scheduler-agnostic endpoint plus an activation contract. The code provides
`/api/cron/providers`; the operator chooses Vercel Cron, a generic cron, CI, or
another scheduler, supplies the secret, and confirms the cadence. The endpoint
fails closed with `503` until a secret exists. The repository does not commit a
plan-specific schedule.

#### Thought 4 (Branch B)

Branch B satisfies the request honestly. It makes the endpoint triggerable and
ready for an automatic schedule, but it does not claim the schedule is active.
This mirrors the content scheduler's contract (`docs/content-scheduler.md:1-18`)
and preserves the operator's deployment authority. The UI must therefore say
"when an external scheduler calls…", not "the scheduler is healthy"; there is
no provider heartbeat table to prove the latter.

#### Thought 5

Authentication must accept both `PROVIDER_CRON_SECRET` and `CRON_SECRET`, not
choose one by precedence. Vercel sends `Authorization: Bearer $CRON_SECRET`;
a generic scheduler may use the provider-specific header. If both are set, a
single-value precedence function would reject the other. A list of valid
secrets is simpler and safer. No secret means `503`; a wrong secret means `401`;
comparison is timing-safe; the route performs no database work before auth.

#### Thought 6

A scheduler tick must not be swallowed by the render path's five-minute floor.
`refreshProvidersIfDue` returns `[]` when `now - state.lastAttempt < MIN_ATTEMPT_MS`
(`lib/storage/providers/freshness.ts:41,89`). If a page render tried and failed
at 11:58, a 12:00 scheduler tick would be skipped and the next chance would be
18:00. Add `force` to bypass only that per-process floor. The due interval and
`claimProviderSync` remain, so the provider must still be stale and another
process cannot run the same provider.

#### Thought 7

Manual AIO should use the explicit admin endpoint
(`app/api/admin/providers/sync/route.ts:14`), not the legacy alias, and should
keep `syncAllEnabled`: it deliberately includes every enabled provider and
reports keyless warnings. That path has no lease (`lib/storage/providers/sync.ts:190-210`),
so a manual click can race a scheduler. The writes are idempotent, but the
upstream metadata reads can duplicate. This is an explicit operator action and
a documented residual, not a silent claim that the scheduler lease covers it.
Adding leases to the manual path is a separate hardening change; it is not
required to deliver the requested AIO control.

#### Thought 8

The card must use `providersDue`, not its local overdue predicate. That policy
already excludes disabled and unconfigured providers
(`lib/provider-sync-policy.ts:36-53`). The card can still show `disabled` and
`no key`; it simply must not label those rows overdue. The card's `now` is
captured at render, so a long-open page can be slightly stale; that is existing
behavior and not a reason to add a client timer.

#### Thought 9

The tests must prove the failure boundaries, not just the happy path: missing
secret, wrong secret, due provider, immediate second call, disabled provider,
keyless provider, and a failed sync that leaves `synced_at` unchanged. A
disposable provider with an explicit empty catalog (`data: []`) updates the
provider timestamp without adding models. The HTTP fixture must restore the
mock state and delete the provider in `finally`, or later catalog checks will
see a foreign row. The unit test covers the secret list; the HTTP suite covers
the route and policy integration.

#### Thought 10

The verification gate must distinguish the design pass from implementation.
`repository:check` proves the FID is registered and the promised test path
exists. Lint and typecheck prove the planning tree is clean. The implementation
gates (`npm test`, `quality`, `build`, `test:http`) remain pending because no
route, UI or test code is written. The schedule activation is a further
operator receipt, not a development gate.

#### Final (pre-operator input)

Choose Branch B. Implement an authenticated, scheduler-agnostic
`/api/cron/providers` endpoint; accept both cron secrets; add a `force` option
for explicit ticks; keep the due interval and durable lease; route the admin
**AIO sync** button through the explicit sync-all endpoint; derive card status
from `providersDue`. Commit no `vercel.json` and no in-process timer. Treat the
hosting plan, scheduler, secret, deployment and activation receipt as operator
inputs. Branch A is rejected until those inputs exist; the timer branch is
rejected by the serverless/multi-instance contract.

The operator then confirmed Hobby daily. Loop 4 reopens only the schedule
artifact: the implementation now commits a daily `vercel.json` and the card
uses `refresh due`. The rest of this Final stands.

### Loop 1 — RED

- **RED:** The initial draft proposed a six-hour `vercel.json` despite
  `docs/content-scheduler.md:57-58,67-68` and the absence of a confirmed plan.
  It used a single-secret precedence rule that would fail Vercel when both
  names were configured. It claimed the five-minute floor remained in force
  without explaining how a scheduled tick could avoid being swallowed. Its risk
  section claimed the AIO path would not bypass a lease, but
  `syncAllEnabled` has no lease. The card copy could imply an installed
  scheduler, and the schedule artifact was listed as an affected component.
- **GREEN:** Replaced the committed cron with a scheduler-agnostic endpoint and
  an activation contract; switched to a list of accepted secrets; added
  `force` with the interval and lease preserved; documented the manual AIO race
  as a residual; removed `vercel.json`; and required the card to describe an
  external scheduler rather than a healthy one.
- **AUDIT:** `lib/storage/providers/freshness.ts:76-110` shows the due selection,
  five-minute floor and lease claim. `lib/provider-sync-policy.ts:36-53` shows
  the disabled/unconfigured exclusions. `lib/storage/providers/sync.ts:190-210`
  shows `syncAllEnabled` has no lease. `docs/content-scheduler.md:57-68`
  confirms the plan constraint. `components/admin/provider-sync-card.tsx:23-55`
  confirms the local overdue duplication. `git status` shows no `vercel.json`.
- **ADVERSARIAL:** A leaked scheduler secret can call the endpoint repeatedly;
  `force` bypasses only the per-process floor, so an operator must choose a
  sane cadence. A manual AIO can race a scheduled run; the writes are
  idempotent but metadata calls duplicate. A serverless invocation can time out
  mid-provider; the lease expires and the next tick reclaims it. A 200 is a
  heartbeat, not proof every provider synced.
- **CHANGE DELTA:** Initial draft was 14,963 characters; the design repair
  ended at 31,349 characters. The replacement delta was +16,386 characters
  (+109.5%). This was a template and design repair, not a bounded loop pass,
  and it exceeded the 10% circuit breaker; it is not claimed as compliant.

### Loop 2 — Independent audit and self-correction

- **RED:** The new route has no in-repository caller; it is an HTTP boundary
  invoked by an external scheduler. The protocol requires production call-graph
  evidence for new functions. The route itself is the production caller of
  `providerCronSecrets`, `force` and the existing `refreshProvidersIfDue`; the
  external scheduler is the caller of the route. This must be stated rather
  than pretending an internal page invokes it.
- **GREEN:** The design names the external scheduler as the route's caller and
  the route as the caller of the new policy/option. The render path keeps
  `force` unset, so the new option cannot change page behavior.
- **AUDIT:** `app/api/cron/content/route.ts:59-72` is the established HTTP
  caller pattern. The route is a Next.js route handler; its caller is the
  scheduler request, not a server component. The `force` option is referenced
  only by the planned route; the render entry point
  (`lib/storage/providers/freshness.ts:157-163`) does not set it.
- **ADVERSARIAL:** A future internal caller could pass `force: true` and bypass
  the floor; the field is deliberately documented as an explicit scheduler
  option, not a general default. A scheduler with a 1-minute cadence would
  bypass the floor and retry a failing provider every minute; the docs must
  recommend a cadence no shorter than the five-minute floor. The durable lease
  prevents concurrent runs, not repeated sequential failures.
- **CHANGE DELTA:** The receipt and audit corrections are measured in the loop
  receipt below; they are below the 10% cap.

### Loop 3 — Final convergence

- **RED:** Three residual risks remain: the operator has not confirmed a
  scheduler plan or secret; a manual AIO can duplicate a scheduled metadata
  read; and a serverless timeout can leave a lease until expiry. None is a
  reason to invent a plan or claim a scheduler exists.
- **GREEN:** The design fails closed without a secret, does not commit a
  schedule, documents the manual race, and relies on the existing lease and
  next-tick recovery. The card is explicitly not a scheduler-health signal.
- **AUDIT:** The design no longer references a nonexistent `vercel.json`; the
  existing paths in Affected Components are present; the planned route and HTTP
  fixture are named as planned. The planning gates are the only claims until
  implementation. No code was modified in this pass.
- **ADVERSARIAL:** A future operator may add a schedule and a secret without
  observing a successful call; the activation receipt requires a real `200`, a
  provider snapshot, and a later `synced_at` advance. A future manual-lease
  change would invalidate the residual note and needs its own FID.
- **CHANGE DELTA:** 0.0%; no actionable improvement after the Loop 2 correction.

### Loop 4 — Operator confirmation: Hobby daily

- **RED:** The previous Final rejected a committed schedule because the plan was
  unconfirmed. The operator has now confirmed Hobby daily. Leaving the FID
  scheduler-agnostic would not deliver the requested automatic schedule; adding
  a six-hour cron would violate Hobby. The card's `sync overdue` wording also
  conflicts with a daily cadence and no heartbeat.
- **GREEN:** Adopt one Vercel Hobby daily cron at `0 0 * * *`; add `vercel.json`
  to the implementation; keep the endpoint generic and triggerable; change the
  card to `refresh due`; add a schedule-config test; keep deployment, secret
  provisioning and activation as operator steps. This supersedes Loop 3's
  no-schedule conclusion, which was conditional on the unconfirmed plan.
- **AUDIT:** `docs/content-scheduler.md:57-58` confirms Hobby daily only. The
  operator's 2026-11-05 instruction is the plan input. There is no current
  `vercel.json`. `providersDue` still uses the 6h threshold
  (`lib/provider-sync-policy.ts:36-53`), so a daily cron can find providers due
  while page renders may refresh sooner. No sub-daily schedule is proposed.
- **ADVERSARIAL:** A daily cron means up to 24h between automatic checks; this
  is the Hobby constraint, not a hidden six-hour promise. A missed midnight run
  is caught by the next daily run; a manual AIO can still race the cron. The
  endpoint returns `503` without `CRON_SECRET`; the schedule existing in the
  repository is not proof the deployment has the secret or is active.
- **CHANGE DELTA:** Measured in the loop receipt below; this is the
  operator-input revision, not a new implementation claim.

### Measured Loop Receipt

- Initial draft → converged design: 14,963 → 31,349 characters (+16,386,
  +109.5%). This was a template/design repair, not a bounded pass.
- Loop 2 receipt/audit corrections: 31,349 → 32,113 characters (+764,
  +2.4%); within the 10% cap. The final receipt annotation changes the byte
  count by less than 0.5% and is outside the design delta.
- Loop 3 final audit: 0 characters changed; no actionable improvement.
- Loop 4 Hobby revision: 32,224 → 34,872 characters (+2,648, +8.2%); within
  the 10% cap. The final receipt annotation is under 0.5% and outside the
  design delta.

### Missed Questions

1. **Is a committed `vercel.json` required to satisfy "automatic"?** Yes, now
   that the operator confirmed Hobby daily. The file specifies `0 0 * * *`;
   deployment and `CRON_SECRET` remain separate activation steps. A six-hour
   entry is not valid on Hobby.
2. **Does accepting both secrets weaken security?** No. Both are server-side
   operator secrets; accepting either is an availability choice, not an
   unauthenticated path. No secret still returns `503`.
3. **Should the scheduler sync all enabled providers or only due ones?** Only
   due ones. AIO is the explicit manual override; the scheduler honors
   `PROVIDER_SYNC_INTERVAL_HOURS` and the lease.
4. **Does this spend provider credits?** Catalog and balance/subscription
   reads are metadata calls, not inference. The existing sync path is reused;
   no chat completion is made.
5. **What happens with no secret configured?** The endpoint returns `503` and
   performs no work. That is a deployment misconfiguration, not a pass.
6. **Can Vercel and a generic scheduler both work?** Yes; set `CRON_SECRET` for
   Vercel and `PROVIDER_CRON_SECRET` for the custom scheduler, or use one value
   for both. The route accepts either configured value.
7. **Can a manual AIO race the scheduler?** Yes. `syncAllEnabled` has no lease;
   the scheduler lease coordinates scheduled runs only. The writes are
   idempotent, but upstream metadata reads can duplicate. This is recorded as a
   residual; a manual-lease change is a separate hardening decision.
8. **Is a new database table needed?** No. The existing
   `provider_sync_leases` row and `providers.synced_at` are sufficient. No
   attempt-history table or scheduler heartbeat is introduced.
9. **How do we know the scheduler is healthy?** We do not. There is no
   provider run-history table. The activation receipt requires an observed
   call and a later `synced_at` advance; the card only shows last sync.
10. **What if a provider fails during a scheduled run?** The freshness path
    swallows the failure, the provider row records it, and `synced_at` does not
    advance. The route returns `200` with the attempted slug; the next tick is
    the retry. A 200 is not a per-provider success claim.
11. **Does the daily cron check every 6h?** No. Hobby cannot. The 6h value is a
    due threshold; the daily cron is the automatic floor, and page renders may
    refresh sooner. The card must say daily.

### Implementation Evidence (REQUIRED for `closed`)

- [ ] **Commit SHA:** Not created. The implementation is in the working tree;
  this record stays `fixed` until a local commit exists.
- [x] **File:line ranges:** `app/api/cron/providers/route.ts:48,71-73,112-118`;
  `lib/provider-sync-policy.ts:61-70`;
  `lib/storage/providers/freshness.ts:75,96`;
  `components/provider-sync.tsx:9-27`;
  `components/admin/provider-sync-card.tsx:23,36,53,73`;
  `scripts/http-suite.mjs:27,44,115-118,153-157`;
  `scripts/http-suite/harness.mjs:339`;
  `scripts/http-suite/provider-cron-checks.mjs:13-197`;
  `tests/provider-sync.test.mjs:72`; `tests/provider-scheduler.test.mjs:5`;
  `vercel.json:3-8`.
- [x] **Gate output:** Pasted in the implementation receipt above; lint,
  typecheck, 12 focused tests, 1059 unit tests, quality, build, the native-PG
  HTTP suite (776 + trial), repository check and attribution pass.
- [x] **Reproducibility:** `git diff` shows the scheduler policy, route,
  freshness option, UI, schedule and tests; the HTTP fixture seeds and deletes
  its own provider in `finally`.
- [x] **Step statuses:** Steps 1–8 are implemented; activation (deployment,
  secret, observed run) remains operator work and is not claimed.

### Code Verification Evidence

- [x] Existing files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution: the route, `force` tick,
  AIO endpoint, policy-derived card, daily cron and tests are present.
- [x] Typecheck/tests/lint pass with pasted tool output.
- [x] Production call-graph evidence: Vercel Cron calls
  `/api/cron/providers`; the route calls `providerCronSecrets`,
  `refreshProvidersIfDue(db, { force: true })` and `syncProvider`; the admin
  card calls `/api/admin/providers/sync` through `ProviderSyncButton`.
- [x] FID status reflects the actual state: `fixed`, uncommitted, not activated.

## Resolution

- **Closed Date:**
- **Fix Description:**
- **Tests Added:**
- **Verification Evidence:**
- **Archived:**

## Non-Goals

- No in-process timer; a second process or restart must not duplicate scheduled
  runs.
- No sub-daily Vercel schedule; the Hobby daily `0 0 * * *` is the only
  automatic cadence.
- No deployment or activation receipt in this pass.
- No secret provisioning, provider activation, paid inference, deployment or
  scheduler activation in this pass.
- No lease around the manual AIO path; the duplicate-read race is recorded.
- No change to the free/paid routing, settlement or publication rules.
- No provider run-history or scheduler-heartbeat table.

## Lessons Learned

A read-path refresh is not a schedule. The operator needs one named endpoint
that a scheduler can authenticate to, and the UI must use the same due policy
the scheduler uses or it will call correctly skipped providers overdue. A
schedule artifact is a deployment-plan decision: once the operator confirms
Hobby, the daily `0 0 * * *` artifact is the correct contract, not a six-hour
assumption.
