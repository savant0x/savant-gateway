# Deployment runbook (prepared, not executed)

Status: the artifact, environment inventory, health endpoints, storage and
shutdown behavior described here are implemented and verified locally. **No
deployment, hosting provisioning, DNS change, secret injection or release has
been executed.** Deployment requires explicit operator approval and the operator
inputs listed in "Missing operator inputs" below.

Since FID-2026-1030-067 the host is chosen — one persistent process on a local
volume, per [hosting-decision.md](hosting-decision.md) — and the packaging
exists (`Dockerfile`, `.dockerignore`, `fly.toml`, `scripts/docker-entrypoint.sh`).
What has *not* happened is a build of that image: Docker's Linux engine cannot
start on the development machine, so the image is unbuilt and the first
`fly deploy` is also its first build. The application-side contract below is
verified; the container is not.

## Runtime contract

- Single application process. `WEB_CONCURRENCY`, `PM2_INSTANCES` must be unset
  or `1`; `NODE_APP_INSTANCE` must be `0`. Rate buckets are process-local, so a
  second process multiplies admission while every instance reports healthy.
- SQLite on a **persistent volume**. The file must be readable and writable by
  the process; WAL mode requires two sibling files (`gateway.db-wal`,
  `gateway.db-shm`) on the same filesystem.
- One machine, one process, one database file. Do not publish a serverless or
  multi-replica deployment: it contradicts the storage and accounting contract
  and is rejected by the validator.

## Environment inventory

Checked by `npm run config:check` and the startup gate (`instrumentation.ts`):
a production process that cannot honour this contract fails to start with issue
codes, not values.

Required in production:

| Env var | Requirement |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public canonical origin, `https://`, non-loopback, no credentials/path/query/fragment. Used for Stripe redirects, customer links, the sitemap/robots canonical origin, and static social metadata at build time. |
| `DB_PATH` | Absolute path to the SQLite file, outside the system temporary directory. |
| `ADMIN_PASSWORD` | 12+ characters. Enables `/admin`. |
| `ADMIN_SESSION_SECRET` | 32+ characters. Rotating it invalidates operator sessions. |

Optional (see `../.env.example` for the full list and defaults):
`PROVIDER_KEY`, `COMMANDCODE_API_KEY`, `APIXO_API_KEY`, `PROVIDER_BASE_URL`,
`PROVIDER_PUBLIC_MODELS_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`ARTIFICIAL_ANALYSIS_API_KEY`, `TRIAL_ENABLED=false` (must stay `false` until
launch rulings 044 close), free-pool knobs (`FREE_*`), rate limits
(`FREE_SHARED_RPM`, `PAID_KEY_RPM`).

Forbidden / never set:

- `GATEWAY_DISPOSABLE_START=yes` — explicitly opts a production start into a
  loopback origin and a throwaway database; only the mechanical HTTP
  verification suites set it. Its presence on a real deployment is a
  misconfiguration and shows up as `mode: "disposable"` on `/api/ready`.
- `NEXT_MANUAL_SIG_HANDLE` — replacing the signal handler forfeits drain; the
  validator rejects it.

## Start procedure

```bash
npm ci
npm run config:check   # operator gate; passes only with the inventory above
npm run build
npm start              # instrumentation gate re-validates and refuses bad config
```

The startup gate runs once per process before serving and exits with issue
codes (`origin_missing`, `db_ephemeral`, `multi_worker`, …). The full list is in
`../lib/production-config.ts`.

## Fly.io procedure

Chosen because its volumes are local NVMe rather than network storage: SQLite
runs in WAL mode here, and WAL requires every reader and writer on the same host
and the same filesystem. Railway, Render, Hetzner's network volumes and Vercel do
not meet that; see [hosting-decision.md](hosting-decision.md).

One-time provisioning (operator, spends money):

```bash
fly auth login
fly apps create savant-gateway        # or change `app` in fly.toml first
fly volumes create gateway_data --region ord --size 1
fly secrets set ADMIN_PASSWORD=... ADMIN_SESSION_SECRET=...
# once a provider is configured: fly secrets set PROVIDER_KEY=...
```

Do not run `fly launch`: it regenerates the configuration this file describes.
Create the app and the volume explicitly.

Before the first deploy, set `NEXT_PUBLIC_SITE_URL` in `fly.toml` in **both**
`[build.args]` and `[env]` to the origin that will actually serve —
`https://<app>.fly.dev` until a custom domain exists. They must match. The build
argument is what static pages use for their social image URLs, which are
resolved during `next build`; the runtime value feeds redirects and the
sitemap/robots routes. A leftover localhost value fails the readiness check
rather than going live with broken redirects and cookies. The sitemap and robots
routes read the runtime value per request, so changing the origin does not
require a rebuild for them; changing static social metadata does.

