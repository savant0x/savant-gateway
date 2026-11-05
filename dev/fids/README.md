# FID register

**Last folder audit:** 2026-11-03 (hardening pass). This page indexes the
working set; each FID owns its own status, evidence and resolution.

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
| [043](FID-2026-1030-043-launch-master.md) | Master launch contract and dependency register | converged | Keep coverage, ordering and release decisions current. |
| [062](FID-2026-1030-062-launch-acceptance-and-rollout.md) | Real launch acceptance, controlled rollout and rollback | converged | Discharge the dated external receipt items 1–8; launch remains no-go. |
| [068](FID-2026-1030-068-usdc-receive-lane.md) | Direct-to-wallet USDC receive lane | fixed | Operator inputs still gate the receive lane; re-read the record before acting. |
| [127](FID-2026-1103-127-real-launch-acceptance-receipt.md) | Real launch acceptance receipt | fixed | Operator records the six observations and a go pinned to the release SHA, then runs `npm run receipt:launch`. |
| [137](FID-2026-1103-137-product-hardening-and-install-order-master.md) | Product hardening and install-order master | converged | Closes only after 126 and 127 have their required evidence. |
| [2026-1104-003](FID-2026-1104-003-free-allocation-refusal-truth.md) | Free-allocation refusal truth and hermetic supply | fixed | Implementation `7091b8f`; isolated `npm run test:load` remains (no disposable PostgreSQL endpoint on this host). |
| [2026-1104-005](FID-2026-1104-005-capacity-envelope-and-pool-faults.md) | Accepted capacity envelope and database pool faults | fixed | Implementation `e145413`; real-server saturation proof and isolated load rerun remain. |
| [2026-1104-006](FID-2026-1104-006-bounded-transport-and-jobs.md) | Bounded transport and durable scheduled work | converged | Worker streams with a byte cap, validates redirects and adds durable job claims. |
| [2026-1104-007](FID-2026-1104-007-provisioning-tls-verification.md) | Verified TLS for provisioning helpers | fixed | Implementation `0433cf7`; live trusted/self-signed handshake with the provider CA and disposable-role confirmation remain. |
| [2026-1104-008](FID-2026-1104-008-runtime-gates-and-current-docs.md) | One runtime, one gate contract and current documentation | converged | Operator picks Node 22 or 24; worker unifies the gate list and adds the repository check. |
| [2026-1104-009](FID-2026-1104-009-browser-journey-receipt.md) | Fresh browser journey receipt | converged | Worker adds the Playwright runner and records six journeys in both themes. |
| [2026-1104-010](FID-2026-1104-010-discovery-to-inference-events.md) | Discovery-to-inference business events | fixed | Implementation `78c6920`; real-PostgreSQL HTTP and `verify:supabase` receipts remain blocked by the host database and CA. |
| [2026-1104-011](FID-2026-1104-011-policy-v1-2-publication.md) | Policy v1.2 for the current service surface | converged | Operator approves the recipient inventory; worker drafts v1.2 and the acceptance bump. |
| [2026-1104-013](FID-2026-1104-013-model-matched-visual-builds.md) | Pelican-first model-matched visual builds with a gated OpenRouter track | converged | 013A only after 006/009; schema-aware backup (SCOPE VB6) is implemented. 013B stays blocked on a lawful OpenRouter fixture and rights. |

> 2026-11-04 correction: FID-013 was absent from this table despite the
> planning summary's "registered" claim. It is now registered as 013A/013B;
> the active count is 14/20. Neither track is implemented, and 013B is not an
> implementation authorization.
>
> 2026-11-04 convergence review: seven design corrections applied; 013 is
> `converged`. 013A code remains blocked on FID-006, FID-009 and schema-aware
> backup (SCOPE VB6); 013B remains blocked on a lawful fixture and rights.
>
> 2026-11-04 level-3 implementation: FID-005 is `fixed` in `e145413` (bounded
> pool acquisition and failed-rollback discard); FID-007 is `fixed` in
> `0433cf7` (verified remote provisioning TLS). Both carry partial receipts;
> real-server and live TLS acceptance remain, so neither is closed.
>
> 2026-11-04 SCOPE VB6: the logical dump/restore is schema-aware (`/2`), legacy
> `/1` dumps still restore, and the recovery drill covers `content` and
> `identity`. FID-013's durability prerequisite is satisfied; 013A remains
> blocked on FID-006 and FID-009.
>
> 2026-11-04 FID-010 implementation: `78c6920` adds five bounded funnel events,
> a durable once-only first-completion marker, and a 30-day admin aggregate.
> The FID is `fixed`; its HTTP gate is red in the single-connection PGlite
> fixture and `verify:supabase` lacks the managed-host CA, so it is not closed.

Finding 3 of the 2026-11-04 release audit has no new record: real payment,
funded inference, hosted restore, delivered alert and the release decision stay
with [127](FID-2026-1103-127-real-launch-acceptance-receipt.md),
[043](FID-2026-1030-043-launch-master.md) and
[062](FID-2026-1030-062-launch-acceptance-and-rollout.md).

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
127 stays active because the operator's six observations and explicit go
decision do not exist yet.

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
