# FID: Real monitoring, delivered alerts and incident controls

**Filename:** `FID-2026-1030-059-observability-and-incident-response.md`
**ID:** FID-2026-1030-059
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** closed
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-048, FID-2026-1030-049, FID-2026-1030-051, FID-2026-1030-052, FID-2026-1030-053, FID-2026-1030-057, FID-2026-1030-058
**YAGNI-Compliance:** Verified — instrument real events and one selected alert transport.

## Summary

Make quota/funding, provider errors, settlement failures, payment delivery,
database/backup health and saturation observable, with tested alert delivery and
operational admission controls. A console message is not an alerting service.

## Environment

Existing analytics/provider status, `lib/gateway-stream.ts` fixed settlement
diagnostic and deployment/recovery services planned in 057/058.

## Detailed Description

### Problem / expected behavior / root cause

Financial diagnostics and analytics exist, but no recorded monitoring transport,
on-call destination or delivery drill proves intervention will happen. Empty
traffic must not imply uptime or healthy quota; stale evidence needs explicit age.

### Evidence

The stream repair logs `[gateway.settlement]` with reservation IDs; its audit
explicitly says alert delivery and durable recovery are not implemented by that
fix. `docs/launch-plan.md` phase 3 lists monitoring/delivery/incident requirements.

## Impact Assessment

Gateway/payment/provider/data metrics, secure operator status/actions and incident
runbooks. Risk high: silent lost funds or an uncontrolled bill. Operator selects
alert destination, spend thresholds and ownership; do not send test messages unasked.

## Proposed Solution

### Approach and steps

1. Define bounded, redacted metrics and correlation IDs for dispatch, holds,
   settlements, webhook lag, quota age, errors, reserves, disk and backup age.
2. Implement actual scheduled observation/alert delivery with retry/deduplication,
   resolution and delivery-failure status; distinguish unknown/stale/no-traffic.
3. Add authenticated pause/drain/provider-disable controls that stop new work
   while allowing already incurred accounting and payment fulfillment to settle.
4. Exercise low reserve, stuck recovery, database/backup failure, alert transport
   failure and incident acknowledgment; record received alerts and response actions.

### Verification

Planned `tests/operations-alerts.test.mjs`; extend `tests/analytics.test.mjs` for
unknown/empty observations. Fault/HTTP checks prove protected controls and real
event → monitor → transport invocation. A controlled destination delivery requires
explicit operator authorization and is recorded separately from mock transport tests.

## Implementation Plan — converged 2026-10-31

- **D1 — Transport is a vendor-neutral HTTPS webhook, not a selected vendor.**
  `OPERATIONS_ALERT_WEBHOOK_URL` is unset by default; when absent, incidents are
  durable and visibly `unconfigured`, and no request leaves the process. A
  configured URL must be HTTPS (loopback HTTP is allowed only for a disposable
  test runtime) and may carry `OPERATIONS_ALERT_WEBHOOK_SECRET`, which signs the
  raw body with HMAC-SHA256. This preserves the operator's destination decision
  while giving the code one real transport to test.
- **D2 — Incidents are durable and deduplicated by fingerprint.**
  `operations_incidents` stores `fingerprint`, severity, open/resolved status,
  first/last seen, acknowledgment, delivery state, attempts, next attempt and a
  redacted error. A repeated tick updates `last_seen` instead of opening a
  duplicate; a cleared condition resolves the row and queues one recovery.
- **D3 — Controls are settings-backed and admission-only.**
  `operations.admission_state` is `open`, `paused` or `draining` with a reason
  and timestamp. The gateway checks it after authentication/model resolution and
  before any rate limit, provider slot, allowance hold or credit hold. Pause and
  drain refuse new inference with 503; they do not touch payment webhooks,
  settlement, quarantined releases or in-flight streams. Provider disable reuses
  the existing `providers.enabled` control.
- **D4 — Observation is a scheduled command plus an authenticated manual tick.**
  `scripts/operations-monitor.mjs` is the cron/Fly-invoked entry point and
  `POST /api/admin/operations {action:"tick"}` is the operator's manual run.
  Both call one monitor function. The app does not start an in-process timer,
  because a second process/timer would multiply delivery attempts.
- **D5 — Metrics come from durable state, and absence is explicit.**
  Traffic, errors, unresolved settlements, payment-event failures, provider
  quota age/unknown/error, reserved and quarantined money, database bytes and
  optional backup age are read from existing tables. No traffic is reported as
  `noTraffic`, never as healthy zero-error uptime. No upstream call is made.
- **D6 — Thresholds are bounded environment settings with quiet defaults.**
  Error rate requires at least `OPERATIONS_MIN_REQUESTS`; reserve, database and
  backup rules are disabled at `0`. Settlement, payment-age and quota-age rules
  are on with conservative defaults. Every threshold is parsed and bounded; a
  malformed value falls back to the default rather than disabling a guard.
- **D7 — Protected operator surface.** `GET/POST /api/admin/operations` uses the
  existing same-origin and admin-session guards; `/admin/operations` is inside
  the authenticated admin layout. `GET /api/ready` adds the admission state and
  remains 200 while paused so payment fulfillment and the operator console stay
  reachable.
