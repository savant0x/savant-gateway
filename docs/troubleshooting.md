# Troubleshooting

Start with the exact command and its output. The gates print codes or check
names, not secret values; do not paste credentials into an issue.

> **Storage and deployment note (2026-11-04).** Current storage is PostgreSQL and
the current deployment path is Vercel. The SQLite, WAL, `DB_PATH` and Fly
sections below are historical troubleshooting from the superseded 2026-11-02
topology; they are retained as a record, not as current procedure. See
[deployment-runbook.md](deployment-runbook.md) for the dated banner.

## The catalog is empty

**Symptoms:** `/models` has no rows; `/v1/models` returns an empty list.

The catalog is populated by a provider sync, not seeded. Sign in at
`/admin/login`, open **Admin → Providers**, confirm the credential variable name
matches `.env.local`, then run **Test** and **Sync**. If the provider test fails,
the upstream URL, credential or account limit is the problem; a sync will not
repair it.

## `config-check: PASS (non-production)`

That is the expected result of `npm run config:check` when `NODE_ENV` is not
`production`. It validates that the script runs, not that the deployment
inventory is complete.

Use the operator gate:

```bash
npm run config:check:prod
```

It forces production mode and fails with issue codes. A local development
environment is expected to fail this command; that is not a regression.

## `config:check:prod` issue codes

| Code | Meaning | Fix |
| --- | --- | --- |
| `origin_missing` | `NEXT_PUBLIC_SITE_URL` is unset | Set the real HTTPS origin. |
| `origin_insecure` | Origin is not HTTPS | Use `https://`; localhost is not a production origin. |
| `origin_loopback` | Origin is localhost, a loopback address or a wildcard | Use the public hostname. |
| `origin_invalid` | Origin has credentials, a path, query or fragment | Supply an origin only, for example `https://gateway.example.com`. |
| `db_missing` | `DATABASE_URL` is unset | Set the production PostgreSQL URL. |
| `db_memory` | `DATABASE_URL` names PGlite or `:memory:` | Use a networked PostgreSQL database. |
| `db_relative` | `DATABASE_URL` is not an absolute URL | Use `postgres://` or `postgresql://` with a host. |
| `db_invalid` | `DATABASE_URL` is malformed, not PostgreSQL, or has no host | Correct the URL. |
| `db_ephemeral` | `DATABASE_URL` points at loopback in production | Use a networked host; only an explicit disposable start skips this check. |
| `admin_unconfigured` | Admin password or session secret is missing/too short | Set `ADMIN_PASSWORD` (12+) and `ADMIN_SESSION_SECRET` (32+). |
| `multi_worker` | `WEB_CONCURRENCY`/`PM2_INSTANCES` above 1 or `NODE_APP_INSTANCE` above 0 | Run one process. |
| `manual_signal_handler` | `NEXT_MANUAL_SIG_HANDLE` is truthy | Unset it so SIGTERM drains in-flight streams. |

## `npm run test:http` or `test:recovery` fails immediately

Both suites boot a production server and need a completed build. Run:

```bash
npm run build
npm run test:http
npm run test:recovery
```

`npm run verify` runs the build first, so use it when you want the full ordered
set. A dev server holding the same port can also make a suite fail to start; stop
the local server before running the gates.

## The native PostgreSQL cluster cannot start

Docker is not required and is not used. With `TEST_DATABASE_URL` unset,
`npm run verify` and `npm run test:postgres` use the pinned
`@embedded-postgres/windows-x64` or `@embedded-postgres/linux-x64` binaries. If
the error says the package is missing, run `npm install`: it is an
optionalDependency, so an unsupported platform is skipped rather than failing
the install. Only Windows x64 and Linux x64 are pinned; on another platform,
supply an explicit disposable endpoint.

A failed startup removes its own run directory and prints the reason. A hard
kill can leave a cluster running under `.scratch/postgres/run-*`; stop it with
the `pg_ctl` binary from the package, or delete that marked directory only
after the process is gone. Never point `TEST_DATABASE_URL` at the application
database: the HTTP suites drop and recreate schemas, and they refuse an endpoint
equal to `DATABASE_URL`.

A managed PostgreSQL server remains the explicit alternative:

```bash
# DATABASE_URL (or DB_CONNECTION_STRING) in .env.local names the server.
node scripts/with-supabase-postgres.mjs -- npm run test:postgres
```

