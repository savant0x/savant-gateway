# Content scheduler runbook

Signal source fetching is automatic only when an external scheduler calls the
authenticated heartbeat. The application does **not** create a timer, and a
saved dashboard switch is not proof that a scheduler exists. Health is derived
from durable run rows.

## Heartbeat contract

- **Endpoint:** `/api/cron/content`
- **Methods:** `GET` and `POST` are equivalent.
- **Authentication:** `Authorization: Bearer <secret>`,
  `x-content-secret: <secret>`, or `x-cron-secret: <secret>`.
- **Secret source:** `CONTENT_CRON_SECRET`, falling back to the platform-standard
  `CRON_SECRET`. If neither is set, every request returns `503`.
- **Wrong or missing secret:** `401`.
- **Paused policy:** authenticated requests still return `200` with
  `paused: true` and record a paused run. No source work is admitted.
- **Enabled policy:** the run processes at most the configured batch limit within
  a 35-second work budget. Unfinished source writes keep a revision-bound
  checkpoint for the next tick.

Example response:

```json
{
  "paused": false,
  "runId": "…",
  "status": "ok",
  "sourcesDue": 3,
  "claimed": 3,
  "skipped": 0,
  "deadlineReached": false,
  "results": [],
  "policyRevision": 2
}
```

## Configure the policy

Open `/admin/content` and use **Automation heartbeat**:

- **Admit automatic work:** off records paused heartbeats.
- **Sources per heartbeat:** 1–50, default 10.
- **Expected heartbeat (min):** 1–60, default 5.
- **Save policy:** serialized by revision; a stale editor receives a conflict.

Pause stops both automatic fetching and the future stored-content rematch work.
Reviewing accepted/dismissed decisions is unaffected.

## Supported schedulers

### Vercel Cron

Vercel sends `Authorization: Bearer $CRON_SECRET` to a cron path. Set
`CRON_SECRET` and add a schedule only on a plan that supports the chosen
frequency. **Vercel Hobby supports daily crons only**; a `*/5` schedule is not a
supported Hobby configuration. On Pro or Enterprise, for example:

```json
{
  "crons": [{ "path": "/api/cron/content", "schedule": "*/5 * * * *" }]
}
```

The schedule value must match the plan's minimum interval and the dashboard's
expected heartbeat. Do not commit a Vercel schedule until the operator confirms
the plan and authorizes deployment.

### Generic cron or CI scheduler

Use the scheduler's secret store; do not put the secret on a command line where
the process table can read it.

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${CONTENT_CRON_SECRET}" \
  "https://gateway.example.com/api/cron/content"
```

Run it at least as often as the expected heartbeat. A five-minute schedule with
a five-minute expected heartbeat gives a two-period (plus one minute) overdue
window.

### systemd timer

A timer can call the same endpoint. Put the secret in a root-readable
`EnvironmentFile` and keep it out of `ExecStart` arguments. The service should
be a oneshot; the timer's `OnUnitActiveSec` is the heartbeat interval.

### Managed job runners

Fly Machines, Render Cron Jobs, Railway cron services and similar products can
invoke an HTTP endpoint. Configure the header/secret in the job definition and
use the same interval and endpoint. The repository does not ship a provider
specific job definition because the backend is an operator input.

## Activation receipt

Do these in order:

1. Provision `CONTENT_CRON_SECRET` (or `CRON_SECRET`) in the runtime secret
   store. Do not print it or commit it.
2. Deploy the code with operator authorization.
3. Open `/admin/content`, confirm the expected heartbeat and batch size, then
   save the policy.
4. Call the endpoint once with the secret. Confirm `200`, `paused: false` when
   automation is enabled, and a new run on `/admin/content/history`.
5. Create the external schedule. Do not treat this document as activation.
6. Wait for at least two heartbeat periods and confirm the history shows new
   `scheduled` runs and the panel reports **Healthy**.
7. Stop the scheduler and wait for two periods plus one minute. The panel must
   report **Heartbeat overdue**. Start it again and confirm recovery.
8. If the scheduler cannot be created, leave the dashboard policy off. An
   enabled flag without a heartbeat is deliberately reported as **Awaiting first
   heartbeat**, not healthy.

## Failure semantics

- A failed source increments its failure streak and advances only the attempt
  clock. Its public freshness uses the last successful completion.
- Five consecutive fetch failures disable the source. A configuration error
  stays visible without disabling it.
- A budget pause closes the cycle as `paused`, stores a checkpoint when item
  writes remain, and does not advance the attempt or success clock.
- An expired run lease becomes `interrupted` on the next tick; it is never
  reported as a successful fetch.
- A deliberately deleted source keeps its cycle receipt with a snapshotted label.

## Related

- [Operator first run](operator-first-run.md)
- [Operations runbook](operations-runbook.md)
- [Troubleshooting](troubleshooting.md)
