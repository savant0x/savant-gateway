# FID: Database migrations, backups and proven restoration

**Filename:** `FID-2026-1030-058-database-backup-and-restore.md`
**ID:** FID-2026-1030-058
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-051, FID-2026-1030-057
**YAGNI-Compliance:** Verified — supported SQLite backup/migration workflow, no database rewrite.

## Summary

Demonstrate that production data survives migration, process interruption and
storage recovery, and that a consistent backup can be restored with reconcilable
financial state. A backup file's existence is not a restore test.

## Environment

`lib/db.ts`, `lib/schema/columns.ts`, domain schema modules and SQLite stores.
The settled-call identity from 051 must be included in recovery inventory.

## Detailed Description

### Problem / expected behavior / root cause

Additive schema bootstrapping exists, but there is no complete backup schedule,
restore drill or migration/rollback acceptance. A naive live file copy may omit
active database state. Code rollback does not reverse a migration or undo payments.

### Evidence

`lib/db.ts` runs domain schemas and `ensureColumn` at boot. `docs/launch-plan.md`
requires consistent backup, isolated restore, restart and financial reconciliation.
The source inventory has no dedicated backup/restore acceptance tool today.

## Impact Assessment

Database lifecycle, jobs, permissions, encrypted/off-host backup retention and
operator runbooks. Risk critical: history loss, double credit or stale financial
restore. Never overwrite the live database to demonstrate a drill.

## Proposed Solution

### Approach and steps

1. Inventory schema/version/migration invariants, WAL/runtime configuration and
   customer/credit/payment/usage/hold/recovery records. Test old-schema upgrades
   and repeat startup on copies before production.
2. Implement a supported consistent backup workflow with bounded schedule,
   retention, access controls, checksum/metadata and observable failure.
3. Obtain operator recovery-point/time targets and restore into an isolated
   service; check integrity, counts, balances, ledger and unresolved settlements.
4. Reconcile externally delivered payments and in-flight outcomes after restore;
   document compatible code rollback and forward repair instead of database rewind.

### Verification

Planned `tests/database-recovery.test.mjs`; extend existing ledger/trial tests
for restored invariants. A disposable drill performs migration, backup under
writes, process interruption and restore, then runs real HTTP reconciliation.
Intended callers: scheduled backup → consistent SQLite operation; startup →
versioned schema; recovery runbook → isolated restore/reconciliation, never blind replacement.

## Verification Gates

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
planned `tests/database-recovery.test.mjs`. A timed backup/restore drill with
redacted financial assertions and actual failure reporting is additionally mandatory;
production-equivalent storage access comes from 057.

## Perfection Loop

RED: missing restore/migration interruption evidence. GREEN: consistent snapshots,
isolated restore and payment reconciliation. AUDIT: pending. ADVERSARIAL: an old
snapshot can replay a paid webhook unless external events are reconciled safely.
Five questions: every data state, bounded recovery time, protected backups,
maintainable migrations and verified financial continuity.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: restore starts in maintenance;
reconcile payment history after the snapshot and unresolved calls before new
traffic. A restored event table must not cause duplicate credit or lost payments.
Final convergence checks are in the master planning-audit receipt.

Design only. No backup job or recoverability guarantee is claimed until the
scheduled path and actual restore have both succeeded with evidence.

## Lessons Learned

Recovery must preserve financial truth across systems, not only open a database file.