The wrapper creates one generated `gateway_run_<timestamp>_<pid>` database,
sets `TEST_DATABASE_URL` and `HTTP_TEST_DATABASE_URL` for the child, and drops
only that database afterwards. The base database is never the test target. The
same wrapper backs `npm run verify:supabase` and `npm run push:supabase`. A hard
kill can leave the generated database behind; the script prints its name, and a
failed cleanup is reported rather than hidden.

## Admin sign-in is unavailable

`/admin` needs both `ADMIN_PASSWORD` (12+ characters) and
`ADMIN_SESSION_SECRET` (32+ characters) in the environment that is actually
serving the request. If either is missing or short, the console is disabled
rather than accepting a partial credential. In a production build,
`/dashboard` redirects to `/admin/login`; the loopback development bypass is
intentionally unavailable.

Open **Environment diagnostics** on the login screen. It reports each value as
`missing`, `present, below minimum`, or `valid`; it never prints the value. The
`POST /api/admin/session` response carries a `code` that names the refusing
layer:

| `code` | Meaning | Fix |
| --- | --- | --- |
| `admin_not_configured` | A variable is missing or short | Set both values in the served environment. |
| `database_unavailable` | The session epoch could not be read | Fix `DATABASE_URL`; `/api/ready` must pass. |
| `invalid_password` | The typed password did not match | Enter the exact configured value. |
| `rate_limited` | Five failed attempts in ten minutes | Wait for the window to expire. |
| `cross_origin` | Origin does not match the request host | Open the console on its own origin. |

### Vercel specifically

1. Set `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` for **Production** (and
   Preview if you sign in there), not only Development.
2. Remove any leading or trailing newline or quote from a pasted value. The
   diagnostics row says `(surrounding whitespace)` when one is present; a typed
   password can never match it.
3. Environment changes apply to a **new deployment**. Redeploy after editing
   them; an existing build keeps the environment it was created with.
4. Set `DATABASE_URL` to the production PostgreSQL endpoint. The login POST
   reads the session epoch from that database; a paused or missing Supabase
   project returns `503 database_unavailable` rather than `invalid_password`.
5. Confirm `/api/ready` returns 200 in the deployed environment before rotating
   any credential.

## Checkout returns `503`

Stripe is not configured. `POST /api/account/topup` returns `503` when
`STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is absent, and no credit is
invented. Set both in `.env.local` for test-mode checkout. For local
development-tenant calls, the **Tenant credit** card on `/admin` funds that
tenant; it does not credit a customer account. A redirect from Stripe is not
proof of payment; credit is written only by the signed webhook.

## `better-sqlite3` fails after a Node upgrade (historical SQLite)

The native module is rebuilt for the Node ABI that installed it. Rebuild it:

```bash
npm rebuild better-sqlite3
```

If the build tools are missing on Windows, install the current Visual Studio
Build Tools with the C++ workload, then rerun `npm install`.

## `database is locked` or a second process writes unexpectedly (historical SQLite)

This section describes the superseded SQLite topology. WAL mode did not make
two writers safe, and the process-local rate limiter assumed a single writer.
Current PostgreSQL deployments use shared admission and connection pooling; do
not apply this SQLite-specific workaround. Stop any extra local `next start` /
`next dev` process if the disposable test port collides.

## Historical Fly and container failures

The Fly and container path was removed on 2026-11-05 (FID-2026-1105-002). The
repository no longer carries `Dockerfile`, `.dockerignore`, `fly.toml` or a
container entrypoint, and the current delivery path is Vercel with PostgreSQL.
Earlier Fly CLI, trial-billing and first-image-build failures are recorded in
the [deployment runbook](deployment-runbook.md) and
[hosting decision](hosting-decision.md); do not follow them as current
procedure.

## The pre-push hook does not run

`npm install` sets `core.hooksPath` to `.githooks` through the `prepare` script.
Check it:

```bash
git config --get core.hooksPath
```

Expected: `.githooks`. Run the hook directly with Bash when diagnosing it:

```bash
bash .githooks/pre-push
```

A hook failure prints the gate name and exit status; fix that gate rather than
bypassing the hook.

## Still stuck

Check [getting-started.md](getting-started.md) for the first-run path,
[deployment-runbook.md](deployment-runbook.md) for production, and
[project-status.md](project-status.md) for the open gates. A reproducible defect
belongs in a FID or a GitHub issue; a live credential, customer key, prompt or
payment detail belongs nowhere in either.
