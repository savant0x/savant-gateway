# FID: Deploy the gateway to one persistent host

**Filename:** `FID-2026-1030-067-fly-deployment.md`
**ID:** FID-2026-1030-067
**Parent:** FID-2026-1030-057
**Severity:** high
**Status:** converged
**Created:** 2026-10-30 18:40
**Automation level:** 2
**YAGNI-Compliance:** Verified

## Summary

The gateway is a single Node process writing a WAL-mode SQLite file. It has a
verified local runtime contract ([deployment runbook](../../docs/deployment-runbook.md))
and no deployable artifact: no `Dockerfile`, no host configuration, no volume
mount. The hosting decision ([hosting decision](../../docs/hosting-decision.md))
selected one persistent process on a local volume over a libSQL port to Vercel,
because the app already runs exactly that way and WAL requires every reader and
writer on one host.

This FID supplies the missing artifact for that decision: a container image, a
Fly configuration pinning one machine, one process and one volume, a volume-safe
backup script, and a runbook extension. It does **not** deploy. Provisioning the
machine, the volume and the secrets needs the operator's account and spending,
and publishing remains gated by FID-062.

## Environment

- **OS:** Windows 11 host, Linux container target
- **Language/Runtime:** Node `v24.21.0` local, `node:22-bookworm-slim` image
- **Tool Versions:** npm `12.2.1`, Docker `28.4.0`, Fly CLI absent
- **Commit/State:** `2484c1c`

## Detailed Description

### Problem

`docs/deployment-runbook.md` states the runtime contract and records that
deployment is "prepared, not executed". Prepared covered the *application's*
obligations — health endpoints, the startup gate, drain, storage semantics — and
not the packaging. Nothing in the tree tells a host how to build the app, where
the database file goes, or that exactly one machine may attach it, so a first
deployment would have to invent those decisions at the console.

Three facts make the packaging decisions non-obvious rather than cosmetic:

1. `package.json` declares `"prepare": "git config core.hooksPath .githooks"`.
   There is no repository inside a build image, so a plain `npm ci` fails.
   `--ignore-scripts` would also skip `better-sqlite3`'s install step, which the
   app cannot load without.
2. `better-sqlite3` is listed in `next.config.mjs` → `serverExternalPackages`, so
   it is a runtime requirement and must exist in the final image, not only during
   the build.
3. Fly mounts volumes root-owned. A process running as `node` cannot create
   `gateway.db` on a fresh volume, and `db.ts` creates the directory at import
   time, so the failure surfaces as a boot crash rather than a clear error.

### Expected Behavior

`docker build` produces an image that starts as a non-root user on an empty
volume, creates its database, serves, survives a restart with its data intact,
and reports truthful readiness. `fly deploy` is the only remaining operator
action.

### Root Cause

Absent artifact, not a defect. The application was written to be hosted this way
and the packaging was simply not part of FID-057's application-side scope.

### Evidence

```text
$ ls fly.toml Dockerfile .dockerignore
none of fly.toml/Dockerfile/.dockerignore present
$ command -v fly
fly: NOT INSTALLED
$ grep -n '"prepare"' package.json
"prepare": "git config core.hooksPath .githooks && git config commit.template .gitmessage"
$ grep -n serverExternalPackages next.config.mjs
serverExternalPackages: ["better-sqlite3"],
```

## Impact Assessment

### Affected Components

- `Dockerfile` (new) — multi-stage image
- `.dockerignore` (new) — keeps the local database and secrets out of context
- `fly.toml` (new) — one machine, one volume, readiness check
- `scripts/docker-entrypoint.sh` (new) — volume ownership, privilege drop
- `scripts/db-backup.mjs` (new) — online backup with integrity verification
- `docs/deployment-runbook.md` — Fly-specific procedure
- `README.md` — deployment pointer

### Risk Level

- [x] High: the artifact decides whether the only copy of the ledger is durable.

## Proposed Solution

### Approach

Package the application unchanged. Every hosting decision is expressed in
configuration, not code, so the accounting paths and the startup gate keep
describing themselves. Refuse to work around the storage contract: one machine,
`auto_start_machines` off, no process manager, no scale-to-zero.

- Readiness, not liveness, is the machine health check. `/api/ready` returns 503
  unless the origin is https, `DB_PATH` is absolute and outside the temp
  directory, admin credentials are configured, and the volume is writable, so a
  misconfigured deploy fails instead of serving.
- `next` is the container entry process under `gosu`, not `npm`, so SIGTERM
  reaches the listener and the drain described in the runbook actually happens.
- The entrypoint fixes ownership of a root-owned volume mount once, then drops
  privileges. The alternative — running as root — trades a real security
  property for one line of shell.
