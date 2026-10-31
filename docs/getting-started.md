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

The database is a single SQLite file at `DB_PATH`. WAL mode adds
`gateway.db-wal` and `gateway.db-shm` beside it, so keep the file and its
siblings together.

```bash
npm run db:backup
npm run db:restore -- --backup <name>.db --target <new-path>.db
```

A backup is one `.db` plus its `.db.json` sidecar. Do not copy only the `.db`
while writes continue, and never overwrite the live file to test a restore.

## Before a change

```bash
npm run check        # eslint + tsc --noEmit
npm test             # unit tests
npm run quality      # 400-line file ceiling
npm run build        # production build
npm run test:http    # builds must already exist; disposable database
npm run test:recovery # backup/restore drill; builds must already exist
npm run verify       # all of the above, including config:check
```

The pre-push hook runs the same gates plus the attribution guard and fails
closed. CI runs the same set. `npm run verify` does not run
`config:check:prod`; that is a deployment-time gate, not a local one.
