# FID register

**Last folder audit:** 2026-11-03. This page indexes the working set; each FID
owns its own status, evidence and resolution.

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
| [126](FID-2026-1103-126-production-concurrency-proof.md) | Production concurrency proof | converged | Implement the mandatory disposable-PostgreSQL concurrency proof. |
| [127](FID-2026-1103-127-real-launch-acceptance-receipt.md) | Real launch acceptance receipt | converged | Implement the redacted receipt after 126 and 131. |
| [128](FID-2026-1103-128-admin-session-continuity.md) | Preserve admin session context | converged | Implement safe post-login continuation for expired sessions. |
| [129](FID-2026-1103-129-content-freshness-and-source-guidance.md) | Content freshness and source guidance | converged | Implement reader freshness and operator source guidance. |
| [130](FID-2026-1103-130-durable-feed-validators.md) | Durable feed validators | converged | Implement durable conditional-fetch metadata behind a measured need. |
| [131](FID-2026-1103-131-stream-cancellation-telemetry.md) | Structured stream cancellation telemetry | converged | Implement redacted disconnect and provider-failure classification. |
| [132](FID-2026-1103-132-search-indexing.md) | Measured Signal search indexing | converged | Measure the current wildcard query, then add the smallest justified index. |
| [133](FID-2026-1103-133-admin-environment-diagnostics.md) | Safe admin environment diagnostics | converged | Implement configuration-state diagnostics without exposing secrets. |
| [134](FID-2026-1103-134-consistent-empty-states.md) | Consistent actionable empty states | converged | Implement the shared empty-state pattern across the listed surfaces. |
| [135](FID-2026-1103-135-current-project-index.md) | Current project status index | converged | Replace the stale navigation role of `docs/project-status.md`. |
| [136](FID-2026-1103-136-verification-summary.md) | Machine-readable verification summary | converged | Implement the final gate summary while retaining full output. |
| [137](FID-2026-1103-137-product-hardening-and-install-order-master.md) | Product hardening and install-order master | converged | Maintain the sequence and acceptance conditions for 126–136. |

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