```bash
fly deploy            # builds the image on Fly's remote builder
fly status
fly logs
curl -fsS https://<app>.fly.dev/api/ready
curl -fsS https://<app>.fly.dev/sitemap.xml | head -3  # public origin, not localhost
```

The local machine needs no Docker for this. What `fly.toml` pins, and why:

| Setting | Reason |
| --- | --- |
| `health check: /api/ready` | Readiness, not liveness. 503 unless the origin is https, `DB_PATH` is durable, admin credentials exist and the volume accepts a write, so a bad deploy never enters rotation. |
| `auto_stop_machines = "off"` | The gateway settles billing on stream close; a suspended machine cannot. |
| one machine, no process manager | A second writer against this volume corrupts the ledger, and the startup gate rejects a multi-process topology. |
| `kill_timeout = "120s"` | Drain long streams before the process is replaced. |
| entrypoint drops to `node` | The volume mount arrives root-owned; the server should not run as root to fix that. |

A deploy replaces the machine because the volume attaches to exactly one at a
time. Expect a few seconds of downtime per release; that is the cost of the
single-writer contract, not a misconfiguration.

### Backup on the volume

```bash
fly ssh console -C "node /app/scripts/db-backup.mjs"
fly sftp get /data/backups/<name>.db ./
fly sftp get /data/backups/<name>.db.json ./
```

The script uses SQLite's online backup API, verifies `integrity_check`, requires
the core customer/money tables, and writes a `.json` sidecar containing the
SHA-256, byte count, page size, journal mode and table list. The `.db` and its
`.json` are one restore point: copy both off the volume. Retention
(`BACKUP_RETENTION`, default 7) prunes the pair together. On POSIX the backup
directory is created `0700` and files are `0600`; a failed backup exits non-zero
and leaves no sidecar, so an unverified file is never presented as a restore
point.

Copies still land on the **same volume as the database**. Pulling them off is a
separate, required step, and off-site retention is not automated yet.

The backup interval is the recovery-point objective (RPO). The operator must
choose the interval and the restore-time objective (RTO) before launch; this
repository does not choose them. An example on a host with cron:

```cron
17 */6 * * * cd /app && DB_PATH=/data/gateway.db BACKUP_RETENTION=14 \
  node scripts/db-backup.mjs >> /data/backups/backup.log 2>&1
```

On Fly, use a scheduled machine or an external scheduler; the app container does
not run cron.

## Health and readiness

- `GET /api/health` — liveness only: the process can answer. It makes no claim
  about the database. Wire container restarts / `docker healthcheck` here.
- `GET /api/ready` — truthful readiness: reports `ready` / `not_ready` with
  `checks: { configuration, storage }`, `mode: "durable" | "disposable"`, and
  HTTP 503 when either fails. Storage is probed by listing required tables and
  performing a write inside a transaction that is always rolled back, so a
  read-only mount fails here instead of on the first customer write. Wire the
  load balancer / ingress health route here, and keep the route uncached.

Both endpoints are public, non-cacheable, and intentionally expose no secret,
no path and no balance information.

## Ingress requirements (operator)

- TLS termination in front of the process; `NEXT_PUBLIC_SITE_URL` must match the
  certificate's public origin.
