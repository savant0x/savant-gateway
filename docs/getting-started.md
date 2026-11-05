# Getting started

This is the local first-run path: install, configure, sync a provider, create a
customer key and make one gateway call. For the operator console itself, see
[operator-first-run.md](operator-first-run.md). For failures, see
[troubleshooting.md](troubleshooting.md).

## Prerequisites

- Node `>=22.18.0` and npm.
- A provider credential for the upstream you intend to sync.
- Git Bash on Windows if you want to run the POSIX pre-push hook directly.

## Install and configure

```bash
git clone https://github.com/savant0x/savant-gateway.git
cd savant-gateway
npm install
cp .env.example .env.local
```

Set these in `.env.local`:

| Variable | Value |
| --- | --- |
| `PROVIDER_KEY` | The upstream credential. Server-only; never expose it to the browser. |
| `ADMIN_PASSWORD` | 12+ characters; enables `/admin`. |
| `ADMIN_SESSION_SECRET` | 32+ characters; signs the admin cookie. |

Generate a session secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

`DB_PATH` is optional and defaults to `./data/gateway.db`. The local origin
defaults to `http://localhost:3000`; leave `NEXT_PUBLIC_SITE_URL` alone for local
work.

`npm run config:check` is the general validator. It reports
`PASS (non-production)` when `NODE_ENV` is not `production`. The operator gate is
`npm run config:check:prod`, which enforces the deployment inventory; it is
expected to fail on a local development environment.

## Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

In development, `/dashboard` is a loopback operator console. In a production
build it redirects to `/admin/login`, so do not build a workflow around the
development bypass.

## Populate the catalog

The catalog starts empty; that is the honest state, not a failure.

1. Open `/admin/login` and sign in with `ADMIN_PASSWORD`.
2. Go to **Admin → Providers**.
3. Confirm the provider row's credential variable name matches
   `.env.local` (for example `PROVIDER_KEY`), then run **Test** and **Sync**.
4. Open `/models`. Until the sync completes, the page is empty and `/v1/models`
   returns nothing.

A sync is scoped to its provider: one failing upstream does not empty another
provider's catalog.

## Create a customer and a key

1. Open `/signup` and create an account. Signup requires accepting the current
   consumer policies.
2. Open `/account`. The page shows balance, plan, keys, usage and ledger.
3. Create a key and copy it once. Only its hash is stored; the full value is not
   recoverable later.
4. If you need paid calls, note the two credit paths: the **Tenant credit** card
   on `/admin` funds the local development tenant's keys and writes an audited
   ledger row. Customer accounts are funded by Stripe webhook fulfilment;
   without Stripe keys the customer top-up endpoint returns `503` and invents
   nothing, so a customer key can use free-pool models but cannot buy credit
   locally.

## Make the first call

List the models visible to the key, then call one:

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer sk-..."

curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-..." \
  -H "Content-Type: application/json" \
  -d '{"model":"<id from /v1/models>","messages":[{"role":"user","content":"ping"}]}'
```

Streaming uses the same route with `"stream": true`. A free-pool model never
debits credit; a paid model reserves a hold and settles actual usage on
completion, failure or stream close.

## Local database and recovery

Local development runs PostgreSQL through PGlite in `data/pg`; a deployment
runs on the server named by `DATABASE_URL`. There is no database file to copy.

```bash
npm run db:backup
npm run db:restore -- --from data/backups/gateway-<stamp> [--force]
```

A backup is a directory: `manifest.json` plus one `.jsonl` per table. The
manifest holds row counts and per-table checksums, and every dump is verified
against the ledger equation before it is written. A restore re-checks both and
rolls back on any disagreement. It is a logical snapshot, not point-in-time
recovery — there is no WAL archiving.

## Before a change

```bash
npm run check        # eslint + tsc --noEmit
npm test             # unit tests
npm run quality      # 400-line file ceiling
npm run build        # production build
npm run test:http    # builds must already exist; disposable database
npm run test:postgres # two-connection proof; native PostgreSQL or TEST_DATABASE_URL
npm run test:recovery # backup/restore drill; builds must already exist
npm run verify       # sequential runner; writes .verify/summary.json
```

The pre-push hook runs the same gates plus the attribution guard and fails
closed. CI runs the same set. `npm run verify` does not run
`config:check:prod`; that is a deployment-time gate, not a local one.

`npm run verify` needs no container runtime. With `TEST_DATABASE_URL` unset it
starts one pinned native PostgreSQL 17 cluster for the whole sequential run,
exports its URL to both `TEST_DATABASE_URL` and `HTTP_TEST_DATABASE_URL`, and
stops and removes it afterwards. The cluster binds only to loopback on an
ephemeral port, uses a random per-run password, and lives under ignored
`.scratch/postgres`; `npm run test:postgres` does the same for the mandatory
proof alone. Set `TEST_DATABASE_URL` to reuse an existing disposable endpoint
instead; a non-loopback endpoint is refused unless
`PUSH_POSTGRES_ALLOW_REMOTE=yes` is set.

For a push with an explicitly disposable endpoint, `npm run push:postgres`
starts the same native cluster, exports both test variables to `git push`, and
removes the cluster afterwards. Pass push arguments after `--`, for example
`npm run push:postgres -- origin main`.

A managed PostgreSQL server remains the explicit alternative.
`npm run push:supabase` creates a uniquely named `gateway_push_*` database on
the server named by `DATABASE_URL` (falling back to `DB_CONNECTION_STRING`),
exports both test variables to the push, and drops that database afterwards.
`npm run verify:supabase` runs the full `verify` gate against the same kind of
generated endpoint. The base database is never used as a test target. A hard
kill can leave the generated database behind; drop the name printed by the
script if cleanup reports a failure.

Every gate's raw output is kept in `.verify/<gate>.log`, and the JSON summary
records exit codes, durations, test totals and unexpected skips. A skipped
required gate fails the run; the summary is not a replacement for the logs.

The PostgreSQL concurrency proof is mandatory and never silently skips. It uses
`TEST_DATABASE_URL` when set; otherwise it starts the native cluster described
above and fails closed if that cannot start.

The main HTTP suite uses a PGlite wire fixture by default. The trial suite
requires real PostgreSQL because it proves concurrent trial admission: it uses
`HTTP_TEST_DATABASE_URL` (or the shared `TEST_DATABASE_URL`) when set, otherwise
it starts the native cluster and fails closed if that cannot start. The suites
drop and recreate the `public` and `content` schemas, and they refuse an
endpoint equal to `DATABASE_URL`; never point either variable at production. A
non-loopback HTTP endpoint also requires `DISPOSABLE_REMOTE_HTTP=yes`, which
`verify:supabase` sets for its generated database.
