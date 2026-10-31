# FID: Database migrations, backups and proven restoration

**Filename:** `FID-2026-1030-058-database-backup-and-restore.md`
**ID:** FID-2026-1030-058
**Parent:** FID-2026-1030-043
**Severity:** critical
**Status:** verified
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-051, FID-2026-1030-057
**YAGNI-Compliance:** Verified — supported SQLite backup/migration workflow, no database rewrite.

## Summary

Implemented a consistent, checksummed online backup with a metadata sidecar, an
isolated restore verifier that refuses the live path and checks the credit
equation before the server starts, and a disposable end-to-end drill that backs
up under writes, restores, boots the real server and reads operator
reconciliation over HTTP. The code path closes on local evidence. Operator
RPO/RTO targets and a timed restore on the actual production volume are tracked
as a live-acceptance item; they are not claimed here.

## Environment

- **OS:** Windows 11 development host; Linux container target (Fly, Node image).
- **Language/Runtime:** Node.js >= 22.18.0, Next.js 16.4.3, better-sqlite3 13.0.3.
- **Tool Versions:** npm; SQLite bundled with better-sqlite3; `node --test`.
- **Commit/State:** implementation commit recorded below, verified on top of
  `9e40037` with a working-tree change set.

## Detailed Description

### Problem

Additive schema bootstrapping already existed, but the recovery path was a
written intention rather than a tested operation. `scripts/db-backup.mjs`
verified `integrity_check` and a table count, yet wrote no checksum or metadata,
had no restore counterpart, and no drill proved that a copy retained balances,
the ledger, payment events, unresolved settlements or quarantine. A backup file's
existence was the only evidence.

### Expected Behavior

- A live backup is consistent while writes continue and is bound to a SHA-256,
  byte size and table inventory.
- A restore never overwrites the live database, rejects an unverified or
  tampered copy, and verifies integrity, foreign keys, required tables and the
  credit equation before the app opens it.
- A restored copy survives repeat startup, keeps unresolved settlements and
  quarantined holds visible, and cannot credit a replayed payment event twice.
- The operator has a runbook for backup, isolated restore, reconciliation,
  payment replay and code rollback.

### Root Cause

Recovery was treated as a documentation obligation. The existing backup script
proved only that a readable SQLite file was produced; it did not bind the file to
its metadata, isolate the restore target, or exercise the financial reads that
matter after a restore.

### Evidence

- Pre-change `scripts/db-backup.mjs`: online copy, `integrity_check` and a table
  count only; no sidecar, checksum, required-table check or restore guard.
- Pre-change `docs/deployment-runbook.md`: "stop the process, put the database
  files back" with no verification tool or financial acceptance.
- No `scripts/db-restore.mjs`, no `scripts/db-recovery-drill.mjs`, and no
  `tests/database-recovery.test.mjs` in the tree.

## Impact Assessment

### Affected Components

- `scripts/db-backup.mjs` — backup consistency, metadata, retention and access.
- `scripts/db-restore.mjs` — isolated restore and financial verification.
- `scripts/db-recovery-drill.mjs` — end-to-end proof through the real server.
- `tests/database-recovery.test.mjs` — regression coverage.
- `docs/deployment-runbook.md` — operator procedure, RPO/RTO and rollback.
- `package.json`, `protocol.config.yaml` — declared commands and gates.

### Risk Level

- [x] Critical: System crash, data loss, or security vulnerability
- [ ] High: Major feature broken, no workaround
- [ ] Medium: Feature degraded, workaround exists
- [ ] Low: Minor issue, cosmetic, or edge case

## Proposed Solution

### Approach

Keep SQLite and the single-writer contract. Harden the existing online backup
instead of replacing it; add a separate restore verifier because a backup and a
restore exercise different failure modes; prove the path with a disposable drill
that uses the real production server and reconciliation endpoint.

### Steps

1. **Inventory and migration evidence — implemented.** Added recovery tests for
   an additive column upgrade on a restored copy, repeat startup and an
   interrupted write. The existing `ensureColumn` and settlement tests remain
   the unit-level evidence.
2. **Consistent backup workflow — implemented.** SHA-256 sidecar, byte count,
   page size, journal mode, required tables, `0700`/`0600` permissions, atomic
   metadata write, pair-aware pruning, and a guard that never prunes the live
   file.
