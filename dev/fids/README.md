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
| [146](FID-2026-1103-146-trial-fixture-requires-real-postgres.md) | Trial HTTP fixture requires real PostgreSQL | fixed | Green `ci` run on the fix commit, then archive. |

### Closed in the 2026-11-03 hardening pass

[126](archive/FID-2026-1103-126-production-concurrency-proof.md),
[145](archive/FID-2026-1103-145-push-with-disposable-postgres.md),
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
are `closed` with commit, test and gate receipts. 127 stays active because the
operator's six observations and explicit go decision do not exist yet.

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
