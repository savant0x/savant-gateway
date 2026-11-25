# FID register

**Last folder audit:** 2026-11-24 (FID folder audit). This page
indexes the working set; each FID owns its own status, evidence and resolution.
Current counts: 13 active / 22, 196 archived, 200 allocated.

## Layout

- `FID-YYYY-MMDD-NNN-<title>.md` — active work only.
- `archive/` — records whose implementation and closure evidence are complete.
  An archived record can still name a live external acceptance gap; its status
  is `closed`, not a claim that every launch obligation is discharged.
- `audit/` — dated, repository-wide audit baselines. These are not FIDs.
- `../tracking/internal-followups.json` — follow-up items that outlive a FID.

## Active queue

| ID | Title | Status | Next action |
| --- | --- | --- | --- |
| [2026-1124-006](FID-2026-1124-006-provider-registration-surface.md) | Provider registration surface cannot express what a provider needs | converged | Implement: conservative capability defaults, `requiresModelReview` in the input and console, editable headers, delete hygiene. |
| [2026-1124-005](FID-2026-1124-005-catalog-gateway-query-cost.md) | Catalog and gateway query cost after multi-provider onboarding | converged | Implement the five measured slices; each has its own test and commit. |
| [043](FID-2026-1030-043-launch-master.md) | Master launch contract and dependency register | converged | Keep coverage, ordering and release decisions current. |
| [062](FID-2026-1030-062-launch-acceptance-and-rollout.md) | Real launch acceptance, controlled rollout and rollback | converged | Discharge the dated external receipt items 1–8; launch remains no-go. Item 1 (NOWPayments payment/IPN) is operator-accepted as an assumption, not verified. |
| [068](FID-2026-1030-068-usdc-receive-lane.md) | Direct-to-wallet USDC receive lane | fixed | Operator inputs still gate the receive lane; re-read the record before acting. |
| [127](FID-2026-1103-127-real-launch-acceptance-receipt.md) | Real launch acceptance receipt | fixed | Operator records the five observations (`payment`, `recovery`, `alert`, `load`, `rollback`) and a go pinned to the release SHA, then runs `npm run receipt:launch`. |
| [137](FID-2026-1103-137-product-hardening-and-install-order-master.md) | Product hardening and install-order master | converged | Children 126, 128–136 and 141 are closed and archived; only 127 remains, so the master closes after its operator observations and go decision. |
| [2026-1104-011](FID-2026-1104-011-policy-v1-2-publication.md) | Policy v1.2 for the current service surface | converged | Operator approves the recipient inventory; worker drafts v1.2 and the acceptance bump. |
| [2026-1104-016](FID-2026-1104-016-persistent-content-model-decisions.md) | Persistent content/model acceptance and dismissal | fixed | Implementation landed at `3f5a045` (durable states, revision-guarded decisions, decision log, one visibility predicate); the two-connection link-decision race passes on 2026-11-24. Closure awaits a real-browser exercise of accept/dismiss/restore. |
| [2026-1104-017](FID-2026-1104-017-content-matching-controls-and-review.md) | Full linked-content management, settings and rematch | fixed | Implementation landed at `6cb7486` and `1c4c2a5` (keyset inventory, policy/aliases, cancellable rematch, invalidation). Closure still needs pinned job snapshots, per-item retry scopes and HTTP/browser receipts. |
| [2026-1104-018](FID-2026-1104-018-content-automation-master.md) | Content automation and persistent matching master | converged | Child 015 is `closed`; 016 and 017 are `fixed` (`3f5a045`, `6cb7486`, `1c4c2a5`) and still owe proof. The master closes on those plus the operator's scheduler backend, secret and hosted-tick authorization. |
| [2026-1110-002](FID-2026-1110-002-identity-calibration-lab.md) | Identity calibration lab and measured certificate | converged | Steps 1–4 are committed (`d66a538`, `b884984`, `1f75c44`; step 4 in `495e8b3`, plus its proxy script under [2026-1122-001](archive/FID-2026-1122-001-commit-calibration-proxy.md)). Step 5, collection, is next and needs an operator-supplied upstream; then the certificate path. |
| [2026-1120-001](FID-2026-1120-001-inferhub-upstream-onboarding.md) | InferHub upstream onboarding | fixed | Steps 1, 2, 3, 4 and 8 are done (`ed8812a`, `495e8b3`, `b159ba0`): the row is seeded disabled, review-required and resale-restricted. Steps 5–7 stay blocked on funding and a measured figure. |

