# FID-2026-1030-059 — operations monitor closure (2026-10-31)

Request: complete FID-2026-1030-056's residual accessibility/responsive matrix and
implement FID-2026-1030-059's observability, alert transport and incident
controls. Automation level 3, strict, single agent.

## 056

Already closed in `7945f84`: 33 routes at 320/1024 in both themes, 132/132
checks, 14.03:1 minimum body contrast, a 2px focus ring, no overflow, one `h1`
and a skip link. Real payment and deployed-origin acceptance remain
`FID-2026-1030-056-LIVE`. No new 056 change was required.

## 059 implementation

- **Schema:** additive `operations_incidents` with fingerprint uniqueness,
  severity/status, first/last seen, acknowledgment, delivery kind/state/attempts,
  next attempt and redacted error.
- **Read model:** `lib/operations-snapshot.ts` reads traffic/errors in a bounded
  window, settlement state, payment-event state, enabled-provider quota
  age/unknown/error, reserve, held/quarantined/credit money and supplied
  database/backup observations. No traffic is `noTraffic`, not a healthy zero.
- **Rules:** `lib/operations-rules.ts` covers error rate with a minimum sample,
  unresolved settlements, failed/quarantined and stale payment claims, low
  reserve, quota error/stale/unknown, database size and backup age. Thresholds
  are bounded; malformed values fall back to defaults.
- **Incidents:** `lib/operations-incidents.ts` and `operations-tick.ts` implement
  dedup, open/refresh/reopen/escalate, resolution with one recovery,
  acknowledgment, delivery once, bounded backoff and a terminal failed state.
- **Transport:** `lib/alert-transport.ts` is one operator-supplied HTTPS webhook,
  optional HMAC-SHA256 over the raw body, bounded timeout, unconfigured local
  state and URL-redacted stored errors. No vendor or destination ships.
- **Controls:** settings-backed `open`/`paused`/`draining`; gateway refuses new
  inference with 503 after authentication/model resolution and before rate limit,
  provider slot, allowance or credit hold. Payment webhooks, settlement,
  quarantine release and in-flight streams remain available. Provider disable
  reuses `providers.enabled`.
- **Operator surface:** `/admin/operations`, protected `GET/POST
  /api/admin/operations`, and the scheduled `scripts/operations-monitor.mjs`
  (opens the live SQLite file directly; no in-process timer). `docs/operations-runbook.md`
  documents scheduling, payload/signature, controls and first response.

## Verification

`npm run verify` exit 0:

- lint and typecheck clean; `config-check: PASS (non-production)`;
- 376 unit tests, including 12 focused operations tests;
- quality PASS (340 files);
- production build;
- 718 HTTP checks, including the operations drill: protected/foreign-origin API,
  overview and rendered page, acknowledgment, reason-required pause, pause/drain
  503 before usage or credit holds, readiness 200 disclosing pause, resume,
  provider disable/enable, manual tick;
- trial suite PASS;
- recovery drill PASS (7 concurrent writes, backup/restore, both startups,
  1918 ms).

The monitor script was also run against a disposable file database: exit 0,
`noTraffic: true`, zero incidents.

## Residual

`FID-2026-1030-059-LIVE` is blocked. No `OPERATIONS_ALERT_WEBHOOK_URL`, signing
secret, scheduler or external destination was configured, and no authorized
alert was received or responded to. The local webhook receiver proves the code
path, not operator delivery. Hosted acceptance follows 062/067.

Implementation `617935b`; closure record in the archived FID.
