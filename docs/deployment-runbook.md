# Deployment runbook (prepared, not executed)

Status: the artifact, environment inventory, health endpoints, storage and
shutdown behavior described here are implemented and verified locally. **No
deployment, hosting provisioning, DNS change, secret injection or release has
been executed.** Deployment requires explicit operator approval and the operator
inputs listed in "Missing operator inputs" below.

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
| `NEXT_PUBLIC_SITE_URL` | Public canonical origin, `https://`, non-loopback, no credentials/path/query/fragment. Used for Stripe redirects and customer links. |
| `DB_PATH` | Absolute path to the SQLite file, outside the system temporary directory. |
| `ADMIN_PASSWORD` | 12+ characters. Enables `/admin`. |
| `ADMIN_SESSION_SECRET` | 32+ characters. Rotating it invalidates operator sessions. |

Optional (see `../../.env.example` for the full list and defaults):
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

- Backup: while the process runs, copy the database with SQLite's online backup
  (or stop the process and copy `gateway.db` plus `-wal`/`-shm` together);
  copying only the main file while the process writes is not a restore point.
- Restore: stop the process, put the database files back on the persistent
  volume, set the same `DB_PATH`, start, and confirm `/api/ready` returns 200
  `ready` before re-admitting traffic.
- Secret rotation: `ADMIN_SESSION_SECRET` rotation invalidates operator
  sessions immediately (safe to rotate). Provider and Stripe keys are env
  values only, never persisted rows, so rotation is an environment change and a
  restart.

## Dependency vulnerability disposition

`npm audit --omit=dev --audit-level=high` runs as part of the implementation
verification. Disposition for this run (2026-10-30): **0 vulnerabilities found
in production dependencies** (`found 0 vulnerabilities`, exit 0); no
high/critical finding required a waiver or a resolution plan. Re-run this audit
before going live and record it in
[dev/session-summaries/2026-10-30-deployment-readiness.md](dev/session-summaries/2026-10-30-deployment-readiness.md).

## Missing operator inputs (blockers to actual deployment)

The following are open inputs from the FIDs, not implementation gaps:

1. **Hosting, domain, TLS and process count** (057): no provider chosen, no
   domain reserved, no persistent volume attached. The artifact supports
   exactly one process on one volume.
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
6. **Deployment itself** (062): publishing remains gated on explicit operator
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
