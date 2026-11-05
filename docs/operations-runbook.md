# Operations monitor and incident response

Status: implemented and verified locally (FID-2026-1030-059). No webhook
destination, scheduler or production deployment is configured in this
repository. Until an operator sets a destination and schedules the monitor,
incidents are recorded and visible but no external alert is delivered. That
external receipt is an operator step, not a code claim.

## What runs

`scripts/operations-monitor.mjs` (also `npm run operations:monitor`) is one
run. It reads a snapshot from durable state, evaluates rules, opens or resolves
deduplicated incident rows, and attempts due alert deliveries. `POST
/api/admin/operations { "action": "tick" }` and the **Run monitor now** button on
`/admin/operations` run the same function.

The application does **not** start an in-process timer: a second process or a
timer per instance would multiply deliveries. Schedule one run from cron, a Fly
scheduled machine or another external scheduler:

```cron
*/5 * * * * cd /app && DATABASE_URL=postgres://user:pass@host/db \
  OPERATIONS_ALERT_WEBHOOK_URL=https://alerts.example.test/hook \
  node scripts/operations-monitor.mjs >> /data/operations-monitor.log 2>&1
```

The monitor reads PostgreSQL directly. Set `DATABASE_URL` for a networked
database, or `PG_LOCAL_PATH` to a PGlite directory for a single-process
deployment. With neither set it exits non-zero naming what is missing rather
than guessing a path, and it never runs a destructive migration.

The monitor exits non-zero only when the run itself fails or a configured
delivery attempt fails. An unconfigured webhook exits 0 and says so on stderr;
it is neither a successful delivery nor a scheduler failure.

## Automatic provider sync

Provider catalogs refresh without a scheduler. A render of `/`, `/models` or the
catalog data calls `ensureProvidersFresh()` (`lib/provider-sync.ts`): any enabled
provider whose `synced_at` is older than `PROVIDER_SYNC_INTERVAL_HOURS` (default
6) is synced in the background, at most one run per process at a time and never
more often than every five minutes. The page always serves stored rows, so an
unresponsive upstream cannot delay it. `PROVIDER_SYNC_INTERVAL_HOURS=0` turns it
off and leaves only the **Sync** button.

An imported catalog is not a published catalog. A paid row without a sell price
is never public, and a row priced from a manually entered cost is withheld once
that cost is older than `PROVIDER_PRICE_MAX_AGE_DAYS` (default 30, `0` disables).
Re-enter the cost in `/admin/pricing` to republish it. This is the guard against
silent upstream price drift on providers that publish no machine-readable rates;
crypto sales are not refundable, so a price nobody re-checked is not offered.

## Funnel activity events

`activity_events` holds the account and money lifecycle plus five bounded
product events. The writer allowlists identifiers such as `modelId`,
`contentId`, `groupSlug` and `source`; prompts, completions, keys, emails and
IPs are refused.

| Event | Written when | Identity |
| --- | --- | --- |
| `follow_created` | a signed-in customer newly follows a model | model id |
| `save_created` | a signed-in customer newly saves an item | content id |
| `content_model_click` | a signed-in customer opens a model from an item | content and model ids |
| `briefing_return` | a signed-in customer loads `/signal/briefing` | page id |
| `first_completion` | the first successful settlement for a customer | durable per-user marker |

`first_completion` is written after settlement commits and is best-effort; a
failed event never rolls back a paid or free call. The other four are also
best-effort and record a new action, not a repeat. `GET /api/admin/activity`
returns the latest events plus a 30-day `summary` grouped by UTC day and kind;
`/admin` shows the per-kind totals. Counts are a lower bound when a best-effort
write was lost. This surface adds no new retention window.

## What it observes

All values come from PostgreSQL; the monitor makes no upstream call and no
health claim from missing data.

