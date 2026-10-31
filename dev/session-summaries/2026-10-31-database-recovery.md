# Session summary: database recovery (FID-2026-1030-058)

**Session:** 2026-10-31 database backup and restore
**Contract:** FID-2026-1030-058
**Status:** implemented, verified, closed against the implementation commit

## What the operator asked for

"resume master plan w/ automation level 3." The master's next dependency-ready
child was 058: migrations, backup and proven restoration. 051 and 057 were
satisfied for this purpose (051 closed; 057 `fixed` with residual hosting gates).
Trials, offering activation and deployment stayed off.

## What was wrong

The repository had an online backup script and a runbook paragraph, but no
recovery proof:

1. `scripts/db-backup.mjs` verified `integrity_check` and a table count only. No
   checksum or metadata bound the file to the backup it claimed to be.
2. There was no restore tool. "Stop the process and put the files back" was an
   untested instruction, with no guard against overwriting the live database.
3. No test asserted that a restored copy retained the credit equation, payment
   events, unresolved settlements or quarantined holds.
4. No path exercised a replayed payment event after a restore.
5. No disposable drill booted the real server on a restored file.

## What changed

- **`scripts/db-backup.mjs`** now writes a `savant-backup/1` sidecar with SHA-256,
  byte count, page size, journal mode and table inventory; requires the core
  customer/money tables; writes metadata atomically; applies `0700`/`0600` POSIX
  bits; prunes the `.db` and `.json` together; and never prunes the resolved live
  file.
- **`scripts/db-restore.mjs`** restores into a new isolated path. It refuses a
  missing or mismatched sidecar, an existing target and a target equal to
  `DB_PATH`; checks integrity, foreign keys, required tables, the credit equation
  (`balance = latest baseline + ledger`), negative balances and orphan ledger
  rows; atomically renames the verified copy; and writes a
  `<target>.restore.json` receipt with counts, unresolved settlements and
  quarantined holds. `--allow-unverified` is the explicit legacy escape hatch and
  is recorded in the receipt.
- **`scripts/db-recovery-drill.mjs`** seeds a reconciled credit history, keeps
  writes running during the backup, restores into a new file, boots the real
  production server, signs in and reads `/api/admin/reconciliation`, then
  restarts on the restored copy.
- **`tests/database-recovery.test.mjs`** adds five tests: backup under writes and
  restore invariants; target/live-path/checksum refusals; explicit unverified
  consent; a killed uncommitted write; additive migration on a restored copy;
  and replay rejection by the event-id and provider-reference unique constraints.
- **`docs/deployment-runbook.md`** separates backup, isolated restore, RPO/RTO,
  payment replay and code rollback.
- **`package.json` / `protocol.config.yaml`** add `db:backup`, `db:restore`,
  `test:recovery`; `npm run verify` now includes the drill.

## Verification

`npm run verify` exit 0 on 2026-10-31T01:14:07Z:

- `config-check: PASS (non-production)`
- 326 tests, 326 pass, 0 fail
- quality PASS (400-line ceiling, 295 files)
- production build exit 0 (18 static/SSG pages)
- `http-suite: 466 checks PASS`
- `trial-http-suite: all checks PASS`
- `recovery-drill: PASS` — 8 concurrent writes, verified restore, operator
  reconciliation on both startups, 2009ms
- lint and typecheck exit 0 (inside `npm run check`)

## What this does and does not prove

Proved locally: a consistent online copy under concurrent writes, checksum and
sidecar verification, isolated restore, the credit equation, survivor counts,
payment-event presence, replay rejection, additive migration and repeat startup.

Not proved: an RPO/RTO target chosen by the operator, a timed restore on the
actual Fly volume, different filesystem/permission/disk-full behavior, and live
Stripe reconciliation after a production restore. Those remain blocked as
`FID-2026-1030-058-LIVE` in `dev/tracking/internal-followups.json`. The local
drill is code evidence, not a production recovery receipt.

## Active queue after this closure

Thirteen records:

```text
043 044 045 046 049 056 057 059 060 061 062 066 068
```

058 is archived closed. 043–046, 049 and 059–060/062 are the implementation
queue; 044 and 062 are operator-gated; 056/057/061 carry residual gates; 066 is
dormant; 068 is blocked on chain/token, xpub, RPC and screening inputs.

## Operator boundaries preserved

Nothing was deployed, funded, sold, activated or published. No credential value
was read or written. The Fly account still needs the operator's payment method;
the first `fly deploy` remains the image's first build.