3a. **Isolated restore — implemented.** `db-restore.mjs` refuses a missing or
   mismatched sidecar, an existing target and a target equal to `DB_PATH`; it
   verifies integrity, foreign keys, required tables, the credit equation,
   negative balances and orphan ledger rows.
3b. **Operator recovery targets — blocked.** RPO/RTO and a timed restore on the
   actual volume are operator inputs and are not set. Tracked as
   `FID-2026-1030-058-LIVE`.
4a. **Payment and in-flight reconciliation procedure — implemented.** The
   restore receipt reports unresolved settlements and quarantined holds; the
   runbook requires Stripe replay against `billing_events` and
   `topups.provider_ref`. The replay-safety constraint is tested on a restored
   copy.
4b. **Live post-snapshot payment observation — blocked.** Real Stripe delivery
   after a production restore is not exercised until a live restore exists.

### Verification

`tests/database-recovery.test.mjs` (5 tests) covers backup under writes,
restoration and financial invariants, target/live-path/checksum refusals, the
explicit unverified escape hatch, process interruption, additive migration on a
restored copy, and replay rejection. `npm run test:recovery` performs the timed
drill through the real HTTP reconciliation endpoint and a second startup.

## Verification Gates

- gate: lint — `npm run lint`
- gate: typecheck — `npm run typecheck`
- gate: test tests/database-recovery.test.mjs — `node --test tests/database-recovery.test.mjs`
- gate: test — `npm test` (full directory)
- gate: test_http — `npm run test:http`
- gate: test_recovery — `npm run test:recovery`
- gate: quality — `npm run quality`
- gate: build — `npm run build`
- gate: verify — `npm run verify`

### Verification Receipt

- verified: 2026-10-31T01:14:07Z
- lint: exit 0
- typecheck: exit 0
- config:check: exit 0 (`config-check: PASS (non-production)`)
- test: exit 0 — 326 tests, 0 fail (5 new recovery tests)
- quality: exit 0 — 295 files under the 400-line ceiling
- build: exit 0 — 18 static/SSG pages
- test_http: exit 0 — 466 checks PASS
- trial HTTP: exit 0 — all checks PASS
- test_recovery: exit 0 — 8 concurrent writes during backup, verified restore,
  operator reconciliation over HTTP, second startup, 2009ms
- verify: exit 0

## Perfection Loop

### Loop 1 — RED

- **RED:** The backup had no checksum or metadata, so a stale or wrong file could
  be restored as if it were the right one. There was no restore tool, so
  "restore" was an untested instruction. The credit equation, unresolved
  settlements and payment replay were not part of any recovery check.
- **GREEN:** Added `savant-backup/1` sidecars, `db-restore.mjs` with isolated
  targets and financial invariants, a real-server drill, and
  `tests/database-recovery.test.mjs`.
- **AUDIT:** `npm run verify` exit 0; 326 unit tests; 466 HTTP checks; trial
  suite; recovery drill PASS.
- **ADVERSARIAL:** A backup can pass `integrity_check` and still be the wrong
  file; the sidecar binds filename, byte size and SHA-256. A consistent database
  can still be financially wrong; the restore refuses a nonzero credit
  difference, negative balances or orphan ledger rows. A restored event table
  can double-credit; the test requires the event id and provider reference
  unique constraints to reject a replay.
- **CHANGE DELTA:** ~85% of this FID's implementation text.

### Missed Questions

1. What if the backup is older than the current schema? → Additive migrations
   run forward at startup; the restored-copy test applies `ensureColumn` twice
   without losing rows. Destructive migrations are not used.
2. What if the sidecar is separated from the `.db`? → Restore refuses by
   default; `--allow-unverified` is an explicit operator escape hatch and the
   receipt records `verified: false`.
3. What if `BACKUP_DIR` is the database directory and retention sees a
   prefix-named live file? → `prune` skips the resolved source path.
4. What if the process dies mid-write? → The test kills a child inside an open
   transaction; the row is absent and `integrity_check` is `ok` on reopen.
5. What if the restore target already exists or is the live file? → Both are
   refused before any copy.
6. What about payments delivered after the snapshot? → The runbook requires
   Stripe replay against durable event ids and provider references; the unique
   constraints make a replay a no-op or a claim conflict, not a second credit.
7. What about off-site retention and encryption? → Off-site is an explicit
   operator step; POSIX access is `0700`/`0600`; encryption at rest is a host or
   backup-destination concern, not silently claimed here.