| Area | Source | Rule |
| --- | --- | --- |
| Traffic | `usage_events` in the window | Error-rate warning/critical above `OPERATIONS_ERROR_RATE_BPS`, only with at least `OPERATIONS_MIN_REQUESTS` calls. No calls is `No traffic`, never 0% healthy. |
| Settlements | `settlements` | Any `admitted` row older than `OPERATIONS_SETTLEMENT_MAX_AGE_SECONDS`; severity escalates at twice the age. |
| Payments | `billing_events` | Any `failed`/`quarantined` event is critical; a `claimed` event older than `OPERATIONS_PAYMENT_MAX_AGE_SECONDS` is a warning. |
| Quota | enabled `providers` | `quota_error` critical; stale observation warning; configured provider with no observation warning. |
| Reserve | `providers.subscription_tokens_remaining` | Below `OPERATIONS_RESERVE_MIN_TOKENS` per provider when the rule is enabled. |
| Money | `credit_holds`, `quarantined_holds`, `users.credit_micros` | Displayed for reconciliation; no rule. |
| Storage | `pg_database_size(current_database())` and `BACKUP_DIR` | Database size and backup-age rules when their thresholds are non-zero. |
| Admission | `settings` | Current `open`, `paused` or `draining` state and reason. |

Threshold parsing is bounded. A malformed value falls back to the safe default,
never to "off". Empty/zero rules (`OPERATIONS_RESERVE_MIN_TOKENS`,
`OPERATIONS_DATABASE_MAX_BYTES`, `OPERATIONS_BACKUP_MAX_AGE_SECONDS`) are
disabled until the operator chooses a floor; the remaining rules have
conservative defaults.

## Incidents and delivery

`operations_incidents` is durable and deduplicated by fingerprint. A repeated
open condition refreshes `last_seen` without another alert. A cleared condition
is marked resolved and queues one recovery. A resolved condition that returns
reopens the same row and queues a new alert. Warning → critical queues an
escalation. Acknowledgment records attribution only; it does not resolve the
condition or stop delivery.

The transport is a single operator-supplied HTTPS webhook. No vendor is
selected in the tree. Set:

```bash
OPERATIONS_ALERT_WEBHOOK_URL=https://...
# optional, 16+ characters
OPERATIONS_ALERT_WEBHOOK_SECRET=...
```

The request is `POST application/json` with
`x-savant-event: operations.incident`,
`x-savant-delivery: <id>:<alert|recovery>:<attempt>`, and, when a secret is set,
`x-savant-signature: sha256=<hex>` over the raw body. The payload carries the
fingerprint, severity, status, title, detail and timestamps; it never contains a
provider key, customer key, password or Stripe secret.

Delivery state is recorded per incident: `unconfigured`, `pending`, `delivered`
or `failed`, with attempts, next attempt and a redacted error. Retries use
bounded exponential backoff and stop at `OPERATIONS_ALERT_MAX_ATTEMPTS`; an
exhausted `failed` row is not retried forever. The webhook URL is treated as a
potential credential and is removed from stored errors before redaction.

## Operator controls

Open `/admin/operations` (admin session required; same-origin enforced by the
API):

- **Pause admission** / **Drain admission** require a reason. New inference
  receives HTTP 503 with `Retry-After: 30` after authentication and model
  resolution, before any rate limit, provider slot, allowance hold or credit
  hold. No usage row or hold is created for a refused call.
- **Resume admission** returns the state to `open`.
- Pause and drain do **not** stop signed payment webhooks, settlement,
  quarantine release, reconciliation or in-flight streams. `/api/ready` stays
  200 and reports `admission`, so the console and payment path remain reachable.
- **Providers** can be disabled independently. Disabling removes that provider's
  models from admission; it does not refund or modify existing holds.

The settings persist across restart. `GET /api/admin/operations` is the same
overview as the page and is protected by the admin cookie and same-origin check.

## First response

1. Open `/admin/operations`; read the incident detail and the latest monitor
   time. Do not assume a quiet page means health: check whether the monitor has
   run and whether traffic exists.
2. For payment incidents, verify the signed delivery in the payment provider's
   dashboard and reconcile `topups` / `billing_events`. Replay only through the
   signed webhook path; never mark a payment paid by SQL.
3. For unresolved settlements, reconcile `settlements`, `credit_holds` and
   `quarantined_holds`. Release a quarantined hold only with a recorded note.
4. For quota errors/stale observations, check the provider status page and
   credentials, then refresh the provider from the operator console. Calls are
   refused on unknown capacity by design.
5. Pause admission before a risky repair, then resume only after reconciliation.
6. Acknowledge the incident with attribution; it clears when the next monitor
   run no longer sees the condition.

## Verification boundary

Local evidence covers rule evaluation, dedup, resolve/reopen, retry/backoff,
redaction, HMAC signing, a local webhook receiver, pause/drain refusal before
usage, readiness while paused, resume, and provider disable. It does not prove a
production webhook received an alert, a scheduler is installed, or an operator
responded. Those remain live acceptance items.