### Closed in the 2026-11-24 admin and default-provider commits

[2026-1124-001](archive/FID-2026-1124-001-admin-console-clarity.md) is `closed`. A read-only pass over all 17 `/admin` routes fixed seven presentation and payload faults without touching a price, markup, guard or settlement rule, against the review baseline at [audit/2026-11-24-admin-surface-review.md](audit/2026-11-24-admin-surface-review.md): `/admin/showcase` explains its switch instead of 404ing, the overview tiles name the quantities they count, a review-required provider's chat-decision backlog appears on its row, Delete is offered on every non-default row, `/admin/pricing` pages both tables and ships a trimmed row shape (1,104 kB → 347 kB), and the 30-day total has one name; 3 new cases, 12/12 gates and 1267/1267 tests.

[2026-1124-002](archive/FID-2026-1124-002-default-provider.md) is `closed` at implementation `f2e1a53`. The default is `providers.is_default` with a partial unique index that allows at most one holder, not a constant; **Make default** moves it and reports the measured published-row count on each side, the delete guard refuses only the current default, and the write path is unchanged. 10 new cases, 12/12 gates and 1277/1277 tests, plus a live probe of the route's 404/400/401 answers. Its "published at the next sync" consequence is retracted by [2026-1124-004](FID-2026-1124-004-default-provider-namespace-migration.md): the first sync after a switch collides on `models_upstream_idx` until the switch-time re-key lands.

### Closed in the 2026-11-22 security and bulk-decision commits

[2026-1122-006](archive/FID-2026-1122-006-next-security-upgrade.md) is `closed`. `next upgrade --agent=security` moved 16.4.3 → 16.4.6; duplicate checks were empty, and 12/12 gates with 1240/1240 tests passed in the upgrade worktree.

[2026-1122-007](archive/FID-2026-1122-007-bulk-chat-decisions.md) is `closed`. The review panel wrote one decision per click, so a 281-row catalog could not realistically be decided; bulk actions now record one row per model in a single transaction with one republish, still operator-sourced and individually overridable. 5 PostgreSQL cases, 12/12 gates and 1245/1245 tests.

### Closed in the 2026-11-25 provider-health commit

[2026-1124-003](archive/FID-2026-1124-003-non-subscription-provider-health.md) is
`closed`. A provider registered with `supports_subscription = 0` was treated as a
failed check: `readRuntime` wrote the sentinel `"Provider does not expose
quota."` into `quota_error` on every observation, `quotaIsCurrent` therefore
refused forever, and every completion routed to that provider paid a lease
claim, a live balance request and two `providers` writes on the critical path.
The same row was counted `errored`, so `/admin/operations` raised a permanent
critical incident for a provider working as designed. Absence of the capability
is now carried only by the capability flag; `providerObservationIsCurrent`
judges metered providers by quota, wallet-only providers by a recent error-free
balance, and an account that publishes neither as never stale. The snapshot
counts those rows in `quota.unsupported` instead of `unknown`/`errored`, and the
panel divides by the quota-reporting count. 5 new cases; `npm run verify` PASS
12/12 gates with 1287/1287 tests and PostgreSQL 20/20.

### Closed in the 2026-11-25 provider re-key commit

[2026-1124-004](archive/FID-2026-1124-004-default-provider-namespace-migration.md) is `closed` at implementation `a629d38`. A flag-only switch left `models.id` disagreeing with `models_upstream_idx`, so the next sync of either provider raised `23505` and rolled back, and the override lookup could apply one model's manual group and prices to another. The switch now re-keys both providers inside the existing transaction through a temporary namespace, moves plan and subscription entitlements, watches, content links and showcase bindings with the model, keeps usage and decision history under the recorded id, and republishes routes; override preservation is keyed on `(upstream_slug, upstream_id)` and scoped to the syncing provider. 5 new cases; `npm run verify` PASS 12/12 gates with 1282/1282 tests and PostgreSQL 20/20.

### Closed in the 2026-11-24 register audit