- The proxy must preserve `Host` and set `X-Forwarded-For` correctly. Request
  guards never trust a client-supplied forwarded value for authorization, but
  correct proxy headers keep customer rate limits honest.
- SSE: the proxy must not buffer `/v1/chat/completions` responses (disable
  response buffering) and must leave the client- or request-cancelled stream
  connected long enough for the gateway to settle its accounting. Set
  read/send timeouts above the slowest model's streamed response, and keep
  `proxy_read_timeout` above 300s for gateway paths.
- Admin access (`/admin`, `/api/admin/*`) is cookie-guarded with a strict
  same-origin check; optionally restrict it at the proxy as defence in depth.

## Shutdown and drain

`next start` closes the listening socket on SIGTERM and lets in-flight requests
finish. Do not install a manual signal handler. The verifier rejects
`NEXT_MANUAL_SIG_HANDLE`, so drain behavior is the supported path:

1. SIGTERM → listener closes, admission stops.
2. In-flight gateway requests settle into SQLite (holds created before work,
   released on settle; unresolved holds stay visible for reconciliation).
3. Process exits. The persistent volume keeps the state.

Containers should use a grace period comfortably longer than the longest
expected streamed completion (suggest 120–300s) rather than SIGKILL'ing early.

## Storage failure behavior

If the SQLite file is missing, read-only, or loses required tables, `/api/ready`
returns 503 `not_ready` with `checks.storage: "unavailable"`. The HTTP suite
proves this by dropping a required table on the disposable suite database
(`readiness fails closed when storage loses a required table`).

## Backup and restore

### Backup

1. Run `DB_PATH=/data/gateway.db node scripts/db-backup.mjs` (or
   `npm run db:backup`) while the process is live. The online API produces one
   consistent file; do not copy only `gateway.db` while writes continue.
2. Require exit 0 and both `<name>.db` and `<name>.db.json`.
3. Pull both files off the volume and verify `sha256sum <name>.db` against the
   sidecar. Keep at least one copy outside the volume/provider failure domain.

### Restore and drill

Never overwrite the live file to "test" a restore. Restore into a new path:

```bash
node scripts/db-restore.mjs \
  --backup /data/backups/<name>.db \
  --target /data/restore/gateway.db
```

The tool refuses a missing or mismatched sidecar (only a legacy file may use
`--allow-unverified`), an existing target, and a target equal to `DB_PATH`. It
checks integrity and foreign keys, required tables, the credit equation
(`balance = latest baseline + ledger`), negative balances and orphan ledger rows,
then writes `<target>.restore.json` with counts and the unresolved
settlement/quarantine inventory.

1. Stop the gateway with SIGTERM and let it drain.
2. Move the verified file to the volume at `DB_PATH`, keeping the previous file
   until readiness passes; or point `DB_PATH` at the verified target.
3. Start and require `GET /api/ready` → 200 `ready`.
4. Sign in to `/admin/reconciliation`; confirm `totals.balanced` and review the
   accounts. The restore receipt's unresolved settlements and quarantined holds
   are the recovery worklist.
5. Reconcile payments delivered after the snapshot: replay the missing Stripe
   events and match `topups.provider_ref` / `billing_events`. A replayed event id
   is a claim conflict and a replayed provider reference violates the unique
   constraint, so it cannot credit the same top-up twice.
6. Re-admit traffic only after reconciliation.

### Targets and evidence

- RPO is the backup interval; RTO is stop + restore + readiness +
  reconciliation. Both are operator targets and must be recorded before launch.
- `npm run test:recovery` is the disposable drill: it seeds a reconciled credit
  history, keeps writes running during the backup, restores into a new file,
  boots the real server, checks `/api/admin/reconciliation`, and restarts on the
  restored copy. `npm run verify` runs it after the HTTP suite.
- The local drill currently completes in a few seconds but is **not** a
  production-equivalent timing. The first timed restore on the actual volume is
  still required and must be recorded.

### Code rollback