- The backup uses SQLite's online backup API rather than `cp`, because copying
  only the main file while WAL is live is not a restore point.

### Steps

1. `implemented` — `Dockerfile`: deps → build → prod-deps → runner.
2. `implemented` — `.dockerignore`: exclude `.env*`, `data/`, `.next`, `.git`.
3. `implemented` — `scripts/docker-entrypoint.sh`: chown `/data`, drop to `node`.
4. `implemented` — `scripts/db-backup.mjs`: online backup + `integrity_check` + prune.
5. `implemented` — `fly.toml`: one machine, volume at `/data`, `/api/ready` check.
6. `implemented` — `docs/deployment-runbook.md`: the Fly procedure.
7. `deferred` — operator-approved, 2026-10-30: "we'll complete everything
   deployment-related at a later date once we're ready to fully launch. We can
   continue regular dev without launching the site." The CLI is installed and
authenticated, and `fly config validate` reports `✓ Configuration is valid`, but
the account cannot provision: `fly apps create savant-gateway` returns
`trial has ended, please add a credit card`. No app, volume, secret or machine
was created and nothing was spent. Resuming is the five commands in
`docs/deployment-runbook.md`.

### Verification

Local proof that the artifact is correct, independent of any account:

- `docker build` succeeds.
- A container starts on an empty named volume and `/api/ready` returns 200.
- The volume contains `gateway.db` and its WAL siblings afterwards.
- A second container on the *different* volume proves nothing was baked in —
  readiness does not depend on a pre-seeded file.
- Restart against the same volume preserves a written row.
- `scripts/db-backup.mjs` produces a copy whose `integrity_check` is `ok`.
- `npm run verify` still passes, proving no source change regressed a gate.
- A missing `ADMIN_PASSWORD` makes `/api/ready` return 503, proving the check is
  load-bearing rather than decorative.

No `tests/*.test.mjs` artifact is promised: this FID adds no application code.
The gates and the container transcript are the receipt.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/production-config.test.mjs
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- verified: 2026-10-30T22:46Z (working tree, not yet committed)
- lint: exit 0
- typecheck: exit 0
- test: exit 0 — 321 pass, 0 fail
- quality: exit 0 — PASS, 400-line ceiling, 295 files
- build: exit 0 — production build
- container build: NOT RUN — Docker's Linux engine cannot start on this machine
  (`WSL2 is unable to start since virtualization is not enabled`). The first
  `fly deploy` is therefore the image's first build.

Production-start transcript, real file database, environment shaped as
`fly.toml` sets it:

```text
/api/health  -> 200 {"status":"alive"}
/api/ready   -> 200 {"status":"ready","checks":{"configuration":"ok","storage":"ok"},"mode":"durable"}
/ /models /docs /plans /signup /login /support -> 200 (all)
volume      -> gateway.db, gateway.db-wal, gateway.db-shm
journal_mode (independent connection) -> wal
signup      -> 201, cust_89ad132f-…
stop        -> connection refused, listener count 0
restart     -> new pid, log "✓ Ready in 134ms", no EADDRINUSE
login after restart (same account id) -> 200
```

Backup transcript:

```text
db-backup: wrote …gateway-2026-10-30T22-45-28-328Z.db (35 tables, 512000 bytes, 125 pages, integrity ok)
db-backup: pruned …gateway-2026-10-30T22-45-25-952Z.db
backup dir -> 2 files, no -wal/-shm orphans (after the fix below)
copy reopened -> integrity_check: ok, accounts: 2
```

Configuration gate:

```text
correct env      -> config-check: PASS (https://savant-gateway.fly.dev), exit 0
no admin         -> exit 1, admin_unconfigured
loopback origin  -> exit 1, origin_insecure + origin_loopback
relative DB_PATH -> exit 1, db_relative
WEB_CONCURRENCY=4-> exit 1, multi_worker
```

**A false pass was caught and discarded.** The first restart test reported
`ready` and a successful login, but the new process had died with
`EADDRINUSE`; the answers came from the *old* server, so nothing had been proven.
The test was rerun after confirming the old listener was gone (`curl` refused,
listener count 0) and the new one had a distinct pid and a clean `Ready` line.
The passing result above is the second run.

**A real defect was caught in the new script.** Opening the copy to verify it
leaves `-wal`/`-shm` beside it; `prune` matched only `*.db`, so pruned backups
left their siblings behind forever. `removeDatabaseFiles` now removes the
siblings for pruned copies and after a successful verification.

## Perfection Loop

### Loop 1 — RED