[2026-1104-015](archive/FID-2026-1104-015-content-fetch-automation-and-history.md) is
`closed` at implementation `dbaa033`. The record had held closure on a
disposable-PostgreSQL ownership proof, a full HTTP gate pass and a hosted
heartbeat. The first two now exist: `npm run test:postgres` PASS on a disposable
PostgreSQL 17.11.0 cluster with `tests/content-job-concurrency.test.mjs` running
under `CONTENT_CONCURRENCY_REQUIRED=1` ("two connections cannot claim one due
source twice", 1 test, 0 skipped), and the 2026-11-24T20:29Z `npm run verify`
receipt is 12/12 gates with 1277/1277 tests, PostgreSQL 20/20 and both HTTP
suites PASS. The hosted heartbeat is an operator activation input and is tracked
as `FID-2026-1104-015-LIVE`; no automatic fetching is claimed in production.

### Closed in the 2026-11-23 provider-switch commit

[2026-1123-003](archive/FID-2026-1123-003-provider-model-switches.md) is `closed` at
`f875bb9`. Switching a provider's catalog meant one press per row and a refusal
spoken one toast at a time. `/admin/catalog` now selects rows and applies a bulk
Enable/Disable through the same guard the single button uses, reporting every
refused row with its reason. The same review found the `/admin/providers`
**Status** column rendering the quota probe's stored status, so a persisted
disable still read `active`; the column now reports the switch and names health
separately.

### Closed in the 2026-11-23 catalog-preview commit

[2026-1123-002](archive/FID-2026-1123-002-provider-catalog-preview.md) is `closed` at `fecc7f1`.
Every catalog read required the provider's key, so a provider with a public `/v1/models` showed
nothing before purchase. Preview now reads with the credential when this runtime has one and
without it when not, and reports the row, import and refusal counts from the same builder the
importer uses. It takes no database handle, so nothing is written. Live: 531 upstream rows →
272 importable, identical keyed and keyless, with the catalog count and `synced_at` unchanged.

### Closed in the 2026-11-23 content-linking commit

[2026-1123-001](archive/FID-2026-1123-001-content-model-link-precision.md) is `closed`. The
matcher was literal, unmeasured and wrong in two directions: older generations linked whenever a
newer one was discussed, and one headline produced up to ten near-identical cards for one model
sold under several provider prefixes. A committed 21-headline corpus measured 11/21 failures at
RED and passes 21/21 today; longest-match suppression, a version-continuation guard,
family-derived alias forms, body evidence for every kind and read-time grouping by
`canonicalModelKey` did the work. Live render: seven links produced three cards. `npm run verify`
PASS, 1251/1251 tests.

### Closed in the 2026-11-22 provider-key commit

[2026-1122-005](archive/FID-2026-1122-005-provider-key-operability.md) is `closed` at `ce6cad7`.
The operator report "the key never sticks" reproduced as three defects: a field with no stated
purpose, a pasted secret refused by a rule instead of by name, and an enable that left an empty
catalog until the next cron tick. Enabling now reads the catalog once and reports the count; a
failed read saves the configuration and says to retry with **Sync**. `npm run verify` PASS,
1240/1240 tests; the record keeps the two `repository:check` failures and the useless `"Sync
failed"` message that the live probe exposed.

### Closed in the 2026-11-22 vendor-groups commit

[2026-1122-004](archive/FID-2026-1122-004-vendor-catalog-groups.md) is `closed` at implementation
`4bdc562`. A provider names its prefix-group document in `catalog_url`, sync stores a per-prefix
snapshot in `provider_catalog_groups`, and `/admin/catalog` shows pooled capacity and every prefix
whose system prompt the vendor rewrites — as a fact sheet that no gateway, pricing or prompt path
reads. `npm run verify` PASS, 1231/1231 tests; the record names the defect no test caught (the admin
form did not carry the new field and would have erased it on save) and the residual limits (no
snapshot before a sync, one shape family, vendor-reported capacity).

### Closed in the 2026-11-22 provider-cost commit

[2026-1122-003](archive/FID-2026-1122-003-provider-cost-persistence.md) is `closed` at
implementation `16588ef`. It parses the provider's own `usage.cost` into micro-dollars, stores it as
`usage_events.provider_cost_micros` beside the price-table figure, flags a disagreement in the
admin overview, and deliberately keeps billing on the price table. `npm run verify` PASS, 1216/1216
tests; the record names its residual limits (fixtures rather than a funded upstream, a heuristic
ceiling, and no aggregate drift view).

### Closed in the 2026-11-22 operational integration commit

[2026-1122-002](archive/FID-2026-1122-002-inferhub-operational-integration.md) is `closed` at
implementation `a1b51d4`. It added a per-provider `balance_url` so the InferHub wallet is read at
`https://inferhub.dev/api/me`, mapped an upstream 402 to our own 503, made an in-stream provider
error settle `error` without relaying the provider's text, and serialised schema migrations after
the gate caught a deadlocked `ensureColumn`. `npm run verify` PASS, 1203/1203 tests. The audit's
remaining findings are IA5–IA7 in [`SCOPE.md`](../../SCOPE.md).

### Closed in the 2026-11-22 calibration proxy commit

[2026-1122-001](archive/FID-2026-1122-001-commit-calibration-proxy.md) is `closed` at
implementation commit `3c4975d`. `tests/identity-calibration-proxy.test.mjs` was committed in
`495e8b3` while `scripts/identity-calibration-proxy.mjs`, which it imports at line 21, stayed
untracked, so `main` failed the test gate from a clean checkout. The script is committed with
no source-line change; `node --test tests/identity-calibration-proxy.test.mjs` is 13/13 in a
worktree of `3c4975d` with an empty `git status`, `npm test` is 1,191 tests / 0 fail. The
committed test had been counted in the 1,191-test receipts, so those receipts were sound only
in a tree that held the untracked file; this fixes the tree, not the claims.

[2026-1120-002](archive/FID-2026-1120-002-catalog-normalization-layer.md) is `closed` at
implementation commit `b159ba0`. The import path normalizes before it builds: shape knowledge
lives in `lib/providers/normalize/`, matched by content rather than provider slug; upstream
aliases and declared non-text rows are dropped and reported in the sync warnings; families
derive from the leaf id; and the metadata overlay's owner is chosen in the wiring where its URL
lives. `tests/catalog-normalize.test.mjs` is 12/12 and includes a whole-row parity test against
the recorded default-provider payload. `npm test` PASS with 1,169 passing and zero failures;
`test:http` PASS across both suites. Two behaviours changed deliberately and are documented in
the record: alias rows are no longer imported, and `cc/claude-opus-5-5` is family Claude rather
than "Cc".

### Closed in the 2026-11-10 research document repair

[2026-1110-001](archive/FID-2026-1110-001-research-document-integrity.md) is
`closed` at implementation commit `f6ecba3`. Both research documents carry
provenance and an evidence-status table; the strategy P&L is recomputed by one
method and its retail price reconciled; the persistence and payment sections are
marked superseded against the implemented design; the non-verifying canary daemon
is deleted; and `tests/research-documents.test.mjs` (7/7) guards provenance,
placeholder targets, fences, escape cleanliness and the P&L identity.
`npm test` PASS with 1,118 passing and zero failures. Thirteen orphan base64
image definitions remain at the ends of the two files and are recorded as an
operator-approved residual; no formula is carried as an image any more.

### Closed in the 2026-11-06 router.cheap evidence closure

[2026-1105-003](archive/FID-2026-1105-003-router-cheap-provider.md) is `closed`
at implementation commits `6cdfc80` (eligibility enforcement) and `192b7b0`
(read-only three-source review evidence). The admin review now shows account,
reseller and public evidence without importing a price or evaluating an
expression. `npm run verify` PASS 12/12 gates with 1,127/1,127 tests,
PostgreSQL 20/20, HTTP 758 checks plus trial, recovery, quality and build.
The operator confirmed on 2026-11-06 that resale permission is clear: access is
key-authenticated and gated. Root-key billing, serving-source and request-time
price observations remain `FID-2026-1105-003-LIVE` in
`../tracking/internal-followups.json`.

### Closed in the 2026-11-06 scheduled-sync closure

[2026-1105-004](archive/FID-2026-1105-004-scheduled-provider-sync.md) is
`closed` at implementation commit `15d01b4`. The authenticated due-only
endpoint, AIO action, policy-derived status, daily Vercel Hobby cron and
scheduler contract are implemented; deployment
`dpl_53PM1vwqGkVk61xzaCWXfruwL2CC` has `CRON_SECRET` and one registered cron,
and the route returned `401` unauthenticated / `200` authenticated. No provider
was due during activation, so the first scheduled due-provider refresh remains
`FID-2026-1105-004-LIVE` in `../tracking/internal-followups.json`; it is not a
closure claim.

### 2026-11-06 register audit

- FID-2026-1106-002 closed at commit `64a30f0` and moved to `archive/`. The
  count is 12 active, 177 archived and 189 allocated. The folder audit is
  [`../audits/2026-11-06-fid-folder-audit.md`](../audits/2026-11-06-fid-folder-audit.md).
- FID-2026-1106-001 was reopened after its first archive because the browser
  journey did not assert newest-first order or stored-over-GitHub image
  precedence. It closed again at implementation commit `95ed201` with a fresh
  14/14 browser run on build `OMN5qQvSNGIvDZtz6wII7` and a 12/12 gate run. The
  current count is 12 active records, 176 archived, 188 allocated. Its
  convergence reconstruction exceeded the 10% per-pass cap in all three
  passes; the record discloses the measured deltas.
- FID-2026-1104-013 closed and moved to `archive/` at implementation commit
  `de4dfbc`. At that point the count was 12 active records, 175 archived, 187
  allocated; no active record was unlisted, split or duplicated.
- At the 2026-11-05 audit, 13 active records matched the 13 table rows; 174
  records were archived, for 187 allocated FIDs.
- Every filename matches its `**ID:**` field. Three archived 2026-10-31 records
  (077–079) predated that metadata field and now carry it; their status,
  resolution and evidence text is unchanged.
- `npm run repository:check` passes: 12 active FIDs, closure commit references,
  root links and current-doc links are consistent.
- 005–008 are closed and archived after implementation. 005 and 006 landed in
  `59341a4`; 007 landed in `0a74353`; the master closed with all three children.
  `npm run verify` PASS on the final tree: 11/11 gates, 1,100 tests, PostgreSQL
  2/2, build, HTTP and recovery. No provider funding, live payment, price
  publication or deployment is claimed.
- FID-2026-1105-004 is closed and archived at `22f4f6a`; implementation
  `15d01b4` is deployed with `CRON_SECRET` and the Hobby daily cron. The first
  scheduled due-provider refresh remains `FID-2026-1105-004-LIVE`.
- 068 and 127 use the legacy `fixed` status that the template still accepts;
  their resolutions state the remaining operator and external evidence. Neither
  is a closure candidate.
- 043, 062 and 137 are converged masters. The six design records (011, 013,
  015–018) remain converged, not implemented; 009 is closed.
- The 2026-11-04 note's `8/20` count was accurate at that point; four content
  records (015–018) were added afterwards. With 009 archived, the current count
  is 12/20.

### Closed in the 2026-11-06 responsive allocation repair

[2026-1106-002](archive/FID-2026-1106-002-responsive-allocation-and-related-rows.md)
is `closed` at commit `64a30f0`. The free-model page no longer overflows at
390 px, Signal related reading uses the thumbnail row variant, and the browser
matrix passes 14/14 journeys on build `0zm_Bb4Z79zlK7_rqLpy1`. `npm run verify`
passes 12/12 gates with 1,124/1,124 tests and PostgreSQL 20/20.

### Closed in the 2026-11-06 model coverage implementation

[2026-1106-001](archive/FID-2026-1106-001-model-coverage-thumbnails.md) is
`closed` at implementation commit `95ed201`. Model pages render up to six
compact coverage rows with stored → GitHub → Signal fallback images, validated
video playback and separate title links. The first archive was reopened
because the journey did not assert newest-first order or stored-over-GitHub
precedence; the completion run adds both and passes 14/14 journeys on build
`OMN5qQvSNGIvDZtz6wII7`. `npm run verify` passes 12/12 gates with 1,124/1,124
tests, PostgreSQL 20/20, the HTTP suites and recovery. No live payment, funded
inference or deployment is claimed.

### Closed in the 2026-11-06 visual-builds implementation

[2026-1104-013](archive/FID-2026-1104-013-model-matched-visual-builds.md) is
`closed` with implementation commits `a73960f` (013A), `4009b21` (013A
browser/durability evidence) and `de4dfbc` (013B OpenRouter lane, `/3` backup
and gate hardening). `npm run verify` PASS: 12/12 gates, 1,123/1,123 tests,
mandatory PostgreSQL 20/20, browser 4/4, recovery 15/15, quality 687 files,
build PASS, 177.7 s. The OpenRouter fixture suite passes 4/4. No real source
publication, funded inference, payment or deployment is claimed.

[2026-1105-001](archive/FID-2026-1105-001-youtube-description-model-matching.md)
is closed with implementation commit `84189f8` and local verification evidence.

[2026-1105-002](archive/FID-2026-1105-002-docker-free-verification.md) is closed
with implementation commit `a3ed2a1`. A full `npm run verify` passes on the
pinned native PostgreSQL lifecycle (11/11 gates, 1,046 tests, zero skips, 776
HTTP checks on real PostgreSQL), and the lifecycle suite is 9/9. Linux CI, a
clean install with postinstall scripts enabled, the load gate and hosted
delivery remain unobserved.

[2026-1104-009](archive/FID-2026-1104-009-browser-journey-receipt.md) is closed
with implementation commit `0052734`. The Playwright runner passes 12/12
journeys (six journeys x light/dark) on build `IbsGZjBu7Q51HrQ3KPfsT`; the
pinned receipt is `dev/audits/2026-11-05-browser-matrix-009.md`.

> 2026-11-04 correction: FID-013 was absent from this table despite the
> planning summary's "registered" claim. It is now registered as 013A/013B;
> the active count was 14/20 before the completed-implementation cleanup (8/20
> at that point; the current count is 11/20 after four content records were
> added and 009 was archived). Neither track is implemented, and 013B is not an
> implementation authorization.
>
> 2026-11-04 convergence review: seven design corrections applied; 013 is
> `converged`. 013A was blocked on FID-009 and schema-aware backup (SCOPE VB6);
> VB6 and 009 are now closed, and the operator authorized 013A on 2026-11-05.
> 013B remains blocked on a lawful fixture and rights.
>
> 2026-11-04 level-3 implementation: FID-005 landed in `e145413` (bounded pool
> acquisition and failed-rollback discard); FID-007 landed in `0433cf7`
> (verified remote provisioning TLS). Both are now closed and archived;
> real-server and live TLS acceptance remain in `FID-2026-1104-005-LIVE` and
> `FID-2026-1104-007-LIVE`.
>
> 2026-11-04 SCOPE VB6: the logical dump/restore is schema-aware (`/2`), legacy
> `/1` dumps still restore, and the recovery drill covers `content` and
> `identity`. FID-013's durability prerequisite is satisfied; 009 is now closed
> at `0052734`, and 013A is authorized.
>
> 2026-11-04 FID-010 implementation: `78c6920` adds five bounded funnel events,
> a durable once-only first-completion marker, and a 30-day admin aggregate.
> The FID is closed and archived; its HTTP gate was red in the single-connection
> PGlite fixture and `verify:supabase` lacked the managed-host CA, so those
> acceptance receipts remain in `FID-2026-1104-010-LIVE`.

Finding 3 of the 2026-11-04 release audit has no new record: real payment,
hosted restore, delivered alert and the release decision stay with
[127](FID-2026-1103-127-real-launch-acceptance-receipt.md),
[043](FID-2026-1030-043-launch-master.md) and
[062](FID-2026-1030-062-launch-acceptance-and-rollout.md). Funded paid
inference was withdrawn from the required test scope on 2026-11-04 and remains
unverified.

### Closed in the 2026-11-05 policy-read and load-baseline session

[2026-1105-012](archive/FID-2026-1105-012-gateway-policy-read-and-webhook-retries.md)
is `closed` with implementation commit `efd8cb5`. The admin gateway summary is
awaited, the HTTP suite proves both signed in-flight 409 paths, and the candidate
load baseline passes 123/123 checks. The load receipt is
`dev/receipts/2026-11-05-load-baseline/load-acceptance.json`; operator approval
and hosted acceptance remain open.

### Closed in the 2026-11-05 customer and offering economics implementation

[2026-1105-007](archive/FID-2026-1105-007-customer-and-offering-economics.md)
and [2026-1105-008](archive/FID-2026-1105-008-admin-economics-master.md) are
`closed` with implementation commit `0a74353` for 007 and child commits
`59341a4`/`0a74353` for the master. The customer contribution, free cohort and
read-only simulator surfaces pass the full 11-gate verification. No plan, ledger
or entitlement write path was added.

### Closed in the 2026-11-05 billing concurrency implementation

[2026-1105-009](archive/FID-2026-1105-009-subscription-allowance-concurrency.md),
[2026-1105-010](archive/FID-2026-1105-010-payment-claim-fencing.md) and
[2026-1105-011](archive/FID-2026-1105-011-tool-output-fallback-accounting.md)
are `closed` with implementation commit `9f6548f`. Admission, lifecycle, admin,
settlement and quarantine paths share one lock order; payment claims carry a
fenced generation; tool and function output enters the existing fallback. The
fail-closed PostgreSQL proof now runs 15 races, including four subscription
admission races and four payment/invoice races. `npm run verify` passed 11/11
gates with 1,096/1,096 tests, 718 main HTTP checks plus trial, recovery 14/14,
quality (650 files) and build. No live payment, funded inference, provider
transfer, deployment or remote database change is claimed.

### Closed in the 2026-11-05 admin economics implementation

[2026-1105-005](archive/FID-2026-1105-005-pricing-command-center.md) and
[2026-1105-006](archive/FID-2026-1105-006-provider-capital-and-alerts.md) are
`closed` with implementation commit `59341a4`. The realized pricing command
center and the provider capital/runway view are implemented; economic alerts
remain default-off. `npm run verify` passed 11/11 gates with 1,075/1,075 tests,
quality (647 files), build, 776 main HTTP checks plus trial, and recovery 14/14.
No provider funding, balance mutation, ledger write, price publication outside
the guarded PATCH path, or deployment is claimed.

### Closed in the 2026-11-04 completed-implementation cleanup

[2026-1104-003](archive/FID-2026-1104-003-free-allocation-refusal-truth.md),
[2026-1104-005](archive/FID-2026-1104-005-capacity-envelope-and-pool-faults.md),
[2026-1104-007](archive/FID-2026-1104-007-provisioning-tls-verification.md) and
[2026-1104-010](archive/FID-2026-1104-010-discovery-to-inference-events.md) are
`closed` with commits `7091b8f`, `e145413`, `0433cf7` and `78c6920`. Local
implementation gates pass; the isolated load, two-connection pool proof, live
TLS handshake and real-PostgreSQL HTTP/verify receipts remain acceptance
observations in `../tracking/internal-followups.json` (`-LIVE` entries). They
are not implementation blockers and no launch acceptance is claimed.

### Closed in the 2026-11-04 PostgreSQL verification pass

[2026-1104-008](archive/FID-2026-1104-008-runtime-gates-and-current-docs.md)
is `closed` with implementation commit `941c60f`. A clean `npm ci` and full
`npm run verify` pass on Node 24 against disposable PostgreSQL 17.6: 11/11
gates, 1,019/1,019 tests with zero skips, the two-connection proof 4/4, the main
HTTP suite's 776 checks plus the trial suite, and recovery 14/14. The managed
`verify:supabase` wrapper remains unrun because its self-signed chain has no
configured CA; live TLS acceptance stays in
`FID-2026-1104-007-LIVE`. The first full run exposed a trial reservation /
settlement deadlock; [FID-014](archive/FID-2026-1104-014-trial-reservation-lock-order.md)
is `closed` at `8f40a76`.

### Closed in the 2026-11-04 bounded transport pass

[2026-1104-006](archive/FID-2026-1104-006-bounded-transport-and-jobs.md) is
`closed` with commit `941c60f`: streaming byte caps, manual redirect
validation, private-literal normalization, atomic expiring source claims, a
total cron deadline and a database provider-sync lease. Focused suites pass
18/18 and 8/8; the full suite is 1,015/1,019 with four PostgreSQL-only skips;
check, quality, build, recovery, storage, config and repository checks pass.
The real-PostgreSQL HTTP and mandatory two-connection receipts, plus the DNS
rebinding residual, remain in `FID-2026-1104-006-LIVE`; no full `verify` or
launch acceptance is claimed. FID-008 is now closed with the clean-install,
full-gate real-PostgreSQL receipt; FID-014 is `closed` at `8f40a76` with the
trial deadlock found during that run.

### Closed in the 2026-11-04 shared-admission implementation

[2026-1104-004](archive/FID-2026-1104-004-shared-admission-across-instances.md)
is `closed`: provider and completion admission use atomic PostgreSQL buckets and
expiring leases. The mandatory two-connection proof passed 4/4 with 0 skipped on
a generated Supabase database; added cost was a provider acquire+release median
302.09ms / p95 343.20ms and a completion token median 166.47ms / p95 186.06ms on
the remote pooler (WAN upper bound). Docker-free runbook: SCOPE A26.

### Closed in the 2026-11-04 NOWPayments ruling

[2026-1104-012](archive/FID-2026-1104-012-nowpayments-sandbox-acceptance.md)
is `closed — operator-approved non-pursuit`, archived without commit (no code
change). The operator confirmed both live invoices were creation-only and ruled
that the managed service is assumed to work as wired. No sandbox, paid-invoice,
IPN or replay receipt exists; the record states the assumption rather than
claiming verification.

### Closed in the 2026-11-04 release audit

[2026-1104-001](archive/FID-2026-1104-001-release-audit-and-guard-integrity.md)
and [2026-1104-002](archive/FID-2026-1104-002-quarantine-release-concurrency.md)
close against repair commit `43d8758`: all ten verify gates PASS, 980/980 tests,
2/2 mandatory PostgreSQL proofs and 803 HTTP checks plus trial PASS. The separate
isolated load measurement fails eight targets; the
[release report](../audits/2026-11-04-release-readiness.md) remains no-go.

### Closed in the 2026-11-03 hardening pass

[126](archive/FID-2026-1103-126-production-concurrency-proof.md),
[145](archive/FID-2026-1103-145-push-with-disposable-postgres.md),
[146](archive/FID-2026-1103-146-trial-fixture-requires-real-postgres.md),
[147](archive/FID-2026-1103-147-free-model-allocation-guide.md),
[148](archive/FID-2026-1103-148-postgres-load-acceptance.md),
[142](archive/FID-2026-1103-142-ci-typecheck-typegen.md),
[143](archive/FID-2026-1103-143-deterministic-paid-limit-probe.md),
[144](archive/FID-2026-1103-144-trial-suite-real-postgres.md),
[128](archive/FID-2026-1103-128-admin-session-continuity.md),
[129](archive/FID-2026-1103-129-content-freshness-and-source-guidance.md),
[130](archive/FID-2026-1103-130-durable-feed-validators.md),
[131](archive/FID-2026-1103-131-stream-cancellation-telemetry.md),
[132](archive/FID-2026-1103-132-search-indexing.md),
[133](archive/FID-2026-1103-133-admin-environment-diagnostics.md),
[134](archive/FID-2026-1103-134-consistent-empty-states.md),
[135](archive/FID-2026-1103-135-current-project-index.md),
[136](archive/FID-2026-1103-136-verification-summary.md) and
[141](archive/FID-2026-1103-141-catalog-pricing-optimization-and-deployment-truth.md)
are `closed` with commit, test and gate receipts. FID-148 closes the load-gate
port; its real-PostgreSQL run failed five candidate targets, which stay with 062.
127 stays active because the operator's five required observations and explicit
go decision do not exist yet.

### Closed in the 2026-11-03 sandbox readiness pass

[152](archive/FID-2026-1103-152-hosted-deployment-and-provider-key-proof.md),
[153](archive/FID-2026-1103-153-sandbox-pricing-economics-report.md),
[154](archive/FID-2026-1103-154-sandbox-pricing-history-and-charts.md),
[155](archive/FID-2026-1103-155-disposable-postgres-verification.md) and
[156](archive/FID-2026-1103-156-sandbox-launch-readiness-receipt.md) are
`closed` with commit, gate and receipt evidence. The final redacted receipt is
`dev/receipts/2026-11-03-sandbox/README.md`. Hosted CommandCode remains enabled
without its key, and no launch approval or real-money activity occurred.

### Closed in the 2026-11-03 pricing and provisioning pass

[157](archive/FID-2026-1103-157-highest-impact-price-change-table.md),
[158](archive/FID-2026-1103-158-provider-readiness-guard.md) and
[159](archive/FID-2026-1103-159-disposable-supabase-push-verify.md) are `closed`
with commit, test and gate receipts. 157 ranks modeled price changes in the
sandbox report; 158 refuses an enabled provider without a visible key and
reports readiness in diagnostics; 159 provisions a disposable database on the
configured server for push and verify.

`converged` means the design is ready for implementation; it does not mean code
has landed. A FID leaves this table only when its status is `closed` or
`verified` and `Resolution` records the commit and gate receipt.

## Maintenance rules

1. New records use the filename and metadata in
   [`templates/FID-TEMPLATE.md`](../../templates/FID-TEMPLATE.md).
2. Keep one ID per record, with the filename prefix and `**ID:**` field equal.
3. Move a record to `archive/` only with a `Resolution` section, a commit or
   explicit archived-without-commit note, and verification evidence. Set the
   status to `closed` (or the historical `verified` / `superseded` form where
   that is what the evidence says).
4. Do not rewrite a resolution or evidence section during housekeeping. Advance
   status only when the record itself already contains the corresponding
   closure evidence.
5. Do not archive a converged design merely because the design is complete.
6. Keep the table above aligned with the actual active folder; do not split a
   record between `dev/fids/` and `dev/fids/archive/`.