Roll back the application image, not the database. Migrations are additive
(`CREATE TABLE IF NOT EXISTS`, `ensureColumn`); the current image opens and
upgrades a restored snapshot forward. Do not rewind payments or repair history
with ad-hoc SQL; use the audited adjustment/refund endpoint and record the
reference.

### Secret rotation

`ADMIN_SESSION_SECRET` rotation invalidates operator sessions immediately (safe
to rotate). Provider and Stripe keys are env values only, never persisted rows,
so rotation is an environment change and a restart.

## Dependency vulnerability disposition

`npm audit --omit=dev --audit-level=high` runs as part of the implementation
verification. Disposition for this run (2026-10-30): **0 vulnerabilities found
in production dependencies** (`found 0 vulnerabilities`, exit 0); no
high/critical finding required a waiver or a resolution plan. Re-run this audit
before going live and record it in
[dev/session-summaries/2026-10-30-deployment-readiness.md](../dev/session-summaries/2026-10-30-deployment-readiness.md).

## Missing operator inputs (blockers to actual deployment)

The following are open inputs from the FIDs, not implementation gaps:

1. **Hosting, domain, TLS and process count** (057): provider chosen (Fly), but
   no app, volume, secret or domain has been provisioned, so nothing is attached
   and nothing is served. The artifact supports exactly one process on one
   volume.
2. **Offering and economics** (044, open): free-versus-trial offering, approved
   model/price set, resale permission and confirmed rate card, fee/refund/expiry
   policy, funded upstream wallet or reserve, permission to publish savings
   claims. Until funded, the observed upstream spend is zero and the recorded
   offering evidence stays a sensitivity, not a price.
3. **Subscriptions/trials state** (044, kept off): `TRIAL_ENABLED=false`,
   zero grant budget, no trial model pairs, no purchasable plan locally.
4. **Safe process topology** (048, converged, unimplemented): the shared
   admission service for a multi-process future does not exist; do not scale
   the process count until it does.
5. **Ingress acceptance** (057): real proxy receipts for SSE flush/cancel,
   timeouts and header behavior must be collected against the chosen host; they
   cannot be produced locally.
6. **Database recovery targets and real-volume drill** (058): the backup/restore
   path and a disposable drill are verified, but the RPO/RTO are not set and no
   timed restore has run on the actual volume. Treat the local drill as code
   evidence, not a production recovery receipt.
7. **Deployment itself** (062): publishing remains gated on explicit operator
   approval even after every artifact check passes.

## What was verified here

- `tests/production-config.test.mjs`: missing/unsafe origin and database,
  loopback, temporary paths, worker-count signals, manual signal handling,
  exact-opt-in disposable mode, truthful readiness combinations, and that the
  operator gate emits codes and never configured values.
- HTTP suite additions: liveness claims, readiness propagation and disclosure,
  `no-store` on both endpoints, baseline security headers on a page response,
  and readiness failing closed (503) after storage loses a required table.
- Startup gate exercised as part of every `next start` in the suites.

### FID-2026-1030-067 additions

Run against a real production `next start` with the environment shape `fly.toml`
sets, on a file database instead of the suites' disposable one:

- `/api/ready` → `200 {"status":"ready","configuration":"ok","storage":"ok","mode":"durable"}`.
- A signup wrote a customer through the app; an independent process then read
  the file and reported `journal_mode: wal` with the row present, so the WAL
  siblings are a real requirement of this tree rather than an assumption.
- The server was stopped, confirmed to refuse connections, restarted as a new
  process, and that new process authenticated the account created by the previous
  one — persistence across a process boundary, not within it.
- `scripts/db-backup.mjs` produced a copy of the live database reporting 35
  tables, `integrity ok`, from which the account was readable; retention pruned
  the oldest and left no orphaned `-wal`/`-shm` files.
- `npm run config:check` passed on the correct environment and exited 1 with
  `admin_unconfigured`, `origin_loopback`/`origin_insecure`, `db_relative` and
  `multi_worker` on each broken one, printing codes and never values.

Not verified: the container image itself. `docker build` could not run because
Docker's Linux engine cannot start without virtualization enabled on this
machine.
