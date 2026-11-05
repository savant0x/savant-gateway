# FID register

**Last folder audit:** 2026-11-05 (register reconciliation). This page indexes the
working set; each FID owns its own status, evidence and resolution. Current
counts: 13 active / 20 slots, 166 archived, 179 allocated.

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
| [2026-1105-004](FID-2026-1105-004-scheduled-provider-sync.md) | Scheduled provider sync and AIO trigger | fixed | Deployed at `dpl_53PM1vwqGkVk61xzaCWXfruwL2CC`; `CRON_SECRET` set; unauth `401`, auth and Vercel-triggered run `200` (nothing due). Next: observe a scheduled due-provider refresh. |
| [2026-1105-003](FID-2026-1105-003-router-cheap-provider.md) | router.cheap reseller integration | fixed | Implementation commit `6cdfc80`; archive after the remaining closure acceptance. No inference, reseller customer or management write. |
| [043](FID-2026-1030-043-launch-master.md) | Master launch contract and dependency register | converged | Keep coverage, ordering and release decisions current. |
| [062](FID-2026-1030-062-launch-acceptance-and-rollout.md) | Real launch acceptance, controlled rollout and rollback | converged | Discharge the dated external receipt items 1–8; launch remains no-go. |
| [068](FID-2026-1030-068-usdc-receive-lane.md) | Direct-to-wallet USDC receive lane | fixed | Operator inputs still gate the receive lane; re-read the record before acting. |
| [127](FID-2026-1103-127-real-launch-acceptance-receipt.md) | Real launch acceptance receipt | fixed | Operator records the five observations (`payment`, `recovery`, `alert`, `load`, `rollback`) and a go pinned to the release SHA, then runs `npm run receipt:launch`. |
| [137](FID-2026-1103-137-product-hardening-and-install-order-master.md) | Product hardening and install-order master | converged | Closes only after 127 has its required operator evidence; 126 is already closed. |
| [2026-1104-011](FID-2026-1104-011-policy-v1-2-publication.md) | Policy v1.2 for the current service surface | converged | Operator approves the recipient inventory; worker drafts v1.2 and the acceptance bump. |
| [2026-1104-013](FID-2026-1104-013-model-matched-visual-builds.md) | Pelican-first model-matched visual builds with a gated OpenRouter track | converged | 013A is authorized; implementation may start now that 006 and 009 are closed. 013B stays blocked on a lawful OpenRouter fixture and rights. |
| [2026-1104-015](FID-2026-1104-015-content-fetch-automation-and-history.md) | Dashboard-configured fetching and durable history | converged | Planning only; coding reserved and scheduler backend unconfirmed. |
| [2026-1104-016](FID-2026-1104-016-persistent-content-model-decisions.md) | Persistent content/model acceptance and dismissal | converged | Planning only; accepted links remain attached across automatic work. |
| [2026-1104-017](FID-2026-1104-017-content-matching-controls-and-review.md) | Full linked-content management, settings and rematch | converged | Implement after 015 and 016 in a coding session. |
| [2026-1104-018](FID-2026-1104-018-content-automation-master.md) | Content automation and persistent matching master | converged | Planning handoff ready; no coding or hosted activation authorized. |

### 2026-11-05 register audit

- 13 active records match the 13 table rows above; 166 records are archived, for
  179 allocated FIDs. No active record is unlisted, split or duplicated.
- Every filename matches its `**ID:**` field. Three archived 2026-10-31 records
  (077–079) predated that metadata field and now carry it; their status,
  resolution and evidence text is unchanged.
- `npm run repository:check` passes: 13 active FIDs, closure commit references,
  root links and current-doc links are consistent.
- FID-2026-1105-004 is implemented, gated and committed at `15d01b4`; the Hobby
  daily schedule is written, but no deployment, secret or scheduler activation
  exists yet.
- 068 and 127 use the legacy `fixed` status that the template still accepts;
  their resolutions state the remaining operator and external evidence. Neither
  is a closure candidate.
- 043, 062 and 137 are converged masters. The six design records (011, 013,
  015–018) remain converged, not implemented; 009 is closed.
- The 2026-11-04 note's `8/20` count was accurate at that point; four content
  records (015–018) were added afterwards. With 009 archived, the current count
  is 12/20.

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