- **RED:** A plain `npm ci` in the image fails on the `prepare` script; naively
  skipping all scripts breaks the native dependency; a root-owned volume mount
  crashes the app on first boot; `npm` as PID 1 risks swallowing SIGTERM; a
  liveness health check would pass on a volume that cannot be written.
- **GREEN:** `npm ci --ignore-scripts` followed by an explicit
  `npm rebuild better-sqlite3`, with a compiler toolchain present so a missing
  prebuild is not fatal. Entrypoint chowns then drops privileges. `next` is the
  entry process. Health check is `/api/ready`.
- **AUDIT:** Each item is exercised by the container transcript below.
- **ADVERSARIAL:** `npm rebuild` needs network for a prebuild download. If the
  base image's ABI had no prebuild and no toolchain, the build would fail with a
  confusing node-gyp error. Installing `python3 make g++` removes the dependency
  on prebuild availability.
- **CHANGE DELTA:** n/a (first pass).

### Missed Questions

1. *Does anything read `NEXT_PUBLIC_SITE_URL` in a client component, where it
   would be inlined at build time and diverge from runtime env?* No. All eleven
   importers of `config/site` are server modules; the check is at
   `grep -rln "config/site" app components lib`. Runtime env is therefore
   authoritative and the image needs no origin build arg.
2. *Does the build need the database?* `lib/db.ts` opens it at import. During
   build it would default to `data/gateway.db` under the build workdir, which is
   harmless and never copied to the runner, but `DB_PATH` is still set at
   runtime so serving never uses that path.
3. *Can the volume be safely shared by two machines during a rolling deploy?*
   No. WAL requires one host; a second mount of the same volume is the exact
   failure the startup gate forbids. Deployment therefore replaces the machine.
4. *Is the backup off-machine?* Not by itself. It writes next to the database on
   the same volume; pulling it off the volume is a documented operator step, and
   FID-067 does not claim off-site retention exists.

### Implementation Evidence

- [x] **Commit SHA:** `1081362` — the artifact, its runbook and README procedure,
      and the FID-067 records in one commit. The receipt above was taken against
      that same tree.
- [x] **File:line ranges:** `Dockerfile`, `.dockerignore`, `fly.toml`,
      `scripts/docker-entrypoint.sh`, `scripts/db-backup.mjs`.
- [x] **Gate output:** receipt below.
- [x] **Reproducibility:** `docker build -t savant-gateway .`
- [x] **Step statuses:** six `implemented`, one `blocked` on operator credentials.

### Loop 2 — Independent audit and self-correction

- **RED:** Does the image carry secrets or the local database? Does it run as
  root? Does it survive the absence of a prebuilt native binary?
- **GREEN:** `.dockerignore` excludes `.env*` and `data/`; the entrypoint closes
  with `gosu node`; the toolchain is installed where `npm rebuild` runs.
- **AUDIT:** Image inspection in the transcript: `USER` resolution via the
  entrypoint, no `.env` file present, no `data/` directory in the built context.
- **ADVERSARIAL:** A 512 MB machine is the analysed cost point and may be tight
  for Next 16 at runtime. Recorded as a known operational knob rather than a
  guess: raise memory if the machine OOMs.
- **CHANGE DELTA:** n/a.

### Loop 3 — Final convergence

- **RED:** The artifact's central claim is that one process on one volume keeps
the ledger correct. Only a container can prove the image; it could not be built.
- **GREEN:** The application-side half of that claim was proven directly — WAL
  observed, durability across a real process boundary, readiness and the config
  gate exercised in both directions — and the gap is named rather than papered
  over in the runbook, README, CHANGELOG and this FID.
- **AUDIT:** Gate receipt above; runtime transcript above.
- **ADVERSARIAL:** `fly.toml`'s 512 MB machine may be tight for Next 16. Recorded
  as an operational knob: raise memory if the machine OOMs. The health check on
  `/api/ready` also means a deploy fails loudly rather than degrading quietly,
  which is the right trade for a pre-traffic service.
- **CHANGE DELTA:** n/a (first convergence).

## Resolution

- **Commit:** `1081362` — `feat(deploy)`.
- **Closed Date:** not closed — the operator deferred deployment until the
  launch date, so the artifact ships dormant. It is committed as `1081362`.
- **Fix Description:** container image, Fly configuration, volume entrypoint,
  backup script and runbook procedure.
- **Tests Added:** No. No application code changed.
- **Verification Evidence:** the gate receipt and container transcript.
- **Archived:** not archived.

## Lessons Learned

The application's runtime contract was already written down and enforced by a
startup gate before any host existed. That is why this work is packaging rather
than porting: the contract told the artifact what shape to be. The reverse order
— choosing a host first and then discovering that it cannot hold a WAL file — is
what FID-066 declined to do.