- **D8 — Delivery failure is visible, not swallowed.** A failed delivery records
  state, attempts and a redacted error; the next tick retries after a bounded
  backoff. The record never claims a delivered alert until the transport returns
  success.

## Verification Gates

- gate: test tests/operations.test.mjs

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
`tests/operations.test.mjs` and the existing analytics tests. Mandatory external
receipt: authorized alert received, delivery failure visible, recovery/pause/
drain response exercised. 060/062 require these controls before traffic.

## Implementation Receipt — 2026-10-31

Implemented in `617935b`; no destination or scheduler was deployed.

- **Read model and rules:** `lib/operations-types.ts`,
  `lib/operations-snapshot.ts`, `lib/operations-rules.ts` and
  `lib/operations-thresholds.ts` read traffic/errors, settlements, payment
  events, enabled-provider quota age/unknown/error, reserve, held/quarantined
  money and database/backup observations from SQLite. A window with no calls is
  `noTraffic`; it is never rendered as 0% healthy. Thresholds are bounded and a
  malformed value falls back to the default, not to off.
- **Incident state and delivery:** `lib/operations-incidents.ts` and
  `lib/operations-tick.ts` implement durable fingerprint dedup, open/refresh/
  reopen/escalation, one recovery on resolution, acknowledgment, delivery
  states, bounded exponential retry and an exhausted `failed` terminal state.
  `lib/schema/operations.ts` is additive and migrations are idempotent.
- **Transport:** `lib/alert-transport.ts` sends one operator-configured HTTPS
  webhook with an optional HMAC-SHA256 signature, a bounded timeout, URL
  redaction in stored errors and no vendor SDK. Unset means durable local
  incidents and no network request.
- **Controls:** settings-backed `open`/`paused`/`draining` state with reason and
  timestamp; the gateway refuses new inference with 503 after authentication and
  model resolution, before rate limit, provider slot, allowance or credit hold.
  The admin API/page (`/api/admin/operations`, `/admin/operations`) are session
  and same-origin protected; provider disable reuses `providers.enabled`.
- **Observation entry points:** `POST /api/admin/operations {action:"tick"}` and
  `scripts/operations-monitor.mjs` share the tick implementation. The script
  opens the live SQLite file directly, refuses a missing file, performs no
  migration and does not depend on Next's `server-only` runtime. No in-process
  timer exists.
- **Verification:** 12 focused unit tests in `tests/operations.test.mjs`; the
  HTTP drill proves anonymous/foreign-origin refusal, the overview, the rendered
  operator page, acknowledgment, reason-required pause, paused/draining 503 with
  `Retry-After` and no usage/credit hold, readiness staying 200 and disclosing
  pause, resume, provider disable/enable and the manual tick. The full receipts
  are in the closure record below.

## Perfection Loop

RED: no demonstrated delivered alerts. GREEN: actual transport, bounded event
ownership and safe incident controls. AUDIT: pending. ADVERSARIAL: alert delivery
can fail during the incident; monitor the monitor without a retry storm.
Five questions: every silent failure state, bounded cardinality/retries, protected
controls, maintainable ownership and auditable delivery rather than green labels.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: pause only new inference admission;
authorized payment fulfillment, durable recovery and drain remain available.
Exercise those paths during an incident so pausing does not create lost money.
Final convergence checks are in the master planning-audit receipt.

Implementation replaces the design-only state. No notification is sent by this
closure: transport setup, a scheduled run and an authorized received alert remain
named operator-input/acceptance boundaries in `FID-2026-1030-059-LIVE`.

## Closure Record — 2026-10-31

- **Closed Date:** 2026-10-31
- **Implementation:** `617935b` — durable operations incidents, the bounded
  snapshot/rules, vendor-neutral signed webhook delivery with retry/backoff,
  settings-backed pause/drain admission controls, protected operator status and
  actions, the scheduled monitor script and the runbook.
- **Dependencies:** 048, 051, 053, 057 and 058 are closed and archived; 049 is
  closed with its live reset observation tracked. 060/062 still require these
  controls before traffic.
- **Verification Evidence:** `npm run verify` exit 0 — lint, typecheck,
  `config:check PASS (non-production)`, 376 unit tests, quality PASS (340 files),
  production build, 718 HTTP checks, trial suite PASS and the recovery drill PASS
  (7 concurrent writes, backup/restore, both startups, 1918ms). The 12 focused
  operations tests cover threshold fallback, no-traffic semantics, every rule,
  dedup/reopen/acknowledgment, delivery once, recovery, retry/backoff/ceiling,
  unconfigured delivery, transport policy, HMAC signing and URL-redacted
  failure. The script was also run against a disposable file database and
  returned exit 0 with `noTraffic: true`.
- **Test follow-up:** `0656d07` strengthens the transport-failure test so the
  webhook endpoint echoes its URL and signing secret into the 500 body; the
  stored error is asserted to contain neither. The focused file still passes
  12/12.
- **Residual (not claimed):** `FID-2026-1030-059-LIVE` remains blocked on an
  operator-selected webhook URL (and optional 16+ character signing secret), an
  installed cron/Fly scheduler, one authorized received alert and a recorded
  response action, and the hosted deployment that 062/067 still gate. The local
  suite proves a local webhook receiver, not delivery to an operator destination.

## Lessons Learned

An alert is complete when someone can receive it and act, not when code formats text.
