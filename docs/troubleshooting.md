# Troubleshooting

Start with the exact command and its output. The gates print codes or check
names, not secret values; do not paste credentials into an issue.

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
| `db_missing` | `DB_PATH` is unset | Set an absolute path on the persistent volume. |
| `db_memory` | `DB_PATH` is `:memory:` | Use a file; in-memory storage loses the ledger. |
| `db_relative` | `DB_PATH` is relative | Use an absolute path. |
| `db_ephemeral` | `DB_PATH` is under the system temporary directory | Mount the volume and put the file outside temp. |
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

## Admin sign-in is unavailable

`/admin` needs both `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`. If either is
missing or short, the console is disabled rather than accepting a partial
credential. In a production build, `/dashboard` redirects to `/admin/login`;
the loopback development bypass is intentionally unavailable.

## Checkout returns `503`

Stripe is not configured. `POST /api/account/topup` returns `503` when
`STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is absent, and no credit is
invented. Set both in `.env.local` for test-mode checkout. For local
development-tenant calls, the **Tenant credit** card on `/admin` funds that
tenant; it does not credit a customer account. A redirect from Stripe is not
proof of payment; credit is written only by the signed webhook.

## `better-sqlite3` fails after a Node upgrade

The native module is rebuilt for the Node ABI that installed it. Rebuild it:

```bash
npm rebuild better-sqlite3
```

If the build tools are missing on Windows, install the current Visual Studio
Build Tools with the C++ workload, then rerun `npm install`.

## `database is locked` or a second process writes unexpectedly

This application is one process against one SQLite file. WAL mode does not make
two writers safe, and the process-local rate limiter assumes a single writer.
Stop the extra `next start`/`next dev` process. Do not run the HTTP suites
concurrently with a dev server that points at the same `DB_PATH`; the suites use
disposable databases, but a manual `npm start` can still collide on the port.

## Fly CLI is “not found”

On Windows installs the CLI is often at `%USERPROFILE%\.fly\bin\flyctl.exe`
(`~/.fly/bin/flyctl.exe` in Bash), which is not always on the shell `PATH`.
Either add that directory to `PATH` or invoke the binary directly:

```bash
"$HOME/.fly/bin/flyctl.exe" version
```

## `fly apps list` says the trial has ended

The authenticated CLI can reach Fly, but the account has no active payment
method. App and volume creation will fail until the operator enables billing:

```text
trial has ended, please add a credit card
```

No app, volume, machine or secret exists in that state, so a deploy or restore
cannot be timed. This is an account boundary, not a code defect. Record it as a
blocker and do not fabricate a deployment or recovery receipt.

## First `fly deploy` is also the first image build

The repository carries a `Dockerfile` and `fly.toml`, but the image has not been
built locally: Docker's Linux engine cannot start without virtualization on this
development machine. Fly's remote builder performs the first build. A successful
`/api/ready` is required before routing traffic; a 503 names configuration or
storage rather than entering rotation.

If the image build stops at `NEXT_PUBLIC_SITE_URL build argument is required`,
set the origin in both `fly.toml`'s `[build.args]` and `[env]` tables. Build
arguments are not inherited from the runtime environment, and static social
metadata needs the value during `next build`.

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
