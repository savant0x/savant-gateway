# Provider scheduler runbook

Provider catalogs refresh automatically only when something calls the provider
heartbeat. The repository commits one Vercel Hobby daily cron for that purpose
and the application does **not** start an in-process timer. A saved schedule, a
`200`, or a recent `synced_at` is not by itself proof that a scheduler is
installed; the activation receipt below is.

## Heartbeat contract

- **Endpoint:** `/api/cron/providers`
- **Methods:** `GET` and `POST` are equivalent.
- **Authentication:** `Authorization: Bearer <secret>`,
  `x-provider-secret: <secret>`, or `x-cron-secret: <secret>`.
- **Secret source:** `PROVIDER_CRON_SECRET` or the platform-standard
  `CRON_SECRET`. Both are accepted at once; a precedence rule would break a
  deployment that sets both. If neither is set, every request returns `503`.
- **Wrong or missing secret:** `401`.
- **Scope:** only providers that are enabled, have a visible credential, and
  whose `synced_at` is older than `PROVIDER_SYNC_INTERVAL_HOURS` (default 6,
  `0` disables automatic refresh).
- **No cache:** every response carries `Cache-Control: no-store`.

Example response:

```json
{
  "ok": true,
  "attempted": ["savant"],
  "intervalHours": 6,
  "providers": [
    {
      "slug": "savant",
      "label": "Savant",
      "enabled": true,
      "configured": true,
      "syncedAt": "2026-11-05T00:00:03.000Z",
      "modelCount": 44,
      "servingCount": 31
    }
  ]
}
```

`attempted` names the providers whose sync this call ran. A provider failure is
swallowed by the freshness path, recorded on that provider's row, and reported
as attempted; `synced_at` does not advance. A `200` is a request receipt, not a
claim that every provider succeeded.

## Committed schedule

`vercel.json` contains exactly one cron:

```json
{
  "crons": [{ "path": "/api/cron/providers", "schedule": "0 0 * * *" }]
}
```

Vercel sends `Authorization: Bearer $CRON_SECRET`. Set that variable in the
project; `PROVIDER_CRON_SECRET` is an alternative for a generic scheduler that
calls the same route. Vercel Hobby supports daily crons only, so no six-hour or
other sub-daily entry may be added while the project is on Hobby.

The daily cron is the automatic floor, not a six-hour guarantee. The
`PROVIDER_SYNC_INTERVAL_HOURS` value is a due threshold: a page render may
refresh a provider sooner, and a provider last synced nine hours ago is due at
the next daily run.

## Manual AIO sync

**AIO sync** on `/admin/providers` posts to `/api/admin/providers/sync`, which
calls `syncAllEnabled`. It refreshes balance, subscription and catalog for every
enabled provider regardless of the due clock and reports per-provider warnings
(for example a missing key). It is an explicit operator action, not a scheduler
substitute.

The manual path is not covered by `provider_sync_leases`; a click can race the
daily run. Writes are idempotent, but upstream metadata reads can be duplicated.
A scheduler tick and a manual sync also bypass only the render path's
five-minute floor, never the due interval or the durable lease.

## Generic scheduler

Use the scheduler's secret store; never put the value on a command line where
the process table can read it.

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${PROVIDER_CRON_SECRET}" \
  "https://gateway.example.com/api/cron/providers"
```

Run it no more often than the five-minute attempt floor unless there is a
reason; the due interval still prevents redundant upstream work. A scheduler
cadence shorter than `PROVIDER_SYNC_INTERVAL_HOURS` mostly produces empty
`attempted` lists.

## Activation receipt

Do these in order, with deployment authorization:

1. Provision `CRON_SECRET` (or `PROVIDER_CRON_SECRET`) in the runtime secret
   store. Do not print it or commit it.
2. Deploy the tree that contains `vercel.json` and the route.
3. Confirm the provider row and `vercel.json` were deployed: the route must
   return `401` without the secret and `200` with it.
4. Call the endpoint once with the secret. Confirm `200` and a provider
   snapshot; a due provider's `attempted` list and `syncedAt` must agree.
5. Confirm the Vercel project shows the daily cron and that `CRON_SECRET` is set
   in the environment used by that deployment.
6. Wait for the next 00:00 UTC run. Confirm a provider's `synced_at` advanced
   without a page render or manual click. Record the observation; the repository
   has no scheduler-heartbeat table, so this is an operator receipt.
7. If the scheduler cannot be created or observed, do not claim automatic sync
   is live. The endpoint and the committed cron still work when triggered
   manually, and the card must not be read as scheduler health.

## Activation status — 2026-11-05

Production is deployed at `https://savant-gateway.vercel.app`
(`dpl_53PM1vwqGkVk61xzaCWXfruwL2CC`). `CRON_SECRET` is set as a Production
Secret. The route returned `401` without the secret and `200` with it; the
empty `attempted` list was correct because Savant had synced at 21:08Z and was
not due. `vercel crons list` shows the single `0 0 * * *` job, enabled, and
`vercel crons run` invoked it at 21:52:32Z with a `200` in runtime logs. The
full receipt is in FID-2026-1105-004.

Still open: the first 00:00 UTC scheduled run and a refresh of a due provider.
At 00:00 UTC Savant will still be inside the 6h window, so the expected
`attempted` list is empty; observe a later daily run, or a due provider, before
claiming automatic refresh is proven.

## Failure semantics

- No configured secret: `503`, no database or upstream work.
- Wrong secret: `401`, no database or upstream work.
- Nothing due: `200` with `attempted: []`. This is normal, not an error.
- Provider failure: `200` with the slug in `attempted`; the provider row records
  the failure and `synced_at` stays unchanged. The next tick retries.
- Another instance holds the lease: that provider is skipped, not failed. The
  next tick re-evaluates it after release or expiry.
- A serverless invocation that times out mid-provider leaves a lease until it
  expires (default 10 minutes); the next tick can reclaim it.

## Related

- [Providers](providers.md)
- [Operations runbook](operations-runbook.md)
- [Content scheduler](content-scheduler.md)