8. What about a real-volume timing? → Not claimed; it is the tracked live item.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** pending the implementation commit recorded in the closure
  entry.
- [x] **File:line ranges:**
  - `scripts/db-backup.mjs:33` required tables; `:59` SHA-256; `:143` atomic
    metadata; `:198` required-table refusal; `:244` pair-aware prune.
  - `scripts/db-restore.mjs:119` live-path refusal; `:174` checksum refusal;
    `:217` foreign-key check; `:273` credit-equation check; `:354` atomic
    rename; `:372` restore receipt.
  - `scripts/db-recovery-drill.mjs:88` financial seed; `:307` backup; `:339`
    restore; `:391` HTTP reconciliation; `:415` second startup.
  - `tests/database-recovery.test.mjs:206`, `:336`, `:407`, `:460`, `:503` five
    recovery tests.
  - `docs/deployment-runbook.md:119` backup; `:212` restore; `:242` targets and
    evidence; `:254` code rollback.
  - `package.json:21` recovery command; `:27` verify includes it.
- [x] **Gate output:** 326 tests, 466 HTTP checks, trial suite, quality 295
  files, production build and recovery drill all exit 0.
- [x] **Reproducibility:** `grep -n "savant-backup/1" scripts/db-backup.mjs`,
  `grep -n "refusing to restore over the live DB_PATH" scripts/db-restore.mjs`,
  `grep -n "test:recovery" package.json`.
- [x] **Step statuses:** 1 implemented; 2 implemented; 3a implemented; 3b
  blocked; 4a implemented; 4b blocked.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution: sidecar, restore guards,
  financial checks, drill, runbook and gate wiring are present.
- [x] Typecheck/tests/lint pass with pasted output above.
- [x] Production call-graph evidence: `npm run verify` → `test:recovery` →
  `db-recovery-drill.mjs` → `db-backup.mjs` / `db-restore.mjs` → real
  `next start` → `/api/admin/reconciliation`.
- [x] FID status reflects the actual implementation state: code closed; live
  RPO/RTO and real-volume restore are tracked separately.

### Loop 2 — Independent audit and self-correction

- **RED:** The first tampered-backup test failed on the sidecar's filename check
  before reaching the checksum, because the copied sidecar still named the
  original file. The backup prune could also delete a live file whose name began
  with `gateway-` if the source lived in the backup directory.
- **GREEN:** The test now rewrites the sidecar filename before tampering; `prune`
  compares each candidate to the resolved `sourcePath` and skips it.
- **AUDIT:** The recovery test file passes 5/5 after both corrections; the full
  gate passes.
- **ADVERSARIAL:** The drill runs on a disposable local file, not the Fly volume.
  A different filesystem, mount permission or disk-full condition can still fail
  the real restore; that is why the runbook requires a timed production-volume
  drill and the tracking item remains open.
- **CHANGE DELTA:** ~8%.

### Loop 3 — Final convergence

- **RED:** No operator RPO/RTO and no timed restore on the production volume.
- **GREEN:** Recorded as item `FID-2026-1030-058-LIVE` in
  `dev/tracking/internal-followups.json`; the runbook names it as an operator
  gate.
- **AUDIT:** JSON ledger parses; `docs/deployment-runbook.md:298` names the
  remaining live item.
- **ADVERSARIAL:** A local green drill cannot prove Fly volume behavior. The
  first real restore remains a launch gate under 062; this record does not claim
  production recovery.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** pending the implementation commit and closure record.
- **Fix Description:** Checksummed online backup with a sidecar and required-table
  verification; isolated restore verifier with integrity, foreign-key, credit
  equation and replay checks; disposable real-server recovery drill; operator
  runbook with RPO/RTO, payment reconciliation and code rollback.
- **Tests Added:** Yes — `tests/database-recovery.test.mjs`, five tests covering
  backup under writes, restore invariants, refusals, unverified consent,
  interruption, additive migration and replay rejection.
- **Verification Evidence:** `npm run verify` exit 0 — 326 unit tests, 295
  quality files, production build, 466 HTTP checks, trial suite, recovery drill
  PASS (8 concurrent writes, 2009ms).
- **Archived:** pending.

## Lessons Learned

A backup file's existence is not recovery evidence. Bind the copy to a checksum,
refuse to restore over the live path, verify the financial equation before the
server starts, and drill the whole path through the real HTTP surface. Local
green tests still do not substitute for one timed restore on the production
volume.
